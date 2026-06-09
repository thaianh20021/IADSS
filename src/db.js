import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'iadss-db.json');
const REFERENCE_SEED_VERSION = 2;

export const FALLBACK_DRUGS = [
  'Acetaminophen',
  'Acyclovir',
  'Adapalene',
  'Adenosine',
  'Alprazolam',
  'Amikacin',
  'Amiodarone',
  'Amlodipine',
  'Amoxicillin',
  'Amoxicillin/Clavulanate',
  'Amphotericin B',
  'Ampicillin',
  'Ampicillin/Sulbactam',
  'Apixaban',
  'Artificial tears',
  'Aspirin',
  'Atenolol',
  'Atorvastatin',
  'Atropine',
  'Azithromycin',
  'Aztreonam',
  'Baloxavir',
  'Beclomethasone',
  'Benzathine penicillin G',
  'Benzoyl peroxide',
  'Betamethasone',
  'Bictegravir',
  'Bisacodyl',
  'Bisoprolol',
  'Budesonide',
  'Bupivacaine',
  'Canagliflozin',
  'Carbamazepine',
  'Carvedilol',
  'Caspofungin',
  'Cefaclor',
  'Cefadroxil',
  'Cefazolin',
  'Cefdinir',
  'Cefepime',
  'Cefixime',
  'Cefotaxime',
  'Cefotetan',
  'Cefoxitin',
  'Cefpodoxime',
  'Ceftaroline',
  'Ceftazidime',
  'Ceftobiprole',
  'Ceftriaxone',
  'Cefuroxime',
  'Celecoxib',
  'Cephalexin',
  'Cetirizine',
  'Chloramphenicol',
  'Chlorpheniramine',
  'Cimetidine',
  'Ciprofloxacin',
  'Ciprofloxacin eye drops',
  'Clarithromycin',
  'Clindamycin',
  'Clonazepam',
  'Clopidogrel',
  'Clotrimazole',
  'Cloxacillin',
  'Codeine',
  'Colistin',
  'Combined oral contraceptives',
  'Dabigatran',
  'Dalbavancin',
  'Dapagliflozin',
  'Daptomycin',
  'Delafloxacin',
  'Dexamethasone',
  'Diazepam',
  'Diclofenac',
  'Dicloxacillin',
  'Digoxin',
  'Diltiazem',
  'Dobutamine',
  'Dopamine',
  'Doripenem',
  'Dolutegravir',
  'Domperidone',
  'Doxycycline',
  'Dulaglutide',
  'Duloxetine',
  'Efavirenz',
  'Emtricitabine',
  'Enalapril',
  'Enoxaparin',
  'Entecavir',
  'Epinephrine',
  'Ertapenem',
  'Erythromycin',
  'Escitalopram',
  'Esomeprazole',
  'Etomidate',
  'Etoricoxib',
  'Famciclovir',
  'Famotidine',
  'Fenofibrate',
  'Fentanyl',
  'Fexofenadine',
  'Fidaxomicin',
  'Flucytosine',
  'Fluconazole',
  'Fluoxetine',
  'Fluticasone',
  'Formoterol',
  'Fosfomycin',
  'Furosemide',
  'Gentamicin',
  'Glibenclamide',
  'Gliclazide',
  'Glimepiride',
  'Griseofulvin',
  'Haloperidol',
  'Heparin',
  'Hydrochlorothiazide',
  'Hydrocortisone',
  'Ibuprofen',
  'Imipenem/Cilastatin',
  'Indomethacin',
  'Insulin aspart',
  'Insulin glargine',
  'Insulin lispro',
  'Insulin regular',
  'Ipratropium',
  'Isotretinoin',
  'Itraconazole',
  'Ketamine',
  'Ketoconazole',
  'Ketorolac',
  'Lamivudine',
  'Lamotrigine',
  'Latanoprost',
  'Lactulose',
  'Ledipasvir',
  'Levetiracetam',
  'Levofloxacin',
  'Levonorgestrel',
  'Lidocaine',
  'Linagliptin',
  'Lincomycin',
  'Linezolid',
  'Liraglutide',
  'Lisinopril',
  'Loperamide',
  'Loratadine',
  'Lorazepam',
  'Losartan',
  'Meloxicam',
  'Meropenem',
  'Metformin',
  'Methylergometrine',
  'Methylprednisolone',
  'Metoclopramide',
  'Metoprolol',
  'Metronidazole',
  'Micafungin',
  'Miconazole',
  'Minocycline',
  'Misoprostol',
  'Morphine',
  'Moxifloxacin',
  'Mupirocin',
  'Nafcillin',
  'Naproxen',
  'Neomycin',
  'Nifedipine',
  'Nitrofurantoin',
  'Norepinephrine',
  'Norfloxacin',
  'NPH insulin',
  'Nystatin',
  'Ofloxacin',
  'Olanzapine',
  'Olmesartan',
  'Omeprazole',
  'Ondansetron',
  'Oseltamivir',
  'Oxacillin',
  'Oxycodone',
  'Oxytocin',
  'Pantoprazole',
  'Paracetamol',
  'Paroxetine',
  'Penicillin G',
  'Penicillin V',
  'Perindopril',
  'Phenytoin',
  'Piperacillin',
  'Piperacillin/Tazobactam',
  'Polyethylene glycol',
  'Polymyxin B',
  'Posaconazole',
  'Prednisolone',
  'Prednisone',
  'Procaine penicillin',
  'Progesterone',
  'Propofol',
  'Propranolol',
  'Quetiapine',
  'Rabeprazole',
  'Ramipril',
  'Ribavirin',
  'Rifampin',
  'Risperidone',
  'Ritonavir',
  'Rivaroxaban',
  'Ropivacaine',
  'Rosuvastatin',
  'Roxithromycin',
  'Salbutamol',
  'Salmeterol',
  'Semaglutide',
  'Sertraline',
  'Sevoflurane',
  'Simvastatin',
  'Sitagliptin',
  'Sofosbuvir',
  'Spironolactone',
  'Streptomycin',
  'Sulfadiazine',
  'Sulfasalazine',
  'Tacrolimus ointment',
  'Teicoplanin',
  'Telmisartan',
  'Tedizolid',
  'Tenofovir',
  'Terbinafine',
  'Tetracycline',
  'Ticarcillin',
  'Ticarcillin/Clavulanate',
  'Ticagrelor',
  'Tigecycline',
  'Timolol eye drops',
  'Tinidazole',
  'Tiotropium',
  'Tobramycin',
  'Tobramycin eye drops',
  'Torsemide',
  'Tramadol',
  'Trimethoprim/Sulfamethoxazole',
  'Valacyclovir',
  'Valproate',
  'Valsartan',
  'Vancomycin',
  'Venlafaxine',
  'Verapamil',
  'Vildagliptin',
  'Voriconazole',
  'Warfarin',
  'Zanamivir'
];

