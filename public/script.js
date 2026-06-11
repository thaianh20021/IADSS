const form = document.querySelector('#transactionForm');
const prescriptionForm = document.querySelector('#prescriptionForm');
const authPanel = document.querySelector('#authPanel');
const loginForm = document.querySelector('#loginForm');
const registerForm = document.querySelector('#registerForm');
const showLoginButton = document.querySelector('#showLoginButton');
const showRegisterButton = document.querySelector('#showRegisterButton');
const authAlertArea = document.querySelector('#authAlertArea');
const userMenu = document.querySelector('#userMenu');
const currentUserLabel = document.querySelector('#currentUserLabel');
const logoutButton = document.querySelector('#logoutButton');
const alertArea = document.querySelector('#alertArea');
const prescriptionAlertArea = document.querySelector('#prescriptionAlertArea');
const settingsAlertArea = document.querySelector('#settingsAlertArea');
const rows = document.querySelector('#transactionRows');
const prescriptionRows = document.querySelector('#prescriptionRows');
const clearDataButton = document.querySelector('#clearDataButton');
const clearUsersButton = document.querySelector('#clearUsersButton');
const systemStatus = document.querySelector('#systemStatus');
const dashboardAlertArea = document.querySelector('#dashboardAlertArea');
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
const authRoleCards = document.querySelectorAll('.auth-role-card');
const authRoleHint = document.querySelector('#authRoleHint');
const globalSearchInput = document.querySelector('#globalSearchInput');
const notificationsButton = document.querySelector('#notificationsButton');
const settingsShortcutButton = document.querySelector('#settingsShortcutButton');
const helpButton = document.querySelector('#helpButton');
const supportButton = document.querySelector('#supportButton');
const utilityPanel = document.querySelector('#utilityPanel');
const utilityTitle = document.querySelector('#utilityTitle');
const utilityBody = document.querySelector('#utilityBody');
const utilityCloseButton = document.querySelector('#utilityCloseButton');
const dashboardRoleFilter = document.querySelector('#dashboardRoleFilter');
const dashboardDateFilter = document.querySelector('#dashboardDateFilter');
const dashboardFilterButton = document.querySelector('#dashboardFilterButton');
const exportReportButton = document.querySelector('#exportReportButton');
const overrideDispenseButton = document.querySelector('#overrideDispenseButton');

let lookupTimer = null;
let currentMedicineResults = [];
let lastSavedPrescription = null;
let qrScanStream = null;
let qrScanTimer = null;
let authToken = window.localStorage.getItem('iadssAuthToken') || '';
let currentUser = null;
let dashboardTransactions = [];
const qrCanvas = document.createElement('canvas');
const qrCanvasContext = qrCanvas.getContext('2d', {
  willReadFrequently: true
});
let referenceLists = {
  drugs: [],
  drugClasses: []
};
const allowedTabsByRole = {
  pharmacy: ['rolePanel', 'posPanel', 'apiDocsPanel'],
  doctor: ['rolePanel', 'doctorPanel', 'apiDocsPanel'],
  moh: ['rolePanel', 'dashboardPanel', 'settingsPanel', 'apiDocsPanel']
};
const defaultTabByRole = {
  pharmacy: 'posPanel',
  doctor: 'doctorPanel',
  moh: 'dashboardPanel'
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

function setAuthAlert(type, message, reason = '') {
  renderAlert(authAlertArea, type, message, reason);
}

function setPrescriptionAlert(type, message, reason = '') {
  renderAlert(prescriptionAlertArea, type, message, reason);
}

function setSettingsAlert(type, message, reason = '') {
  renderAlert(settingsAlertArea, type, message, reason);
}

function setDashboardAlert(type, message, reason = '') {
  renderAlert(dashboardAlertArea, type, message, reason);
}

function clearAlert(target) {
  target.innerHTML = '';
}

function setAuthMode(mode) {
  const isLogin = mode === 'login';
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  loginForm.classList.toggle('active', isLogin);
  registerForm.classList.toggle('active', !isLogin);
  showLoginButton.classList.toggle('active', isLogin);
  showRegisterButton.classList.toggle('active', !isLogin);
  showLoginButton.setAttribute('aria-selected', String(isLogin));
  showRegisterButton.setAttribute('aria-selected', String(!isLogin));
  clearAlert(authAlertArea);
}

function getAuthHeaders(headers = {}) {
  return authToken
    ? {
        ...headers,
        Authorization: `Bearer ${authToken}`
      }
    : headers;
}

async function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: getAuthHeaders(options.headers ?? {})
  });
}

function canAccessTab(panelId) {
  if (!currentUser) {
    return false;
  }

  return (allowedTabsByRole[currentUser.role] ?? []).includes(panelId);
}

