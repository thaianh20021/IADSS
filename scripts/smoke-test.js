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

  const health = await request('/api/health');
  assert(health.ok === true, 'Health check did not return ok=true.');
  console.log('OK health check');

  const antibiotics = await request('/api/reference/antibiotics');
  assert(antibiotics.items.includes('Amoxicillin'), 'Antibiotic reference list is missing Amoxicillin.');
  const antibioticClasses = await request('/api/reference/antibioticClasses');
  assert(antibioticClasses.items.includes('Penicillin'), 'Antibiotic class reference list is missing Penicillin.');
  console.log('OK reference lists loaded');

  await request('/api/transactions', { method: 'DELETE' });
  console.log('OK cleared previous transactions');

  const doctorPrescription = await request('/api/prescriptions', {
    method: 'POST',
    body: JSON.stringify({
      patientId: '88888',
      hospitalName: 'Smoke Test Hospital',
      prescriberLicense: 'DOC-SMOKE',
      antibioticName: 'Cefixime',
      antibioticClass: 'Cephalosporin',
      dosage: '200mg',
      quantityLimit: 14,
      treatmentDurationDays: 7,
      expiryDate: '2027-12-31'
    })
  });
  assert(doctorPrescription.prescription.patientId === '88888', 'Doctor prescription was not saved.');
  console.log('OK doctor prescription saved');

  const doctorApproved = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      patientId: '88888',
      hospitalName: 'Smoke Test Hospital',
      prescriberLicense: 'DOC-SMOKE',
      antibiotic: 'Cefixime',
      antibioticClass: 'Cephalosporin',
      dosage: '200mg',
      quantity: 14,
      treatmentDurationDays: 7
    })
  });
  assert(doctorApproved.transaction.status === 'Approved', 'Doctor-created prescription was not approved by POS.');
  console.log('OK doctor-created prescription verified by POS');

  const amoxicillinPrescription = await request('/api/prescriptions', {
    method: 'POST',
    body: JSON.stringify({
      patientId: '12345',
      hospitalName: 'National General Hospital',
      prescriberLicense: '98765',
      antibioticName: 'Amoxicillin',
      antibioticClass: 'Penicillin',
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
      patientId: '12345',
      hospitalName: 'National General Hospital',
      prescriberLicense: '98765',
      antibiotic: 'Amoxicillin',
      antibioticClass: 'Penicillin',
      dosage: '500mg',
      quantity: 10,
      treatmentDurationDays: 5
    })
  });
  assert(approved.transaction.status === 'Approved', 'Valid transaction was not approved.');
  console.log('OK valid transaction approved');

  const blocked = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      patientId: '00000',
      hospitalName: 'National General Hospital',
      prescriberLicense: '98765',
      antibiotic: 'Amoxicillin',
      antibioticClass: 'Penicillin',
      dosage: '500mg',
      quantity: 1,
      treatmentDurationDays: 5
    })
  });
  assert(blocked.transaction.status === 'Blocked', 'Invalid transaction was not blocked.');
  console.log('OK invalid transaction blocked');

  const history = await request('/api/transactions');
  const transactions = history.transactions ?? [];
  const approvedCount = transactions.filter((item) => item.status === 'Approved').length;
  const blockedCount = transactions.filter((item) => item.status === 'Blocked').length;
  const misuseRate = Math.round((blockedCount / transactions.length) * 100);

  assert(transactions.length === 3, `Expected 3 transactions, got ${transactions.length}.`);
  assert(approvedCount === 2, `Expected 2 approved transactions, got ${approvedCount}.`);
  assert(blockedCount === 1, `Expected 1 blocked transaction, got ${blockedCount}.`);
  assert(misuseRate === 33, `Expected misuse rate 33, got ${misuseRate}.`);
  console.log('OK dashboard data supports 33% misuse rate');

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
