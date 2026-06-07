import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'iadss-db.json');

export const FALLBACK_ANTIBIOTICS = [
  'Amoxicillin',
  'Amoxicillin Clavulanate',
  'Ampicillin',
  'Azithromycin',
  'Cefaclor',
  'Cefixime',
  'Ceftriaxone',
  'Cephalexin',
  'Cefuroxime',
  'Ciprofloxacin',
  'Clarithromycin',
  'Clindamycin',
  'Cotrimoxazole',
  'Doxycycline',
  'Levofloxacin',
  'Meropenem',
  'Metronidazole',
  'Nitrofurantoin'
];

export const DEFAULT_ANTIBIOTIC_CLASSES = [
  'Penicillin',
  'Macrolide',
  'Cephalosporin',
  'Fluoroquinolone',
  'Tetracycline',
  'Nitroimidazole',
  'Lincosamide',
  'Sulfonamide'
];

const LEGACY_DEMO_PRESCRIPTIONS = [
  {
    patientId: '12345',
    hospitalName: 'National General Hospital',
    prescriberLicense: '98765',
    antibioticName: 'Amoxicillin',
    antibioticClass: 'Penicillin',
    dosage: '500mg',
    quantityLimit: 20,
    treatmentDurationDays: 5,
    expiryDate: '2027-12-31'
  },
  {
    patientId: '24680',
    hospitalName: 'City Children Hospital',
    prescriberLicense: '13579',
    antibioticName: 'Azithromycin',
    antibioticClass: 'Macrolide',
    dosage: '250mg',
    quantityLimit: 6,
    treatmentDurationDays: 3,
    expiryDate: '2027-12-31'
  },
  {
    patientId: '11223',
    hospitalName: 'District Medical Center',
    prescriberLicense: '44556',
    antibioticName: 'Cephalexin',
    antibioticClass: 'Cephalosporin',
    dosage: '500mg',
    quantityLimit: 28,
    treatmentDurationDays: 7,
    expiryDate: '2027-12-31'
  }
];

const LEGACY_DEMO_PRESCRIPTION_KEYS = [
  ...LEGACY_DEMO_PRESCRIPTIONS,
  {
    patientId: '77777',
    prescriberLicense: 'DOC-2026',
    antibioticName: 'Cefixime'
  },
  {
    patientId: '88888',
    prescriberLicense: 'DOC-SMOKE',
    antibioticName: 'Cefixime'
  }
];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeMedicine(value) {
  return normalizeText(value).toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function createPostgresPool(databaseUrl) {
  const needsSsl =
    databaseUrl.includes('sslmode=require') ||
    process.env.PGSSLMODE === 'require' ||
    process.env.NODE_ENV === 'production';

  return new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined
  });
}

class PostgresDatabase {
  constructor(databaseUrl) {
    this.pool = createPostgresPool(databaseUrl);
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS valid_prescriptions (
        id SERIAL PRIMARY KEY,
        patient_id TEXT NOT NULL,
        hospital_name TEXT NOT NULL DEFAULT '',
        prescriber_license TEXT NOT NULL,
        antibiotic_name TEXT NOT NULL,
        antibiotic_class TEXT NOT NULL DEFAULT '',
        dosage TEXT NOT NULL DEFAULT '',
        quantity_limit INTEGER NOT NULL,
        treatment_duration_days INTEGER NOT NULL DEFAULT 1,
        expiry_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (patient_id, prescriber_license, antibiotic_name)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        patient_id TEXT,
        hospital_name TEXT,
        prescriber_license TEXT,
        antibiotic TEXT,
        antibiotic_class TEXT,
        dosage TEXT,
        quantity INTEGER,
        treatment_duration_days INTEGER,
        status TEXT NOT NULL CHECK (status IN ('Approved', 'Blocked')),
        reason TEXT NOT NULL
      );
    `);

    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS hospital_name TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS antibiotic_class TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS dosage TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS treatment_duration_days INTEGER NOT NULL DEFAULT 1;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hospital_name TEXT;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS antibiotic_class TEXT;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dosage TEXT;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS treatment_duration_days INTEGER;');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS medicine_cache (
        query TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        payload JSONB NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reference_items (
        category TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (category, value)
      );
    `);