export const FALLBACK_ANTIBIOTICS = FALLBACK_DRUGS;

export const DEFAULT_DRUG_CLASSES = [
  'ACE inhibitor',
  'Analgesic',
  'Aminoglycoside',
  'Anti-herpes antiviral',
  'Anti-influenza antiviral',
  'Anticoagulant',
  'Antidiabetic',
  'Antiemetic',
  'Antiepileptic',
  'Antifungal',
  'Antihistamine',
  'Antihypertensive',
  'Antiplatelet',
  'Antipsychotic',
  'Antiviral',
  'ARB',
  'Bronchodilator',
  'Calcium channel blocker',
  'Carbapenem',
  'Cephalosporin',
  'Corticosteroid',
  'Dermatology',
  'Diuretic',
  'DPP-4 inhibitor',
  'Emergency medicine',
  'Echinocandin',
  'Fluoroquinolone',
  'General anesthetic',
  'GLP-1 agonist',
  'Glycopeptide',
  'H2 blocker',
  'Hepatitis antiviral',
  'HIV antiviral',
  'Inhaled corticosteroid',
  'Insulin',
  'Lincosamide',
  'Lipopeptide',
  'Lipid lowering',
  'Local anesthetic',
  'Macrolide',
  'Monobactam',
  'Nitrofuran',
  'Nitroimidazole',
  'NSAID',
  'Obstetrics and gynecology',
  'Ophthalmic',
  'Opioid analgesic',
  'Oxazolidinone',
  'Penicillin',
  'Polymyxin',
  'Polyene',
  'PPI',
  'Respiratory',
  'SGLT2 inhibitor',
  'SNRI',
  'SSRI',
  'Statin',
  'Sulfonamide',
  'Tetracycline'
];

