const form = document.querySelector('#transactionForm');
const prescriptionForm = document.querySelector('#prescriptionForm');
const alertArea = document.querySelector('#alertArea');
const prescriptionAlertArea = document.querySelector('#prescriptionAlertArea');
const rows = document.querySelector('#transactionRows');
const prescriptionRows = document.querySelector('#prescriptionRows');
const clearDataButton = document.querySelector('#clearDataButton');
const systemStatus = document.querySelector('#systemStatus');
const antibioticInput = document.querySelector('#antibiotic');
const medicineOptions = document.querySelector('#medicineOptions');
const medicineSuggestions = document.querySelector('#medicineSuggestions');
const lookupSource = document.querySelector('#lookupSource');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');
const totalMetric = document.querySelector('#totalMetric');
const approvedMetric = document.querySelector('#approvedMetric');
const blockedMetric = document.querySelector('#blockedMetric');
const misuseRateMetric = document.querySelector('#misuseRateMetric');

let lookupTimer = null;
let currentMedicineResults = [];

function setAlert(type, message, reason = '') {
  renderAlert(alertArea, type, message, reason);
}

function setPrescriptionAlert(type, message, reason = '') {
  renderAlert(prescriptionAlertArea, type, message, reason);
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
}

function updateMetrics(transactions) {
  const total = transactions.length;
  const blocked = transactions.filter((transaction) => transaction.status === 'Blocked').length;
  const approved = transactions.filter((transaction) => transaction.status === 'Approved').length;
  const misuseRate = total === 0 ? 0 : Math.round((blocked / total) * 100);

  totalMetric.textContent = String(total);
  approvedMetric.textContent = String(approved);
  blockedMetric.textContent = String(blocked);
  misuseRateMetric.textContent = `${misuseRate}%`;
}

function hideMedicineSuggestions() {
  medicineSuggestions.classList.remove('visible');
  antibioticInput.setAttribute('aria-expanded', 'false');
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
        <span>Try a different antibiotic name.</span>
      </div>
    `;
    medicineSuggestions.classList.add('visible');
    antibioticInput.setAttribute('aria-expanded', 'true');
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
  antibioticInput.setAttribute('aria-expanded', 'true');
  lookupSource.textContent = source ? `Medicine source: ${source}` : '';
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
      <td colspan="7" class="empty-cell">Loading transactions...</td>
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
          <td colspan="7" class="empty-cell">No transactions recorded.</td>
        </tr>
      `;
      return;
    }

    rows.innerHTML = transactions
      .map((transaction) => {
        const isBlocked = transaction.status === 'Blocked';
        const statusClass = isBlocked ? 'blocked' : 'approved';

        return `
          <tr class="${isBlocked ? 'blocked-row' : ''}">
            <td>${escapeHtml(formatTimestamp(transaction.timestamp))}</td>
            <td>${escapeHtml(transaction.patientId || 'N/A')}</td>
            <td>${escapeHtml(transaction.antibiotic || 'N/A')}</td>
            <td>${escapeHtml(transaction.antibioticClass || 'N/A')}</td>
            <td>${escapeHtml(transaction.dosage || 'N/A')}</td>
            <td>${escapeHtml(transaction.treatmentDurationDays || 'N/A')}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(transaction.status)}</span></td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    updateMetrics([]);
    rows.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">Unable to load transactions.</td>
      </tr>
    `;
  }
}

async function loadPrescriptions() {
  prescriptionRows.innerHTML = `
    <tr>
      <td colspan="7" class="empty-cell">Loading prescriptions...</td>
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
          <td colspan="7" class="empty-cell">No prescriptions saved.</td>
        </tr>
      `;
      return;
    }

    prescriptionRows.innerHTML = prescriptions
      .map((prescription) => {
        return `
          <tr>
            <td>${escapeHtml(prescription.patientId)}</td>
            <td>${escapeHtml(prescription.prescriberLicense)}</td>
            <td>${escapeHtml(prescription.antibioticName)}</td>
            <td>${escapeHtml(prescription.antibioticClass)}</td>
            <td>${escapeHtml(prescription.dosage)}</td>
            <td>${escapeHtml(prescription.quantityLimit)}</td>
            <td>${escapeHtml(prescription.treatmentDurationDays)} days</td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    prescriptionRows.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">Unable to load prescriptions.</td>
      </tr>
    `;
  }
}

async function searchMedicines(query) {
  const trimmed = query.trim();

  lookupSource.textContent = trimmed.length < 2 ? 'Showing seed antibiotic list...' : 'Searching medicines...';

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

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

antibioticInput.addEventListener('input', (event) => {
  window.clearTimeout(lookupTimer);
  lookupTimer = window.setTimeout(() => {
    searchMedicines(event.target.value);
  }, 300);
});

antibioticInput.addEventListener('focus', () => {
  searchMedicines(antibioticInput.value);
});

antibioticInput.addEventListener('click', () => {
  searchMedicines(antibioticInput.value);
});

medicineSuggestions.addEventListener('mousedown', (event) => {
  const option = event.target.closest('.medicine-option[data-index]');

  if (!option) {
    return;
  }

  event.preventDefault();
  const medicine = currentMedicineResults[Number(option.dataset.index)];

  if (medicine) {
    antibioticInput.value = medicine.name;
    hideMedicineSuggestions();
    lookupSource.textContent = `Selected: ${medicine.source}`;
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
    patientId: formData.get('patientId'),
    prescriberLicense: formData.get('prescriberLicense'),
    antibiotic: formData.get('antibiotic'),
    antibioticClass: formData.get('antibioticClass'),
    dosage: formData.get('dosage'),
    quantity: Number(formData.get('quantity')),
    treatmentDurationDays: Number(formData.get('treatmentDurationDays'))
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
      form.reset();
      lookupSource.textContent = '';
      medicineOptions.innerHTML = '';
      hideMedicineSuggestions();
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

  const formData = new FormData(prescriptionForm);
  const payload = {
    patientId: formData.get('patientId'),
    prescriberLicense: formData.get('prescriberLicense'),
    antibioticName: formData.get('antibioticName'),
    antibioticClass: formData.get('antibioticClass'),
    dosage: formData.get('dosage'),
    quantityLimit: Number(formData.get('quantityLimit')),
    treatmentDurationDays: Number(formData.get('treatmentDurationDays')),
    expiryDate: formData.get('expiryDate')
  };

  try {
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

    setPrescriptionAlert('success', data.message);
    prescriptionForm.reset();
    await loadPrescriptions();
  } catch (error) {
    setPrescriptionAlert('danger', 'Unable to save prescription.', error.message);
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
loadTransactions();
loadPrescriptions();
