import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import {
  FALLBACK_ANTIBIOTICS,
  createDatabase,
  normalizeInput
} from './src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const REFERENCE_CATEGORIES = new Set(['antibiotics', 'antibioticClasses']);

function isFreshCache(cached) {
  if (!cached?.fetchedAt) {
    return false;
  }

  return Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS;
}

function uniqueMedicineResults(results) {
  const seen = new Set();

  return results
    .filter((item) => item?.name)
    .map((item) => ({
      name: normalizeInput(item.name),
      source: item.source,
      detail: item.detail ?? ''
    }))
    .filter((item) => {
      const key = item.name.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

async function fallbackMedicineSearch(db, query) {
  const normalized = query.toLowerCase();
  const configuredAntibiotics = await db.getReferenceList('antibiotics');
  const antibiotics = configuredAntibiotics.length > 0 ? configuredAntibiotics : FALLBACK_ANTIBIOTICS;
  const matches = antibiotics.filter((name) => {
    return name.toLowerCase().includes(normalized);
  });

  return (matches.length > 0 ? matches : antibiotics).slice(0, 8).map((name) => ({
    name,
    source: 'fallback',
    detail: 'Configured antibiotic list'
  }));
}

async function searchOpenFda(query) {
  const search = `openfda.generic_name:${query}* OR openfda.brand_name:${query}*`;
  const url = new URL('https://api.fda.gov/drug/label.json');
  url.searchParams.set('search', search);
  url.searchParams.set('limit', '8');

  if (process.env.OPENFDA_API_KEY) {
    url.searchParams.set('api_key', process.env.OPENFDA_API_KEY);
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`openFDA request failed with ${response.status}`);
  }

  const data = await response.json();

  return uniqueMedicineResults(
    (data.results ?? []).flatMap((result) => {
      const openfda = result.openfda ?? {};
      const names = [
        ...(openfda.generic_name ?? []),
        ...(openfda.brand_name ?? [])
      ];

      return names.map((name) => ({
        name,
        source: 'openFDA',
        detail: openfda.manufacturer_name?.[0] ?? 'FDA drug label'
      }));
    })
  );
}

async function searchRxNorm(query) {
  const url = new URL('https://rxnav.nlm.nih.gov/REST/drugs.json');
  url.searchParams.set('name', query);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`RxNorm request failed with ${response.status}`);
  }

  const data = await response.json();
  const groups = data.drugGroup?.conceptGroup ?? [];

  return uniqueMedicineResults(
    groups.flatMap((group) => {
      return (group.conceptProperties ?? []).map((concept) => ({
        name: concept.name,
        source: 'RxNorm',
        detail: concept.synonym || concept.tty || 'RxNorm concept'
      }));
    })
  );
}

async function searchMedicines(db, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length < 2) {
    return {
      source: 'fallback',
      results: await fallbackMedicineSearch(db, normalizedQuery)
    };
  }

  const cached = await db.getMedicineCache(normalizedQuery);

  if (isFreshCache(cached)) {
    return {
      source: cached.source,
      results: cached.payload
    };
  }

  try {
    const openFdaResults = await searchOpenFda(normalizedQuery);

    if (openFdaResults.length > 0) {
      await db.saveMedicineCache(normalizedQuery, 'openFDA', openFdaResults);
      return {
        source: 'openFDA',
        results: openFdaResults
      };
    }
  } catch (error) {
    console.warn(error.message);
  }

  try {
    const rxNormResults = await searchRxNorm(normalizedQuery);

    if (rxNormResults.length > 0) {
      await db.saveMedicineCache(normalizedQuery, 'RxNorm', rxNormResults);
      return {
        source: 'RxNorm',
        results: rxNormResults
      };
    }
  } catch (error) {
    console.warn(error.message);
  }

  const fallback = await fallbackMedicineSearch(db, normalizedQuery);
  await db.saveMedicineCache(normalizedQuery, 'fallback', fallback);

  return {
    source: 'fallback',
    results: fallback
  };
}

