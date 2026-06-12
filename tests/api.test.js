import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

import { createApp } from '../server.js';
import { createDatabase } from '../src/db.js';

const testDbPath = path.join(os.tmpdir(), `iadss-test-${Date.now()}.json`);

let app;
let db;
let prescriptionCounter = 1;
const tokens = {};
const users = {};

function nextPrescriptionId(prefix = 'RX-TEST') {
  const id = `${prefix}-${String(prescriptionCounter).padStart(3, '0')}`;
  prescriptionCounter += 1;
  return id;
}

async function saveAmoxicillinPrescription(overrides = {}) {
  const prescriptionId = overrides.prescriptionId ?? nextPrescriptionId('RX-AMOX');
  const payload = {
    prescriptionId,
    patientId: '12345',
    hospitalName: 'National General Hospital',
    prescriberLicense: '98765',
    antibioticName: 'Amoxicillin',
    antibioticClass: 'Penicillin',
    dosage: '500mg',
    quantityLimit: 20,
    treatmentDurationDays: 5,
    expiryDate: '2027-12-31',
    ...overrides
  };

  const response = await request(app)
    .post('/api/prescriptions')
    .set(authHeader('doctor'))
    .send(payload)
    .expect(201);

  return response.body.prescription;
}

function authHeader(role) {
  return {
    Authorization: `Bearer ${tokens[role]}`
  };
}

async function registerRole(role) {
  const unique = Date.now();
  return registerUser(role, `${role}-${unique}`, `${role}-${unique}@iadss.test`);
}

async function registerUser(role, username, email) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      name: `${role} user`,
      username,
      email,
      password: 'password123',
      role
    })
    .expect(201);

  if (!tokens[role]) {
    tokens[role] = response.body.token;
    users[role] = response.body.user;
  }

  assert.equal(response.body.user.username, username);
  return response.body;
}