function applyRoleAccess() {
  tabButtons.forEach((button) => {
    const allowed = currentUser && canAccessTab(button.dataset.tab);
    button.disabled = !allowed;
  });

  document.querySelectorAll('.role-card').forEach((card) => {
    const allowed = currentUser && canAccessTab(card.dataset.tab);
    card.disabled = !allowed;
  });
}

function showLoggedOut() {
  currentUser = null;
  authToken = '';
  window.localStorage.removeItem('iadssAuthToken');
  document.body.classList.add('auth-locked');
  authPanel.hidden = false;
  userMenu.hidden = true;
  setAuthMode('login');
  applyRoleAccess();
  tabPanels.forEach((panel) => panel.classList.remove('active'));
}

function showLoggedIn(user) {
  currentUser = user;
  document.body.classList.remove('auth-locked');
  authPanel.hidden = true;
  userMenu.hidden = false;
  const roleIdLabel = user.role === 'pharmacy'
    ? `Pharmacy ID: ${user.pharmacyId}`
    : user.role === 'doctor'
      ? `Doctor ID: ${user.doctorId}`
      : `MOH ID: ${user.mohId}`;
  currentUserLabel.textContent = `${user.name} (${roleIdLabel})`;
  applyRoleAccess();
  setActiveTab(defaultTabByRole[user.role] ?? 'rolePanel');
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
  if (!currentUser) {
    showLoggedOut();
    return;
  }

  if (!canAccessTab(panelId)) {
    setAuthAlert('danger', 'You do not have access to that portal.');
    panelId = defaultTabByRole[currentUser.role] ?? 'rolePanel';
  }

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
  const response = await apiFetch(`/api/reference/${category}`);

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
  const response = await apiFetch(`/api/reference/${category}`, {
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
  const response = await apiFetch(`/api/reference/${category}/${encodeURIComponent(value)}`, {
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

function openUtilityPanel(title, html) {
  if (!utilityPanel || !utilityTitle || !utilityBody) {
    return;
  }

  utilityTitle.textContent = title;
  utilityBody.innerHTML = html;
  utilityPanel.hidden = false;
}

function closeUtilityPanel() {
  if (utilityPanel) {
    utilityPanel.hidden = true;
  }
}

function getFilteredDashboardTransactions() {
  const role = dashboardRoleFilter?.value ?? 'all';
  const dateRange = dashboardDateFilter?.value ?? 'all';
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return dashboardTransactions.filter((transaction) => {
    if (role !== 'all') {
      if (role !== 'pharmacy' || !transaction.pharmacyId) {
        return false;
      }
    }

    if (dateRange !== 'all') {
      const timestamp = new Date(transaction.timestamp).getTime();
      if (!Number.isFinite(timestamp)) {
        return false;
      }
      const maxAge = dateRange === 'today' ? dayMs : dateRange === '7d' ? 7 * dayMs : 30 * dayMs;
      if (now - timestamp > maxAge) {
        return false;
      }
    }

    return true;
  });
}

function renderDashboardTransactions(transactions) {
  updateMetrics(transactions);

  if (transactions.length === 0) {
    rows.innerHTML = `
      <tr>
        <td colspan="13" class="empty-cell">No transactions match the current filters.</td>
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
          <td>${escapeHtml(transaction.pharmacyId || 'N/A')}</td>
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
}

function refreshDashboardFilters() {
  renderDashboardTransactions(getFilteredDashboardTransactions());
}

function exportDashboardCsv() {
  const transactions = getFilteredDashboardTransactions();
  const headers = ['Timestamp', 'Pharmacy ID', 'Prescription ID', 'Patient ID', 'Hospital / Clinic', 'Drug', 'Quantity', 'Duration', 'Rx Status', 'Status', 'Reason', 'Pharmacist', 'Override Reason'];
  const dataRows = transactions.map((transaction) => [transaction.timestamp, transaction.pharmacyId, transaction.prescriptionId, transaction.patientId, transaction.hospitalName, transaction.antibiotic, transaction.quantity, transaction.treatmentDurationDays, transaction.prescriptionStatus, transaction.status, transaction.reason, transaction.pharmacistLicense, transaction.overrideReason]);
  const csv = [headers, ...dataRows]
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `iadss-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setDashboardAlert('success', `${transactions.length} transaction(s) exported.`);
}

function applyGlobalSearch(query) {
  const normalized = String(query ?? '').trim().toLowerCase();
  document.querySelectorAll('.table-wrap tbody tr').forEach((row) => {
    row.hidden = normalized ? !row.textContent.toLowerCase().includes(normalized) : false;
  });
}

function renderNotifications() {
  const risky = dashboardTransactions.filter((transaction) => ['Blocked', 'Overridden'].includes(transaction.status)).slice(0, 8);
  const items = risky.length === 0
    ? '<p>No blocked or overridden transactions loaded.</p>'
    : `<ul class="utility-list">${risky.map((transaction) => `<li><strong>${escapeHtml(transaction.status)}</strong><span>${escapeHtml(transaction.prescriptionId || 'N/A')} - ${escapeHtml(transaction.reason || 'No reason')}</span></li>`).join('')}</ul>`;
  openUtilityPanel('Notifications', items);
}

function showHelpPanel() {
  openUtilityPanel('Support', `
    <div class="support-grid">
      <button type="button" data-help-tab="apiDocsPanel"><span class="material-symbols-outlined">api</span><strong>POS API Docs</strong><small>Open integration docs.</small></button>
      <button type="button" data-help-tab="settingsPanel"><span class="material-symbols-outlined">settings</span><strong>Reference Lists</strong><small>Manage drugs and classes if authorized.</small></button>
      <button type="button" data-help-action="lookup"><span class="material-symbols-outlined">qr_code_scanner</span><strong>Pharmacy Lookup</strong><small>Focus prescription lookup.</small></button>
    </div>
  `);
}

function selectAuthRole(role) {
  authRoleCards.forEach((card) => card.classList.toggle('selected', card.dataset.authRole === role));
  if (registerForm.elements.role) {
    registerForm.elements.role.value = role;
  }
  const labels = { doctor: 'Doctor / Hospital', pharmacy: 'Pharmacy', moh: 'MOH' };
  if (authRoleHint) {
    authRoleHint.textContent = `${labels[role]} selected. Register will use this role.`;
  }
}

async function loadTransactions() {
  rows.innerHTML = `
    <tr>
      <td colspan="13" class="empty-cell">Loading transactions...</td>
    </tr>
  `;

  try {
    const response = await apiFetch('/api/transactions');

    if (!response.ok) {
      throw new Error('Unable to load transactions');
    }

    const data = await response.json();
    dashboardTransactions = data.transactions ?? [];
    renderDashboardTransactions(getFilteredDashboardTransactions());
  } catch (error) {
    dashboardTransactions = [];
    updateMetrics([]);
    rows.innerHTML = `
      <tr>
        <td colspan="13" class="empty-cell">Unable to load transactions.</td>
      </tr>
    `;
  }
}

async function loadPrescriptions() {
  prescriptionRows.innerHTML = `
    <tr>
      <td colspan="13" class="empty-cell">Loading prescriptions...</td>
    </tr>
  `;

  try {
    const response = await apiFetch('/api/prescriptions');

    if (!response.ok) {
      throw new Error('Unable to load prescriptions');
    }

    const data = await response.json();
    const prescriptions = data.prescriptions ?? [];

    if (prescriptions.length === 0) {
      prescriptionRows.innerHTML = `
        <tr>
          <td colspan="13" class="empty-cell">No prescriptions saved.</td>
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
            <td>${escapeHtml(prescription.doctorId || 'N/A')}</td>
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
        <td colspan="13" class="empty-cell">Unable to load prescriptions.</td>
      </tr>
    `;
  }
}

async function searchMedicines(query) {
  const trimmed = query.trim();

  lookupSource.textContent = trimmed.length < 2 ? 'Showing configured drug list...' : 'Searching medicines...';

  try {
    const response = await apiFetch(`/api/medicines/search?q=${encodeURIComponent(trimmed)}`);

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
      <span>${escapeHtml(prescription.dosage)} Â· ${escapeHtml(prescription.drugClass)}</span>
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
    const response = await apiFetch(`/api/prescriptions/${encodeURIComponent(prescriptionId)}`);
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
    <p><strong>Doctor ID:</strong> ${escapeHtml(prescription.doctorId || 'N/A')}</p>
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
  const response = await apiFetch('/api/prescriptions', {
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

async function loadCurrentUser() {
  if (!authToken) {
    showLoggedOut();
    return;
  }

  try {
    const response = await apiFetch('/api/auth/me');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Session invalid');
    }

    showLoggedIn(data.user);
    await loadReferenceLists();
  } catch (error) {
    showLoggedOut();
  }
}

async function submitAuthForm(endpoint, payload) {
  const response = await apiFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Authentication failed');
  }

  authToken = data.token;
  window.localStorage.setItem('iadssAuthToken', authToken);
  showLoggedIn(data.user);
  await loadReferenceLists();
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll('.role-card').forEach((card) => {
  card.addEventListener('click', () => setActiveTab(card.dataset.tab));
});

showLoginButton.addEventListener('click', () => setAuthMode('login'));
showRegisterButton.addEventListener('click', () => setAuthMode('register'));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);

  try {
    await submitAuthForm('/api/auth/login', {
      identifier: formData.get('identifier'),
      password: formData.get('password')
    });
    loginForm.reset();
    clearAlert(authAlertArea);
  } catch (error) {
    setAuthAlert('danger', 'Unable to log in.', error.message);
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(registerForm);

  try {
    await submitAuthForm('/api/auth/register', {
      name: formData.get('name'),
      username: formData.get('username'),
      email: formData.get('email'),
      password: formData.get('password'),
      role: formData.get('role')
    });
    registerForm.reset();
    clearAlert(authAlertArea);
  } catch (error) {
    setAuthAlert('danger', 'Unable to create account.', error.message);
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    if (authToken) {
      await apiFetch('/api/auth/logout', {
        method: 'POST'
      });
    }
  } finally {
    showLoggedOut();
  }
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
      const response = await apiFetch(`/api/prescriptions/${encodeURIComponent(id)}/cancel`, {
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
    const response = await apiFetch(`/api/prescriptions/${encodeURIComponent(id)}`);
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
    const response = await apiFetch('/api/transactions', {
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
    const response = await apiFetch('/api/transactions', {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Unable to clear transactions');
    }

    await loadTransactions();
    setDashboardAlert('success', 'Transaction history cleared.');
  } catch (error) {
    setDashboardAlert('danger', 'Unable to clear transaction history.');
  } finally {
    clearDataButton.disabled = false;
  }
});

clearUsersButton.addEventListener('click', async () => {
  const password = window.prompt('Enter reset password to delete all users:');

  if (password === null) {
    return;
  }

  clearUsersButton.disabled = true;

  try {
    const response = await apiFetch('/api/users', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to clear users');
    }

    setDashboardAlert('success', 'All users deleted. Please create a new account to continue.');
    window.setTimeout(() => {
      showLoggedOut();
    }, 900);
  } catch (error) {
    setDashboardAlert('danger', 'Unable to clear users.', error.message);
  } finally {
    clearUsersButton.disabled = false;
  }
});

authRoleCards.forEach((card) => {
  card.addEventListener('click', () => {
    selectAuthRole(card.dataset.authRole);
    setAuthMode('register');
  });
});

utilityCloseButton?.addEventListener('click', closeUtilityPanel);
utilityPanel?.addEventListener('click', (event) => {
  if (event.target === utilityPanel) {
    closeUtilityPanel();
  }
});

notificationsButton?.addEventListener('click', async () => {
  if (currentUser?.role === 'moh' && dashboardTransactions.length === 0) {
    await loadTransactions();
  }
  renderNotifications();
});

settingsShortcutButton?.addEventListener('click', () => {
  if (currentUser && canAccessTab('settingsPanel')) {
    setActiveTab('settingsPanel');
  } else {
    openUtilityPanel('Settings unavailable', '<p>Your current role cannot manage reference settings.</p>');
  }
});

helpButton?.addEventListener('click', showHelpPanel);
supportButton?.addEventListener('click', showHelpPanel);

globalSearchInput?.addEventListener('input', (event) => {
  const query = event.target.value;
  if (document.querySelector('.tab-panel.active')?.id === 'posPanel') {
    lookupPrescriptionId.value = query;
  } else {
    applyGlobalSearch(query);
  }
});

globalSearchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && document.querySelector('.tab-panel.active')?.id === 'posPanel') {
    event.preventDefault();
    loadPrescriptionForPharmacy(globalSearchInput.value);
  }
});

dashboardRoleFilter?.addEventListener('change', refreshDashboardFilters);
dashboardDateFilter?.addEventListener('change', refreshDashboardFilters);
dashboardFilterButton?.addEventListener('click', () => dashboardRoleFilter?.focus());
exportReportButton?.addEventListener('click', exportDashboardCsv);

overrideDispenseButton?.addEventListener('click', () => {
  document.querySelector('#overrideBlocked').checked = true;
  form.requestSubmit();
});

document.addEventListener('click', (event) => {
  const proxy = event.target.closest('[data-proxy-click]');
  if (proxy) {
    document.querySelector(`#${proxy.dataset.proxyClick}`)?.click();
  }

  const helpTab = event.target.closest('[data-help-tab]');
  if (helpTab) {
    closeUtilityPanel();
    setActiveTab(helpTab.dataset.helpTab);
  }

  const helpAction = event.target.closest('[data-help-action="lookup"]');
  if (helpAction) {
    closeUtilityPanel();
    setActiveTab('posPanel');
    lookupPrescriptionId.focus();
  }
});
checkHealth();
loadCurrentUser();
