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

describe('IADSS API', () => {
  before(async () => {
    db = await createDatabase({ filePath: testDbPath });
    app = await createApp({ db });
  });

  after(async () => {
    await db.close();
    await fs.rm(testDbPath, { force: true });
  });

  it('seeds valid prescriptions', async () => {
    const response = await request(app).get('/api/prescriptions').expect(200);

    assert.equal(response.body.prescriptions.length, 3);
    assert.equal(response.body.prescriptions[0].patientId, '12345');
  });

  it('approves a valid prescription transaction', async () => {
    const response = await request(app)
      .post('/api/transactions')
      .send({
        patientId: '12345',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Penicillin',
        dosage: '500mg',
        quantity: 10,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Approved');
    assert.equal(response.body.message, 'Transaction Approved. Data synced to MOH.');
  });

  it('lets a doctor create a prescription that the pharmacy POS can verify', async () => {
    const prescription = await request(app)
      .post('/api/prescriptions')
      .send({
        patientId: '77777',
        prescriberLicense: 'DOC-2026',
        antibioticName: 'Cefixime',
        antibioticClass: 'Cephalosporin',
        dosage: '200mg',
        quantityLimit: 14,
        treatmentDurationDays: 7,
        expiryDate: '2027-12-31'
      })
      .expect(201);

    assert.equal(prescription.body.prescription.patientId, '77777');

    const transaction = await request(app)
      .post('/api/transactions')
      .send({
        patientId: '77777',
        prescriberLicense: 'DOC-2026',
        antibiotic: 'Cefixime',
        antibioticClass: 'Cephalosporin',
        dosage: '200mg',
        quantity: 14,
        treatmentDurationDays: 7
      })
      .expect(201);

    assert.equal(transaction.body.transaction.status, 'Approved');
  });

  it('blocks missing transaction fields', async () => {
    const response = await request(app)
      .post('/api/transactions')
      .send({
        patientId: '00000',
        antibiotic: 'Amoxicillin',
        quantity: 1
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.message, 'HIGH RISK ALERT: Invalid Prescription. Sale Blocked.');
  });

  it('blocks invalid prescription details', async () => {
    const response = await request(app)
      .post('/api/transactions')
      .send({
        patientId: '12345',
        prescriberLicense: '98765',
        antibiotic: 'Doxycycline',
        antibioticClass: 'Tetracycline',
        dosage: '100mg',
        quantity: 2,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Invalid prescription details.');
  });

  it('blocks transactions that exceed the prescription quantity limit', async () => {
    const response = await request(app)
      .post('/api/transactions')
      .send({
        patientId: '12345',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Penicillin',
        dosage: '500mg',
        quantity: 21,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Requested quantity exceeds prescription limit of 20.');
  });

  it('blocks transactions that exceed the prescription treatment duration', async () => {
    const response = await request(app)
      .post('/api/transactions')
      .send({
        patientId: '12345',
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
    const response = await request(app)
      .post('/api/transactions')
      .send({
        patientId: '12345',
        prescriberLicense: '98765',
        antibiotic: 'Amoxicillin',
        antibioticClass: 'Macrolide',
        dosage: '500mg',
        quantity: 10,
        treatmentDurationDays: 5
      })
      .expect(201);

    assert.equal(response.body.transaction.status, 'Blocked');
    assert.equal(response.body.transaction.reason, 'Antibiotic class does not match prescription class Penicillin.');
  });

  it('returns transaction history and clears it', async () => {
    const history = await request(app).get('/api/transactions').expect(200);

    assert.equal(history.body.transactions.length, 7);
    assert.equal(history.body.transactions[0].status, 'Blocked');

    await request(app).delete('/api/transactions').expect(200);

    const cleared = await request(app).get('/api/transactions').expect(200);
    assert.equal(cleared.body.transactions.length, 0);
  });

  it('returns fallback medicine suggestions for short queries', async () => {
    const response = await request(app).get('/api/medicines/search?q=a').expect(200);

    assert.equal(response.body.source, 'fallback');
    assert.ok(response.body.results.some((medicine) => medicine.name === 'Amoxicillin'));
  });

  it('returns the seed medicine list when the query is empty', async () => {
    const response = await request(app).get('/api/medicines/search').expect(200);

    assert.equal(response.body.source, 'fallback');
    assert.ok(response.body.results.length >= 8);
    assert.ok(response.body.results.some((medicine) => medicine.name === 'Cephalexin'));
  });
});
