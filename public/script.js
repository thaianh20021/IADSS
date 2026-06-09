const form = document.querySelector('#transactionForm');
const prescriptionForm = document.querySelector('#prescriptionForm');
const alertArea = document.querySelector('#alertArea');
const prescriptionAlertArea = document.querySelector('#prescriptionAlertArea');
const settingsAlertArea = document.querySelector('#settingsAlertArea');
const rows = document.querySelector('#transactionRows');
const prescriptionRows = document.querySelector('#prescriptionRows');
const clearDataButton = document.querySelector('#clearDataButton');
const systemStatus = document.querySelector('#systemStatus');
const drugInput = document.querySelector('#drug');
const medicineOptions = document.querySelector('#medicineOptions');
const medicineSuggestions = document.querySelector('#medicineSuggestions');
const lookupSource = document.querySelector('#lookupSource');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');
const totalMetric = document.querySelector('#totalMetric');
const approvedMetric = document.querySelector('#approvedMetric');
const blockedMetric = document.querySelector('#blockedMetric');
const overrideMetric = document.querySelector('#overrideMetric');
const interventionRateMetric = document.querySelector('#interventionRateMetric');
const invalidAttemptRateMetric = document.querySelector('#invalidAttemptRateMetric');
const resetTransactionFormButton = document.querySelector('#resetTransactionForm');
const resetPrescriptionFormButton = document.querySelector('#resetPrescriptionForm');
const drugListForm = document.querySelector('#drugListForm');
const drugClassListForm = document.querySelector('#drugClassListForm');
const drugBulkForm = document.querySelector('#drugBulkForm');
const drugClassBulkForm = document.querySelector('#drugClassBulkForm');
const drugList = document.querySelector('#drugList');
const drugClassList = document.querySelector('#drugClassList');
const lookupPrescriptionId = document.querySelector('#lookupPrescriptionId');
const loadPrescriptionButton = document.querySelector('#loadPrescriptionButton');
const scanQrButton = document.querySelector('#scanQrButton');
const stopQrScanButton = document.querySelector('#stopQrScanButton');
const qrScanner = document.querySelector('#qrScanner');
const qrScannerVideo = document.querySelector('#qrScannerVideo');
const qrScannerStatus = document.querySelector('#qrScannerStatus');
const loadedPrescriptionSummary = document.querySelector('#loadedPrescriptionSummary');
const printPrescriptionButton = document.querySelector('#printPrescriptionButton');
const sendPrescriptionButton = document.querySelector('#sendPrescriptionButton');
const printPrescription = document.querySelector('#printPrescription');
const printPrescriptionId = document.querySelector('#printPrescriptionId');
const printPrescriptionDetails = document.querySelector('#printPrescriptionDetails');
const qrImage = document.querySelector('#qrImage');

let lookupTimer = null;
let currentMedicineResults = [];
let lastSavedPrescription = null;
let qrScanStream = null;
let qrScanTimer = null;
const qrCanvas = document.createElement('canvas');
const qrCanvasContext = qrCanvas.getContext('2d', {
  willReadFrequently: true
});
let referenceLists = {
  drugs: [],
  drugClasses: []
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderAlert(target, type, message, reason = '') {
  const detail = reason ? `<div class="alert-reason">${escapeHtml(reason)}</div>` : '';

  target.innerHTML = `
    <div class="alert ${type}">
      ${escapeHtml(message)}
      ${detail}
    </div>
  `;
}

function setAlert(type, message, reason = '') {
  renderAlert(alertArea, type, message, reason);
}

function setPrescriptionAlert(type, message, reason = '') {
  renderAlert(prescriptionAlertArea, type, message, reason);
}

function setSettingsAlert(type, message, reason = '') {
  renderAlert(settingsAlertArea, type, message, reason);
}

function clearAlert(target) {
  target.innerHTML = '';
}

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestamp));
}

function getStatusClass(status) {
  return String(status ?? 'invalid').toLowerCase().replaceAll(' ', '-');
}

function setActiveTab(panelId) {
  tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === panelId);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });

  if (panelId === 'dashboardPanel') {
    loadTransactions();
  }

  if (panelId === 'doctorPanel') {
    loadPrescriptions();
  }

  if (panelId === 'settingsPanel') {
    loadReferenceLists();
  }
}