export const DEFAULT_ANTIBIOTIC_CLASSES = DEFAULT_DRUG_CLASSES;

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

const PRESCRIPTION_STATUS = {
  VALID: 'Valid',
  PARTIALLY_DISPENSED: 'Partially Dispensed',
  FULLY_DISPENSED: 'Fully Dispensed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled'
};

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

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getPrescriptionStatus(prescription) {
  if (prescription.cancelledAt) {
    return PRESCRIPTION_STATUS.CANCELLED;
  }

  if (prescription.expiryDate < getTodayIsoDate()) {
    return PRESCRIPTION_STATUS.EXPIRED;
  }

  const quantityLimit = Number(prescription.quantityLimit) || 0;
  const dispensedQuantity = Number(prescription.dispensedQuantity) || 0;

  if (quantityLimit > 0 && dispensedQuantity >= quantityLimit) {
    return PRESCRIPTION_STATUS.FULLY_DISPENSED;
  }

  if (dispensedQuantity > 0) {
    return PRESCRIPTION_STATUS.PARTIALLY_DISPENSED;
  }

  return PRESCRIPTION_STATUS.VALID;
}

function withDispensingFields(prescription) {
  const quantityLimit = Number(prescription.quantityLimit) || 0;
  const dispensedQuantity = Math.max(0, Number(prescription.dispensedQuantity) || 0);
  const remainingQuantity = Math.max(quantityLimit - dispensedQuantity, 0);

  return {
    ...prescription,
    dispensedAt: prescription.dispensedAt ?? null,
    cancelledAt: prescription.cancelledAt ?? null,
    dispensedQuantity,
    remainingQuantity,
    prescriptionStatus: getPrescriptionStatus({
      ...prescription,
      dispensedQuantity
    })
  };
}

function normalizeReferenceCategory(category) {
  if (category === 'antibiotics') {
    return 'drugs';
  }

  if (category === 'antibioticClasses') {
    return 'drugClasses';
  }

  return category;
}