function evaluateRequiredFields({
  patientId,
  hospitalName,
  prescriberLicense,
  antibiotic,
  antibioticClass,
  dosage,
  quantity,
  treatmentDurationDays
}) {
  if (
    !patientId ||
    !hospitalName ||
    !prescriberLicense ||
    !antibiotic ||
    !antibioticClass ||
    !dosage ||
    !quantity ||
    !treatmentDurationDays
  ) {
    return 'Missing required transaction fields.';
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 'Quantity must be a positive whole number.';
  }

  if (!Number.isInteger(treatmentDurationDays) || treatmentDurationDays <= 0) {
    return 'Treatment duration must be a positive whole number.';
  }

  return null;
}

async function evaluateTransaction(db, payload) {
  const patientId = normalizeInput(payload.patientId);
  const hospitalName = normalizeInput(payload.hospitalName);
  const prescriberLicense = normalizeInput(payload.prescriberLicense);
  const antibiotic = normalizeInput(payload.antibiotic);
  const antibioticClass = normalizeInput(payload.antibioticClass);
  const dosage = normalizeInput(payload.dosage);
  const quantity = Number(payload.quantity);
  const treatmentDurationDays = Number(payload.treatmentDurationDays);

  const missingReason = evaluateRequiredFields({
    patientId,
    hospitalName,
    prescriberLicense,
    antibiotic,
    antibioticClass,
    dosage,
    quantity,
    treatmentDurationDays
  });

  if (missingReason) {
    return {
      patientId,
      hospitalName,
      prescriberLicense,
      antibiotic,
      antibioticClass,
      dosage,
      quantity: Number.isFinite(quantity) ? quantity : null,
      treatmentDurationDays: Number.isFinite(treatmentDurationDays) ? treatmentDurationDays : null,
      status: 'Blocked',
      reason: missingReason
    };
  }

  const prescription = await db.findValidPrescription({
    patientId,
    hospitalName,
    prescriberLicense,
    antibioticName: antibiotic
  });

  if (!prescription) {
    return {
      patientId,
      hospitalName,
      prescriberLicense,
      antibiotic,
      antibioticClass,
      dosage,
      quantity,
      treatmentDurationDays,
      status: 'Blocked',
      reason: 'Invalid prescription details.'
    };
  }

  if (prescription.antibioticClass.toLowerCase() !== antibioticClass.toLowerCase()) {
    return {
      patientId,
      hospitalName,
      prescriberLicense,
      antibiotic,
      antibioticClass,
      dosage,
      quantity,
      treatmentDurationDays,
      status: 'Blocked',
      reason: `Antibiotic class does not match prescription class ${prescription.antibioticClass}.`
    };
  }

  if (prescription.dosage.toLowerCase() !== dosage.toLowerCase()) {
    return {
      patientId,
      hospitalName,
      prescriberLicense,
      antibiotic,
      antibioticClass,
      dosage,
      quantity,
      treatmentDurationDays,
      status: 'Blocked',
      reason: `Dosage does not match prescription dosage ${prescription.dosage}.`
    };
  }

  if (quantity > prescription.quantityLimit) {
    return {
      patientId,
      hospitalName,
      prescriberLicense,
      antibiotic,
      antibioticClass,
      dosage,
      quantity,
      treatmentDurationDays,
      status: 'Blocked',
      reason: `Requested quantity exceeds prescription limit of ${prescription.quantityLimit}.`
    };
  }

  if (treatmentDurationDays > prescription.treatmentDurationDays) {
    return {
      patientId,
      hospitalName,
      prescriberLicense,
      antibiotic,
      antibioticClass,
      dosage,
      quantity,
      treatmentDurationDays,
      status: 'Blocked',
      reason: `Treatment duration exceeds prescription duration of ${prescription.treatmentDurationDays} days.`
    };
  }

  return {
    patientId,
    hospitalName,
    prescriberLicense,
    antibiotic,
    antibioticClass,
    dosage,
    quantity,
    treatmentDurationDays,
    status: 'Approved',
    reason: 'Prescription verified.'
  };
}