describe('IADSS API', () => {
  before(async () => {
    db = await createDatabase({ filePath: testDbPath });
    app = await createApp({ db });
    await registerRole('pharmacy');
    await registerRole('doctor');
    await registerRole('moh');
  });

  after(async () => {
    await db.close();
    await fs.rm(testDbPath, { force: true });
  });

  it('starts without demo prescriptions and exposes configurable reference lists', async () => {
    const response = await request(app).get('/api/prescriptions').set(authHeader('doctor')).expect(200);

    assert.equal(response.body.prescriptions.length, 0);

    const antibiotics = await request(app).get('/api/reference/antibiotics').set(authHeader('doctor')).expect(200);
    assert.ok(antibiotics.body.items.includes('Amoxicillin'));

    const classes = await request(app).get('/api/reference/antibioticClasses').set(authHeader('doctor')).expect(200);
    assert.ok(classes.body.items.includes('Penicillin'));

    const added = await request(app).post('/api/reference/antibiotics').set(authHeader('moh')).send({ value: 'Testamycin' }).expect(201);
    assert.ok(added.body.items.includes('Testamycin'));

    const deleted = await request(app).delete('/api/reference/antibiotics/Testamycin').set(authHeader('moh')).expect(200);
    assert.equal(deleted.body.items.includes('Testamycin'), false);
  });

  it('requires login for protected endpoints and exposes the current user', async () => {
    await request(app).get('/api/transactions').expect(401);

    const login = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: users.pharmacy.username,
        password: 'password123'
      })
      .expect(200);

    assert.equal(login.body.user.pharmacyId, `PHARM-${users.pharmacy.username}`);

    const me = await request(app)
      .get('/api/auth/me')
      .set(authHeader('moh'))
      .expect(200);

    assert.equal(me.body.user.role, 'moh');
    assert.equal(me.body.user.mohId, `MOH-${me.body.user.username}`);
  });

  it('blocks authenticated users from portals outside their role', async () => {
    await request(app).get('/api/transactions').set(authHeader('doctor')).expect(403);
    await request(app).post('/api/prescriptions').set(authHeader('pharmacy')).send({}).expect(403);
    await request(app).post('/api/reference/drugs').set(authHeader('doctor')).send({ value: 'Rolemycin' }).expect(403);
  });

  it('approves a prescription entered by a hospital or doctor', async () => {
    const prescription = await saveAmoxicillinPrescription();

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        patientId: '12345',
        hospitalName: 'National General Hospital',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Penicillin',
        dosage: '500mg',
        quantity: 10,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Approved');
    assert.equal(response.body.transaction.pharmacyId, `PHARM-${users.pharmacy.username}`);
    assert.equal(response.body.transaction.prescriptionStatus, 'Valid');
    assert.equal(response.body.message, 'Transaction Approved. Data synced to MOH.');

    const prescriptions = await request(app).get('/api/prescriptions').set(authHeader('doctor')).expect(200);
    const dispensed = prescriptions.body.prescriptions.find((item) => item.prescriptionId === prescription.prescriptionId);
    assert.equal(dispensed.doctorId, users.doctor.username);
    assert.equal(dispensed.hospitalId, `HOSP-${users.doctor.username}`);
    assert.equal(dispensed.prescriptionStatus, 'Partially Dispensed');
    assert.equal(dispensed.dispensedQuantity, 10);
    assert.equal(dispensed.remainingQuantity, 10);
  });

  it('lets a doctor create a prescription that the pharmacy POS can verify', async () => {
    const prescriptionId = nextPrescriptionId('RX-DOCTOR');
    const prescription = await request(app)
      .post('/api/prescriptions')
      .set(authHeader('doctor'))
      .send({
        prescriptionId,
        patientId: '77777',
        hospitalName: 'University Medical Center',
        prescriberLicense: 'DOC-2026',
        antibioticName: 'Cefixime',
        antibioticClass: 'Cephalosporin',
        dosage: '200mg',
        quantityLimit: 14,
        treatmentDurationDays: 7,
        expiryDate: '2027-12-31',
        mainDiagnosis: 'Acute pharyngitis',
        icd10Code: 'J02.9',
        clinicalNotes: 'Internal note',
        drugAllergies: 'None known'
      })
      .expect(201);

    assert.equal(prescription.body.prescription.patientId, '77777');
    assert.equal(prescription.body.prescription.prescriptionStatus, 'Valid');

    const lookup = await request(app).get(`/api/prescriptions/${prescriptionId}`).set(authHeader('pharmacy')).expect(200);
    assert.equal(lookup.body.prescription.drugName, 'Cefixime');
    assert.equal(lookup.body.prescription.remainingQuantity, 14);
    assert.equal(lookup.body.prescription.mainDiagnosis, undefined);
    assert.equal(lookup.body.prescription.clinicalNotes, undefined);

    const transaction = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId,
        quantity: 14
      })
      .expect(201);

    assert.equal(transaction.body.transaction.status, 'Approved');
  });

  it('supports separate organization IDs and multiple medicines in one prescription', async () => {
    const prescriptionId = nextPrescriptionId('RX-MULTI');
    const created = await request(app)
      .post('/api/prescriptions')
      .set(authHeader('doctor'))
      .send({
        prescriptionId,
        patientId: '55555',
        hospitalId: 'HOSP-MULTI-001',
        hospitalName: 'Multi Care Hospital',
        prescriberLicense: 'DOC-MULTI',
        items: [
          {
            itemId: 'MED-1',
            drugName: 'Amoxicillin',
            drugClass: 'Penicillin',
            dosage: '500mg',
            quantityLimit: 10,
            treatmentDurationDays: 5,
            expiryDate: '2027-12-31'
          },
          {
            itemId: 'MED-2',
            drugName: 'Azithromycin',
            drugClass: 'Macrolide',
            dosage: '250mg',
            quantityLimit: 6,
            treatmentDurationDays: 3,
            expiryDate: '2027-12-31'
          }
        ]
      })
      .expect(201);

    assert.equal(created.body.prescription.doctorId, users.doctor.username);
    assert.equal(created.body.prescription.hospitalId, 'HOSP-MULTI-001');
    assert.equal(created.body.prescription.items.length, 2);

    const lookup = await request(app).get(`/api/prescriptions/${prescriptionId}`).set(authHeader('pharmacy')).expect(200);
    assert.equal(lookup.body.prescription.items.length, 2);
    assert.equal(lookup.body.prescription.items[0].remainingQuantity, 10);
    assert.equal(lookup.body.prescription.clinicalNotes, undefined);

    const missingItem = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId,
        quantity: 1
      })
      .expect(201);

    assert.equal(missingItem.body.transaction.status, 'Blocked');
    assert.equal(missingItem.body.transaction.reason, 'Multiple medicines in this prescription. Select a medicine item before dispensing.');

    const firstDispense = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId,
        itemId: 'MED-1',
        hospitalId: 'HOSP-MULTI-001',
        quantity: 5
      })
      .expect(201);

    assert.equal(firstDispense.body.transaction.status, 'Approved');
    assert.equal(firstDispense.body.transaction.itemId, 'MED-1');
    assert.equal(firstDispense.body.transaction.hospitalId, 'HOSP-MULTI-001');

    const afterFirst = await request(app).get(`/api/prescriptions/${prescriptionId}`).set(authHeader('pharmacy')).expect(200);
    const med1 = afterFirst.body.prescription.items.find((item) => item.itemId === 'MED-1');
    const med2 = afterFirst.body.prescription.items.find((item) => item.itemId === 'MED-2');
    assert.equal(med1.remainingQuantity, 5);
    assert.equal(med2.remainingQuantity, 6);
    assert.equal(afterFirst.body.prescription.prescriptionStatus, 'Partially Dispensed');
  });

  it('limits doctors to prescriptions created by their own account', async () => {
    const secondaryId = Date.now();
    const secondary = await registerUser(
      'doctor',
      `doctor-secondary-${secondaryId}`,
      `doctor-secondary-${secondaryId}@iadss.test`
    );
    const ownPrescription = await request(app)
      .post('/api/prescriptions')
      .set({ Authorization: `Bearer ${secondary.token}` })
      .send({
        prescriptionId: nextPrescriptionId('RX-SECONDARY'),
        patientId: '88801',
        hospitalName: 'Secondary Clinic',
        prescriberLicense: 'DOC-SECOND',
        antibioticName: 'Azithromycin',
        antibioticClass: 'Macrolide',
        dosage: '250mg',
        quantityLimit: 6,
        treatmentDurationDays: 3,
        expiryDate: '2027-12-31'
      })
      .expect(201);

    await request(app)
      .get(`/api/prescriptions/${ownPrescription.body.prescription.prescriptionId}`)
      .set(authHeader('doctor'))
      .expect(403);

    await request(app)
      .post(`/api/prescriptions/${ownPrescription.body.prescription.prescriptionId}/cancel`)
      .set(authHeader('doctor'))
      .expect(403);

    const primaryList = await request(app).get('/api/prescriptions').set(authHeader('doctor')).expect(200);
    assert.equal(
      primaryList.body.prescriptions.some((item) => item.prescriptionId === ownPrescription.body.prescription.prescriptionId),
      false
    );

    const mohList = await request(app).get('/api/prescriptions').set(authHeader('moh')).expect(200);
    assert.equal(
      mohList.body.prescriptions.some((item) => item.prescriptionId === ownPrescription.body.prescription.prescriptionId),
      true
    );

    await request(app)
      .post(`/api/prescriptions/${ownPrescription.body.prescription.prescriptionId}/cancel`)
      .set(authHeader('moh'))
      .expect(200);
  });

  it('generates a QR code image for a prescription ID', async () => {
    const prescription = await saveAmoxicillinPrescription({
      prescriptionId: nextPrescriptionId('RX-QR')
    });

    const response = await request(app)
      .get(`/api/prescriptions/${prescription.prescriptionId}/qr`)
      .expect(200)
      .expect('Content-Type', /image\/png/);

    assert.ok(response.body.length > 100);
  });

  it('blocks cancelled prescriptions', async () => {
    const prescription = await saveAmoxicillinPrescription({
      prescriptionId: nextPrescriptionId('RX-CANCEL')
    });

    await request(app).post(`/api/prescriptions/${prescription.prescriptionId}/cancel`).set(authHeader('doctor')).expect(200);

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        quantity: 1
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.prescriptionStatus, 'Cancelled');
  });

  it('allows partial dispensing and blocks quantities above the remaining limit', async () => {
    const prescription = await saveAmoxicillinPrescription();
    const payload = {
      prescriptionId: prescription.prescriptionId,
      patientId: '12345',
      hospitalName: 'National General Hospital',
      prescriberLicense: '98765',
      antibiotic: 'Amoxicillin',
      antibioticClass: 'Penicillin',
      dosage: '500mg',
      quantity: 10,
      treatmentDurationDays: 5
    };

    const approved = await request(app).post('/api/transactions').set(authHeader('pharmacy')).send(payload).expect(201);
    assert.equal(approved.body.transaction.status, 'Approved');

    const tooMuch = await request(app).post('/api/transactions').set(authHeader('pharmacy')).send({ ...payload, quantity: 11 }).expect(201);
    assert.equal(tooMuch.body.transaction.status, 'Blocked');
    assert.equal(tooMuch.body.transaction.prescriptionStatus, 'Partially Dispensed');
    assert.equal(tooMuch.body.transaction.reason, 'Dispense quantity exceeds remaining quantity of 10.');

    const remaining = await request(app).post('/api/transactions').set(authHeader('pharmacy')).send(payload).expect(201);
    assert.equal(remaining.body.transaction.status, 'Approved');
    assert.equal(remaining.body.transaction.prescriptionStatus, 'Partially Dispensed');

    const afterFull = await request(app).post('/api/transactions').set(authHeader('pharmacy')).send({ ...payload, quantity: 1 }).expect(201);
    assert.equal(afterFull.body.transaction.status, 'Blocked');
    assert.equal(afterFull.body.transaction.prescriptionStatus, 'Fully Dispensed');
    assert.equal(afterFull.body.transaction.reason, 'Prescription status is Fully Dispensed.');
  });

  it('blocks expired prescriptions', async () => {
    const prescription = await saveAmoxicillinPrescription({
      prescriptionId: nextPrescriptionId('RX-EXPIRED'),
      expiryDate: '2020-01-01'
    });

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        patientId: '12345',
        hospitalName: 'National General Hospital',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Penicillin',
        dosage: '500mg',
        quantity: 10,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.prescriptionStatus, 'Expired');
    assert.equal(response.body.transaction.reason, 'Prescription status is Expired.');
  });

  it('blocks missing transaction fields', async () => {
    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        patientId: '00000',
        hospitalName: 'National General Hospital',
        antibiotic: 'Amoxicillin',
        quantity: 1
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.message, 'HIGH RISK ALERT: Invalid Prescription. Sale Blocked.');
  });

  it('blocks invalid prescription details', async () => {
    const prescription = await saveAmoxicillinPrescription();

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        patientId: '12345',
        hospitalName: 'National General Hospital',
        prescriberLicense: '98765',
        antibiotic: 'Doxycycline',
        antibioticClass: 'Tetracycline',
        dosage: '100mg',
        quantity: 2,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Drug does not match prescription drug Amoxicillin.');
  });

  it('blocks transactions from the wrong hospital or clinic', async () => {
    const prescription = await saveAmoxicillinPrescription();

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        patientId: '12345',
        hospitalName: 'Wrong Hospital',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Penicillin',
        dosage: '500mg',
        quantity: 10,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Patient, hospital, or prescriber does not match prescription record.');
  });

  it('blocks transactions that exceed the prescription quantity limit', async () => {
    const prescription = await saveAmoxicillinPrescription();

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        patientId: '12345',
        hospitalName: 'National General Hospital',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Penicillin',
        dosage: '500mg',
        quantity: 21,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Dispense quantity exceeds remaining quantity of 20.');
  });

  it('records audited overrides without reducing valid remaining quantity', async () => {
    const prescription = await saveAmoxicillinPrescription({
      prescriptionId: nextPrescriptionId('RX-OVERRIDE'),
      quantityLimit: 5
    });

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        quantity: 6,
        overrideBlocked: true,
        pharmacistLicense: 'PHARM-999',
        overrideReason: 'Confirmed dosage change with prescriber by phone.'
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Overridden');
    assert.equal(response.body.transaction.pharmacistLicense, 'PHARM-999');
    assert.equal(response.body.message, 'AUDITED OVERRIDE: Transaction recorded for MOH review.');

    const lookup = await request(app).get(`/api/prescriptions/${prescription.prescriptionId}`).set(authHeader('pharmacy')).expect(200);
    assert.equal(lookup.body.prescription.remainingQuantity, 5);
  });

  it('blocks transactions that exceed the prescription treatment duration', async () => {
    const prescription = await saveAmoxicillinPrescription();

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        patientId: '12345',
        hospitalName: 'National General Hospital',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Penicillin',
        dosage: '500mg',
        quantity: 10,
        treatmentDurationDays: 6
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Treatment duration exceeds prescription duration of 5 days.');
  });

  it('blocks transactions with the wrong antibiotic class', async () => {
    const prescription = await saveAmoxicillinPrescription();

    const response = await request(app)
      .post('/api/transactions')
      .set(authHeader('pharmacy'))
      .send({
        prescriptionId: prescription.prescriptionId,
        patientId: '12345',
        hospitalName: 'National General Hospital',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Macrolide',
        dosage: '500mg',
        quantity: 10,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Drug class does not match prescription class Penicillin.');
  });

  it('returns transaction history and clears it', async () => {
    const history = await request(app).get('/api/transactions').set(authHeader('moh')).expect(200);

    assert.ok(history.body.transactions.length >= 10);
    assert.ok(history.body.transactions.some((transaction) => transaction.prescriptionStatus === 'Fully Dispensed'));
    assert.ok(history.body.transactions.some((transaction) => transaction.prescriptionStatus === 'Partially Dispensed'));
    assert.ok(history.body.transactions.some((transaction) => transaction.prescriptionStatus === 'Expired'));

    await request(app).delete('/api/transactions').set(authHeader('moh')).expect(200);

    const cleared = await request(app).get('/api/transactions').set(authHeader('moh')).expect(200);
    assert.equal(cleared.body.transactions.length, 0);
  });

  it('returns fallback medicine suggestions for short queries', async () => {
    const response = await request(app).get('/api/medicines/search?q=a').set(authHeader('pharmacy')).expect(200);

    assert.equal(response.body.source, 'fallback');
    assert.ok(response.body.results.some((medicine) => medicine.name === 'Amoxicillin'));
  });

  it('returns the configured medicine list when the query is empty', async () => {
    const response = await request(app).get('/api/medicines/search').set(authHeader('pharmacy')).expect(200);

    assert.equal(response.body.source, 'fallback');
    assert.ok(response.body.results.length >= 8);
    assert.ok(response.body.results.some((medicine) => medicine.name === 'Amoxicillin'));
  });

  it('lets MOH clear all users only with the reset password', async () => {
    await request(app)
      .delete('/api/users')
      .set(authHeader('doctor'))
      .send({ password: 'thaianh13042002' })
      .expect(403);

    await request(app)
      .delete('/api/users')
      .set(authHeader('moh'))
      .send({ password: 'wrong-password' })
      .expect(403);

    await request(app)
      .get('/api/auth/me')
      .set(authHeader('moh'))
      .expect(200);

    await request(app)
      .delete('/api/users')
      .set(authHeader('moh'))
      .send({ password: 'thaianh13042002' })
      .expect(200);

    await request(app)
      .get('/api/auth/me')
      .set(authHeader('moh'))
      .expect(401);
  });
});