function createLegacyPrescriptionId(prescription, index) {
  const fallback = `RX-LEGACY-${String(index + 1).padStart(4, '0')}`;
  const pieces = [
    prescription.patientId,
    prescription.prescriberLicense,
    prescription.antibioticName
  ]
    .map((value) => normalizeText(value).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean);

  return pieces.length > 0 ? `RX-${pieces.join('-')}` : fallback;
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
        prescription_id TEXT NOT NULL UNIQUE,
        patient_id TEXT NOT NULL,
        hospital_name TEXT NOT NULL DEFAULT '',
        prescriber_license TEXT NOT NULL,
        antibiotic_name TEXT NOT NULL,
        antibiotic_class TEXT NOT NULL DEFAULT '',
        dosage TEXT NOT NULL DEFAULT '',
        quantity_limit INTEGER NOT NULL,
        treatment_duration_days INTEGER NOT NULL DEFAULT 1,
        expiry_date DATE NOT NULL,
        main_diagnosis TEXT NOT NULL DEFAULT '',
        icd10_code TEXT NOT NULL DEFAULT '',
        clinical_notes TEXT NOT NULL DEFAULT '',
        drug_allergies TEXT NOT NULL DEFAULT '',
        dispensed_quantity INTEGER NOT NULL DEFAULT 0,
        dispensed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        prescription_id TEXT,
        patient_id TEXT,
        hospital_name TEXT,
        prescriber_license TEXT,
        antibiotic TEXT,
        antibiotic_class TEXT,
        dosage TEXT,
        quantity INTEGER,
        treatment_duration_days INTEGER,
        prescription_status TEXT,
        status TEXT NOT NULL CHECK (status IN ('Approved', 'Blocked')),
        reason TEXT NOT NULL
      );
    `);

    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS prescription_id TEXT;');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS hospital_name TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS antibiotic_class TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS dosage TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS treatment_duration_days INTEGER NOT NULL DEFAULT 1;');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS main_diagnosis TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS icd10_code TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS clinical_notes TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS drug_allergies TEXT NOT NULL DEFAULT \'\';');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS dispensed_quantity INTEGER NOT NULL DEFAULT 0;');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMPTZ;');
    await this.pool.query('ALTER TABLE valid_prescriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;');
    await this.pool.query(`
      UPDATE valid_prescriptions
      SET dispensed_quantity = quantity_limit
      WHERE dispensed_at IS NOT NULL AND dispensed_quantity = 0;
    `);
    await this.pool.query(`
      UPDATE valid_prescriptions
      SET prescription_id = 'RX-LEGACY-' || id::text
      WHERE prescription_id IS NULL OR prescription_id = '';
    `);
    await this.pool.query('ALTER TABLE valid_prescriptions ALTER COLUMN prescription_id SET NOT NULL;');
    await this.pool.query('ALTER TABLE valid_prescriptions DROP CONSTRAINT IF EXISTS valid_prescriptions_patient_id_prescriber_license_antibiotic_name_key;');
    await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS valid_prescriptions_prescription_id_key ON valid_prescriptions (prescription_id);');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS prescription_id TEXT;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hospital_name TEXT;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS antibiotic_class TEXT;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dosage TEXT;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS treatment_duration_days INTEGER;');
    await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS prescription_status TEXT;');

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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await this.removeLegacyDemoPrescriptions();

    await this.seedReferenceItems('drugs', FALLBACK_DRUGS);
    await this.seedReferenceItems('drugClasses', DEFAULT_DRUG_CLASSES);
    await this.applyReferenceSeedVersion();
  }

  async applyReferenceSeedVersion() {
    const result = await this.pool.query('SELECT value FROM app_metadata WHERE key = $1;', [
      'referenceSeedVersion'
    ]);
    const currentVersion = Number(result.rows[0]?.value ?? 0);

    if (currentVersion >= REFERENCE_SEED_VERSION) {
      return;
    }

    for (const value of FALLBACK_DRUGS) {
      await this.addReferenceItem('drugs', value);
    }

    for (const value of DEFAULT_DRUG_CLASSES) {
      await this.addReferenceItem('drugClasses', value);
    }

    await this.pool.query(
      `
        INSERT INTO app_metadata (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value;
      `,
      ['referenceSeedVersion', String(REFERENCE_SEED_VERSION)]
    );
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
    const normalizedCategory = normalizeReferenceCategory(category);
    const result = await this.pool.query('SELECT COUNT(*)::int AS count FROM reference_items WHERE category = $1;', [
      normalizedCategory
    ]);

    if (result.rows[0].count > 0) {
      return;
    }

    for (const value of values) {
      await this.addReferenceItem(normalizedCategory, value);
    }
  }

  async getPrescriptions() {
    const result = await this.pool.query(`
      SELECT
        prescription_id AS "prescriptionId",
        patient_id AS "patientId",
        hospital_name AS "hospitalName",
        prescriber_license AS "prescriberLicense",
        antibiotic_name AS "antibioticName",
        antibiotic_class AS "antibioticClass",
        dosage,
        quantity_limit AS "quantityLimit",
        treatment_duration_days AS "treatmentDurationDays",
        expiry_date::text AS "expiryDate",
        main_diagnosis AS "mainDiagnosis",
        icd10_code AS "icd10Code",
        clinical_notes AS "clinicalNotes",
        drug_allergies AS "drugAllergies",
        dispensed_quantity AS "dispensedQuantity",
        GREATEST(quantity_limit - dispensed_quantity, 0) AS "remainingQuantity",
        dispensed_at AS "dispensedAt",
        cancelled_at AS "cancelledAt",
        CASE
          WHEN cancelled_at IS NOT NULL THEN 'Cancelled'
          WHEN expiry_date < CURRENT_DATE THEN 'Expired'
          WHEN dispensed_quantity >= quantity_limit THEN 'Fully Dispensed'
          WHEN dispensed_quantity > 0 THEN 'Partially Dispensed'
          ELSE 'Valid'
        END AS "prescriptionStatus"
      FROM valid_prescriptions
      ORDER BY patient_id, antibiotic_name;
    `);

    return result.rows;
  }

  async savePrescription(prescription) {
    const result = await this.pool.query(
      `
        INSERT INTO valid_prescriptions (
          prescription_id,
          patient_id,
          hospital_name,
          prescriber_license,
          antibiotic_name,
          antibiotic_class,
          dosage,
          quantity_limit,
          treatment_duration_days,
          expiry_date,
          main_diagnosis,
          icd10_code,
          clinical_notes,
          drug_allergies
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (prescription_id)
        DO UPDATE SET
          hospital_name = EXCLUDED.hospital_name,
          patient_id = EXCLUDED.patient_id,
          prescriber_license = EXCLUDED.prescriber_license,
          antibiotic_name = EXCLUDED.antibiotic_name,
          antibiotic_class = EXCLUDED.antibiotic_class,
          dosage = EXCLUDED.dosage,
          quantity_limit = EXCLUDED.quantity_limit,
          treatment_duration_days = EXCLUDED.treatment_duration_days,
          expiry_date = EXCLUDED.expiry_date,
          main_diagnosis = EXCLUDED.main_diagnosis,
          icd10_code = EXCLUDED.icd10_code,
          clinical_notes = EXCLUDED.clinical_notes,
          drug_allergies = EXCLUDED.drug_allergies
        RETURNING
          prescription_id AS "prescriptionId",
          patient_id AS "patientId",
          hospital_name AS "hospitalName",
          prescriber_license AS "prescriberLicense",
          antibiotic_name AS "antibioticName",
          antibiotic_class AS "antibioticClass",
          dosage,
          quantity_limit AS "quantityLimit",
          treatment_duration_days AS "treatmentDurationDays",
          expiry_date::text AS "expiryDate",
          main_diagnosis AS "mainDiagnosis",
          icd10_code AS "icd10Code",
          clinical_notes AS "clinicalNotes",
          drug_allergies AS "drugAllergies",
          dispensed_quantity AS "dispensedQuantity",
          GREATEST(quantity_limit - dispensed_quantity, 0) AS "remainingQuantity",
          dispensed_at AS "dispensedAt",
          cancelled_at AS "cancelledAt",
          CASE
            WHEN cancelled_at IS NOT NULL THEN 'Cancelled'
            WHEN expiry_date < CURRENT_DATE THEN 'Expired'
            WHEN dispensed_quantity >= quantity_limit THEN 'Fully Dispensed'
            WHEN dispensed_quantity > 0 THEN 'Partially Dispensed'
            ELSE 'Valid'
          END AS "prescriptionStatus";
      `,
      [
        prescription.prescriptionId,
        prescription.patientId,
        prescription.hospitalName,
        prescription.prescriberLicense,
        prescription.antibioticName,
        prescription.antibioticClass,
        prescription.dosage,
        prescription.quantityLimit,
        prescription.treatmentDurationDays,
        prescription.expiryDate,
        prescription.mainDiagnosis,
        prescription.icd10Code,
        prescription.clinicalNotes,
        prescription.drugAllergies
      ]
    );

    return result.rows[0];
  }

  async findPrescriptionById(prescriptionId) {
    const result = await this.pool.query(
      `
        SELECT
          prescription_id AS "prescriptionId",
          patient_id AS "patientId",
          hospital_name AS "hospitalName",
          prescriber_license AS "prescriberLicense",
          antibiotic_name AS "antibioticName",
          antibiotic_class AS "antibioticClass",
          dosage,
          quantity_limit AS "quantityLimit",
          treatment_duration_days AS "treatmentDurationDays",
          expiry_date::text AS "expiryDate",
          main_diagnosis AS "mainDiagnosis",
          icd10_code AS "icd10Code",
          clinical_notes AS "clinicalNotes",
          drug_allergies AS "drugAllergies",
          dispensed_quantity AS "dispensedQuantity",
          GREATEST(quantity_limit - dispensed_quantity, 0) AS "remainingQuantity",
          dispensed_at AS "dispensedAt",
          cancelled_at AS "cancelledAt",
          CASE
            WHEN cancelled_at IS NOT NULL THEN 'Cancelled'
            WHEN expiry_date < CURRENT_DATE THEN 'Expired'
            WHEN dispensed_quantity >= quantity_limit THEN 'Fully Dispensed'
            WHEN dispensed_quantity > 0 THEN 'Partially Dispensed'
            ELSE 'Valid'
          END AS "prescriptionStatus"
        FROM valid_prescriptions
        WHERE LOWER(prescription_id) = LOWER($1)
        LIMIT 1;
      `,
      [prescriptionId]
    );

    return result.rows[0] ?? null;
  }

  async addPrescriptionDispense(prescriptionId, quantity) {
    await this.pool.query(
      `
        UPDATE valid_prescriptions
        SET
          dispensed_quantity = LEAST(quantity_limit, dispensed_quantity + $2),
          dispensed_at = CASE
            WHEN dispensed_quantity + $2 >= quantity_limit THEN COALESCE(dispensed_at, NOW())
            ELSE dispensed_at
          END
        WHERE LOWER(prescription_id) = LOWER($1);
      `,
      [prescriptionId, quantity]
    );
  }

  async cancelPrescription(prescriptionId) {
    await this.pool.query(
      `
        UPDATE valid_prescriptions
        SET cancelled_at = COALESCE(cancelled_at, NOW())
        WHERE LOWER(prescription_id) = LOWER($1);
      `,
      [prescriptionId]
    );
  }

  async saveTransaction(transaction) {
    const result = await this.pool.query(
      `
        INSERT INTO transactions (
          prescription_id,
          patient_id,
          hospital_name,
          prescriber_license,
          antibiotic,
          antibiotic_class,
          dosage,
          quantity,
          treatment_duration_days,
          prescription_status,
          status,
          reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING
          id,
          timestamp,
          prescription_id AS "prescriptionId",
          patient_id AS "patientId",
          hospital_name AS "hospitalName",
          prescriber_license AS "prescriberLicense",
          antibiotic,
          antibiotic_class AS "antibioticClass",
          dosage,
          quantity,
          treatment_duration_days AS "treatmentDurationDays",
          prescription_status AS "prescriptionStatus",
          status,
          reason;
      `,
      [
        transaction.prescriptionId,
        transaction.patientId,
        transaction.hospitalName,
        transaction.prescriberLicense,
        transaction.antibiotic,
        transaction.antibioticClass,
        transaction.dosage,
        transaction.quantity,
        transaction.treatmentDurationDays,
        transaction.prescriptionStatus,
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
        prescription_id AS "prescriptionId",
        patient_id AS "patientId",
        hospital_name AS "hospitalName",
        prescriber_license AS "prescriberLicense",
        antibiotic,
        antibiotic_class AS "antibioticClass",
        dosage,
        quantity,
        treatment_duration_days AS "treatmentDurationDays",
        prescription_status AS "prescriptionStatus",
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
    const normalizedCategory = normalizeReferenceCategory(category);
    const result = await this.pool.query(
      'SELECT value FROM reference_items WHERE category = $1 ORDER BY value;',
      [normalizedCategory]
    );

    return result.rows.map((row) => row.value);
  }

  async addReferenceItem(category, value) {
    const normalizedCategory = normalizeReferenceCategory(category);
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
      [normalizedCategory, normalizedValue]
    );

    return normalizedValue;
  }

  async deleteReferenceItem(category, value) {
    const normalizedCategory = normalizeReferenceCategory(category);
    await this.pool.query('DELETE FROM reference_items WHERE category = $1 AND value = $2;', [
      normalizedCategory,
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
        drugs: uniqueSorted(FALLBACK_DRUGS),
        drugClasses: uniqueSorted(DEFAULT_DRUG_CLASSES)
      },
      metadata: {
        referenceSeedVersion: REFERENCE_SEED_VERSION
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

    this.state.validPrescriptions = this.state.validPrescriptions.map((prescription, index) => {
      const seed = LEGACY_DEMO_PRESCRIPTIONS.find((item) => {
        return (
          item.patientId === prescription.patientId &&
          item.prescriberLicense === prescription.prescriberLicense &&
          normalizeMedicine(item.antibioticName) === normalizeMedicine(prescription.antibioticName)
        );
      });

      const prescriptionWithId = {
        ...prescription,
        prescriptionId: prescription.prescriptionId || createLegacyPrescriptionId(prescription, index),
        mainDiagnosis: prescription.mainDiagnosis ?? '',
        icd10Code: prescription.icd10Code ?? '',
        clinicalNotes: prescription.clinicalNotes ?? '',
        drugAllergies: prescription.drugAllergies ?? '',
        dispensedQuantity: prescription.dispensedQuantity ?? (prescription.dispensedAt ? prescription.quantityLimit : 0),
        cancelledAt: prescription.cancelledAt ?? null
      };

      if (!prescription.prescriptionId) {
        changed = true;
      }

      if (!seed) {
        if (!prescription.hospitalName) {
          changed = true;
          return {
            ...prescriptionWithId,
            hospitalName: 'Unknown Hospital / Clinic'
          };
        }

        return prescriptionWithId;
      }

      const merged = {
        ...seed,
        ...prescriptionWithId,
        prescriptionId: prescriptionWithId.prescriptionId,
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

    if (!this.state.metadata || typeof this.state.metadata !== 'object') {
      this.state.metadata = {};
      changed = true;
    }

    if (!Array.isArray(this.state.referenceLists.drugs)) {
      this.state.referenceLists.drugs = uniqueSorted([
        ...(this.state.referenceLists.antibiotics ?? []),
        ...FALLBACK_DRUGS
      ]);
      changed = true;
    }

    if (!Array.isArray(this.state.referenceLists.drugClasses)) {
      this.state.referenceLists.drugClasses = uniqueSorted([
        ...(this.state.referenceLists.antibioticClasses ?? []),
        ...DEFAULT_DRUG_CLASSES
      ]);
      changed = true;
    }

    const currentSeedVersion = Number(this.state.metadata.referenceSeedVersion ?? 0);
    const seedDrugs = currentSeedVersion < REFERENCE_SEED_VERSION ? FALLBACK_DRUGS : [];
    const seedClasses = currentSeedVersion < REFERENCE_SEED_VERSION ? DEFAULT_DRUG_CLASSES : [];
    const normalizedDrugs = uniqueSorted([...this.state.referenceLists.drugs, ...seedDrugs]);
    const normalizedClasses = uniqueSorted([...this.state.referenceLists.drugClasses, ...seedClasses]);

    if (JSON.stringify(normalizedDrugs) !== JSON.stringify(this.state.referenceLists.drugs)) {
      this.state.referenceLists.drugs = normalizedDrugs;
      changed = true;
    }

    if (JSON.stringify(normalizedClasses) !== JSON.stringify(this.state.referenceLists.drugClasses)) {
      this.state.referenceLists.drugClasses = normalizedClasses;
      changed = true;
    }

    if (currentSeedVersion < REFERENCE_SEED_VERSION) {
      this.state.metadata.referenceSeedVersion = REFERENCE_SEED_VERSION;
      changed = true;
    }

    return changed;
  }

  async getPrescriptions() {
    return clone(
      this.state.validPrescriptions.map((prescription) => withDispensingFields(prescription))
    );
  }

  async savePrescription(prescription) {
    const existingIndex = this.state.validPrescriptions.findIndex((item) => {
      return normalizeText(item.prescriptionId).toLowerCase() === normalizeText(prescription.prescriptionId).toLowerCase();
    });

    if (existingIndex >= 0) {
      this.state.validPrescriptions[existingIndex] = {
        ...this.state.validPrescriptions[existingIndex],
        ...prescription,
        dispensedQuantity: this.state.validPrescriptions[existingIndex].dispensedQuantity ?? 0,
        dispensedAt: this.state.validPrescriptions[existingIndex].dispensedAt ?? null,
        cancelledAt: this.state.validPrescriptions[existingIndex].cancelledAt ?? null
      };
    } else {
      this.state.validPrescriptions.push({
        ...prescription,
        dispensedQuantity: 0,
        dispensedAt: null,
        cancelledAt: null
      });
    }

    await this.persist();
    const saved = existingIndex >= 0
      ? this.state.validPrescriptions[existingIndex]
      : this.state.validPrescriptions[this.state.validPrescriptions.length - 1];

    return clone(withDispensingFields(saved));
  }

  async findPrescriptionById(prescriptionId) {
    const prescription = this.state.validPrescriptions.find((item) => {
      return normalizeText(item.prescriptionId).toLowerCase() === normalizeText(prescriptionId).toLowerCase();
    });

    if (!prescription) {
      return null;
    }

    return clone(withDispensingFields(prescription));
  }

  async addPrescriptionDispense(prescriptionId, quantity) {
    const prescription = this.state.validPrescriptions.find((item) => {
      return normalizeText(item.prescriptionId).toLowerCase() === normalizeText(prescriptionId).toLowerCase();
    });

    if (!prescription) {
      return;
    }

    prescription.dispensedQuantity = Math.min(
      Number(prescription.quantityLimit) || 0,
      (Number(prescription.dispensedQuantity) || 0) + quantity
    );

    if (prescription.dispensedQuantity >= prescription.quantityLimit) {
      prescription.dispensedAt = prescription.dispensedAt ?? new Date().toISOString();
    }

    await this.persist();
  }

  async cancelPrescription(prescriptionId) {
    const prescription = this.state.validPrescriptions.find((item) => {
      return normalizeText(item.prescriptionId).toLowerCase() === normalizeText(prescriptionId).toLowerCase();
    });

    if (!prescription) {
      return;
    }

    prescription.cancelledAt = prescription.cancelledAt ?? new Date().toISOString();
    await this.persist();
  }

  async saveTransaction(transaction) {
    const saved = {
      id: this.state.counters.transactions,
      timestamp: new Date().toISOString(),
      prescriptionId: transaction.prescriptionId,
      patientId: transaction.patientId,
      hospitalName: transaction.hospitalName,
      prescriberLicense: transaction.prescriberLicense,
      antibiotic: transaction.antibiotic,
      antibioticClass: transaction.antibioticClass,
      dosage: transaction.dosage,
      quantity: transaction.quantity,
      treatmentDurationDays: transaction.treatmentDurationDays,
      prescriptionStatus: transaction.prescriptionStatus,
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
    return clone(this.state.referenceLists?.[normalizeReferenceCategory(category)] ?? []);
  }

  async addReferenceItem(category, value) {
    const normalizedCategory = normalizeReferenceCategory(category);
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
      throw new Error('Reference value is required.');
    }

    if (!this.state.referenceLists[normalizedCategory]) {
      this.state.referenceLists[normalizedCategory] = [];
    }

    this.state.referenceLists[normalizedCategory] = uniqueSorted([...this.state.referenceLists[normalizedCategory], normalizedValue]);
    await this.persist();

    return normalizedValue;
  }

  async deleteReferenceItem(category, value) {
    const normalizedCategory = normalizeReferenceCategory(category);
    const normalizedValue = normalizeText(value);

    if (!this.state.referenceLists[normalizedCategory]) {
      return;
    }

    this.state.referenceLists[normalizedCategory] = this.state.referenceLists[normalizedCategory].filter((item) => item !== normalizedValue);
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
