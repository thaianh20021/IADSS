import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import {
  FALLBACK_DRUGS,
  createDatabase,
  normalizeInput
} from './src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const REFERENCE_CATEGORIES = new Set(['drugs', 'drugClasses', 'antibiotics', 'antibioticClasses']);
const PRESCRIPTION_STATUS = {
  VALID: 'Valid',
  PARTIALLY_DISPENSED: 'Partially Dispensed',
  FULLY_DISPENSED: 'Fully Dispensed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  INVALID: 'Invalid'
};

function normalizeReferenceCategory(category) {
  if (category === 'antibiotics') {
    return 'drugs';
  }

  if (category === 'antibioticClasses') {
    return 'drugClasses';
  }

  return category;
}

function sanitizePrescriptionForPharmacy(prescription) {
  if (!prescription) {
    return null;
  }

  return {
    prescriptionId: prescription.prescriptionId,
    patientId: prescription.patientId,
    hospitalName: prescription.hospitalName,
    prescriberLicense: prescription.prescriberLicense,
    drugName: prescription.antibioticName,
    antibioticName: prescription.antibioticName,
    drugClass: prescription.antibioticClass,
    antibioticClass: prescription.antibioticClass,
    dosage: prescription.dosage,
    quantityLimit: prescription.quantityLimit,
    dispensedQuantity: prescription.dispensedQuantity ?? 0,
    remainingQuantity: prescription.remainingQuantity ?? prescription.quantityLimit,
    treatmentDurationDays: prescription.treatmentDurationDays,
    expiryDate: prescription.expiryDate,
    prescriptionStatus: prescription.prescriptionStatus
  };
}

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
  const configuredDrugs = await db.getReferenceList('drugs');
  const drugs = configuredDrugs.length > 0 ? configuredDrugs : FALLBACK_DRUGS;
  const matches = drugs.filter((name) => {
    return name.toLowerCase().includes(normalized);
  });

  return (matches.length > 0 ? matches : drugs).slice(0, 8).map((name) => ({
    name,
    source: 'fallback',
    detail: 'Configured drug list'
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
  prescriptionId,
  quantity
}) {
  if (!prescriptionId || !quantity) {
    return 'Missing required dispense fields.';
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 'Quantity must be a positive whole number.';
  }
  return null;
}

async function evaluateTransaction(db, payload) {
  const prescriptionId = normalizeInput(payload.prescriptionId);
  const patientId = normalizeInput(payload.patientId);
  const hospitalName = normalizeInput(payload.hospitalName);
  const prescriberLicense = normalizeInput(payload.prescriberLicense);
  const antibiotic = normalizeInput(payload.drugName ?? payload.drug ?? payload.antibiotic);
  const antibioticClass = normalizeInput(payload.drugClass ?? payload.antibioticClass);
  const dosage = normalizeInput(payload.dosage);
  const quantity = Number(payload.quantity);
  const treatmentDurationDays = Number(payload.treatmentDurationDays);

  const missingReason = evaluateRequiredFields({
    prescriptionId,
    quantity
  });

  if (missingReason) {
    return {
      prescriptionId,
      patientId,
      hospitalName,
      prescriberLicense,
      antibiotic,
      antibioticClass,
      dosage,
      quantity: Number.isFinite(quantity) ? quantity : null,
      treatmentDurationDays: Number.isFinite(treatmentDurationDays) ? treatmentDurationDays : null,
      prescriptionStatus: PRESCRIPTION_STATUS.INVALID,
      status: 'Blocked',
      reason: missingReason
    };
  }

  const prescription = await db.findPrescriptionById(prescriptionId);
  const transactionRecord = {
    prescriptionId,
    patientId: patientId || prescription?.patientId || '',
    hospitalName: hospitalName || prescription?.hospitalName || '',
    prescriberLicense: prescriberLicense || prescription?.prescriberLicense || '',
    antibiotic: antibiotic || prescription?.antibioticName || '',
    antibioticClass: antibioticClass || prescription?.antibioticClass || '',
    dosage: dosage || prescription?.dosage || '',
    quantity,
    treatmentDurationDays: Number.isFinite(treatmentDurationDays) ? treatmentDurationDays : prescription?.treatmentDurationDays ?? null
  };

  if (!prescription) {
    return {
      ...transactionRecord,
      prescriptionStatus: PRESCRIPTION_STATUS.INVALID,
      status: 'Blocked',
      reason: 'Prescription ID was not found.'
    };
  }

  if (prescription.prescriptionStatus === PRESCRIPTION_STATUS.EXPIRED) {
    return {
      ...transactionRecord,
      prescriptionStatus: PRESCRIPTION_STATUS.EXPIRED,
      status: 'Blocked',
      reason: 'Prescription status is Expired.'
    };
  }

  if (prescription.prescriptionStatus === PRESCRIPTION_STATUS.CANCELLED) {
    return {
      ...transactionRecord,
      prescriptionStatus: PRESCRIPTION_STATUS.CANCELLED,
      status: 'Blocked',
      reason: 'Prescription status is Cancelled.'
    };
  }

  if (prescription.prescriptionStatus === PRESCRIPTION_STATUS.FULLY_DISPENSED) {
    return {
      ...transactionRecord,
      prescriptionStatus: PRESCRIPTION_STATUS.FULLY_DISPENSED,
      status: 'Blocked',
      reason: 'Prescription status is Fully Dispensed.'
    };
  }

  if (
    (patientId && prescription.patientId !== patientId) ||
    (prescriberLicense && prescription.prescriberLicense !== prescriberLicense) ||
    (hospitalName && prescription.hospitalName.toLowerCase() !== hospitalName.toLowerCase())
  ) {
    return {
      ...transactionRecord,
      prescriptionStatus: prescription.prescriptionStatus,
      status: 'Blocked',
      reason: 'Patient, hospital, or prescriber does not match prescription record.'
    };
  }

  if (antibiotic && prescription.antibioticName.toLowerCase() !== antibiotic.toLowerCase()) {
    return {
      ...transactionRecord,
      prescriptionStatus: prescription.prescriptionStatus,
      status: 'Blocked',
      reason: `Drug does not match prescription drug ${prescription.antibioticName}.`
    };
  }

  if (antibioticClass && prescription.antibioticClass.toLowerCase() !== antibioticClass.toLowerCase()) {
    return {
      ...transactionRecord,
      prescriptionStatus: prescription.prescriptionStatus,
      status: 'Blocked',
      reason: `Drug class does not match prescription class ${prescription.antibioticClass}.`
    };
  }

  if (dosage && prescription.dosage.toLowerCase() !== dosage.toLowerCase()) {
    return {
      ...transactionRecord,
      prescriptionStatus: prescription.prescriptionStatus,
      status: 'Blocked',
      reason: `Dosage does not match prescription dosage ${prescription.dosage}.`
    };
  }

  if (quantity > prescription.remainingQuantity) {
    return {
      ...transactionRecord,
      prescriptionStatus: prescription.prescriptionStatus,
      status: 'Blocked',
      reason: `Dispense quantity exceeds remaining quantity of ${prescription.remainingQuantity}.`
    };
  }

  if (Number.isFinite(treatmentDurationDays) && treatmentDurationDays > prescription.treatmentDurationDays) {
    return {
      ...transactionRecord,
      prescriptionStatus: prescription.prescriptionStatus,
      status: 'Blocked',
      reason: `Treatment duration exceeds prescription duration of ${prescription.treatmentDurationDays} days.`
    };
  }

  return {
    ...transactionRecord,
    prescriptionStatus: prescription.prescriptionStatus,
    status: 'Approved',
    reason: 'Prescription verified.'
  };
}

function validatePrescriptionPayload(payload) {
  const prescriptionId = normalizeInput(payload.prescriptionId);
  const patientId = normalizeInput(payload.patientId);
  const hospitalName = normalizeInput(payload.hospitalName);
  const prescriberLicense = normalizeInput(payload.prescriberLicense);
  const antibioticName = normalizeInput(payload.drugName ?? payload.antibioticName ?? payload.drug ?? payload.antibiotic);
  const antibioticClass = normalizeInput(payload.drugClass ?? payload.antibioticClass);
  const dosage = normalizeInput(payload.dosage);
  const quantityLimit = Number(payload.quantityLimit);
  const treatmentDurationDays = Number(payload.treatmentDurationDays);
  const expiryDate = normalizeInput(payload.expiryDate);
  const mainDiagnosis = normalizeInput(payload.mainDiagnosis);
  const icd10Code = normalizeInput(payload.icd10Code);
  const clinicalNotes = normalizeInput(payload.clinicalNotes);
  const drugAllergies = normalizeInput(payload.drugAllergies);

  if (
    !prescriptionId ||
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
      prescriptionId,
      patientId,
      hospitalName,
      prescriberLicense,
      antibioticName,
      antibioticClass,
      dosage,
      quantityLimit,
      treatmentDurationDays,
      expiryDate,
      mainDiagnosis,
      icd10Code,
      clinicalNotes,
      drugAllergies
    }
  };
}

function validateReferenceCategory(category) {
  if (!REFERENCE_CATEGORIES.has(category)) {
    return null;
  }

  return normalizeReferenceCategory(category);
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

  app.get('/api/prescriptions/:prescriptionId', async (request, response, next) => {
    try {
      const prescription = await db.findPrescriptionById(request.params.prescriptionId);

      if (!prescription) {
        response.status(404).json({ error: 'Prescription ID was not found.' });
        return;
      }

      response.json({
        prescription: sanitizePrescriptionForPharmacy(prescription)
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

  app.post('/api/prescriptions/:prescriptionId/cancel', async (request, response, next) => {
    try {
      const prescription = await db.findPrescriptionById(request.params.prescriptionId);

      if (!prescription) {
        response.status(404).json({ error: 'Prescription ID was not found.' });
        return;
      }

      await db.cancelPrescription(request.params.prescriptionId);
      const cancelled = await db.findPrescriptionById(request.params.prescriptionId);

      response.json({
        prescription: cancelled,
        message: 'Prescription cancelled.'
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

      if (saved.status === 'Approved') {
        await db.addPrescriptionDispense(saved.prescriptionId, saved.quantity);
      }

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
