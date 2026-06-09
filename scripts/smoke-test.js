const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL ?? process.argv[2] ?? 'http://localhost:3000');

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, '');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed with ${response.status}: ${text}`);
  }

  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log(`Running IADSS smoke test against ${baseUrl}`);
  const runId = Date.now();
  const cefiximePrescriptionId = `SMOKE-CFX-${runId}`;
  const amoxicillinPrescriptionId = `SMOKE-AMOX-${runId}`;

  const health = await request('/api/health');
  assert(health.ok === true, 'Health check did not return ok=true.');
  console.log('OK health check');

  const drugs = await request('/api/reference/drugs');
  assert(drugs.items.includes('Amoxicillin'), 'Drug reference list is missing Amoxicillin.');
  const drugClasses = await request('/api/reference/drugClasses');
  assert(drugClasses.items.includes('Penicillin'), 'Drug class reference list is missing Penicillin.');
  console.log('OK reference lists loaded');

  await request('/api/transactions', { method: 'DELETE' });
  console.log('OK cleared previous transactions');

  const doctorPrescription = await request('/api/prescriptions', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: cefiximePrescriptionId,
      patientId: '88888',
      hospitalName: 'Smoke Test Hospital',
      prescriberLicense: 'DOC-SMOKE',
      antibioticName: 'Cefixime',
      antibioticClass: 'Cephalosporin',
      dosage: '200mg',
      quantityLimit: 14,
      treatmentDurationDays: 7,
      expiryDate: '2027-12-31',
      mainDiagnosis: 'Smoke test diagnosis',
      icd10Code: 'J02.9',
      clinicalNotes: 'Hidden from pharmacy lookup',
      drugAllergies: 'None known'
    })
  });
  assert(doctorPrescription.prescription.patientId === '88888', 'Doctor prescription was not saved.');
  console.log('OK doctor prescription saved');

  const lookup = await request(`/api/prescriptions/${cefiximePrescriptionId}`);
  assert(lookup.prescription.remainingQuantity === 14, 'Pharmacy lookup did not return remaining quantity.');
  assert(lookup.prescription.clinicalNotes === undefined, 'Pharmacy lookup leaked clinical notes.');
  console.log('OK pharmacy lookup returns minimum necessary data');

  const doctorApproved = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: cefiximePrescriptionId,
      quantity: 7
    })
  });
  assert(doctorApproved.transaction.status === 'Approved', 'Doctor-created prescription was not approved by POS.');
  assert(doctorApproved.transaction.prescriptionStatus === 'Valid', 'Approved transaction did not report Valid prescription status.');
  console.log('OK partial dispense verified by POS');

  const repeated = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: cefiximePrescriptionId,
      quantity: 8
    })
  });
  assert(repeated.transaction.status === 'Blocked', 'Over-remaining dispense was not blocked.');
  assert(repeated.transaction.prescriptionStatus === 'Partially Dispensed', 'Over-remaining dispense did not report Partially Dispensed.');
  console.log('OK over-remaining dispense blocked');

  const remaining = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: cefiximePrescriptionId,
      quantity: 7
    })
  });
  assert(remaining.transaction.status === 'Approved', 'Remaining quantity was not approved.');
  console.log('OK remaining quantity dispensed');

  const amoxicillinPrescription = await request('/api/prescriptions', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: amoxicillinPrescriptionId,
      patientId: '12345',
      hospitalName: 'National General Hospital',
      prescriberLicense: '98765',
      drugName: 'Amoxicillin',
      drugClass: 'Penicillin',
      dosage: '500mg',
      quantityLimit: 20,
      treatmentDurationDays: 5,
      expiryDate: '2027-12-31'
    })
  });
  assert(amoxicillinPrescription.prescription.patientId === '12345', 'Amoxicillin prescription was not saved.');
  console.log('OK Amoxicillin prescription saved');

  const approved = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: amoxicillinPrescriptionId,
      quantity: 10
    })
  });
  assert(approved.transaction.status === 'Approved', 'Valid transaction was not approved.');
  console.log('OK valid transaction approved');

  const blocked = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: `SMOKE-INVALID-${runId}`,
      quantity: 1
    })
  });
  assert(blocked.transaction.status === 'Blocked', 'Invalid transaction was not blocked.');
  console.log('OK invalid transaction blocked');

  const history = await request('/api/transactions');
  const transactions = history.transactions ?? [];
  const approvedCount = transactions.filter((item) => item.status === 'Approved').length;
  const blockedCount = transactions.filter((item) => item.status === 'Blocked').length;
  const misuseRate = Math.round((blockedCount / transactions.length) * 100);

  assert(transactions.length === 5, `Expected 5 transactions, got ${transactions.length}.`);
  assert(approvedCount === 3, `Expected 3 approved transactions, got ${approvedCount}.`);
  assert(blockedCount === 2, `Expected 2 blocked transactions, got ${blockedCount}.`);
  assert(misuseRate === 40, `Expected misuse rate 40, got ${misuseRate}.`);
  console.log('OK dashboard data supports 40% misuse rate with blocked attempts');

  const medicines = await request('/api/medicines/search?q=cephalexin');
  assert(Array.isArray(medicines.results), 'Medicine search did not return results array.');
  assert(medicines.results.length > 0, 'Medicine search returned no results.');
  console.log(`OK medicine lookup source: ${medicines.source}`);

  console.log('Smoke test passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