    await this.removeLegacyDemoPrescriptions();

    await this.seedReferenceItems('antibiotics', FALLBACK_ANTIBIOTICS);
    await this.seedReferenceItems('antibioticClasses', DEFAULT_ANTIBIOTIC_CLASSES);
  }

  async removeLegacyDemoPrescriptions() {
    for (const prescription of LEGACY_DEMO_PRESCRIPTION_KEYS) {
      await this.pool.query(
        `
          DELETE FROM valid_prescriptions
          WHERE patient_id = $1
            AND prescriber_license = $2
            AND LOWER(antibiotic_name) = LOWER($3);
        `,
        [
          prescription.patientId,
          prescription.prescriberLicense,
          prescription.antibioticName
        ]
      );
    }
  }

  async seedReferenceItems(category, values) {
    const result = await this.pool.query('SELECT COUNT(*)::int AS count FROM reference_items WHERE category = $1;', [
      category
    ]);

    if (result.rows[0].count > 0) {
      return;
    }

    for (const value of values) {
      await this.addReferenceItem(category, value);
    }
  }

  async getPrescriptions() {
    const result = await this.pool.query(`
      SELECT
        patient_id AS "patientId",
        hospital_name AS "hospitalName",
        prescriber_license AS "prescriberLicense",
        antibiotic_name AS "antibioticName",
        antibiotic_class AS "antibioticClass",
        dosage,
        quantity_limit AS "quantityLimit",
        treatment_duration_days AS "treatmentDurationDays",
        expiry_date::text AS "expiryDate"
      FROM valid_prescriptions
      ORDER BY patient_id, antibiotic_name;
    `);

    return result.rows;
  }

  async savePrescription(prescription) {
    const result = await this.pool.query(
      `
        INSERT INTO valid_prescriptions (
          patient_id,
          hospital_name,
          prescriber_license,
          antibiotic_name,
          antibiotic_class,
          dosage,
          quantity_limit,
          treatment_duration_days,
          expiry_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (patient_id, prescriber_license, antibiotic_name)
        DO UPDATE SET
          hospital_name = EXCLUDED.hospital_name,
          antibiotic_class = EXCLUDED.antibiotic_class,
          dosage = EXCLUDED.dosage,
          quantity_limit = EXCLUDED.quantity_limit,
          treatment_duration_days = EXCLUDED.treatment_duration_days,
          expiry_date = EXCLUDED.expiry_date
        RETURNING
          patient_id AS "patientId",
          hospital_name AS "hospitalName",
          prescriber_license AS "prescriberLicense",
          antibiotic_name AS "antibioticName",
          antibiotic_class AS "antibioticClass",
          dosage,
          quantity_limit AS "quantityLimit",
          treatment_duration_days AS "treatmentDurationDays",
          expiry_date::text AS "expiryDate";
      `,
      [
        prescription.patientId,
        prescription.hospitalName,
        prescription.prescriberLicense,
        prescription.antibioticName,
        prescription.antibioticClass,
        prescription.dosage,
        prescription.quantityLimit,
        prescription.treatmentDurationDays,
        prescription.expiryDate
      ]
    );

    return result.rows[0];
  }

  async findValidPrescription({ patientId, hospitalName, prescriberLicense, antibioticName }) {
    const result = await this.pool.query(
      `
        SELECT
          patient_id AS "patientId",
          hospital_name AS "hospitalName",
          prescriber_license AS "prescriberLicense",
          antibiotic_name AS "antibioticName",
          antibiotic_class AS "antibioticClass",
          dosage,
          quantity_limit AS "quantityLimit",
          treatment_duration_days AS "treatmentDurationDays",
          expiry_date::text AS "expiryDate"
        FROM valid_prescriptions
        WHERE patient_id = $1
          AND LOWER(hospital_name) = LOWER($2)
          AND prescriber_license = $3
          AND LOWER(antibiotic_name) = LOWER($4)
          AND expiry_date >= CURRENT_DATE
        LIMIT 1;
      `,
      [patientId, hospitalName, prescriberLicense, antibioticName]
    );

    return result.rows[0] ?? null;
  }

  async saveTransaction(transaction) {
    const result = await this.pool.query(
      `
        INSERT INTO transactions (
          patient_id,
          hospital_name,
          prescriber_license,
          antibiotic,
          antibiotic_class,
          dosage,
          quantity,
          treatment_duration_days,
          status,
          reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING
          id,
          timestamp,
          patient_id AS "patientId",
          hospital_name AS "hospitalName",
          prescriber_license AS "prescriberLicense",
          antibiotic,
          antibiotic_class AS "antibioticClass",
          dosage,
          quantity,
          treatment_duration_days AS "treatmentDurationDays",
          status,
          reason;
      `,
      [
        transaction.patientId,
        transaction.hospitalName,
        transaction.prescriberLicense,
        transaction.antibiotic,
        transaction.antibioticClass,
        transaction.dosage,
        transaction.quantity,
        transaction.treatmentDurationDays,
        transaction.status,
        transaction.reason
      ]
    );

    return result.rows[0];
  }

  async getTransactions() {
    const result = await this.pool.query(`
      SELECT
        id,
        timestamp,
        patient_id AS "patientId",
        hospital_name AS "hospitalName",
        prescriber_license AS "prescriberLicense",
        antibiotic,
        antibiotic_class AS "antibioticClass",
        dosage,
        quantity,
        treatment_duration_days AS "treatmentDurationDays",
        status,
        reason
      FROM transactions
      ORDER BY timestamp DESC, id DESC;
    `);

    return result.rows;
  }

  async clearTransactions() {
    await this.pool.query('DELETE FROM transactions;');
  }

  async getReferenceList(category) {
    const result = await this.pool.query(
      'SELECT value FROM reference_items WHERE category = $1 ORDER BY value;',
      [category]
    );

    return result.rows.map((row) => row.value);
  }

  async addReferenceItem(category, value) {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
      throw new Error('Reference value is required.');
    }

    await this.pool.query(
      `
        INSERT INTO reference_items (category, value)
        VALUES ($1, $2)
        ON CONFLICT (category, value) DO NOTHING;
      `,
      [category, normalizedValue]
    );

    return normalizedValue;
  }

  async deleteReferenceItem(category, value) {
    await this.pool.query('DELETE FROM reference_items WHERE category = $1 AND value = $2;', [
      category,
      normalizeText(value)
    ]);
  }

  async getMedicineCache(query) {
    const result = await this.pool.query(
      `
        SELECT source, payload, fetched_at AS "fetchedAt"
        FROM medicine_cache
        WHERE query = $1
        LIMIT 1;
      `,
      [query]
    );

    return result.rows[0] ?? null;
  }

  async saveMedicineCache(query, source, payload) {
    await this.pool.query(
      `
        INSERT INTO medicine_cache (query, source, payload, fetched_at)
        VALUES ($1, $2, $3::jsonb, NOW())
        ON CONFLICT (query)
        DO UPDATE SET
          source = EXCLUDED.source,
          payload = EXCLUDED.payload,
          fetched_at = NOW();
      `,
      [query, source, JSON.stringify(payload)]
    );
  }

  async clearMedicineCache() {
    await this.pool.query('DELETE FROM medicine_cache;');
  }

  async close() {
    await this.pool.end();
  }
}

