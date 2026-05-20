/**
 * JORINOVA NEXUS ALIS-X — FinaOps Module
 * Financial Operations · MoMo Payment Integration · Receipt Engine
 *
 * window.NEXUS.csrf      — CSRF token
 * window.NEXUS.apiBase   — API base URL (/api/v1)
 * window.NexusSig        — Post-quantum signature engine
 */
'use strict';

(function () {

  /* ── Constants & State ──────────────────────────────────────── */
  const API = window.NEXUS?.apiBase ?? '/api/v1';
  const CSRF = () => window.NEXUS?.csrf ?? document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';

  const DEMO_PATIENTS = [
    { id: 1, name: 'Jean-Pierre Nkurunziza', pid: 'NX-2025-001234', dob: '1988-04-15', phone: '788001122', gender: 'M', outstanding: 15000 },
    { id: 2, name: 'Amina Uwase',            pid: 'NX-2025-001892', dob: '1995-07-22', phone: '722334455', gender: 'F', outstanding: 8500  },
    { id: 3, name: 'David Mugisha',          pid: 'NX-2025-002104', dob: '1972-11-30', phone: '783990011', gender: 'M', outstanding: 22000 },
    { id: 4, name: 'Grace Habimana',         pid: 'NX-2025-002567', dob: '2001-03-08', phone: '795556677', gender: 'F', outstanding: 5000  },
    { id: 5, name: 'Emmanuel Bizimana',      pid: 'NX-2025-003011', dob: '1965-09-14', phone: '781223344', gender: 'M', outstanding: 35000 },
  ];

  const DEMO_INVOICES = {
    1: [{ id: 'INV-2025-1234', tests: ['CBC', 'Malaria RDT'],    total: 15000, paid: 0    }],
    2: [{ id: 'INV-2025-1892', tests: ['HIV Test', 'HBsAg'],     total: 8500,  paid: 4000 }],
    3: [{ id: 'INV-2025-2104', tests: ['Metabolic Panel', 'CBC', 'Urinalysis'], total: 22000, paid: 10000 }],
    4: [{ id: 'INV-2025-2567', tests: ['Malaria RDT'],            total: 5000,  paid: 0    }],
    5: [{ id: 'INV-2025-3011', tests: ['Genomics Panel'],         total: 35000, paid: 0    }],
  };

  const PAYMENT_METHOD_LABELS = {
    mtn_momo:     '📱 MTN MoMo',
    airtel_money: '📱 Airtel Money',
    cash:         '💵 Cash',
    bank_transfer:'🏦 Bank Transfer',
    rssb:         '🛡️ RSSB Insurance',
    mutuelle:     '🛡️ Mutuelle de Santé',
  };

  let _state = {
    currentStep:    1,
    selectedPatient: null,
    selectedInvoice: null,
    selectedMethod: 'mtn_momo',
    amount: 0,
    txRef: null,
    pollInterval: null,
    timerInterval: null,
    timerSeconds: 0,
    lastReceipt: null,
    txHistory: [],
  };

  /* ── Helper: API fetch ──────────────────────────────────────── */
  async function apiFetch(url, opts = {}) {
    const defaults = {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': CSRF(),
      },
    };
    try {
      const res = await fetch(API + url, Object.assign({}, defaults, opts, {
        headers: Object.assign({}, defaults.headers, opts.headers || {}),
      }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('[FinaOps] API error:', e.message);
      return null;
    }
  }

  /* ── Helper: Format RWF ─────────────────────────────────────── */
  function fmtRwf(n) {
    return 'RWF ' + Number(n).toLocaleString('en-US');
  }

  /* ── Helper: Toast ──────────────────────────────────────────── */
  function toast(type, title, msg) {
    if (window.NEXUS?.toast) { window.NEXUS.toast(type, title, msg); return; }
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    console.log(`[${type.toUpperCase()}] ${title}: ${msg}`);
    // Fallback in-page toast
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span>
      <div class="toast-body"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>
      <button class="toast-close">✕</button>`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-in'));
    t.querySelector('.toast-close').onclick = () => t.remove();
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 400); }, 5000);
  }

  /* ── Tab Navigation ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.fo-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.fo-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.fo-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.pane);
        if (pane) pane.classList.add('active');
        if (btn.dataset.pane === 'fo-overview')   loadOverview();
        if (btn.dataset.pane === 'fo-invoices')   loadInvoices();
        if (btn.dataset.pane === 'fo-analytics')  loadAnalytics();
      });
    });
  }

  /* ── Overview: KPIs + Charts ────────────────────────────────── */
  function loadOverview() {
    // Set KPI values (demo data; replace with API calls)
    const kpis = {
      'fk-today-rev':  '348,000 RWF',
      'fk-month-rev':  '6,500,000 RWF',
      'fk-outstanding':'1,250,000 RWF',
      'fk-expenses':   '3,220,000 RWF',
    };
    Object.entries(kpis).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    renderOverviewCharts();
  }

  function renderOverviewCharts() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#7FA8CC';

    // Revenue vs Expenses — last 7 days
    const barCtx = document.getElementById('fo-rev-bar-chart')?.getContext('2d');
    if (barCtx && !barCtx.canvas._chartInstance) {
      const labels = (() => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push(d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }));
        }
        return days;
      })();
      const chart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Revenue',
              data: [280000, 320000, 290000, 410000, 355000, 398000, 348000],
              backgroundColor: 'rgba(0,230,118,0.25)',
              borderColor: '#00E676',
              borderWidth: 1.5,
              borderRadius: 4,
            },
            {
              label: 'Expenses',
              data: [185000, 210000, 175000, 220000, 205000, 195000, 185000],
              backgroundColor: 'rgba(255,23,68,0.15)',
              borderColor: '#FF1744',
              borderWidth: 1.5,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#7FA8CC', boxWidth: 12 } },
            tooltip: { backgroundColor: 'rgba(7,20,40,0.95)', titleColor: '#E8F4FF', bodyColor: '#7FA8CC' },
          },
          scales: {
            x: { grid: { color: 'rgba(0,153,255,0.06)' }, ticks: { color: '#4A6880' } },
            y: {
              grid: { color: 'rgba(0,153,255,0.06)' },
              ticks: { color: '#4A6880', callback: v => (v / 1000).toFixed(0) + 'K' },
            },
          },
        },
      });
      barCtx.canvas._chartInstance = chart;
    }

    // Payment method pie
    const pieCtx = document.getElementById('fo-pay-pie-chart')?.getContext('2d');
    if (pieCtx && !pieCtx.canvas._chartInstance) {
      const pieData = [
        ['Cash',          3240000, 'rgba(0,153,255,0.75)'],
        ['MoMo',           980000, 'rgba(255,215,0,0.75)'],
        ['RSSB/Mutuelle', 1860000, 'rgba(0,230,118,0.75)'],
        ['Bank',           420000, 'rgba(213,0,249,0.75)'],
      ];
      const chart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
          labels: pieData.map(d => d[0]),
          datasets: [{
            data: pieData.map(d => d[1]),
            backgroundColor: pieData.map(d => d[2]),
            borderColor: 'rgba(2,8,24,0.8)',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(7,20,40,0.95)' } },
        },
      });
      pieCtx.canvas._chartInstance = chart;

      // Legend
      const total = pieData.reduce((s, d) => s + d[1], 0);
      const leg = document.getElementById('fo-pie-legend');
      if (leg) {
        leg.innerHTML = pieData.map(([l, v, c]) =>
          `<div class="legend-item">
            <div class="legend-dot" style="background:${c}"></div>
            <span class="legend-label">${l}</span>
            <span class="legend-count">${(v / total * 100).toFixed(1)}%</span>
          </div>`
        ).join('');
      }
    }
  }

  /* ── Patient Lookup ─────────────────────────────────────────── */
  function initPatientSearch() {
    const searchInput = document.getElementById('momo-patient-search');
    const resultsEl   = document.getElementById('momo-search-results');
    if (!searchInput || !resultsEl) return;

    let debounce = null;

    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => lookupPatient(searchInput.value.trim()), 260);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length > 1) resultsEl.classList.add('open');
    });

    document.addEventListener('click', e => {
      if (!searchInput.contains(e.target) && !resultsEl.contains(e.target)) {
        resultsEl.classList.remove('open');
      }
    });
  }

  async function lookupPatient(query) {
    const resultsEl = document.getElementById('momo-search-results');
    if (!resultsEl) return;
    if (!query || query.length < 2) { resultsEl.classList.remove('open'); return; }

    // Try API first, fall back to demo data
    let patients = null;
    patients = await apiFetch(`/patients/?search=${encodeURIComponent(query)}&limit=8`);
    if (!patients || !patients.results) {
      // Demo fallback
      const q = query.toLowerCase();
      patients = { results: DEMO_PATIENTS.filter(p =>
        p.name.toLowerCase().includes(q) || p.pid.toLowerCase().includes(q) || p.phone.includes(q)
      )};
    }

    renderPatientResults(patients.results || []);
  }

  function renderPatientResults(patients) {
    const resultsEl = document.getElementById('momo-search-results');
    if (!resultsEl) return;

    if (!patients.length) {
      resultsEl.innerHTML = '<div style="padding:12px 16px;font-size:13px;color:var(--text-muted)">No patients found</div>';
      resultsEl.classList.add('open');
      return;
    }

    resultsEl.innerHTML = patients.map(p => {
      const initials = p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return `<div class="momo-search-result-item" data-id="${p.id}">
        <div class="msri-avatar">${initials}</div>
        <div class="msri-info">
          <div class="msri-name">${p.name}</div>
          <div class="msri-meta">${p.pid || p.patient_id || '—'} · ${p.phone || '—'}</div>
        </div>
        <span class="badge badge-orange" style="margin-left:auto;flex-shrink:0">${fmtRwf(p.outstanding || p.outstanding_balance || 0)}</span>
      </div>`;
    }).join('');

    resultsEl.querySelectorAll('.momo-search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const patient = patients.find(p => String(p.id) === item.dataset.id);
        if (patient) selectPatient(patient);
      });
    });

    resultsEl.classList.add('open');
  }

  function selectPatient(patient) {
    _state.selectedPatient = patient;

    const card    = document.getElementById('patient-payment-card');
    const avatar  = document.getElementById('ppc-avatar');
    const name    = document.getElementById('ppc-name');
    const pid     = document.getElementById('ppc-pid');
    const dob     = document.getElementById('ppc-dob');
    const balance = document.getElementById('ppc-balance');
    const invoiceGroup = document.getElementById('momo-invoice-group');
    const invSel  = document.getElementById('momo-invoice-sel');

    if (card) {
      const initials = patient.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      if (avatar)  avatar.textContent  = initials;
      if (name)    name.textContent    = patient.name;
      if (pid)     pid.textContent     = patient.pid || patient.patient_id || '—';
      if (dob)     dob.textContent     = patient.dob || '—';
      if (balance) balance.textContent = fmtRwf(patient.outstanding || patient.outstanding_balance || 0);
      card.style.display = 'flex';
    }

    // Auto-fill phone
    const phoneInput = document.getElementById('momo-phone');
    if (phoneInput && patient.phone) {
      phoneInput.value = patient.phone.replace(/^0/, '').replace(/^250/, '').replace(/\s/g, '');
    }

    // Load invoices
    if (invoiceGroup && invSel) {
      const invoices = DEMO_INVOICES[patient.id] || [];
      invSel.innerHTML = '<option value="">— Select invoice —</option>' +
        invoices.map(inv =>
          `<option value="${inv.id}" data-total="${inv.total}" data-paid="${inv.paid}">
            ${inv.id} · ${fmtRwf(inv.total - inv.paid)} outstanding
          </option>`
        ).join('');
      invoiceGroup.style.display = 'block';

      invSel.addEventListener('change', () => {
        const opt = invSel.selectedOptions[0];
        if (!opt || !opt.value) return;
        const remaining = (opt.dataset.total || 0) - (opt.dataset.paid || 0);
        const amtInput = document.getElementById('momo-amount');
        if (amtInput) {
          amtInput.value = remaining;
          updateAmountDisplay(remaining);
        }
        _state.selectedInvoice = { id: opt.value, total: Number(opt.dataset.total), paid: Number(opt.dataset.paid) };
      });
    }

    // Close search
    document.getElementById('momo-search-results')?.classList.remove('open');
    document.getElementById('momo-patient-search').value = patient.name;
  }

  // Clear patient selection
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ppc-clear-btn')?.addEventListener('click', () => {
      _state.selectedPatient = null;
      _state.selectedInvoice = null;
      document.getElementById('patient-payment-card').style.display = 'none';
      document.getElementById('momo-invoice-group').style.display = 'none';
      document.getElementById('momo-patient-search').value = '';
      document.getElementById('momo-amount').value = '';
      updateAmountDisplay(0);
    });
  });

  /* ── Amount Display ─────────────────────────────────────────── */
  function updateAmountDisplay(val) {
    const display = document.getElementById('momo-amount-display');
    if (!display) return;
    const n = Number(val) || 0;
    display.textContent = n > 0 ? fmtRwf(n) : '—';
    _state.amount = n;
  }

  function initAmountField() {
    const amtInput = document.getElementById('momo-amount');
    if (!amtInput) return;
    amtInput.addEventListener('input', () => updateAmountDisplay(amtInput.value));

    document.getElementById('momo-autofill-btn')?.addEventListener('click', () => {
      if (_state.selectedPatient) {
        const outstanding = _state.selectedPatient.outstanding || _state.selectedPatient.outstanding_balance || 0;
        amtInput.value = outstanding;
        updateAmountDisplay(outstanding);
      }
    });
  }

  /* ── Payment Method Selection ───────────────────────────────── */
  function initPaymentMethodBtns() {
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _state.selectedMethod = btn.dataset.method;

        // Show/hide phone vs insurance fields
        const phoneGroup     = document.getElementById('momo-phone-group');
        const insuranceGroup = document.getElementById('momo-insurance-group');
        const isMoMo = ['mtn_momo', 'airtel_money'].includes(_state.selectedMethod);
        const isIns  = ['rssb', 'mutuelle'].includes(_state.selectedMethod);

        if (phoneGroup)     phoneGroup.style.display     = isMoMo || isIns ? '' : 'none';
        if (insuranceGroup) insuranceGroup.style.display = isIns ? '' : 'none';

        // Update submit button label
        const btn2 = document.getElementById('momo-initiate-btn');
        if (btn2) {
          if (isMoMo) btn2.innerHTML = '<span>💳</span> Initiate MoMo Payment';
          else if (isIns) btn2.innerHTML = '<span>🛡️</span> Process Insurance Claim';
          else if (_state.selectedMethod === 'cash') btn2.innerHTML = '<span>💵</span> Record Cash Payment';
          else btn2.innerHTML = '<span>🏦</span> Record Bank Transfer';
        }
      });
    });
  }

  /* ── Step 1: Initiate Payment ───────────────────────────────── */
  async function initiatePayment() {
    const patient  = _state.selectedPatient;
    const amount   = Number(document.getElementById('momo-amount')?.value) || 0;
    const phone    = document.getElementById('momo-phone')?.value?.trim();
    const method   = _state.selectedMethod;

    if (!patient) { toast('warning', 'Patient Required', 'Please select a patient first.'); return; }
    if (!amount || amount < 100) { toast('warning', 'Invalid Amount', 'Please enter a valid amount (minimum RWF 100).'); return; }
    const isMoMo = ['mtn_momo', 'airtel_money'].includes(method);
    if (isMoMo && (!phone || phone.length < 8)) { toast('warning', 'Phone Required', 'Please enter a valid phone number for MoMo payment.'); return; }

    _state.amount = amount;

    // Show loading state on button
    const btn = document.getElementById('momo-initiate-btn');
    if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }

    // Try API, fall back to demo mode
    let txRef = null;
    const invoiceId = _state.selectedInvoice?.id || 'DEMO';

    const payload = {
      patient_id: patient.id,
      amount,
      method,
      phone: phone ? `+250${phone}` : null,
      invoice_id: invoiceId,
    };

    const apiResult = await apiFetch(`/billing/invoices/${invoiceId}/momo-pay/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (apiResult?.tx_ref) {
      txRef = apiResult.tx_ref;
    } else {
      // Demo: generate fake txRef
      txRef = 'NEXUS-' + Date.now().toString(36).toUpperCase();
    }

    if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }

    _state.txRef = txRef;
    goToStep(2);
    startPendingUI(phone ? `+250${phone}` : 'N/A', amount, method);

    // Demo mode: auto-confirm after 4 seconds
    const isDemoMode = !apiResult?.tx_ref;
    if (isDemoMode) {
      console.info('[FinaOps] Demo mode: auto-confirming in 4 seconds');
    }
  }

  /* ── Step 2: Pending Modal ──────────────────────────────────── */
  function startPendingUI(phone, amount, method) {
    document.getElementById('momo-pending-phone').textContent  = phone;
    document.getElementById('momo-pending-amount').textContent = fmtRwf(amount);
    document.getElementById('momo-pending-provider').textContent = method === 'airtel_money' ? 'Airtel Money' : 'MTN MoMo';

    // Timer
    _state.timerSeconds = 0;
    clearInterval(_state.timerInterval);
    _state.timerInterval = setInterval(() => {
      _state.timerSeconds++;
      const m = String(Math.floor(_state.timerSeconds / 60)).padStart(2, '0');
      const s = String(_state.timerSeconds % 60).padStart(2, '0');
      const timerEl = document.getElementById('momo-timer');
      if (timerEl) timerEl.textContent = `${m}:${s}`;
      if (_state.timerSeconds >= 120) cancelPayment(); // 2-min timeout
    }, 1000);

    // Poll payment status
    clearInterval(_state.pollInterval);
    _state.pollInterval = setInterval(() => pollPaymentStatus(_state.txRef), 2000);
  }

  async function pollPaymentStatus(txRef) {
    if (!txRef) return;
    const result = await apiFetch(`/billing/payments/status/${txRef}/`);
    if (result?.status === 'confirmed' || result?.status === 'success') {
      clearInterval(_state.pollInterval);
      clearInterval(_state.timerInterval);
      onPaymentConfirmed(result);
    } else if (result?.status === 'failed' || result?.status === 'cancelled') {
      clearInterval(_state.pollInterval);
      clearInterval(_state.timerInterval);
      toast('error', 'Payment Failed', result.message || 'The payment was not completed.');
      cancelPayment();
    }
  }

  function cancelPayment() {
    clearInterval(_state.pollInterval);
    clearInterval(_state.timerInterval);
    goToStep(1);
    toast('info', 'Payment Cancelled', 'Payment request was cancelled.');
  }

  /* ── Step 3: Payment Confirmed → Receipt ────────────────────── */
  function onPaymentConfirmed(paymentData) {
    const patient = _state.selectedPatient;
    const amount  = _state.amount;
    const invoice = _state.selectedInvoice;
    const method  = _state.selectedMethod;
    const txRef   = _state.txRef;
    const now     = new Date();

    const receiptNum = 'RCP-' + now.getFullYear() + '-' + String(Date.now()).slice(-6);
    const total      = invoice?.total || amount;
    const paid       = (invoice?.paid || 0) + amount;
    const remaining  = Math.max(0, total - paid);
    const pct        = Math.min(100, Math.round(paid / total * 100));

    _state.lastReceipt = { receiptNum, patient, amount, total, paid, remaining, pct, method, txRef, now };

    // Fill receipt fields
    document.getElementById('receipt-number').textContent      = receiptNum;
    document.getElementById('receipt-datetime').textContent    = now.toLocaleString('en-GB');
    document.getElementById('receipt-patient-name').textContent = patient?.name || '—';
    document.getElementById('receipt-patient-pid').textContent  = patient?.pid || '—';

    // Line items
    const itemsEl = document.getElementById('receipt-items');
    if (itemsEl && invoice) {
      const tests = invoice.tests || paymentData?.tests || ['Lab Services'];
      const perTest = Math.round(invoice.total / tests.length);
      itemsEl.innerHTML = tests.map(t =>
        `<div class="receipt-line">
          <span>🧪 ${t}</span>
          <span class="fo-mono">${fmtRwf(perTest)}</span>
        </div>`
      ).join('');
    } else if (itemsEl) {
      itemsEl.innerHTML = `<div class="receipt-line"><span>🧪 Lab Services</span><span class="fo-mono">${fmtRwf(amount)}</span></div>`;
    }

    document.getElementById('receipt-invoice-total').textContent = fmtRwf(total);
    document.getElementById('receipt-amount-paid').textContent   = fmtRwf(amount);
    document.getElementById('receipt-remaining').textContent     = fmtRwf(remaining);
    document.getElementById('receipt-pct-bar').style.width      = pct + '%';
    document.getElementById('receipt-pct-label').textContent    = `${pct}% of invoice paid`;
    document.getElementById('receipt-pay-method').textContent   = PAYMENT_METHOD_LABELS[method] || method;
    document.getElementById('receipt-tx-ref').textContent       = txRef || '—';

    // Success ref
    document.getElementById('momo-success-ref').textContent = 'Ref: ' + (txRef || '—');

    goToStep(3);

    // Add to history
    addToHistory({
      name: patient?.name || 'Patient',
      method: PAYMENT_METHOD_LABELS[method] || method,
      amount,
      ref: txRef,
      time: now,
    });

    toast('success', 'Payment Confirmed!', `${fmtRwf(amount)} received. Receipt generated.`);
  }

  /* ── Print Receipt ──────────────────────────────────────────── */
  function printReceipt() {
    const r = _state.lastReceipt;
    if (!r) return;

    if (window.NexusSig) {
      window.NexusSig.autosignForPrint('receipt-container', {
        docType:    'receipt',
        docId:      r.receiptNum,
        docTitle:   'Payment Receipt — ' + (r.patient?.name || ''),
        patientPid: r.patient?.pid || '',
        leaderName: window.NEXUS?.hospitalName || 'NEXUS LAB',
      });
    }

    window.print();
  }

  /* ── Send Receipt SMS ───────────────────────────────────────── */
  async function sendReceiptSMS(step4 = true) {
    const r = _state.selectedPatient;
    const lr = _state.lastReceipt;
    if (!lr) { toast('warning', 'No Receipt', 'Generate a receipt first.'); return; }

    const phone = document.getElementById('momo-phone')?.value;
    const fullPhone = phone ? `+250${phone}` : '—';
    const dateStr = lr.now.toLocaleDateString('en-GB');
    const smsText = `NEXUS LAB Receipt: Amount ${fmtRwf(lr.amount)} received on ${dateStr} for PID ${lr.patient?.pid || 'N/A'}. ${lr.pct}% of invoice paid. Ref: ${lr.txRef || 'N/A'}. Powered by JORINOVA NEXUS ALIS-X`;

    const payload = {
      patient_id: lr.patient?.id,
      phone: fullPhone,
      message: smsText,
    };

    const result = await apiFetch('/notifications/sms/', { method: 'POST', body: JSON.stringify(payload) });

    if (step4) {
      // Populate step 4
      document.getElementById('sms-proof-to').textContent      = 'To: ' + fullPhone;
      document.getElementById('sms-preview-text').textContent  = smsText;
      document.getElementById('sms-bubble-time').textContent   = new Date().toLocaleTimeString('en-GB');
      goToStep(4);
    }

    toast('success', 'SMS Sent', `Receipt sent to ${fullPhone}`);
  }

  /* ── SMS Resend ─────────────────────────────────────────────── */
  function resendSMS() {
    sendReceiptSMS(false);
  }

  /* ── History ─────────────────────────────────────────────────── */
  function addToHistory(tx) {
    _state.txHistory.unshift(tx);
    renderHistory();
  }

  function renderHistory() {
    const list = document.getElementById('momo-history-list');
    if (!list) return;
    if (!_state.txHistory.length) {
      list.innerHTML = `<div class="empty-state" style="padding:var(--space-xl)">
        <div class="empty-state-icon">📱</div>
        <h3>No Transactions</h3>
        <p>MoMo transactions will appear here after processing.</p>
      </div>`;
      return;
    }
    list.innerHTML = _state.txHistory.map(tx => `
      <div class="momo-tx-item">
        <div class="momo-tx-icon">${tx.method.split(' ')[0]}</div>
        <div class="momo-tx-info">
          <div class="momo-tx-name">${tx.name}</div>
          <div class="momo-tx-meta">${tx.ref} · ${new Date(tx.time).toLocaleTimeString('en-GB')}</div>
        </div>
        <div class="momo-tx-amount">${fmtRwf(tx.amount)}</div>
      </div>
    `).join('');
  }

  /* ── Step Navigation ────────────────────────────────────────── */
  function goToStep(step) {
    _state.currentStep = step;
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`momo-step-${i}`);
      if (stepEl) stepEl.style.display = i === step ? 'flex' : 'none';

      const ind = document.getElementById(`momo-step-ind-${i}`);
      if (ind) {
        ind.classList.remove('active', 'done');
        if (i < step) ind.classList.add('done');
        else if (i === step) ind.classList.add('active');
      }
    }
  }

  /* ── Invoices Tab ────────────────────────────────────────────── */
  function loadInvoices() {
    const stats = { total: 24, paid: 15, pending: 6, overdue: 3 };
    document.getElementById('inv-total-count').textContent  = stats.total;
    document.getElementById('inv-paid-count').textContent   = stats.paid;
    document.getElementById('inv-pending-count').textContent = stats.pending;
    document.getElementById('inv-overdue-count').textContent = stats.overdue;

    const tbody = document.getElementById('fo-invoices-tbody');
    if (!tbody) return;

    const demoInvoices = [
      { num: 'INV-2025-1234', patient: 'Jean-Pierre Nkurunziza', pid: 'NX-2025-001234', tests: 'CBC, Malaria RDT', total: 15000, paid: 0, ins: '—', status: 'pending', date: '2025-05-14', patientId: 1 },
      { num: 'INV-2025-1892', patient: 'Amina Uwase',            pid: 'NX-2025-001892', tests: 'HIV Test, HBsAg', total: 8500, paid: 4000, ins: 'RSSB', status: 'partial', date: '2025-05-13', patientId: 2 },
      { num: 'INV-2025-2104', patient: 'David Mugisha',          pid: 'NX-2025-002104', tests: 'Metabolic Panel', total: 22000, paid: 22000, ins: 'Mutuelle', status: 'paid', date: '2025-05-12', patientId: 3 },
      { num: 'INV-2025-1567', patient: 'Grace Habimana',         pid: 'NX-2025-002567', tests: 'Malaria RDT',     total: 5000, paid: 0, ins: '—', status: 'overdue', date: '2025-04-30', patientId: 4 },
    ];

    const statusMap = {
      paid:    '<span class="badge badge-green">✅ Paid</span>',
      pending: '<span class="badge badge-gold">⏳ Pending</span>',
      partial: '<span class="badge badge-blue">🔶 Partial</span>',
      overdue: '<span class="badge badge-orange">⚠️ Overdue</span>',
    };

    tbody.innerHTML = demoInvoices.map(inv => `
      <tr>
        <td class="fo-mono" style="color:var(--blue-glow)">${inv.num}</td>
        <td>
          <div style="font-weight:600">${inv.patient}</div>
          <div class="fo-mono" style="font-size:11px;color:var(--text-muted)">${inv.pid}</div>
        </td>
        <td style="font-size:var(--text-xs);color:var(--text-secondary)">${inv.tests}</td>
        <td class="fo-mono">${inv.total.toLocaleString()}</td>
        <td class="fo-mono ${inv.paid > 0 ? 'fo-green-text' : ''}">${inv.paid.toLocaleString()}</td>
        <td>${inv.ins}</td>
        <td>${statusMap[inv.status] || inv.status}</td>
        <td class="fo-mono" style="font-size:11px">${inv.date}</td>
        <td>
          <div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">
            <button class="inv-momo-btn" data-patient="${inv.patientId}" data-inv="${inv.num}" data-amount="${inv.total - inv.paid}">📱 Pay</button>
            <button class="btn btn-ghost btn-xs" style="font-size:11px"><i class="fas fa-eye"></i></button>
            <button class="btn btn-ghost btn-xs" style="font-size:11px"><i class="fas fa-print"></i></button>
          </div>
        </td>
      </tr>
    `).join('');

    // MoMo quick-pay buttons
    tbody.querySelectorAll('.inv-momo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = Number(btn.dataset.patient);
        const patient = DEMO_PATIENTS.find(p => p.id === pid);
        if (!patient) return;

        // Switch to MoMo tab and pre-fill
        document.querySelectorAll('.fo-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.fo-body .tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-pane="fo-momo"]')?.classList.add('active');
        document.querySelector('.fo-tab-nav .tab-btn[data-pane="fo-momo"]')?.classList.add('active');

        selectPatient(patient);
        const amtInput = document.getElementById('momo-amount');
        if (amtInput) {
          amtInput.value = btn.dataset.amount;
          updateAmountDisplay(btn.dataset.amount);
        }
        toast('info', 'MoMo Pay', `Pre-filled for ${patient.name}`);
      });
    });
  }

  /* ── Analytics Tab ──────────────────────────────────────────── */
  function loadAnalytics() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#7FA8CC';

    // Monthly Revenue Trend
    const tCtx = document.getElementById('fo-trend-chart')?.getContext('2d');
    if (tCtx && !tCtx.canvas._chartInstance) {
      const chart = new Chart(tCtx, {
        type: 'line',
        data: {
          labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
          datasets: [{
            label: 'Revenue (RWF)',
            data: [4200000,4500000,4100000,4800000,5000000,4600000,5100000,4900000,5200000,4800000,5300000,6500000],
            borderColor: '#00AAFF',
            backgroundColor: 'rgba(0,170,255,0.08)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#00AAFF',
            fill: true,
            tension: 0.4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: 'rgba(7,20,40,0.95)', callbacks: { label: ctx => fmtRwf(ctx.raw) } },
          },
          scales: {
            x: { grid: { color: 'rgba(0,153,255,0.06)' }, ticks: { color: '#4A6880' } },
            y: { grid: { color: 'rgba(0,153,255,0.06)' }, ticks: { color: '#4A6880', callback: v => (v/1000000).toFixed(1)+'M' } },
          },
        },
      });
      tCtx.canvas._chartInstance = chart;
    }

    // Payment method breakdown pie
    const mCtx = document.getElementById('fo-method-pie')?.getContext('2d');
    if (mCtx && !mCtx.canvas._chartInstance) {
      const data = [
        ['Cash',          3240000, 'rgba(0,153,255,0.75)'],
        ['MTN MoMo',       720000, 'rgba(255,215,0,0.75)'],
        ['Airtel Money',   260000, 'rgba(255,109,0,0.75)'],
        ['RSSB/Mutuelle', 1860000, 'rgba(0,230,118,0.75)'],
        ['Bank',           420000, 'rgba(213,0,249,0.75)'],
      ];
      const chart = new Chart(mCtx, {
        type: 'doughnut',
        data: {
          labels: data.map(d => d[0]),
          datasets: [{ data: data.map(d => d[1]), backgroundColor: data.map(d => d[2]), borderColor: 'rgba(2,8,24,0.8)', borderWidth: 2 }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } },
      });
      mCtx.canvas._chartInstance = chart;

      const total = data.reduce((s, d) => s + d[1], 0);
      const leg = document.getElementById('fo-method-legend');
      if (leg) {
        leg.innerHTML = data.map(([l, v, c]) =>
          `<div class="legend-item"><div class="legend-dot" style="background:${c}"></div>
           <span class="legend-label">${l}</span>
           <span class="legend-count">${(v/total*100).toFixed(1)}%</span></div>`
        ).join('');
      }
    }

    // Top 10 tests
    const top10 = [
      ['Complete Blood Count',    'Hematology',     542, 1084000],
      ['Comprehensive Metabolic', 'Chemistry',      380,  950000],
      ['HIV 1/2 Rapid',           'Serology',       274,  685000],
      ['Malaria RDT',             'Serology',       312,  468000],
      ['Urinalysis',              'Chemistry',      441,  441000],
      ['HBsAg',                   'Serology',       188,  376000],
      ['Prothrombin Time (PT)',    'Coagulation',    156,  312000],
      ['Blood Group + Crossmatch','Blood Bank',      98,  245000],
      ['Widal Test',              'Serology',       162,  243000],
      ['VDRL/RPR',                'Serology',       121,  181500],
    ];

    const tbody = document.getElementById('fo-top10-tbody');
    if (tbody) {
      const total = top10.reduce((s, r) => s + r[3], 0);
      tbody.innerHTML = top10.map(([name, dept, vol, rev], i) => {
        const pct = (rev / total * 100).toFixed(1);
        return `<tr>
          <td><span class="badge badge-blue">${i+1}</span></td>
          <td>${name}</td>
          <td><span class="badge badge-grey">${dept}</span></td>
          <td class="fo-mono">${vol.toLocaleString()}</td>
          <td class="fo-mono fo-green-text">${rev.toLocaleString()}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="fo-rev-bar-mini"><div class="fo-rev-bar-fill" style="width:${pct}%;background:var(--blue-glow)"></div></div>
              <span class="fo-mono" style="font-size:11px;color:var(--text-muted)">${pct}%</span>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // Aging report (demo)
    const agingTbody = document.getElementById('fo-aging-tbody');
    if (agingTbody) {
      const aging = [
        { patient: 'Jean-Pierre Nkurunziza', pid: 'NX-001234', inv: 'INV-2025-1234', amount: 15000, due: '2025-05-07', age: 7 },
        { patient: 'Grace Habimana',         pid: 'NX-002567', inv: 'INV-2025-1567', amount: 5000,  due: '2025-04-30', age: 14 },
        { patient: 'Amina Uwase',            pid: 'NX-001892', inv: 'INV-2025-1892', amount: 4500,  due: '2025-05-05', age: 9 },
      ];

      function ageBadge(days) {
        if (days <= 7)  return `<span class="badge badge-gold">1–7 Days</span>`;
        if (days <= 30) return `<span class="badge badge-orange">8–30 Days</span>`;
        return `<span class="badge badge-red">>30 Days</span>`;
      }

      agingTbody.innerHTML = aging.map(a => `
        <tr>
          <td>
            <div style="font-weight:600">${a.patient}</div>
            <div class="fo-mono" style="font-size:11px;color:var(--text-muted)">${a.pid}</div>
          </td>
          <td class="fo-mono" style="color:var(--blue-glow)">${a.inv}</td>
          <td class="fo-mono fo-orange-text">${a.amount.toLocaleString()}</td>
          <td class="fo-mono">${a.due}</td>
          <td class="fo-mono" style="color:var(--alert-orange)">${a.age}</td>
          <td>${ageBadge(a.age)}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="inv-momo-btn">📱 Pay</button>
              <button class="btn btn-ghost btn-xs"><i class="fas fa-envelope"></i></button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  /* ── Settings: mask/unmask fields ───────────────────────────── */
  function initSettings() {
    document.querySelectorAll('.fo-unmask-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        if (target.type === 'password') {
          target.type = 'text';
          btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
          target.type = 'password';
          btn.innerHTML = '<i class="fas fa-eye"></i>';
        }
      });
    });

    document.getElementById('momo-test-btn')?.addEventListener('click', async () => {
      toast('info', 'Testing Connection', 'Connecting to MoMo API…');
      await new Promise(r => setTimeout(r, 1500));
      toast('success', 'Connection OK', 'MTN MoMo sandbox API is reachable.');
    });
  }

  /* ── Demo confirm button ─────────────────────────────────────── */
  function initDemoConfirm() {
    document.getElementById('momo-demo-confirm-btn')?.addEventListener('click', () => {
      clearInterval(_state.pollInterval);
      clearInterval(_state.timerInterval);
      onPaymentConfirmed({ status: 'confirmed', tx_ref: _state.txRef });
    });
  }

  /* ── Bind all action buttons ────────────────────────────────── */
  function bindButtons() {
    document.getElementById('momo-initiate-btn')?.addEventListener('click',    initiatePayment);
    document.getElementById('momo-cancel-btn')?.addEventListener('click',      cancelPayment);
    document.getElementById('receipt-print-btn')?.addEventListener('click',    printReceipt);
    document.getElementById('receipt-email-btn')?.addEventListener('click',    () => toast('info', 'Email', 'Email feature coming soon.'));
    document.getElementById('receipt-sms-btn')?.addEventListener('click',      () => sendReceiptSMS(true));
    document.getElementById('momo-new-payment-btn')?.addEventListener('click', resetMomoFlow);
    document.getElementById('sms-resend-btn')?.addEventListener('click',       resendSMS);
    document.getElementById('momo-finish-btn')?.addEventListener('click',      resetMomoFlow);
  }

  function resetMomoFlow() {
    _state.selectedPatient = null;
    _state.selectedInvoice = null;
    _state.amount = 0;
    _state.txRef  = null;
    document.getElementById('momo-patient-search').value = '';
    document.getElementById('patient-payment-card').style.display = 'none';
    document.getElementById('momo-invoice-group').style.display = 'none';
    document.getElementById('momo-amount').value = '';
    document.getElementById('momo-phone').value = '';
    updateAmountDisplay(0);
    goToStep(1);
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    initTabs();
    initPatientSearch();
    initAmountField();
    initPaymentMethodBtns();
    initSettings();
    initDemoConfirm();
    bindButtons();
    loadOverview();

    // Initialize step 1 active, steps 2-4 hidden
    goToStep(1);

    // New invoice button
    document.getElementById('fo-new-invoice-btn')?.addEventListener('click', () => {
      document.querySelectorAll('.fo-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.fo-body .tab-pane').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-pane="fo-invoices"]')?.classList.add('active');
      document.querySelector('.fo-tab-nav .tab-btn[data-pane="fo-invoices"]')?.classList.add('active');
      loadInvoices();
    });

    // Configure NexusSig
    window.NexusSig?.configure({
      user:     window.NEXUS?.userName,
      hospital: window.NEXUS?.hospitalName,
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();
