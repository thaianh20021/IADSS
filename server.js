import 'dotenv/config';

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import {
  FALLBACK_DRUGS,
  createDatabase,
  normalizeInput
} from './src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const JSQR_DIST_DIR = path.join(__dirname, 'node_modules', 'jsqr', 'dist');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_HASH_ITERATIONS = 120000;
const AUTH_ROLES = new Set(['pharmacy', 'doctor', 'moh']);
const REFERENCE_CATEGORIES = new Set(['drugs', 'drugClasses', 'antibiotics', 'antibioticClasses']);
const PRESCRIPTION_STATUS = {
  VALID: 'Valid',
  PARTIALLY_DISPENSED: 'Partially Dispensed',
  FULLY_DISPENSED: 'Fully Dispensed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  INVALID: 'Invalid'
};
const COMMON_DRUG_SUGGESTIONS = [
  'Amoxicillin',
  'Azithromycin',
  'Cephalexin',
  'Cefixime',
  'Ciprofloxacin',
  'Metformin',
  'Amlodipine',
  'Atorvastatin',
  'Paracetamol',
  'Ibuprofen',
  'Omeprazole',
  'Cetirizine'
];

function normalizeReferenceCategory(category) {
  if (category === 'antibiotics') {
    return 'drugs';
  }

  if (category === 'antibioticClasses') {
    return 'drugClasses';
  }

  return category;
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, 32, 'sha256').toString('hex');
  return `pbkdf2$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash ?? '').split('$');

  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expectedHash = parts[3];

  if (!Number.isInteger(iterations) || !salt || !expectedHash) {
    return false;
  }

  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const expected = Buffer.from(expectedHash, 'hex');

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function getBearerToken(request) {
  const header = request.get('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : '';
}

function validateAuthPayload(payload, mode) {
  const email = normalizeInput(payload.email).toLowerCase();
  const password = String(payload.password ?? '');
  const name = normalizeInput(payload.name);
  const role = normalizeInput(payload.role).toLowerCase();

  if (!email || !email.includes('@')) {
    return { error: 'Valid email is required.' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  if (mode === 'register') {
    if (!name) {
      return { error: 'Full name is required.' };
    }

    if (!AUTH_ROLES.has(role)) {
      return { error: 'Role must be pharmacy, doctor, or moh.' };
    }
  }

  return {
    userInput: {
      email,
      password,
      name,
      role
    }
  };
}

async function createAuthSession(db, user) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.createSession({
    token,
    userId: user.id,
    expiresAt
  });

  return {
    token,
    expiresAt
  };
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
  const commonDrugs = COMMON_DRUG_SUGGESTIONS.filter((name) => {
    return drugs.some((drug) => drug.toLowerCase() === name.toLowerCase());
  });

  if (normalized.length < 2) {
    return [...commonDrugs, ...drugs.filter((name) => {
      return !commonDrugs.some((common) => common.toLowerCase() === name.toLowerCase());
    })].slice(0, 8).map((name) => ({
      name,
      source: 'fallback',
      detail: 'Configured drug list'
    }));
  }

  const matches = drugs.filter((name) => {
    return name.toLowerCase().includes(normalized);
  });
  const sortedMatches = matches.sort((a, b) => {
    const aCommon = commonDrugs.some((name) => name.toLowerCase() === a.toLowerCase()) ? 0 : 1;
    const bCommon = commonDrugs.some((name) => name.toLowerCase() === b.toLowerCase()) ? 0 : 1;
    const aPrefix = a.toLowerCase().startsWith(normalized) ? 0 : 1;
    const bPrefix = b.toLowerCase().startsWith(normalized) ? 0 : 1;

    return aCommon - bCommon || aPrefix - bPrefix || a.localeCompare(b);
  });

  return (sortedMatches.length > 0 ? sortedMatches : commonDrugs).slice(0, 8).map((name) => ({
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

function applyAuditedOverride(evaluated, payload) {
  const overrideRequested = payload.overrideBlocked === true || payload.overrideBlocked === 'true' || payload.overrideBlocked === 'on';

  if (evaluated.status !== 'Blocked' || !overrideRequested) {
    return evaluated;
  }

  const overrideReason = normalizeInput(payload.overrideReason);
  const pharmacistLicense = normalizeInput(payload.pharmacistLicense);

  if (!overrideReason || !pharmacistLicense) {
    return {
      ...evaluated,
      reason: `${evaluated.reason} Override requires a pharmacist license and reason.`
    };
  }

  return {
    ...evaluated,
    status: 'Overridden',
    reason: `Blocked rule overridden after pharmacist attestation: ${evaluated.reason}`,
    overrideReason,
    pharmacistLicense,
    overrideAt: new Date().toISOString()
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
  const requireAuth = (allowedRoles = []) => {
    return async (request, response, next) => {
      try {
        const token = getBearerToken(request);

        if (!token) {
          response.status(401).json({ error: 'Authentication required.' });
          return;
        }

        const user = await db.findUserBySessionToken(token);

        if (!user) {
          response.status(401).json({ error: 'Session expired or invalid.' });
          return;
        }

        if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
          response.status(403).json({ error: 'You do not have access to this portal.' });
          return;
        }

        request.user = user;
        request.authToken = token;
        next();
      } catch (error) {
        next(error);
      }
    };
  };

  app.locals.db = db;

  app.use(express.json());
  app.use('/vendor/jsqr', express.static(JSQR_DIST_DIR));
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/health', (request, response) => {
    response.json({
      ok: true,
      service: 'IADSS MVP',
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/auth/register', async (request, response, next) => {
    try {
      const { error, userInput } = validateAuthPayload(request.body ?? {}, 'register');

      if (error) {
        response.status(400).json({ error });
        return;
      }

      const existingUser = await db.findUserByEmail(userInput.email);

      if (existingUser) {
        response.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const user = await db.createUser({
        name: userInput.name,
        email: userInput.email,
        role: userInput.role,
        passwordHash: hashPassword(userInput.password)
      });
      const session = await createAuthSession(db, user);

      response.status(201).json({
        user: sanitizeUser(user),
        token: session.token,
        expiresAt: session.expiresAt
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/login', async (request, response, next) => {
    try {
      const { error, userInput } = validateAuthPayload(request.body ?? {}, 'login');

      if (error) {
        response.status(400).json({ error });
        return;
      }

      const user = await db.findUserByEmail(userInput.email);

      if (!user || !verifyPassword(userInput.password, user.passwordHash)) {
        response.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const session = await createAuthSession(db, user);

      response.json({
        user: sanitizeUser(user),
        token: session.token,
        expiresAt: session.expiresAt
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/me', requireAuth(), (request, response) => {
    response.json({
      user: sanitizeUser(request.user)
    });
  });

  app.post('/api/auth/logout', requireAuth(), async (request, response, next) => {
    try {
      await db.deleteSession(request.authToken);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/prescriptions', requireAuth(['doctor', 'moh']), async (request, response, next) => {
    try {
      response.json({
        prescriptions: await db.getPrescriptions()
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/prescriptions/:prescriptionId', requireAuth(['pharmacy', 'doctor', 'moh']), async (request, response, next) => {
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

  app.get('/api/prescriptions/:prescriptionId/qr', async (request, response, next) => {
    try {
      const prescription = await db.findPrescriptionById(request.params.prescriptionId);

      if (!prescription) {
        response.status(404).json({ error: 'Prescription ID was not found.' });
        return;
      }

      const qrBuffer = await QRCode.toBuffer(prescription.prescriptionId, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320
      });

      response.setHeader('Content-Type', 'image/png');
      response.setHeader('Cache-Control', 'no-store');
      response.send(qrBuffer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/prescriptions', requireAuth(['doctor', 'moh']), async (request, response, next) => {
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

  app.post('/api/prescriptions/:prescriptionId/cancel', requireAuth(['doctor', 'moh']), async (request, response, next) => {
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

  app.get('/api/medicines/search', requireAuth(['pharmacy', 'doctor', 'moh']), async (request, response, next) => {
    try {
      const query = normalizeInput(request.query.q);
      const result = await searchMedicines(db, query);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/reference/:category', requireAuth(['pharmacy', 'doctor', 'moh']), async (request, response, next) => {
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

  app.post('/api/reference/:category', requireAuth(['moh']), async (request, response, next) => {
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

  app.delete('/api/reference/:category/:value', requireAuth(['moh']), async (request, response, next) => {
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

  app.get('/api/transactions', requireAuth(['moh']), async (request, response, next) => {
    try {
      response.json({
        transactions: await db.getTransactions()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transactions', requireAuth(['pharmacy']), async (request, response, next) => {
    try {
      const evaluated = applyAuditedOverride(await evaluateTransaction(db, request.body ?? {}), request.body ?? {});
      const saved = await db.saveTransaction(evaluated);

      if (saved.status === 'Approved') {
        await db.addPrescriptionDispense(saved.prescriptionId, saved.quantity);
      }

      response.status(201).json({
        transaction: saved,
        message:
          saved.status === 'Approved'
            ? 'Transaction Approved. Data synced to MOH.'
            : saved.status === 'Overridden'
              ? 'AUDITED OVERRIDE: Transaction recorded for MOH review.'
            : 'HIGH RISK ALERT: Invalid Prescription. Sale Blocked.'
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/transactions', requireAuth(['moh']), async (request, response, next) => {
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