function updateMetrics(transactions) {
  const total = transactions.length;
  const blocked = transactions.filter((transaction) => transaction.status === 'Blocked').length;
  const approved = transactions.filter((transaction) => transaction.status === 'Approved').length;
  const overridden = transactions.filter((transaction) => transaction.status === 'Overridden').length;
  const interventions = blocked + overridden;
  const invalidAttempts = transactions.filter(isInvalidAttemptTransaction).length;
  const interventionRate = total === 0 ? 0 : Math.round((interventions / total) * 100);
  const invalidAttemptRate = total === 0 ? 0 : Math.round((invalidAttempts / total) * 100);

  totalMetric.textContent = String(total);
  approvedMetric.textContent = String(approved);
  blockedMetric.textContent = String(blocked);
  overrideMetric.textContent = String(overridden);
  interventionRateMetric.textContent = `${interventionRate}%`;
  invalidAttemptRateMetric.textContent = `${invalidAttemptRate}%`;
}

function isInvalidAttemptTransaction(transaction) {
  if (!['Blocked', 'Overridden'].includes(transaction.status)) {
    return false;
  }

  const status = String(transaction.prescriptionStatus ?? '').toLowerCase();
  const reason = String(transaction.reason ?? '').toLowerCase();

  return (
    status === 'invalid' ||
    status === 'expired' ||
    status === 'cancelled' ||
    status === 'fully dispensed' ||
    reason.includes('exceeds remaining quantity') ||
    reason.includes('not found')
  );
}

function hideMedicineSuggestions() {
  medicineSuggestions.classList.remove('visible');
  drugInput.setAttribute('aria-expanded', 'false');
}

function renderMedicineSuggestions(results, source) {
  currentMedicineResults = results ?? [];

  medicineOptions.innerHTML = currentMedicineResults
    .map((medicine) => `<option value="${escapeHtml(medicine.name)}"></option>`)
    .join('');

  if (currentMedicineResults.length === 0) {
    medicineSuggestions.innerHTML = `
      <div class="medicine-option" role="option">
        <strong>No medicines found</strong>
        <span>Try a different drug name.</span>
      </div>
    `;
    medicineSuggestions.classList.add('visible');
    drugInput.setAttribute('aria-expanded', 'true');
    lookupSource.textContent = '';
    return;
  }

  medicineSuggestions.innerHTML = currentMedicineResults
    .map((medicine, index) => {
      return `
        <button class="medicine-option" type="button" role="option" data-index="${index}">
          <strong>${escapeHtml(medicine.name)}</strong>
          <span>${escapeHtml(medicine.source)}${medicine.detail ? ` - ${escapeHtml(medicine.detail)}` : ''}</span>
        </button>
      `;
    })
    .join('');

  medicineSuggestions.classList.add('visible');
  drugInput.setAttribute('aria-expanded', 'true');
  lookupSource.textContent = source ? `Medicine source: ${source}` : '';
}

function populateDrugClassSelects() {
  document.querySelectorAll('select[name="drugClass"]').forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Select class</option>';

    referenceLists.drugClasses.forEach((item) => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      select.append(option);
    });

    if (referenceLists.drugClasses.includes(currentValue)) {
      select.value = currentValue;
    }
  });
}

function renderSettingsList(category, target, items) {
  if (items.length === 0) {
    target.innerHTML = '<div class="empty-cell">No items configured.</div>';
    return;
  }

  target.innerHTML = items
    .map((item) => {
      return `
        <div class="settings-item">
          <span>${escapeHtml(item)}</span>
          <button class="icon-button" type="button" data-category="${escapeHtml(category)}" data-value="${escapeHtml(item)}" aria-label="Delete ${escapeHtml(item)}">X</button>
        </div>
      `;
    })
    .join('');
}

async function loadReferenceList(category) {
  const response = await fetch(`/api/reference/${category}`);

  if (!response.ok) {
    throw new Error(`Unable to load ${category}`);
  }

  const data = await response.json();
  referenceLists[category] = data.items ?? [];
}

async function loadReferenceLists() {
  try {
    await Promise.all([loadReferenceList('drugs'), loadReferenceList('drugClasses')]);
    renderSettingsList('drugs', drugList, referenceLists.drugs);
    renderSettingsList('drugClasses', drugClassList, referenceLists.drugClasses);
    populateDrugClassSelects();
  } catch (error) {
    setSettingsAlert('danger', 'Unable to load settings.', error.message);
  }
}