function validatePrescriptionPayload(payload) {
  const patientId = normalizeInput(payload.patientId);
  const hospitalName = normalizeInput(payload.hospitalName);
  const prescriberLicense = normalizeInput(payload.prescriberLicense);
  const antibioticName = normalizeInput(payload.antibioticName ?? payload.antibiotic);
  const antibioticClass = normalizeInput(payload.antibioticClass);
  const dosage = normalizeInput(payload.dosage);
  const quantityLimit = Number(payload.quantityLimit);
  const treatmentDurationDays = Number(payload.treatmentDurationDays);
  const expiryDate = normalizeInput(payload.expiryDate);

  if (
    !patientId ||
    !hospitalName ||
    !prescriberLicense ||
    !antibioticName ||
    !antibioticClass ||
    !dosage ||
    !quantityLimit ||
    !treatmentDurationDays ||
    !expiryDate
  ) {
    return {
      error: 'Missing required prescription fields.'
    };
  }

  if (!Number.isInteger(quantityLimit) || quantityLimit <= 0) {
    return {
      error: 'Quantity limit must be a positive whole number.'
    };
  }

  if (!Number.isInteger(treatmentDurationDays) || treatmentDurationDays <= 0) {
    return {
      error: 'Treatment duration must be a positive whole number.'
    };
  }

  if (Number.isNaN(new Date(expiryDate).getTime())) {
    return {
      error: 'Expiry date must be a valid date.'
    };
  }

  return {
    prescription: {
      patientId,
      hospitalName,
      prescriberLicense,
      antibioticName,
      antibioticClass,
      dosage,
      quantityLimit,
      treatmentDurationDays,
      expiryDate
    }
  };
}

function validateReferenceCategory(category) {
  if (!REFERENCE_CATEGORIES.has(category)) {
    return null;
  }

  return category;
}

export async function createApp(options = {}) {
  const db = options.db ?? (await createDatabase(options.database));
  const app = express();

  app.locals.db = db;

  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/health', (request, response) => {
    response.json({
      ok: true,
      service: 'IADSS MVP',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/prescriptions', async (request, response, next) => {
    try {
      response.json({
        prescriptions: await db.getPrescriptions()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/prescriptions', async (request, response, next) => {
    try {
      const { error, prescription } = validatePrescriptionPayload(request.body ?? {});

      if (error) {
        response.status(400).json({ error });
        return;
      }

      const saved = await db.savePrescription(prescription);
      response.status(201).json({
        prescription: saved,
        message: 'Prescription saved. Pharmacies can verify against this record.'
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/medicines/search', async (request, response, next) => {
    try {
      const query = normalizeInput(request.query.q);
      const result = await searchMedicines(db, query);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/reference/:category', async (request, response, next) => {
    try {
      const category = validateReferenceCategory(request.params.category);

      if (!category) {
        response.status(404).json({ error: 'Unknown reference category.' });
        return;
      }

      response.json({
        category,
        items: await db.getReferenceList(category)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/reference/:category', async (request, response, next) => {
    try {
      const category = validateReferenceCategory(request.params.category);
      const value = normalizeInput(request.body?.value);

      if (!category) {
        response.status(404).json({ error: 'Unknown reference category.' });
        return;
      }

      if (!value) {
        response.status(400).json({ error: 'Reference value is required.' });
        return;
      }

      await db.addReferenceItem(category, value);
      await db.clearMedicineCache();
      response.status(201).json({
        category,
        items: await db.getReferenceList(category)
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/reference/:category/:value', async (request, response, next) => {
    try {
      const category = validateReferenceCategory(request.params.category);
      const value = normalizeInput(request.params.value);

      if (!category) {
        response.status(404).json({ error: 'Unknown reference category.' });
        return;
      }

      await db.deleteReferenceItem(category, value);
      await db.clearMedicineCache();
      response.json({
        category,
        items: await db.getReferenceList(category)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/transactions', async (request, response, next) => {
    try {
      response.json({
        transactions: await db.getTransactions()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transactions', async (request, response, next) => {
    try {
      const evaluated = await evaluateTransaction(db, request.body ?? {});
      const saved = await db.saveTransaction(evaluated);

      response.status(201).json({
        transaction: saved,
        message:
          saved.status === 'Approved'
            ? 'Transaction Approved. Data synced to MOH.'
            : 'HIGH RISK ALERT: Invalid Prescription. Sale Blocked.'
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/transactions', async (request, response, next) => {
    try {
      await db.clearTransactions();
      response.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('*', (request, response) => {
    response.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use((error, request, response, next) => {
    console.error(error);
    response.status(500).json({
      error: 'Internal server error'
    });
  });

  return app;
}

async function start() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    console.log(`IADSS MVP running at http://localhost:${port}`);
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