class JsonFileDatabase {
  constructor(filePath = JSON_DB_PATH) {
    this.filePath = filePath;
    this.state = null;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      this.state = this.createEmptyState();
      await this.persist();
    }

    if (!Array.isArray(this.state.validPrescriptions)) {
      this.state.validPrescriptions = [];
      await this.persist();
    }

    if (this.migrateSeedPrescriptionFields()) {
      await this.persist();
    }

    if (this.removeLegacyDemoPrescriptions()) {
      await this.persist();
    }

    if (this.migrateReferenceLists()) {
      await this.persist();
    }
  }

  createEmptyState() {
    return {
      validPrescriptions: [],
      transactions: [],
      medicineCache: {},
      referenceLists: {
        antibiotics: uniqueSorted(FALLBACK_ANTIBIOTICS),
        antibioticClasses: uniqueSorted(DEFAULT_ANTIBIOTIC_CLASSES)
      },
      counters: {
        transactions: 1
      }
    };
  }

  async persist() {
    await fs.writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  migrateSeedPrescriptionFields() {
    let changed = false;

    this.state.validPrescriptions = this.state.validPrescriptions.map((prescription) => {
      const seed = LEGACY_DEMO_PRESCRIPTIONS.find((item) => {
        return (
          item.patientId === prescription.patientId &&
          item.prescriberLicense === prescription.prescriberLicense &&
          normalizeMedicine(item.antibioticName) === normalizeMedicine(prescription.antibioticName)
        );
      });

      if (!seed) {
        if (!prescription.hospitalName) {
          changed = true;
          return {
            ...prescription,
            hospitalName: 'Unknown Hospital / Clinic'
          };
        }

        return prescription;
      }

      const merged = {
        ...seed,
        ...prescription,
        hospitalName: prescription.hospitalName || seed.hospitalName,
        antibioticClass: prescription.antibioticClass || seed.antibioticClass,
        dosage: prescription.dosage || seed.dosage,
        treatmentDurationDays: prescription.treatmentDurationDays || seed.treatmentDurationDays
      };

      if (
        merged.antibioticClass !== prescription.antibioticClass ||
        merged.hospitalName !== prescription.hospitalName ||
        merged.dosage !== prescription.dosage ||
        merged.treatmentDurationDays !== prescription.treatmentDurationDays
      ) {
        changed = true;
      }

      return merged;
    });

    return changed;
  }

  removeLegacyDemoPrescriptions() {
    const before = this.state.validPrescriptions.length;

    this.state.validPrescriptions = this.state.validPrescriptions.filter((prescription) => {
      return !LEGACY_DEMO_PRESCRIPTION_KEYS.some((demo) => {
        return (
          prescription.patientId === demo.patientId &&
          prescription.prescriberLicense === demo.prescriberLicense &&
          normalizeMedicine(prescription.antibioticName) === normalizeMedicine(demo.antibioticName)
        );
      });
    });

    return this.state.validPrescriptions.length !== before;
  }

  migrateReferenceLists() {
    let changed = false;

    if (!this.state.referenceLists || typeof this.state.referenceLists !== 'object') {
      this.state.referenceLists = {};
      changed = true;
    }

    if (!Array.isArray(this.state.referenceLists.antibiotics)) {
      this.state.referenceLists.antibiotics = uniqueSorted(FALLBACK_ANTIBIOTICS);
      changed = true;
    }

    if (!Array.isArray(this.state.referenceLists.antibioticClasses)) {
      this.state.referenceLists.antibioticClasses = uniqueSorted(DEFAULT_ANTIBIOTIC_CLASSES);
      changed = true;
    }

    const normalizedAntibiotics = uniqueSorted(this.state.referenceLists.antibiotics);
    const normalizedClasses = uniqueSorted(this.state.referenceLists.antibioticClasses);

    if (JSON.stringify(normalizedAntibiotics) !== JSON.stringify(this.state.referenceLists.antibiotics)) {
      this.state.referenceLists.antibiotics = normalizedAntibiotics;
      changed = true;
    }

    if (JSON.stringify(normalizedClasses) !== JSON.stringify(this.state.referenceLists.antibioticClasses)) {
      this.state.referenceLists.antibioticClasses = normalizedClasses;
      changed = true;
    }

    return changed;
  }

  async getPrescriptions() {
    return clone(this.state.validPrescriptions);
  }

  async savePrescription(prescription) {
    const existingIndex = this.state.validPrescriptions.findIndex((item) => {
      return (
        item.patientId === prescription.patientId &&
        item.hospitalName === prescription.hospitalName &&
        item.prescriberLicense === prescription.prescriberLicense &&
        normalizeMedicine(item.antibioticName) === normalizeMedicine(prescription.antibioticName)
      );
    });

    if (existingIndex >= 0) {
      this.state.validPrescriptions[existingIndex] = {
        ...this.state.validPrescriptions[existingIndex],
        ...prescription
      };
    } else {
      this.state.validPrescriptions.push(prescription);
    }

    await this.persist();
    return clone(existingIndex >= 0 ? this.state.validPrescriptions[existingIndex] : prescription);
  }

  async findValidPrescription({ patientId, hospitalName, prescriberLicense, antibioticName }) {
    const today = new Date().toISOString().slice(0, 10);

    return (
      this.state.validPrescriptions.find((prescription) => {
        return (
          prescription.patientId === patientId &&
          normalizeText(prescription.hospitalName).toLowerCase() === normalizeText(hospitalName).toLowerCase() &&
          prescription.prescriberLicense === prescriberLicense &&
          normalizeMedicine(prescription.antibioticName) === normalizeMedicine(antibioticName) &&
          prescription.expiryDate >= today
        );
      }) ?? null
    );
  }

  async saveTransaction(transaction) {
    const saved = {
      id: this.state.counters.transactions,
      timestamp: new Date().toISOString(),
      patientId: transaction.patientId,
      hospitalName: transaction.hospitalName,
      prescriberLicense: transaction.prescriberLicense,
      antibiotic: transaction.antibiotic,
      antibioticClass: transaction.antibioticClass,
      dosage: transaction.dosage,
      quantity: transaction.quantity,
      treatmentDurationDays: transaction.treatmentDurationDays,
      status: transaction.status,
      reason: transaction.reason
    };

    this.state.counters.transactions += 1;
    this.state.transactions.push(saved);
    await this.persist();

    return clone(saved);
  }

  async getTransactions() {
    return clone(this.state.transactions).sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() || b.id - a.id;
    });
  }

  async clearTransactions() {
    this.state.transactions = [];
    await this.persist();
  }

  async getReferenceList(category) {
    return clone(this.state.referenceLists?.[category] ?? []);
  }

  async addReferenceItem(category, value) {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
      throw new Error('Reference value is required.');
    }

    if (!this.state.referenceLists[category]) {
      this.state.referenceLists[category] = [];
    }

    this.state.referenceLists[category] = uniqueSorted([...this.state.referenceLists[category], normalizedValue]);
    await this.persist();

    return normalizedValue;
  }

  async deleteReferenceItem(category, value) {
    const normalizedValue = normalizeText(value);

    if (!this.state.referenceLists[category]) {
      return;
    }

    this.state.referenceLists[category] = this.state.referenceLists[category].filter((item) => item !== normalizedValue);
    await this.persist();
  }

  async getMedicineCache(query) {
    const cached = this.state.medicineCache[query];

    if (!cached) {
      return null;
    }

    return clone(cached);
  }

  async saveMedicineCache(query, source, payload) {
    this.state.medicineCache[query] = {
      source,
      payload,
      fetchedAt: new Date().toISOString()
    };

    await this.persist();
  }

  async clearMedicineCache() {
    this.state.medicineCache = {};
    await this.persist();
  }

  async close() {
    return undefined;
  }
}

export async function createDatabase(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const db = databaseUrl
    ? new PostgresDatabase(databaseUrl)
    : new JsonFileDatabase(options.filePath);

  await db.init();
  return db;
}

export function normalizeInput(value) {
  return normalizeText(value);
}