async function addReferenceItem(category, value) {
  const response = await fetch(`/api/reference/${category}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Unable to add item');
  }

  referenceLists[category] = data.items ?? [];
}

async function deleteReferenceItem(category, value) {
  const response = await fetch(`/api/reference/${category}/${encodeURIComponent(value)}`, {
    method: 'DELETE'
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Unable to delete item');
  }

  referenceLists[category] = data.items ?? [];
}

function parseBulkValues(value) {
  return [...new Set(String(value ?? '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

async function importReferenceItems(category, values) {
  for (const value of values) {
    await addReferenceItem(category, value);
  }
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health');

    if (!response.ok) {
      throw new Error('Health check failed');
    }

    systemStatus.textContent = 'System online';
    systemStatus.classList.add('online');
    systemStatus.classList.remove('offline');
  } catch (error) {
    systemStatus.textContent = 'System offline';
    systemStatus.classList.add('offline');
    systemStatus.classList.remove('online');
  }
}

async function loadTransactions() {
  rows.innerHTML = `
    <tr>
      <td colspan="12" class="empty-cell">Loading transactions...</td>
    </tr>
  `;

  try {
    const response = await fetch('/api/transactions');

    if (!response.ok) {
      throw new Error('Unable to load transactions');
    }

    const data = await response.json();
    const transactions = data.transactions ?? [];
    updateMetrics(transactions);

    if (transactions.length === 0) {
      rows.innerHTML = `
        <tr>
          <td colspan="12" class="empty-cell">No transactions recorded.</td>
        </tr>
      `;
      return;
    }

    rows.innerHTML = transactions
      .map((transaction) => {
        const isBlocked = transaction.status === 'Blocked';
        const isOverridden = transaction.status === 'Overridden';
        const statusClass = isBlocked ? 'blocked' : isOverridden ? 'overridden' : 'approved';
        const prescriptionStatusClass = getStatusClass(transaction.prescriptionStatus);

        return `
          <tr class="${isBlocked ? 'blocked-row' : isOverridden ? 'overridden-row' : ''}">
            <td>${escapeHtml(formatTimestamp(transaction.timestamp))}</td>
            <td>${escapeHtml(transaction.prescriptionId || 'N/A')}</td>
            <td>${escapeHtml(transaction.patientId || 'N/A')}</td>
            <td>${escapeHtml(transaction.hospitalName || 'N/A')}</td>
            <td>${escapeHtml(transaction.antibiotic || 'N/A')}</td>
            <td>${escapeHtml(transaction.quantity || 'N/A')}</td>
            <td>${escapeHtml(transaction.treatmentDurationDays || 'N/A')}</td>
            <td><span class="status-badge ${prescriptionStatusClass}">${escapeHtml(transaction.prescriptionStatus || 'Invalid')}</span></td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(transaction.status)}</span></td>
            <td>${escapeHtml(transaction.reason || 'N/A')}</td>
            <td>${escapeHtml(transaction.pharmacistLicense || 'N/A')}</td>
            <td>${escapeHtml(transaction.overrideReason || 'N/A')}</td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    updateMetrics([]);
    rows.innerHTML = `
      <tr>
        <td colspan="12" class="empty-cell">Unable to load transactions.</td>
      </tr>
    `;
  }
}

async function loadPrescriptions() {
  prescriptionRows.innerHTML = `
    <tr>
      <td colspan="12" class="empty-cell">Loading prescriptions...</td>
    </tr>
  `;

  try {
    const response = await fetch('/api/prescriptions');

    if (!response.ok) {
      throw new Error('Unable to load prescriptions');
    }

    const data = await response.json();
    const prescriptions = data.prescriptions ?? [];

    if (prescriptions.length === 0) {
      prescriptionRows.innerHTML = `
        <tr>
          <td colspan="12" class="empty-cell">No prescriptions saved.</td>
        </tr>
      `;
      return;
    }

    prescriptionRows.innerHTML = prescriptions
      .map((prescription) => {
        const prescriptionStatusClass = getStatusClass(prescription.prescriptionStatus);
        const canCancel = !['Cancelled', 'Fully Dispensed'].includes(prescription.prescriptionStatus);

        return `
          <tr>
            <td>${escapeHtml(prescription.prescriptionId)}</td>
            <td>${escapeHtml(prescription.patientId)}</td>
            <td>${escapeHtml(prescription.hospitalName)}</td>
            <td>${escapeHtml(prescription.prescriberLicense)}</td>
            <td>${escapeHtml(prescription.antibioticName)}</td>
            <td><span class="status-badge ${prescriptionStatusClass}">${escapeHtml(prescription.prescriptionStatus)}</span></td>
            <td>${escapeHtml(prescription.antibioticClass)}</td>
            <td>${escapeHtml(prescription.dosage)}</td>
            <td>${escapeHtml(prescription.dispensedQuantity ?? 0)} / ${escapeHtml(prescription.quantityLimit)}</td>
            <td>${escapeHtml(prescription.remainingQuantity ?? prescription.quantityLimit)}</td>
            <td>${escapeHtml(prescription.expiryDate)}</td>
            <td>
              <button class="ghost-button table-button" type="button" data-print-prescription="${escapeHtml(prescription.prescriptionId)}">Print</button>
              <button class="secondary-button table-button" type="button" data-cancel-prescription="${escapeHtml(prescription.prescriptionId)}" ${canCancel ? '' : 'disabled'}>Cancel</button>
            </td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    prescriptionRows.innerHTML = `
      <tr>
        <td colspan="12" class="empty-cell">Unable to load prescriptions.</td>
      </tr>
    `;
  }
}

async function searchMedicines(query) {
  const trimmed = query.trim();

  lookupSource.textContent = trimmed.length < 2 ? 'Showing configured drug list...' : 'Searching medicines...';

  try {
    const response = await fetch(`/api/medicines/search?q=${encodeURIComponent(trimmed)}`);

    if (!response.ok) {
      throw new Error('Medicine lookup failed');
    }

    const data = await response.json();
    renderMedicineSuggestions(data.results ?? [], data.source);
  } catch (error) {
    lookupSource.textContent = 'Medicine lookup unavailable';
    hideMedicineSuggestions();
  }
}

function renderLoadedPrescription(prescription) {
  loadedPrescriptionSummary.classList.remove('empty');
  loadedPrescriptionSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(prescription.drugName)}</strong>
      <span>${escapeHtml(prescription.dosage)} · ${escapeHtml(prescription.drugClass)}</span>
    </div>
    <div>
      <span class="status-badge ${getStatusClass(prescription.prescriptionStatus)}">${escapeHtml(prescription.prescriptionStatus)}</span>
      <span>${escapeHtml(prescription.dispensedQuantity)} / ${escapeHtml(prescription.quantityLimit)} dispensed, ${escapeHtml(prescription.remainingQuantity)} remaining</span>
    </div>
  `;
}

function populateTransactionForm(prescription) {
  form.elements.prescriptionId.value = prescription.prescriptionId;
  form.elements.patientId.value = prescription.patientId;
  form.elements.hospitalName.value = prescription.hospitalName;
  form.elements.prescriberLicense.value = prescription.prescriberLicense;
  form.elements.drug.value = prescription.drugName;
  form.elements.drugClass.value = prescription.drugClass;
  form.elements.dosage.value = prescription.dosage;
  form.elements.treatmentDurationDays.value = prescription.treatmentDurationDays;
  document.querySelector('#quantityLimitDisplay').value = prescription.quantityLimit;
  document.querySelector('#remainingQuantityDisplay').value = prescription.remainingQuantity;
  form.elements.quantity.removeAttribute('max');
  form.elements.quantity.value = prescription.remainingQuantity > 0 ? Math.min(1, prescription.remainingQuantity) : '';
}

async function loadPrescriptionForPharmacy(id = lookupPrescriptionId.value, shouldClearAlert = true) {
  const prescriptionId = String(id ?? '').trim();

  if (!prescriptionId) {
    setAlert('danger', 'Prescription ID is required.');
    return;
  }

  try {
    const response = await fetch(`/api/prescriptions/${encodeURIComponent(prescriptionId)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Prescription not found');
    }

    populateTransactionForm(data.prescription);
    renderLoadedPrescription(data.prescription);
    if (shouldClearAlert) {
      clearAlert(alertArea);
    }
  } catch (error) {
    loadedPrescriptionSummary.classList.add('empty');
    loadedPrescriptionSummary.textContent = 'No prescription loaded.';
    setAlert('danger', 'HIGH RISK ALERT: Invalid Prescription. Sale Blocked.', error.message);
  }
}

function stopQrScanner() {
  if (qrScanTimer) {
    window.clearInterval(qrScanTimer);
    qrScanTimer = null;
  }

  if (qrScanStream) {
    qrScanStream.getTracks().forEach((track) => track.stop());
    qrScanStream = null;
  }

  qrScanner.hidden = true;
  qrScannerVideo.srcObject = null;
}

async function detectQrCodeFromVideo(detector) {
  if (detector) {
    const codes = await detector.detect(qrScannerVideo);
    return codes[0]?.rawValue?.trim() || '';
  }

  if (!window.jsQR || !qrCanvasContext || qrScannerVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return '';
  }

  qrCanvas.width = qrScannerVideo.videoWidth;
  qrCanvas.height = qrScannerVideo.videoHeight;

  if (!qrCanvas.width || !qrCanvas.height) {
    return '';
  }

  qrCanvasContext.drawImage(qrScannerVideo, 0, 0, qrCanvas.width, qrCanvas.height);
  const imageData = qrCanvasContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
  const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert'
  });

  return code?.data?.trim() || '';
}

async function startQrScanner() {
  const supportsBarcodeDetector = 'BarcodeDetector' in window;
  const supportsJsQr = typeof window.jsQR === 'function';

  if (!supportsBarcodeDetector && !supportsJsQr) {
    setAlert('danger', 'QR scanning is not available.', 'Please type the Prescription ID manually.');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setAlert('danger', 'Camera access is not available.', 'Please type the Prescription ID manually.');
    return;
  }

  try {
    stopQrScanner();
    qrScanner.hidden = false;
    qrScannerStatus.textContent = supportsBarcodeDetector
      ? 'Point camera at the prescription QR code.'
      : 'Point camera at the QR code. Safari fallback scanner is active.';
    qrScanStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment'
      },
      audio: false
    });
    qrScannerVideo.srcObject = qrScanStream;
    await qrScannerVideo.play();

    const detector = supportsBarcodeDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    qrScanTimer = window.setInterval(async () => {
      try {
        const value = await detectQrCodeFromVideo(detector);

        if (!value) {
          return;
        }

        lookupPrescriptionId.value = value;
        stopQrScanner();
        await loadPrescriptionForPharmacy(value);
      } catch (error) {
        qrScannerStatus.textContent = 'Unable to read QR code. Hold the code steady or type the ID manually.';
      }
    }, 450);
  } catch (error) {
    stopQrScanner();
    setAlert('danger', 'Unable to start QR scanner.', 'Camera permission may be blocked. Please type the Prescription ID manually.');
  }
}

function getPrescriptionFormPayload() {
  const formData = new FormData(prescriptionForm);

  return {
    prescriptionId: formData.get('prescriptionId'),
    patientId: formData.get('patientId'),
    hospitalName: formData.get('hospitalName'),
    prescriberLicense: formData.get('prescriberLicense'),
    mainDiagnosis: formData.get('mainDiagnosis'),
    icd10Code: formData.get('icd10Code'),
    clinicalNotes: formData.get('clinicalNotes'),
    drugAllergies: formData.get('drugAllergies'),
    drugName: formData.get('drugName'),
    drugClass: formData.get('drugClass'),
    dosage: formData.get('dosage'),
    quantityLimit: Number(formData.get('quantityLimit')),
    treatmentDurationDays: Number(formData.get('treatmentDurationDays')),
    expiryDate: formData.get('expiryDate')
  };
}

function renderPrintPrescription(prescription) {
  if (!prescription) {
    return;
  }

  printPrescriptionId.textContent = prescription.prescriptionId;
  qrImage.src = `/api/prescriptions/${encodeURIComponent(prescription.prescriptionId)}/qr`;
  qrImage.alt = `QR code for prescription ${prescription.prescriptionId}`;
  printPrescriptionDetails.innerHTML = `
    <p><strong>Patient ID:</strong> ${escapeHtml(prescription.patientId)}</p>
    <p><strong>Hospital:</strong> ${escapeHtml(prescription.hospitalName)}</p>
    <p><strong>Prescriber:</strong> ${escapeHtml(prescription.prescriberLicense)}</p>
    <p><strong>Drug:</strong> ${escapeHtml(prescription.antibioticName ?? prescription.drugName)}</p>
    <p><strong>Dosage:</strong> ${escapeHtml(prescription.dosage)}</p>
    <p><strong>Quantity:</strong> ${escapeHtml(prescription.quantityLimit)}</p>
    <p><strong>Duration:</strong> ${escapeHtml(prescription.treatmentDurationDays)} days</p>
    <p><strong>Expiry:</strong> ${escapeHtml(prescription.expiryDate)}</p>
  `;
  printPrescription.classList.add('ready');
}

async function savePrescriptionFromForm(message = 'Prescription saved and sent to pharmacy registry.') {
  const payload = getPrescriptionFormPayload();
  const response = await fetch('/api/prescriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Unable to save prescription');
  }

  lastSavedPrescription = data.prescription;
  renderPrintPrescription(data.prescription);
  setPrescriptionAlert('success', message);
  await loadPrescriptions();

  return data.prescription;
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll('.role-card').forEach((card) => {
  card.addEventListener('click', () => setActiveTab(card.dataset.tab));
});

drugInput.addEventListener('input', (event) => {
  window.clearTimeout(lookupTimer);
  lookupTimer = window.setTimeout(() => {
    searchMedicines(event.target.value);
  }, 300);
});

drugInput.addEventListener('focus', () => {
  searchMedicines(drugInput.value);
});

drugInput.addEventListener('click', () => {
  searchMedicines(drugInput.value);
});

medicineSuggestions.addEventListener('mousedown', (event) => {
  const option = event.target.closest('.medicine-option[data-index]');

  if (!option) {
    return;
  }

  event.preventDefault();
  const medicine = currentMedicineResults[Number(option.dataset.index)];

  if (medicine) {
    drugInput.value = medicine.name;
    hideMedicineSuggestions();
    lookupSource.textContent = `Selected: ${medicine.source}`;
  }
});

loadPrescriptionButton.addEventListener('click', () => {
  loadPrescriptionForPharmacy();
});

scanQrButton.addEventListener('click', () => {
  startQrScanner();
});

stopQrScanButton.addEventListener('click', () => {
  stopQrScanner();
});

lookupPrescriptionId.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadPrescriptionForPharmacy();
  }
});

resetTransactionFormButton.addEventListener('click', () => {
  form.reset();
  clearAlert(alertArea);
  lookupPrescriptionId.value = '';
  loadedPrescriptionSummary.classList.add('empty');
  loadedPrescriptionSummary.textContent = 'No prescription loaded.';
  lookupSource.textContent = '';
  medicineOptions.innerHTML = '';
  hideMedicineSuggestions();
});

resetPrescriptionFormButton.addEventListener('click', () => {
  prescriptionForm.reset();
  lastSavedPrescription = null;
  printPrescription.classList.remove('ready');
  printPrescriptionId.textContent = 'No prescription selected';
  printPrescriptionDetails.innerHTML = '';
  qrImage.removeAttribute('src');
  clearAlert(prescriptionAlertArea);
});

drugListForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = new FormData(drugListForm).get('value');

  try {
    await addReferenceItem('drugs', value);
    drugListForm.reset();
    renderSettingsList('drugs', drugList, referenceLists.drugs);
    setSettingsAlert('success', 'Drug list updated.');
  } catch (error) {
    setSettingsAlert('danger', 'Unable to add drug.', error.message);
  }
});

drugClassListForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = new FormData(drugClassListForm).get('value');

  try {
    await addReferenceItem('drugClasses', value);
    drugClassListForm.reset();
    renderSettingsList('drugClasses', drugClassList, referenceLists.drugClasses);
    populateDrugClassSelects();
    setSettingsAlert('success', 'Drug class list updated.');
  } catch (error) {
    setSettingsAlert('danger', 'Unable to add drug class.', error.message);
  }
});

drugBulkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = parseBulkValues(new FormData(drugBulkForm).get('values'));

  if (values.length === 0) {
    setSettingsAlert('danger', 'Paste at least one drug to import.');
    return;
  }

  try {
    await importReferenceItems('drugs', values);
    drugBulkForm.reset();
    renderSettingsList('drugs', drugList, referenceLists.drugs);
    setSettingsAlert('success', `${values.length} drug(s) imported.`);
  } catch (error) {
    setSettingsAlert('danger', 'Unable to import drugs.', error.message);
  }
});

drugClassBulkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = parseBulkValues(new FormData(drugClassBulkForm).get('values'));

  if (values.length === 0) {
    setSettingsAlert('danger', 'Paste at least one drug class to import.');
    return;
  }

  try {
    await importReferenceItems('drugClasses', values);
    drugClassBulkForm.reset();
    renderSettingsList('drugClasses', drugClassList, referenceLists.drugClasses);
    populateDrugClassSelects();
    setSettingsAlert('success', `${values.length} drug class(es) imported.`);
  } catch (error) {
    setSettingsAlert('danger', 'Unable to import drug classes.', error.message);
  }
});

document.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('.icon-button[data-category][data-value]');
  const cancelButton = event.target.closest('[data-cancel-prescription]');
  const printButton = event.target.closest('[data-print-prescription]');

  if (deleteButton) {
    const { category, value } = deleteButton.dataset;

    try {
      await deleteReferenceItem(category, value);

      if (category === 'drugs') {
        renderSettingsList('drugs', drugList, referenceLists.drugs);
      }

      if (category === 'drugClasses') {
        renderSettingsList('drugClasses', drugClassList, referenceLists.drugClasses);
        populateDrugClassSelects();
      }

      setSettingsAlert('success', 'Reference item deleted.');
    } catch (error) {
      setSettingsAlert('danger', 'Unable to delete reference item.', error.message);
    }
  }

  if (cancelButton) {
    try {
      const id = cancelButton.dataset.cancelPrescription;
      const response = await fetch(`/api/prescriptions/${encodeURIComponent(id)}/cancel`, {
        method: 'POST'
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to cancel prescription');
      }

      setPrescriptionAlert('success', data.message);
      await loadPrescriptions();
    } catch (error) {
      setPrescriptionAlert('danger', 'Unable to cancel prescription.', error.message);
    }
  }

  if (printButton) {
    const id = printButton.dataset.printPrescription;
    const response = await fetch(`/api/prescriptions/${encodeURIComponent(id)}`);
    const data = await response.json();

    if (response.ok) {
      renderPrintPrescription(data.prescription);
      window.print();
    }
  }
});

document.addEventListener('mousedown', (event) => {
  if (!event.target.closest('.medicine-field')) {
    hideMedicineSuggestions();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    prescriptionId: formData.get('prescriptionId'),
    patientId: formData.get('patientId'),
    hospitalName: formData.get('hospitalName'),
    prescriberLicense: formData.get('prescriberLicense'),
    drug: formData.get('drug'),
    drugClass: formData.get('drugClass'),
    dosage: formData.get('dosage'),
    quantity: Number(formData.get('quantity')),
    treatmentDurationDays: Number(formData.get('treatmentDurationDays')),
    overrideBlocked: formData.get('overrideBlocked') === 'on',
    pharmacistLicense: formData.get('pharmacistLicense'),
    overrideReason: formData.get('overrideReason')
  };

  try {
    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Transaction failed');
    }

    const data = await response.json();
    const transaction = data.transaction;

    if (transaction.status === 'Approved') {
      setAlert('success', data.message);
      await loadPrescriptionForPharmacy(transaction.prescriptionId, false);
    } else if (transaction.status === 'Overridden') {
      setAlert('warning', data.message, transaction.reason);
    } else {
      setAlert('danger', data.message, transaction.reason);
    }

    loadTransactions();
  } catch (error) {
    setAlert('danger', 'HIGH RISK ALERT: Invalid Prescription. Sale Blocked.', 'Unable to sync transaction.');
  }
});

prescriptionForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await savePrescriptionFromForm('Prescription saved. Pharmacy can verify by Prescription ID / QR code.');
    prescriptionForm.reset();
  } catch (error) {
    setPrescriptionAlert('danger', 'Unable to save prescription.', error.message);
  }
});

sendPrescriptionButton.addEventListener('click', async () => {
  try {
    await savePrescriptionFromForm('Prescription sent to pharmacy registry.');
  } catch (error) {
    setPrescriptionAlert('danger', 'Unable to send prescription.', error.message);
  }
});

printPrescriptionButton.addEventListener('click', async () => {
  try {
    if (!lastSavedPrescription) {
      await savePrescriptionFromForm('Prescription saved and ready to print.');
    }

    window.print();
  } catch (error) {
    setPrescriptionAlert('danger', 'Unable to print prescription.', error.message);
  }
});

clearDataButton.addEventListener('click', async () => {
  clearDataButton.disabled = true;

  try {
    const response = await fetch('/api/transactions', {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Unable to clear transactions');
    }

    await loadTransactions();
    setAlert('success', 'Transaction history cleared.');
  } catch (error) {
    setAlert('danger', 'Unable to clear transaction history.');
  } finally {
    clearDataButton.disabled = false;
  }
});

checkHealth();
loadReferenceLists();
loadTransactions();
loadPrescriptions();
