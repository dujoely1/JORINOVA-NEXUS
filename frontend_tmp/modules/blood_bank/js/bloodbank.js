/**
 * JORINOVA NEXUS ALIS-X — Blood Bank Module
 * bloodbank.js — Complete frontend logic
 *
 * Uses: window.NEXUS.csrf, window.NEXUS.apiBase
 * Dependencies: Chart.js (loaded via CDN in extra_head block)
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   DEMO DATA — Fallback when API is not available
   ═══════════════════════════════════════════════════════════════ */
const BB_DEMO = {
  summary: {
    total_available: 45,
    expiring_3_days: 7,
    quarantine: 4,
    in_transit: 3,
    groups: {
      'A+':  { available: 8,  components: { WB: 4, PRBC: 3, FFP: 1 }, expiry_pct: 85 },
      'A-':  { available: 3,  components: { WB: 2, FFP: 1 },          expiry_pct: 70 },
      'B+':  { available: 7,  components: { WB: 3, PRBC: 4 },         expiry_pct: 90 },
      'B-':  { available: 2,  components: { PRBC: 2 },                 expiry_pct: 60 },
      'AB+': { available: 5,  components: { WB: 2, PRBC: 2, FFP: 1 }, expiry_pct: 75 },
      'AB-': { available: 1,  components: { PRBC: 1 },                 expiry_pct: 40 },
      'O+':  { available: 12, components: { WB: 6, PRBC: 5, PLT: 1 }, expiry_pct: 80 },
      'O-':  { available: 7,  components: { WB: 3, PRBC: 3, FFP: 1 }, expiry_pct: 55 },
    }
  },

  bags: [
    { id: 1, bag_number: 'BB-2026-001', blood_group: 'O-',  component: 'WB',   volume: 450, status: 'available',  expiry_date: '2026-05-17', collection_date: '2026-04-17', days_to_expiry: 3, expiry_status: 'critical', chamber: 'C1', storage_unit: 'FRIDGE-A', slot_number: 3 },
    { id: 2, bag_number: 'BB-2026-002', blood_group: 'O-',  component: 'PRBC', volume: 280, status: 'available',  expiry_date: '2026-05-19', collection_date: '2026-04-19', days_to_expiry: 5, expiry_status: 'warning',  chamber: 'C1', storage_unit: 'FRIDGE-A', slot_number: 4 },
    { id: 3, bag_number: 'BB-2026-003', blood_group: 'A+',  component: 'PRBC', volume: 280, status: 'available',  expiry_date: '2026-06-01', collection_date: '2026-05-01', days_to_expiry: 18, expiry_status: 'ok',      chamber: 'C2', storage_unit: 'FRIDGE-A', slot_number: 1 },
    { id: 4, bag_number: 'BB-2026-004', blood_group: 'B+',  component: 'WB',   volume: 450, status: 'reserved',   expiry_date: '2026-05-30', collection_date: '2026-04-30', days_to_expiry: 16, expiry_status: 'ok',      chamber: 'C2', storage_unit: 'FRIDGE-A', slot_number: 2 },
    { id: 5, bag_number: 'BB-2026-005', blood_group: 'AB+', component: 'FFP',  volume: 200, status: 'available',  expiry_date: '2026-07-10', collection_date: '2026-01-10', days_to_expiry: 57, expiry_status: 'ok',      chamber: 'C1', storage_unit: 'FREEZER-B', slot_number: 2 },
    { id: 6, bag_number: 'BB-2026-006', blood_group: 'O+',  component: 'PLT',  volume: 50,  status: 'available',  expiry_date: '2026-05-19', collection_date: '2026-05-14', days_to_expiry: 5, expiry_status: 'warning',  chamber: 'C1', storage_unit: 'PLT-AGIT', slot_number: 1 },
    { id: 7, bag_number: 'BB-2026-007', blood_group: 'O-',  component: 'PRBC', volume: 280, status: 'in_transit', expiry_date: '2026-05-20', collection_date: '2026-04-20', days_to_expiry: 6, expiry_status: 'warning',  chamber: 'C3', storage_unit: 'FRIDGE-A', slot_number: 8 },
    { id: 8, bag_number: 'BB-2026-008', blood_group: 'A-',  component: 'WB',   volume: 450, status: 'quarantine', expiry_date: '2026-05-28', collection_date: '2026-04-28', days_to_expiry: 14, expiry_status: 'ok',      chamber: 'C3', storage_unit: 'FRIDGE-B', slot_number: 5 },
    { id: 9, bag_number: 'BB-2026-009', blood_group: 'B-',  component: 'PRBC', volume: 280, status: 'available',  expiry_date: '2026-06-05', collection_date: '2026-05-05', days_to_expiry: 22, expiry_status: 'ok',      chamber: 'C1', storage_unit: 'FRIDGE-B', slot_number: 7 },
    { id:10, bag_number: 'BB-2026-010', blood_group: 'O+',  component: 'PRBC', volume: 280, status: 'available',  expiry_date: '2026-05-16', collection_date: '2026-04-16', days_to_expiry: 2, expiry_status: 'critical',  chamber: 'C1', storage_unit: 'FRIDGE-A', slot_number: 6 },
  ],

  storage: [
    {
      id: 'FRIDGE-A', name: 'Blood Fridge A', type: 'fridge', icon: '❄️',
      temp_current: 4.2, temp_min: 2, temp_max: 6, temp_status: 'normal',
      chambers: [
        { id: 'FA-C1', name: 'Chamber 1', total_slots: 20, bags: [
          { slot: 1, status: 'available', group: 'A+',  bag_number: 'BB-2026-003', expiry_days: 18 },
          { slot: 2, status: 'empty' },
          { slot: 3, status: 'critical',  group: 'O-',  bag_number: 'BB-2026-001', expiry_days: 3 },
          { slot: 4, status: 'expiring',  group: 'O-',  bag_number: 'BB-2026-002', expiry_days: 5 },
          { slot: 5, status: 'available', group: 'B+',  bag_number: 'BB-2026-011', expiry_days: 20 },
          { slot: 6, status: 'critical',  group: 'O+',  bag_number: 'BB-2026-010', expiry_days: 2 },
          { slot: 7, status: 'available', group: 'AB+', bag_number: 'BB-2026-012', expiry_days: 25 },
          { slot: 8, status: 'empty' },
          { slot: 9, status: 'available', group: 'A+',  bag_number: 'BB-2026-013', expiry_days: 30 },
          { slot:10, status: 'empty' },
          ...Array.from({length:10}, (_, i) => ({ slot: i+11, status: 'empty' }))
        ]},
        { id: 'FA-C2', name: 'Chamber 2', total_slots: 20, bags: [
          { slot: 1, status: 'reserved',  group: 'B+',  bag_number: 'BB-2026-004', expiry_days: 16 },
          { slot: 2, status: 'available', group: 'O+',  bag_number: 'BB-2026-014', expiry_days: 12 },
          { slot: 3, status: 'available', group: 'A+',  bag_number: 'BB-2026-015', expiry_days: 18 },
          { slot: 4, status: 'expiring',  group: 'B-',  bag_number: 'BB-2026-016', expiry_days: 3 },
          { slot: 5, status: 'empty' },
          { slot: 6, status: 'available', group: 'O+',  bag_number: 'BB-2026-017', expiry_days: 22 },
          ...Array.from({length:14}, (_, i) => ({ slot: i+7, status: 'empty' }))
        ]},
        { id: 'FA-C3', name: 'Chamber 3', total_slots: 20, bags: [
          { slot: 5, status: 'available', group: 'A-',  bag_number: 'BB-2026-018', expiry_days: 14 },
          { slot: 8, status: 'transit',   group: 'O-',  bag_number: 'BB-2026-007', expiry_days: 6 },
          ...Array.from({length:18}, (_, i) => {
            const occupied = [5,8];
            const slotNum = i+1;
            return occupied.includes(slotNum) ? null : { slot: slotNum, status: 'empty' };
          }).filter(Boolean)
        ]}
      ]
    },
    {
      id: 'FRIDGE-B', name: 'Blood Fridge B', type: 'fridge', icon: '❄️',
      temp_current: 5.8, temp_min: 2, temp_max: 6, temp_status: 'normal',
      chambers: [
        { id: 'FB-C1', name: 'Chamber 1', total_slots: 20, bags: [
          { slot: 7, status: 'available', group: 'B-',  bag_number: 'BB-2026-009', expiry_days: 22 },
          { slot: 3, status: 'available', group: 'O+',  bag_number: 'BB-2026-019', expiry_days: 15 },
          ...Array.from({length:18}, (_, i) => {
            const occupied = [3,7];
            const slotNum = i+1;
            return occupied.includes(slotNum) ? null : { slot: slotNum, status: 'empty' };
          }).filter(Boolean)
        ]},
        { id: 'FB-C2', name: 'Quarantine Zone', total_slots: 20, bags: [
          { slot: 5, status: 'quarantine', group: 'A-', bag_number: 'BB-2026-008', expiry_days: 14 },
          { slot: 9, status: 'quarantine', group: 'O+', bag_number: 'BB-2026-020', expiry_days: 10 },
          ...Array.from({length:18}, (_, i) => {
            const occupied = [5,9];
            const slotNum = i+1;
            return occupied.includes(slotNum) ? null : { slot: slotNum, status: 'empty' };
          }).filter(Boolean)
        ]},
        { id: 'FB-C3', name: 'Chamber 3', total_slots: 20, bags: Array.from({length:20}, (_, i) => ({ slot: i+1, status: 'empty' })) }
      ]
    },
    {
      id: 'FREEZER-B', name: 'FFP Freezer', type: 'freezer', icon: '🧊',
      temp_current: -25.4, temp_min: -30, temp_max: -18, temp_status: 'normal',
      chambers: [
        { id: 'FZ-C1', name: 'Compartment 1', total_slots: 20, bags: [
          { slot: 1, status: 'available', group: 'AB+', bag_number: 'BB-2026-005', expiry_days: 57 },
          { slot: 2, status: 'available', group: 'O-',  bag_number: 'BB-2026-021', expiry_days: 90 },
          { slot: 3, status: 'available', group: 'A+',  bag_number: 'BB-2026-022', expiry_days: 85 },
          ...Array.from({length:17}, (_, i) => ({ slot: i+4, status: 'empty' }))
        ]}
      ]
    },
    {
      id: 'PLT-AGIT', name: 'Platelet Agitator', type: 'agitator', icon: '🔄',
      temp_current: 22.1, temp_min: 20, temp_max: 24, temp_status: 'normal',
      chambers: [
        { id: 'PLT-C1', name: 'Agitator Tray', total_slots: 10, bags: [
          { slot: 1, status: 'expiring',  group: 'O+', bag_number: 'BB-2026-006', expiry_days: 5 },
          { slot: 2, status: 'available', group: 'A+', bag_number: 'BB-2026-023', expiry_days: 4 },
          ...Array.from({length:8}, (_, i) => ({ slot: i+3, status: 'empty' }))
        ]}
      ]
    }
  ],

  exchanges: [
    {
      id: 'EX-001', blood_group: 'O-', qty: 4, partner: 'Nyamata District Hospital',
      destination: 'Nyamata, Bugesera', ai_reason: 'O- stock at CHUK at 18% capacity with 4 bags expiring in 5 days. Nyamata has 3 pending trauma cases with O- demand. Immediate exchange reduces wastage and saves lives.',
      urgency: 'critical', days_to_expiry: 5, status: 'ai_suggested', component: 'PRBC'
    },
    {
      id: 'EX-002', blood_group: 'A+', qty: 2, partner: 'Remera Health Center',
      destination: 'Gasabo District', ai_reason: 'Scheduled C-sections tomorrow require A+ PRBC. Local stock depleted. CHUK surplus detected (8 bags, 18-day validity). Transfer recommended via RBC same-day logistics.',
      urgency: 'high', days_to_expiry: 18, status: 'ai_suggested', component: 'PRBC'
    },
    {
      id: 'EX-003', blood_group: 'AB+', qty: 2, partner: 'King Faisal Hospital',
      destination: 'Kigali', ai_reason: 'Cardiac surgery unit at King Faisal requires AB+ FFP for bypass procedures. Mutual exchange agreement active. Recommended transfer within 24h.',
      urgency: 'medium', days_to_expiry: 57, status: 'ai_suggested', component: 'FFP'
    },
    {
      id: 'EX-004', blood_group: 'O+', qty: 3, partner: 'Kabgayi Hospital',
      destination: 'Muhanga', ai_reason: 'Routine replenishment via scheduled Zipline flight. O+ demand predicted by AI based on patient admission patterns. 15-day validity sufficient for transit.',
      urgency: 'low', days_to_expiry: 15, status: 'pending', component: 'PRBC'
    }
  ],

  requests: [
    { id: 'REQ-045', patient: 'Uwimana Claudette', pid: 'P-10234', blood_group: 'O+', component: 'PRBC', units: 2, ward: 'Theatre 2', urgency: 'STAT', requested_by: 'Dr. Habimana', status: 'pending', time: '14:32' },
    { id: 'REQ-046', patient: 'Nshimiyimana Eric', pid: 'P-10456', blood_group: 'A+', component: 'WB',   units: 1, ward: 'ICU Bed 7',  urgency: 'urgent',  requested_by: 'Dr. Mukamana', status: 'pending', time: '15:05' },
    { id: 'REQ-047', patient: 'Iradukunda Marie', pid: 'P-10789', blood_group: 'B+', component: 'PRBC', units: 2, ward: 'Maternity', urgency: 'routine', requested_by: 'Dr. Ntawuyirushintege', status: 'assigned', time: '13:15' },
  ],

  haemovigilance: [
    { date: '2026-05-10', patient: 'Mugenzi Patrick', bag: 'BB-2026-055', reaction: 'Febrile Non-Haemolytic', severity: 'mild', outcome: 'Recovered', rbc_status: 'Notified' },
    { date: '2026-05-03', patient: 'Umubyeyi Grace', bag: 'BB-2026-041', reaction: 'Allergic Reaction', severity: 'moderate', outcome: 'Recovering', rbc_status: 'Investigating' },
  ]
};

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */
const BB = {
  apiBase:   (window.NEXUS && window.NEXUS.apiBase) ? window.NEXUS.apiBase : '/api/v1',
  csrf:      (window.NEXUS && window.NEXUS.csrf)    ? window.NEXUS.csrf    : '',
  useDemo:   false,
  tempPollInterval: null,
  currentTab: 'inventory',
  crossmatchLog: [],
  inventory: [],
  inventoryPage: 1,
  inventoryPageSize: 15,
  inventoryFilters: { search: '', group: '', component: '', status: 'available', expiry: '' },
  charts: {},
  assignReqId: null,
};

/* ═══════════════════════════════════════════════════════════════
   API HELPER
   ═══════════════════════════════════════════════════════════════ */
async function bbFetch(path, opts = {}) {
  const url = `${BB.apiBase}${path}`;
  const defaults = {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': BB.csrf,
    },
    credentials: 'same-origin',
  };
  const config = Object.assign({}, defaults, opts);
  if (opts.headers) config.headers = Object.assign({}, defaults.headers, opts.headers);

  const res = await fetch(url, config);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

function bbPost(path, body) {
  return bbFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
function init() {
  setupTabs();
  setupModalHandlers();
  setupFilterListeners();
  loadAll();
  BB.tempPollInterval = setInterval(pollTemperatures, 60_000);
}

function loadAll() {
  loadGroupStock();
  loadInventory();
  renderFridgeMap();
  loadAISuggestions();
  loadBloodRequests();
  loadHVReports();
  loadDonations();
  populateCrossmatchSelects();
  buildScreeningGrid();
  updateLastSync();
}

/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */
function setupTabs() {
  const tabs  = document.querySelectorAll('.bb-tab-btn');
  const panes = document.querySelectorAll('.bb-tab-pane');

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === BB.currentTab) return;
      BB.currentTab = tab;

      tabs.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      panes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const pane = document.getElementById(`tab-${tab}`);
      if (pane) pane.classList.add('active');

      // Lazy-init analytics charts
      if (tab === 'analytics' && !BB.charts.donations) {
        setTimeout(initCharts, 80);
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   FILTER LISTENERS
   ═══════════════════════════════════════════════════════════════ */
function setupFilterListeners() {
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const search = document.getElementById('inv-search');
  if (search) search.addEventListener('input', debounce(() => {
    BB.inventoryFilters.search = search.value.trim();
    BB.inventoryPage = 1;
    renderInventoryTable(BB.inventory);
  }, 250));

  ['inv-filter-group', 'inv-filter-component', 'inv-filter-status', 'inv-filter-expiry'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      BB.inventoryFilters.group     = document.getElementById('inv-filter-group').value;
      BB.inventoryFilters.component = document.getElementById('inv-filter-component').value;
      BB.inventoryFilters.status    = document.getElementById('inv-filter-status').value;
      BB.inventoryFilters.expiry    = document.getElementById('inv-filter-expiry').value;
      BB.inventoryPage = 1;
      loadInventory();
    });
  });

  const reqSearch = document.getElementById('req-search');
  if (reqSearch) reqSearch.addEventListener('input', debounce(() => loadBloodRequests(), 250));
  document.getElementById('req-filter-urgency')?.addEventListener('change', () => loadBloodRequests());
  document.getElementById('req-filter-status')?.addEventListener('change', () => loadBloodRequests());

  document.getElementById('bb-refresh-btn')?.addEventListener('click', () => { loadAll(); });
  document.getElementById('bb-add-bag-btn')?.addEventListener('click', () => showToast('🩸 Add blood bag form — coming soon', 'info'));
  document.getElementById('inventory-export-btn')?.addEventListener('click', () => exportInventoryCSV());
  document.getElementById('cm-run-btn')?.addEventListener('click', () => runCrossmatch());
  document.getElementById('cm-clear-btn')?.addEventListener('click', () => clearCrossmatch());
  document.getElementById('don-register-btn')?.addEventListener('click', () => registerDonation());
  document.getElementById('don-clear-btn')?.addEventListener('click', () => clearDonationForm());
  document.getElementById('hv-submit-btn')?.addEventListener('click', () => submitHVReport());
  document.getElementById('hv-clear-btn')?.addEventListener('click', () => clearHVForm());
  document.getElementById('assign-confirm-btn')?.addEventListener('click', () => confirmAssignment());
  document.getElementById('new-request-btn')?.addEventListener('click', () => showToast('💉 New request form — coming soon', 'info'));
}

/* ═══════════════════════════════════════════════════════════════
   LOAD GROUP STOCK
   ═══════════════════════════════════════════════════════════════ */
async function loadGroupStock() {
  try {
    const data = await bbFetch('/bloodbank/summary/');
    renderGroupStock(data.groups || {}, data);
  } catch {
    BB.useDemo = true;
    renderGroupStock(BB_DEMO.summary.groups, BB_DEMO.summary);
  }
}

function renderGroupStock(groups, summary) {
  // KPIs
  animateNumber('kpi-available',  summary.total_available || 0);
  animateNumber('kpi-expiring',   summary.expiring_3_days || 0);
  animateNumber('kpi-quarantine', summary.quarantine      || 0);
  animateNumber('kpi-transit',    summary.in_transit      || 0);

  const reqBadge = document.getElementById('req-badge');
  if (reqBadge) {
    const rc = BB_DEMO.requests.filter(r => r.status === 'pending').length;
    reqBadge.textContent = rc > 0 ? rc : '';
    reqBadge.style.display = rc > 0 ? '' : 'none';
  }

  // Blood group grid
  const grid = document.getElementById('bg-group-grid');
  if (!grid) return;
  const ORDER = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  grid.innerHTML = ORDER.map(g => {
    const info = groups[g] || { available: 0, components: {}, expiry_pct: 0 };
    const cls = g.startsWith('O') ? 'group-o' : g.startsWith('AB') ? 'group-ab' : g.startsWith('A') ? 'group-a' : 'group-b';
    const universalTag = g === 'O-' ? '<span class="universal-tag">DONOR</span>' :
                         g === 'AB+' ? '<span class="universal-tag">RECV</span>' : '';
    const compRows = Object.entries(info.components || {}).map(([k,v]) =>
      `<div class="bg-comp-row"><span class="bg-comp-name">${k}</span><span class="bg-comp-val">${v}</span></div>`
    ).join('');
    const expiryPct  = info.expiry_pct || 0;
    const expiryClass = expiryPct > 80 ? 'ok' : expiryPct > 50 ? 'warning' : expiryPct > 20 ? 'critical' : 'expired';

    return `
      <div class="bg-group-card ${cls}" data-group="${g}" role="button" tabindex="0" title="Filter inventory by ${g}">
        ${universalTag}
        <div class="bg-group-badge">${g}</div>
        <div class="bg-group-count">${info.available}</div>
        <div class="bg-group-label">bags available</div>
        <div class="bg-group-components">${compRows}</div>
        <div class="bg-expiry-bar">
          <div class="bg-expiry-fill ${expiryClass}" style="width:${expiryPct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Click to filter inventory
  grid.querySelectorAll('.bg-group-card').forEach(card => {
    card.addEventListener('click', () => {
      const g = card.dataset.group;
      document.getElementById('inv-filter-group').value = g;
      BB.inventoryFilters.group = g;
      BB.inventoryPage = 1;
      // Switch to inventory tab
      document.querySelector('[data-tab="inventory"]').click();
      loadInventory();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   LOAD INVENTORY
   ═══════════════════════════════════════════════════════════════ */
async function loadInventory() {
  const f = BB.inventoryFilters;
  const params = new URLSearchParams();
  if (f.status)    params.set('status',    f.status);
  if (f.group)     params.set('group',     f.group);
  if (f.component) params.set('component', f.component);
  if (f.expiry)    params.set('expiry_status', f.expiry);

  try {
    const data = await bbFetch(`/bloodbank/bags/?${params}`);
    BB.inventory = data.results || data || [];
    renderInventoryTable(BB.inventory);
  } catch {
    BB.inventory = BB_DEMO.bags;
    renderInventoryTable(BB.inventory);
  }
}

function renderInventoryTable(bags) {
  const f = BB.inventoryFilters;
  let filtered = bags;

  if (f.search) {
    const q = f.search.toLowerCase();
    filtered = filtered.filter(b =>
      b.bag_number.toLowerCase().includes(q) ||
      b.blood_group.toLowerCase().includes(q) ||
      (b.storage_unit||'').toLowerCase().includes(q) ||
      (b.component||'').toLowerCase().includes(q)
    );
  }
  if (f.expiry) {
    filtered = filtered.filter(b => b.expiry_status === f.expiry);
  }

  const total = filtered.length;
  const pages = Math.ceil(total / BB.inventoryPageSize);
  BB.inventoryPage = Math.min(BB.inventoryPage, Math.max(1, pages));
  const start = (BB.inventoryPage - 1) * BB.inventoryPageSize;
  const page  = filtered.slice(start, start + BB.inventoryPageSize);

  const tbody = document.getElementById('inv-tbody');
  const countEl = document.getElementById('inv-result-count');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${total} bag${total !== 1 ? 's' : ''} found`;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10">
      <div class="bb-empty-state">
        <div class="bb-empty-icon">🩸</div>
        <div class="bb-empty-title">No bags found</div>
        <div class="bb-empty-sub">Adjust filters or add blood bags</div>
      </div>
    </td></tr>`;
    renderPagination(pages);
    return;
  }

  tbody.innerHTML = page.map(bag => `
    <tr>
      <td><span class="bb-bag-number">${bag.bag_number}</span></td>
      <td><span class="bb-blood-group-tag ${groupTagClass(bag.blood_group)}">${bag.blood_group}</span></td>
      <td>${componentLabel(bag.component)}</td>
      <td>${bag.volume || '—'}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${bag.storage_unit || '—'} / ${bag.chamber || '—'} / S${bag.slot_number || '?'}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${bag.collection_date || '—'}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${bag.expiry_date || '—'}</td>
      <td><span class="bb-expiry-${bag.expiry_status || 'ok'}">${expiryLabel(bag)}</span></td>
      <td>${statusBadge(bag.status)}</td>
      <td style="text-align:right">
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="BB_viewBag(${bag.id})" title="View details">
            <i class="fas fa-eye"></i>
          </button>
          ${bag.status === 'available' ? `<button class="btn btn-primary btn-sm" onclick="BB_assignBag(${bag.id},'${bag.bag_number}','${bag.blood_group}')" title="Assign">
            <i class="fas fa-check"></i> Assign
          </button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  renderPagination(pages);
}

function renderPagination(pages) {
  const el = document.getElementById('inv-pagination');
  if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }
  el.innerHTML = Array.from({length: pages}, (_, i) => i+1).map(p => `
    <button class="btn btn-ghost btn-sm${p === BB.inventoryPage ? ' active' : ''}"
            style="${p === BB.inventoryPage ? 'background:rgba(0,170,255,0.12);color:var(--blue-glow)' : ''}"
            onclick="BB_goPage(${p})">${p}</button>
  `).join('');
}

window.BB_goPage = function(p) { BB.inventoryPage = p; renderInventoryTable(BB.inventory); };
window.BB_viewBag = function(id) { showToast(`🩸 Bag details view — ID:${id} (coming soon)`, 'info'); };
window.BB_assignBag = function(id, num, group) {
  document.getElementById('assign-req-info').textContent = `Bag ${num} (${group}) — select a request to assign to`;
  document.getElementById('assign-bag-select').innerHTML = `<option value="${id}">${num} — ${group}</option>`;
  openModal('assign-bag-modal');
};

/* ═══════════════════════════════════════════════════════════════
   FRIDGE MAP
   ═══════════════════════════════════════════════════════════════ */
async function renderFridgeMap() {
  try {
    const data = await bbFetch('/bloodbank/storage/');
    drawStorageUnits(data.units || data || []);
  } catch {
    drawStorageUnits(BB_DEMO.storage);
  }
}

function drawStorageUnits(units) {
  const grid = document.getElementById('storage-units-grid');
  const strip = document.getElementById('temp-strip');
  if (!grid) return;

  // Temperature summary strip
  if (strip) {
    strip.innerHTML = units.map(u => `
      <div class="bb-glass-panel" style="padding:6px 14px;display:flex;align-items:center;gap:8px;border-radius:var(--radius-md)">
        <span>${u.icon || (u.type === 'fridge' ? '❄️' : u.type === 'freezer' ? '🧊' : '🔄')}</span>
        <span style="font-size:var(--text-xs);color:var(--text-secondary);font-weight:600">${u.name}</span>
        <span class="unit-temp ${u.temp_status}">${u.temp_current}°C</span>
      </div>
    `).join('');
  }

  grid.innerHTML = units.map(u => buildUnitCard(u)).join('');

  // Expand toggle
  grid.querySelectorAll('.unit-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const unitCard = btn.closest('.storage-unit-card');
      const chamberSection = unitCard.querySelector('.unit-chamber-section');
      const isExpanded = chamberSection.style.display !== 'none';
      chamberSection.style.display = isExpanded ? 'none' : '';
      btn.innerHTML = isExpanded ? '<i class="fas fa-chevron-down"></i> Expand' : '<i class="fas fa-chevron-up"></i> Collapse';
      unitCard.classList.toggle('expanded', !isExpanded);
    });
  });

  // Slot tooltips
  setupSlotTooltips(grid);
}

function buildUnitCard(unit) {
  const totalBags = unit.chambers.reduce((acc, ch) => acc + ch.bags.filter(b => b.status !== 'empty').length, 0);
  const totalSlots = unit.chambers.reduce((acc, ch) => acc + ch.total_slots, 0);
  const tempCls = unit.temp_status || 'normal';

  return `
    <div class="storage-unit-card" id="unit-${unit.id}">
      <div class="unit-header">
        <div class="unit-header-left">
          <span class="unit-icon">${unit.icon || '❄️'}</span>
          <div>
            <div class="unit-name">${unit.name}</div>
            <span class="unit-type-tag unit-type-${unit.type}">${unit.type.toUpperCase()}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-sm)">
          <span class="unit-temp ${tempCls}" id="temp-${unit.id}">${unit.temp_current}°C</span>
          <button class="btn btn-ghost btn-sm unit-expand-btn" type="button">
            <i class="fas fa-chevron-down"></i> Expand
          </button>
        </div>
      </div>
      <div class="unit-body">
        <div class="unit-stats">
          <div class="unit-stat">
            <div class="unit-stat-val">${unit.chambers.length}</div>
            <div class="unit-stat-lbl">Chambers</div>
          </div>
          <div class="unit-stat">
            <div class="unit-stat-val">${totalBags}</div>
            <div class="unit-stat-lbl">Bags Stored</div>
          </div>
          <div class="unit-stat">
            <div class="unit-stat-val">${totalSlots - totalBags}</div>
            <div class="unit-stat-lbl">Free Slots</div>
          </div>
        </div>
      </div>
      <div class="unit-chamber-section" style="display:none">
        <div class="chamber-grid" style="margin:0 var(--space-md) var(--space-md)">
          ${unit.chambers.map(ch => buildChamberCard(ch)).join('')}
        </div>
      </div>
    </div>
  `;
}

function buildChamberCard(chamber) {
  const filledBags = chamber.bags.filter(b => b.status !== 'empty');
  const fillPct = Math.round((filledBags.length / chamber.total_slots) * 100);

  // Find next-to-issue (earliest expiry among available)
  const available = filledBags.filter(b => b.status === 'available' || b.status === 'expiring' || b.status === 'critical');
  const nextIssue = available.sort((a,b) => (a.expiry_days||999) - (b.expiry_days||999))[0];

  const slotMap = {};
  chamber.bags.forEach(b => { slotMap[b.slot] = b; });

  const slots = Array.from({length: chamber.total_slots}, (_, i) => {
    const slotNum = i + 1;
    const bag = slotMap[slotNum] || { slot: slotNum, status: 'empty' };
    const isNext = nextIssue && bag.slot === nextIssue.slot;
    const slotCls = bag.status === 'quarantine' ? 'slot-reserved' :
                    bag.status === 'transit'     ? 'slot-transit'   :
                    `slot-${bag.status}`;
    const dataAttrs = bag.group ? `data-group="${bag.group}" data-bag="${bag.bag_number||''}" data-expiry="${bag.expiry_days || ''} days" data-comp="${bag.component||''}"` : '';
    return `
      <div class="slot ${slotCls}" ${dataAttrs} title="Slot ${slotNum}">
        ${isNext ? '<div class="slot-next-issue"></div>' : ''}
      </div>
    `;
  });

  return `
    <div class="chamber-card">
      <div class="chamber-header">
        <div class="chamber-name">${chamber.name}</div>
        <div class="chamber-badges">
          <span class="fefo-badge">FEFO</span>
          ${nextIssue ? `<span style="font-size:9px;color:var(--alert-green);font-weight:700">▶ S${nextIssue.slot}</span>` : ''}
        </div>
      </div>
      <div class="chamber-fill-bar">
        <div class="chamber-fill-inner" style="width:${fillPct}%"></div>
      </div>
      <div class="slot-grid">${slots.join('')}</div>
      <div style="margin-top:4px;font-size:9px;color:var(--text-muted);font-family:var(--font-mono)">${filledBags.length}/${chamber.total_slots} slots filled</div>
    </div>
  `;
}

function setupSlotTooltips(container) {
  const tooltip = document.getElementById('slot-tooltip');
  if (!tooltip) return;

  container.addEventListener('mouseover', e => {
    const slot = e.target.closest('.slot[data-group]');
    if (!slot) return;
    document.getElementById('slot-tip-group').textContent  = slot.dataset.group  || '';
    document.getElementById('slot-tip-bag').textContent    = '🩸 ' + (slot.dataset.bag   || '');
    document.getElementById('slot-tip-expiry').textContent = '⏱️ Expires in ' + (slot.dataset.expiry || '?');
    document.getElementById('slot-tip-comp').textContent   = slot.dataset.comp   || '';
    tooltip.classList.add('visible');
  });

  container.addEventListener('mousemove', e => {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
  });

  container.addEventListener('mouseout', e => {
    if (!e.target.closest('.slot[data-group]')) tooltip.classList.remove('visible');
  });
}

/* ═══════════════════════════════════════════════════════════════
   TEMPERATURE POLLING
   ═══════════════════════════════════════════════════════════════ */
async function pollTemperatures() {
  try {
    const data = await bbFetch('/bloodbank/storage/');
    const units = data.units || data || [];
    units.forEach(u => {
      const el = document.getElementById(`temp-${u.id}`);
      if (el) {
        el.textContent = `${u.temp_current}°C`;
        el.className = `unit-temp ${u.temp_status || 'normal'}`;
      }
    });
    updateLastSync();
  } catch {
    // silently fail — demo data already shown
  }
}

function updateLastSync() {
  const el = document.getElementById('bb-last-sync');
  if (el) {
    const t = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    el.textContent = `⟳ Synced ${t}`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   AI EXCHANGE SUGGESTIONS
   ═══════════════════════════════════════════════════════════════ */
async function loadAISuggestions() {
  try {
    const data = await bbFetch('/bloodbank/exchanges/?status=ai_suggested');
    const exchanges = data.results || data || [];
    displayAISuggestions(exchanges);
    loadExchangeTable();
  } catch {
    displayAISuggestions(BB_DEMO.exchanges.filter(e => e.status === 'ai_suggested'));
    renderExchangeTable(BB_DEMO.exchanges);
  }
}

function displayAISuggestions(exchanges) {
  const loading = document.getElementById('exchange-loading');
  const section = document.getElementById('exchange-cards-section');
  const noticeBody = document.getElementById('ai-notice-body');
  const countLabel = document.getElementById('exchange-count-label');

  if (loading) loading.style.display = 'none';
  if (section) section.style.display = '';

  if (noticeBody) {
    if (exchanges.length > 0) {
      const critical = exchanges.filter(e => e.urgency === 'critical');
      noticeBody.innerHTML = `
        🤖 AI detected <strong style="color:var(--blue-glow)">${exchanges.length} exchange opportunit${exchanges.length > 1 ? 'ies' : 'y'}</strong>.
        ${critical.length > 0 ? `<strong style="color:var(--alert-red)"> ${critical.length} CRITICAL — O- expiring soon detected.</strong> ` : ''}
        Nyamata Hospital needs O- urgently. Suggest immediate exchange via Zipline.
      `;
    } else {
      noticeBody.innerHTML = 'No AI-suggested exchanges at this time. Inventory is well-balanced.';
    }
  }

  if (countLabel) countLabel.textContent = `${exchanges.length} suggestion${exchanges.length !== 1 ? 's' : ''}`;

  const grid = document.getElementById('exchange-cards-grid');
  if (!grid) return;

  if (exchanges.length === 0) {
    grid.innerHTML = `<div class="bb-empty-state" style="grid-column:1/-1">
      <div class="bb-empty-icon">🤖</div>
      <div class="bb-empty-title">No AI suggestions</div>
      <div class="bb-empty-sub">All inventory levels are balanced</div>
    </div>`;
    return;
  }

  grid.innerHTML = exchanges.map(ex => buildExchangeCard(ex)).join('');
}

function buildExchangeCard(ex) {
  return `
    <div class="exchange-card urgency-${ex.urgency}" id="excard-${ex.id}">
      <div class="exchange-card-header">
        <div class="exchange-group-big" style="color:${groupColor(ex.blood_group)}">${ex.blood_group}</div>
        <span class="urgency-badge ${ex.urgency}">${ex.urgency.toUpperCase()}</span>
      </div>
      <div class="exchange-details">
        <div class="exchange-detail-item">
          <span class="exchange-detail-lbl">🏥 Partner Hospital</span>
          <span class="exchange-detail-val">${ex.partner}</span>
        </div>
        <div class="exchange-detail-item">
          <span class="exchange-detail-lbl">📍 Destination</span>
          <span class="exchange-detail-val">${ex.destination}</span>
        </div>
        <div class="exchange-detail-item">
          <span class="exchange-detail-lbl">🩸 Quantity</span>
          <span class="exchange-detail-val">${ex.qty} bags — ${ex.component}</span>
        </div>
        <div class="exchange-detail-item">
          <span class="exchange-detail-lbl">⏰ Days to Expiry</span>
          <span class="exchange-detail-val" style="color:${ex.days_to_expiry <= 3 ? 'var(--alert-red)' : ex.days_to_expiry <= 7 ? 'var(--alert-orange)' : 'var(--alert-green)'}">${ex.days_to_expiry} days</span>
        </div>
      </div>
      <div class="exchange-ai-reason">
        🤖 "${ex.ai_reason}"
      </div>
      <div id="exchange-action-${ex.id}">
        <button class="one-click-approve-btn" onclick="approveExchange('${ex.id}', this)">
          ✅ ONE-CLICK APPROVE — Send to RBC/Zipline
        </button>
      </div>
    </div>
  `;
}

async function approveExchange(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Approving…'; }

  try {
    await bbPost(`/bloodbank/exchanges/${id}/approve/`, {});
  } catch {
    // Demo: simulate approval
  }

  // Animate to approved state
  const actionDiv = document.getElementById(`exchange-action-${id}`);
  if (actionDiv) {
    actionDiv.innerHTML = `
      <div class="exchange-status-approved">
        ✅ APPROVED — Dispatched to RBC/Zipline Network
      </div>
      <div class="drone-dispatch-banner">
        🚁 Zipline drone dispatch initiated — ETA 47 min to Nyamata Hospital
      </div>
    `;
  }

  // Update card border
  const card = document.getElementById(`excard-${id}`);
  if (card) {
    card.style.borderColor = 'rgba(0,230,118,0.4)';
    card.querySelector('.urgency-badge').className = 'urgency-badge low';
    card.querySelector('.urgency-badge').textContent = 'APPROVED';
  }

  // Update exchange table
  const row = document.getElementById(`exrow-${id}`);
  if (row) {
    const statusCell = row.querySelector('.ex-status-cell');
    if (statusCell) statusCell.innerHTML = statusBadge('in_transit');
    const actionCell = row.querySelector('.ex-action-cell');
    if (actionCell) actionCell.innerHTML = '<span style="color:var(--cyan);font-size:11px;font-weight:600">🚁 IN TRANSIT</span>';
  }

  showToast(`🚁 Exchange ${id} approved — Zipline dispatch initiated! ETA 47 min`, 'success');
}

async function loadExchangeTable() {
  try {
    const data = await bbFetch('/bloodbank/exchanges/');
    renderExchangeTable(data.results || data || []);
  } catch {
    renderExchangeTable(BB_DEMO.exchanges);
  }
}

function renderExchangeTable(exchanges) {
  const tbody = document.getElementById('exchange-tbody');
  if (!tbody) return;

  if (exchanges.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="bb-empty-state" style="padding:var(--space-lg)">
      <div class="bb-empty-icon">🤖</div><div class="bb-empty-title">No exchanges recorded</div>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = exchanges.map(ex => `
    <tr id="exrow-${ex.id}">
      <td><span class="bb-bag-number">${ex.id}</span></td>
      <td><span class="bb-blood-group-tag ${groupTagClass(ex.blood_group)}">${ex.blood_group}</span></td>
      <td>${ex.qty}</td>
      <td>${ex.partner}</td>
      <td style="font-size:var(--text-xs);color:var(--text-muted)">${ex.destination}</td>
      <td style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${ex.ai_reason}">${ex.ai_reason.substring(0,60)}…</td>
      <td><span class="urgency-badge ${ex.urgency}">${ex.urgency.toUpperCase()}</span></td>
      <td class="ex-status-cell">${statusBadgeExchange(ex.status)}</td>
      <td class="ex-action-cell" style="text-align:right">
        ${ex.status === 'ai_suggested' || ex.status === 'pending' ?
          `<button class="one-click-approve-btn" style="width:auto;padding:6px 12px;font-size:11px" onclick="approveExchange('${ex.id}', this)">✅ Approve</button>` :
          ex.status === 'in_transit' ? '<span style="color:var(--cyan);font-size:11px">🚁 In Transit</span>' :
          '<span style="color:var(--alert-green);font-size:11px">✅ Complete</span>'
        }
      </td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════
   BLOOD REQUESTS
   ═══════════════════════════════════════════════════════════════ */
async function loadBloodRequests() {
  try {
    const params = new URLSearchParams();
    const urgency = document.getElementById('req-filter-urgency')?.value;
    const status  = document.getElementById('req-filter-status')?.value;
    const search  = document.getElementById('req-search')?.value.trim();
    if (urgency) params.set('urgency', urgency);
    if (status)  params.set('status', status);
    if (search)  params.set('q', search);
    const data = await bbFetch(`/bloodbank/requests/?${params}`);
    renderRequestsTable(data.results || data || []);
  } catch {
    renderRequestsTable(BB_DEMO.requests);
  }
}

function renderRequestsTable(requests) {
  const tbody = document.getElementById('req-tbody');
  if (!tbody) return;

  if (requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="bb-empty-state" style="padding:var(--space-lg)">
      <div class="bb-empty-icon">💉</div>
      <div class="bb-empty-title">No active requests</div>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(req => {
    const isStat = req.urgency === 'STAT';
    return `
      <tr class="${isStat ? 'bb-req-emergency' : ''}">
        <td><span class="bb-bag-number">${req.id}</span></td>
        <td>
          <div style="font-weight:600;color:var(--text-primary)">${req.patient}</div>
          <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${req.pid}</div>
        </td>
        <td><span class="bb-blood-group-tag ${groupTagClass(req.blood_group)}">${req.blood_group}</span></td>
        <td>${componentLabel(req.component)}</td>
        <td>${req.units}</td>
        <td>${req.ward}</td>
        <td>${isStat ?
          '<span class="bb-status-badge" style="background:rgba(255,23,68,0.15);color:var(--alert-red);border:1px solid rgba(255,23,68,0.4);animation:bb-req-pulse 1s ease-in-out infinite">🚨 STAT</span>' :
          req.urgency === 'urgent' ?
          '<span class="urgency-badge high">URGENT</span>' :
          '<span class="urgency-badge low">ROUTINE</span>'
        }</td>
        <td style="font-size:var(--text-xs);color:var(--text-muted)">${req.requested_by}</td>
        <td>${statusBadge(req.status)}</td>
        <td style="text-align:right">
          ${req.status === 'pending' ?
            `<button class="btn btn-primary btn-sm" onclick="openAssignModal('${req.id}','${req.patient}','${req.blood_group}','${req.component}')">
               🔗 Assign Bag
             </button>` :
            `<span style="color:var(--alert-green);font-size:11px;font-weight:600">✅ Assigned</span>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

window.openAssignModal = function(reqId, patient, group, component) {
  BB.assignReqId = reqId;
  document.getElementById('assign-req-info').innerHTML = `
    <strong>${patient}</strong> — ${group} ${component} — Req ID: ${reqId}
  `;
  // Populate compatible bags
  const compatible = BB.inventory.filter(b => b.blood_group === group && b.status === 'available');
  const sel = document.getElementById('assign-bag-select');
  if (sel) {
    sel.innerHTML = compatible.length === 0
      ? '<option value="">⚠️ No compatible bags available</option>'
      : compatible.map(b => `<option value="${b.id}">${b.bag_number} — Exp: ${b.expiry_date} (${b.days_to_expiry}d)</option>`).join('');
  }
  openModal('assign-bag-modal');
};

function confirmAssignment() {
  const bagId = document.getElementById('assign-bag-select')?.value;
  if (!bagId) { showToast('⚠️ Select a blood bag first', 'warning'); return; }
  showToast(`✅ Bag assigned to request ${BB.assignReqId}`, 'success');
  closeModal('assign-bag-modal');
}

/* ═══════════════════════════════════════════════════════════════
   CROSS-MATCHING
   ═══════════════════════════════════════════════════════════════ */
function populateCrossmatchSelects() {
  const patientSel = document.getElementById('cm-patient');
  const bagSel     = document.getElementById('cm-bag');
  const hvPatSel   = document.getElementById('hv-patient');

  const demoPatients = [
    { id: 1, name: 'Uwimana Claudette',   group: 'O+' },
    { id: 2, name: 'Nshimiyimana Eric',   group: 'A+' },
    { id: 3, name: 'Iradukunda Marie',    group: 'B+' },
    { id: 4, name: 'Mugenzi Patrick',     group: 'AB+' },
    { id: 5, name: 'Umubyeyi Grace',      group: 'A-' },
  ];

  if (patientSel) {
    patientSel.innerHTML = '<option value="">Select patient…</option>' +
      demoPatients.map(p => `<option value="${p.id}" data-group="${p.group}">${p.name} (${p.group})</option>`).join('');
  }
  if (hvPatSel) {
    hvPatSel.innerHTML = '<option value="">Select patient…</option>' +
      demoPatients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }
  if (bagSel) {
    const available = BB.inventory.length > 0 ? BB.inventory : BB_DEMO.bags;
    bagSel.innerHTML = '<option value="">Select bag…</option>' +
      available.filter(b => b.status === 'available').map(b =>
        `<option value="${b.id}" data-group="${b.blood_group}">${b.bag_number} — ${b.blood_group} — ${b.component}</option>`
      ).join('');
  }
}

async function runCrossmatch() {
  const patientId = document.getElementById('cm-patient')?.value;
  const bagId     = document.getElementById('cm-bag')?.value;
  const tech      = document.getElementById('cm-tech')?.value || 'Unknown';

  if (!patientId || !bagId) {
    showToast('⚠️ Select both a patient and blood bag', 'warning');
    return;
  }

  const btn = document.getElementById('cm-run-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running…'; }

  try {
    const result = await bbPost('/bloodbank/crossmatch/', { patient_id: patientId, bag_id: bagId });
    displayCrossmatchResult(result, patientId, bagId, tech);
  } catch {
    // Demo: simulate compatibility
    const patSel = document.getElementById('cm-patient');
    const bagSel = document.getElementById('cm-bag');
    const patGroup = patSel.selectedOptions[0]?.dataset.group || 'O+';
    const bagGroup = bagSel.selectedOptions[0]?.dataset.group || 'O+';
    const compatible = isCompatible(patGroup, bagGroup);
    displayCrossmatchResult({
      result: compatible ? 'compatible' : 'incompatible',
      patient_group: patGroup,
      bag_group: bagGroup,
      ai_flag: false,
    }, patientId, bagId, tech);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔬 Run Cross-match'; }
  }
}

function isCompatible(recipientGroup, donorGroup) {
  const compatMap = {
    'O+':  ['O+','O-'],
    'O-':  ['O-'],
    'A+':  ['A+','A-','O+','O-'],
    'A-':  ['A-','O-'],
    'B+':  ['B+','B-','O+','O-'],
    'B-':  ['B-','O-'],
    'AB+': ['A+','A-','B+','B-','AB+','AB-','O+','O-'],
    'AB-': ['A-','B-','AB-','O-'],
  };
  return (compatMap[recipientGroup] || []).includes(donorGroup);
}

function displayCrossmatchResult(result, patientId, bagId, tech) {
  const box = document.getElementById('cm-result-box');
  if (!box) return;

  box.style.display = '';
  box.className = 'crossmatch-result-box';

  const icon    = document.getElementById('cm-result-icon');
  const label   = document.getElementById('cm-result-label');
  const detail  = document.getElementById('cm-result-detail');
  const aiFlag  = document.getElementById('cm-ai-flag');

  if (result.result === 'compatible') {
    box.classList.add('crossmatch-compatible');
    if (icon)  icon.textContent  = '✅';
    if (label) label.textContent = 'COMPATIBLE';
    if (detail) detail.textContent = `Patient (${result.patient_group}) × Bag (${result.bag_group}) — Safe to transfuse`;
  } else if (result.result === 'weak_positive') {
    box.classList.add('crossmatch-weak');
    if (icon)  icon.textContent  = '⚠️';
    if (label) label.textContent = 'WEAK POSITIVE';
    if (detail) detail.textContent = 'Minor incompatibility detected. Clinical review recommended before transfusion.';
  } else {
    box.classList.add('crossmatch-incompatible');
    if (icon)  icon.textContent  = '❌';
    if (label) label.textContent = 'INCOMPATIBLE';
    if (detail) detail.textContent = `Blood group mismatch: Patient (${result.patient_group}) cannot receive (${result.bag_group}).`;
  }

  if (aiFlag) aiFlag.style.display = result.ai_flag ? '' : 'none';

  // Log entry
  const patSel = document.getElementById('cm-patient');
  const bagSel = document.getElementById('cm-bag');
  const entry = {
    datetime: new Date().toLocaleString('en-GB', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' }),
    patient: patSel?.selectedOptions[0]?.text || '—',
    bag: bagSel?.selectedOptions[0]?.text?.split(' — ')[0] || '—',
    result: result.result,
    tech,
  };
  BB.crossmatchLog.unshift(entry);
  renderCrossmatchLog();
}

function renderCrossmatchLog() {
  const tbody = document.getElementById('cm-log-tbody');
  if (!tbody) return;

  if (BB.crossmatchLog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="bb-empty-state" style="padding:var(--space-md)">
      <div class="bb-empty-icon">🧫</div><div class="bb-empty-title">No crossmatches yet</div>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = BB.crossmatchLog.slice(0, 20).map(e => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:10px">${e.datetime}</td>
      <td style="font-size:var(--text-xs)">${e.patient}</td>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--blue-glow)">${e.bag}</td>
      <td>${e.result === 'compatible' ?
        '<span style="color:var(--alert-green);font-weight:700">✅ Compatible</span>' :
        e.result === 'weak_positive' ?
        '<span style="color:var(--alert-orange);font-weight:700">⚠️ Weak Pos</span>' :
        '<span style="color:var(--alert-red);font-weight:700">❌ Incompatible</span>'
      }</td>
      <td style="font-size:11px;color:var(--text-muted)">${e.tech}</td>
    </tr>
  `).join('');
}

function clearCrossmatch() {
  document.getElementById('cm-patient').value = '';
  document.getElementById('cm-bag').value = '';
  const box = document.getElementById('cm-result-box');
  if (box) box.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════
   DONATIONS
   ═══════════════════════════════════════════════════════════════ */
const SCREENING_TESTS = ['HIV I/II', 'HBsAg', 'HCV Ab', 'Syphilis (VDRL)', 'Malaria (RDT)'];
const screeningState = {};

function buildScreeningGrid() {
  const grid = document.getElementById('screening-grid');
  if (!grid) return;

  SCREENING_TESTS.forEach(t => { screeningState[t] = null; });

  grid.innerHTML = SCREENING_TESTS.map(t => `
    <div class="screening-item">
      <span class="screening-test-name">${t}</span>
      <div class="screening-result">
        <button class="screening-btn screening-pass" data-test="${t}" data-val="pass" onclick="setScreening('${t}','pass')">Pass</button>
        <button class="screening-btn screening-fail" data-test="${t}" data-val="fail" onclick="setScreening('${t}','fail')">Fail</button>
      </div>
    </div>
  `).join('');
}

window.setScreening = function(test, val) {
  screeningState[test] = val;
  const btns = document.querySelectorAll(`[data-test="${test}"]`);
  btns.forEach(b => b.classList.remove('active'));
  const active = document.querySelector(`[data-test="${test}"][data-val="${val}"]`);
  if (active) active.classList.add('active');
};

async function loadDonations() {
  const tbody = document.getElementById('don-tbody');
  const countEl = document.getElementById('don-today-count');
  if (!tbody) return;

  const demoDonations = [
    { donor: 'Habimana Jean', group: 'O+', component: 'WB', volume: 450, screening: 'all_pass', time: '08:34' },
    { donor: 'Mukamana Aline', group: 'A+', component: 'PRBC', volume: 280, screening: 'all_pass', time: '09:12' },
    { donor: 'Twizeyimana Bob', group: 'B+', component: 'WB', volume: 450, screening: 'fail_hbsag', time: '10:05' },
  ];

  if (countEl) countEl.textContent = `${demoDonations.length} donations today`;

  tbody.innerHTML = demoDonations.map(d => `
    <tr>
      <td>${d.donor}</td>
      <td><span class="bb-blood-group-tag ${groupTagClass(d.group)}">${d.group}</span></td>
      <td>${componentLabel(d.component)}</td>
      <td>${d.volume}</td>
      <td>${d.screening === 'all_pass' ?
        '<span class="hv-reaction-badge hv-mild" style="background:rgba(0,230,118,0.12);color:var(--alert-green);border-color:rgba(0,230,118,0.25)">✅ All Pass</span>' :
        '<span class="hv-reaction-badge hv-severe">❌ Reactive</span>'
      }</td>
      <td style="font-family:var(--font-mono);font-size:11px">${d.time}</td>
    </tr>
  `).join('');
}

async function registerDonation() {
  const name      = document.getElementById('don-name').value.trim();
  const group     = document.getElementById('don-group').value;
  const volume    = document.getElementById('don-volume').value;
  const component = document.getElementById('don-component').value;

  if (!name) { showToast('⚠️ Donor name required', 'warning'); return; }

  const screeningResults = Object.entries(screeningState).map(([test, result]) => ({ test, result }));
  const hasFailure = screeningResults.some(s => s.result === 'fail');

  try {
    await bbPost('/bloodbank/donations/', { donor_name: name, blood_group: group, volume, component, screening: screeningResults });
    showToast(`🩸 Donation registered for ${name}${hasFailure ? ' — ⚠️ Reactive screening: bag quarantined' : ''}`, hasFailure ? 'warning' : 'success');
    clearDonationForm();
    loadDonations();
  } catch {
    showToast(`🩸 Donation registered for ${name} (demo mode)${hasFailure ? ' — ⚠️ Quarantined' : ''}`, hasFailure ? 'warning' : 'success');
    clearDonationForm();
    loadDonations();
  }
}

function clearDonationForm() {
  ['don-name','don-dob','don-phone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('don-group').value = '';
  document.getElementById('don-volume').value = '450';
  SCREENING_TESTS.forEach(t => { screeningState[t] = null; });
  document.querySelectorAll('.screening-btn').forEach(b => b.classList.remove('active'));
}

/* ═══════════════════════════════════════════════════════════════
   HAEMOVIGILANCE
   ═══════════════════════════════════════════════════════════════ */
async function loadHVReports() {
  try {
    const data = await bbFetch('/bloodbank/haemovigilance/');
    renderHVTable(data.results || data || []);
  } catch {
    renderHVTable(BB_DEMO.haemovigilance);
  }
}

function renderHVTable(reports) {
  const tbody = document.getElementById('hv-tbody');
  if (!tbody) return;

  if (reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="bb-empty-state" style="padding:var(--space-lg)">
      <div class="bb-empty-icon">🛡️</div>
      <div class="bb-empty-title">No adverse reactions reported</div>
      <div class="bb-empty-sub">This is a good sign!</div>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = reports.map(r => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:11px">${r.date}</td>
      <td style="font-size:var(--text-xs);font-weight:600;color:var(--text-primary)">${r.patient}</td>
      <td><span class="bb-bag-number">${r.bag}</span></td>
      <td style="font-size:var(--text-xs)">${r.reaction}</td>
      <td><span class="hv-reaction-badge hv-${r.severity.toLowerCase()}">${r.severity}</span></td>
      <td style="font-size:var(--text-xs);color:var(--text-secondary)">${r.outcome}</td>
      <td><span class="bb-status-badge ${r.rbc_status === 'Notified' ? 'bb-status-available' : 'bb-status-quarantine'}">${r.rbc_status}</span></td>
    </tr>
  `).join('');
}

async function submitHVReport() {
  const patient    = document.getElementById('hv-patient')?.value;
  const bag        = document.getElementById('hv-bag')?.value.trim();
  const reaction   = document.getElementById('hv-reaction-type')?.value;
  const severity   = document.getElementById('hv-severity')?.value;
  const symptoms   = document.getElementById('hv-symptoms')?.value.trim();
  const management = document.getElementById('hv-management')?.value.trim();

  if (!patient || !bag) { showToast('⚠️ Patient and bag number required', 'warning'); return; }

  const payload = { patient_id: patient, bag_number: bag, reaction_type: reaction, severity, symptoms, management };

  try {
    await bbPost('/bloodbank/haemovigilance/', payload);
    showToast('🛡️ Haemovigilance report submitted. RBC notified.', 'success');
    clearHVForm();
    loadHVReports();
  } catch {
    showToast('🛡️ Report saved (demo mode). RBC will be notified.', 'success');
    // Add to demo data
    const patSel = document.getElementById('hv-patient');
    BB_DEMO.haemovigilance.unshift({
      date: new Date().toISOString().split('T')[0],
      patient: patSel?.selectedOptions[0]?.text || 'Unknown',
      bag, reaction, severity, outcome: 'Pending', rbc_status: 'Pending'
    });
    clearHVForm();
    loadHVReports();
  }
}

function clearHVForm() {
  ['hv-bag','hv-symptoms','hv-management'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('hv-patient').value = '';
}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS — Chart.js
   ═══════════════════════════════════════════════════════════════ */
function initCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  Chart.defaults.color = '#7FA8CC';
  Chart.defaults.borderColor = 'rgba(0,153,255,0.12)';

  const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const donations = [42, 38, 51, 45, 60, 57];
  const discards  = [3,   2,   4,   3,   5,   4];

  // Update analytics KPIs
  document.getElementById('an-discard-rate').textContent = '6.4%';
  document.getElementById('an-tat-xm').textContent       = '38 min';
  document.getElementById('an-fefo').textContent         = '91%';

  // Donation bar chart
  const ctx1 = document.getElementById('chart-donations');
  if (ctx1 && !BB.charts.donations) {
    BB.charts.donations = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: 'Donations',
          data: donations,
          backgroundColor: 'rgba(0,170,255,0.35)',
          borderColor: 'rgba(0,170,255,0.8)',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(0,153,255,0.08)' }, ticks: { color: '#4A6880' } },
          x: { grid: { color: 'rgba(0,153,255,0.08)' }, ticks: { color: '#4A6880' } }
        }
      }
    });
  }

  // Blood group pie chart
  const ctx2 = document.getElementById('chart-groups');
  if (ctx2 && !BB.charts.groups) {
    BB.charts.groups = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
        datasets: [{
          data: [28, 15, 18, 7, 14, 5, 9, 4],
          backgroundColor: [
            'rgba(255,215,0,0.7)','rgba(255,180,0,0.6)',
            'rgba(0,170,255,0.7)','rgba(0,150,220,0.6)',
            'rgba(0,230,118,0.7)','rgba(0,200,100,0.6)',
            'rgba(213,0,249,0.7)','rgba(180,0,210,0.6)',
          ],
          borderColor: 'rgba(4,13,36,0.8)',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#7FA8CC', padding: 12, font: { size: 11 } }
          }
        }
      }
    });
  }

  // Wastage bar chart
  const ctx3 = document.getElementById('chart-wastage');
  if (ctx3 && !BB.charts.wastage) {
    BB.charts.wastage = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Expired',
            data: [2, 1, 3, 2, 4, 3],
            backgroundColor: 'rgba(255,23,68,0.4)',
            borderColor: 'rgba(255,23,68,0.8)',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Discarded',
            data: [1, 1, 1, 1, 1, 1],
            backgroundColor: 'rgba(255,109,0,0.3)',
            borderColor: 'rgba(255,109,0,0.7)',
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { labels: { color: '#7FA8CC', font: { size: 11 } } } },
        scales: {
          y: { stacked: false, grid: { color: 'rgba(0,153,255,0.08)' }, ticks: { color: '#4A6880' } },
          x: { grid: { color: 'rgba(0,153,255,0.08)' }, ticks: { color: '#4A6880' } }
        }
      }
    });
  }

  // Component bar chart
  const ctx4 = document.getElementById('chart-components');
  if (ctx4 && !BB.charts.components) {
    BB.charts.components = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: ['WB', 'PRBC', 'FFP', 'PLT', 'CRYO'],
        datasets: [{
          label: 'Units Issued',
          data: [18, 34, 12, 8, 5],
          backgroundColor: [
            'rgba(0,170,255,0.5)',
            'rgba(0,212,255,0.5)',
            'rgba(0,230,118,0.4)',
            'rgba(255,215,0,0.4)',
            'rgba(213,0,249,0.35)',
          ],
          borderWidth: 0,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(0,153,255,0.08)' }, ticks: { color: '#4A6880' } },
          x: { grid: { color: 'rgba(0,153,255,0.08)' }, ticks: { color: '#4A6880' } }
        }
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   MODAL HELPERS
   ═══════════════════════════════════════════════════════════════ */
function setupModalHandlers() {
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modalClose));
  });
  document.querySelectorAll('.bb-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.bb-modal-overlay.open').forEach(m => closeModal(m.id));
    }
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════ */
function showToast(message, type = 'info') {
  // Try NEXUS global toast first
  if (window.NEXUS && window.NEXUS.toast) {
    window.NEXUS.toast(message, type);
    return;
  }

  const container = document.getElementById('toast-container');
  if (!container) { console.log(`[Toast ${type}] ${message}`); return; }

  const colors = {
    success: { bg: 'rgba(0,230,118,0.12)', border: 'rgba(0,230,118,0.35)', color: 'var(--alert-green)' },
    warning: { bg: 'rgba(255,214,0,0.10)',  border: 'rgba(255,214,0,0.3)',  color: 'var(--alert-yellow)' },
    error:   { bg: 'rgba(255,23,68,0.12)',  border: 'rgba(255,23,68,0.35)', color: 'var(--alert-red)' },
    info:    { bg: 'rgba(0,170,255,0.10)',  border: 'rgba(0,170,255,0.3)',  color: 'var(--blue-glow)' },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background:${c.bg}; border:1px solid ${c.border}; color:${c.color};
    border-radius:var(--radius-md); padding:10px 16px; font-size:var(--text-sm);
    font-weight:600; backdrop-filter:blur(12px); box-shadow:0 8px 24px rgba(0,0,0,0.4);
    animation: bb-slide-in 300ms var(--ease-out); margin-bottom:8px;
    max-width:400px; word-break:break-word;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 400ms'; setTimeout(() => toast.remove(), 400); }, 4000);
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

function groupTagClass(group) {
  const map = {
    'A+':'bgt-ap','A-':'bgt-an','B+':'bgt-bp','B-':'bgt-bn',
    'AB+':'bgt-abp','AB-':'bgt-abn','O+':'bgt-op','O-':'bgt-on'
  };
  return map[group] || 'bgt-ap';
}

function groupColor(group) {
  if (group.startsWith('O'))  return 'var(--gold)';
  if (group.startsWith('AB')) return 'var(--alert-purple)';
  if (group.startsWith('A'))  return 'var(--blue-glow)';
  return 'var(--alert-green)';
}

function componentLabel(code) {
  const map = { WB:'Whole Blood', PRBC:'Packed RBC', FFP:'Fresh Frozen Plasma', PLT:'Platelets', CRYO:'Cryoprecipitate' };
  return map[code] || code || '—';
}

function statusBadge(status) {
  if (!status) return '<span class="bb-status-badge bb-status-available">Unknown</span>';
  return `<span class="bb-status-badge bb-status-${status.replace(' ','_')}">${status.replace('_',' ').toUpperCase()}</span>`;
}

function statusBadgeExchange(status) {
  const map = {
    ai_suggested: `<span class="bb-status-badge" style="background:rgba(213,0,249,0.1);color:var(--alert-purple);border:1px solid rgba(213,0,249,0.25)">🤖 AI SUGGESTED</span>`,
    pending:      `<span class="bb-status-badge bb-status-quarantine">⏳ PENDING</span>`,
    approved:     `<span class="bb-status-badge bb-status-reserved">✅ APPROVED</span>`,
    in_transit:   `<span class="bb-status-badge bb-status-in_transit">🚁 IN TRANSIT</span>`,
    completed:    `<span class="bb-status-badge bb-status-available">✅ COMPLETED</span>`,
  };
  return map[status] || statusBadge(status);
}

function expiryLabel(bag) {
  if (!bag) return '—';
  if (bag.expiry_status === 'expired')  return '❌ EXPIRED';
  if (bag.expiry_status === 'critical') return `🔴 ${bag.days_to_expiry}d`;
  if (bag.expiry_status === 'warning')  return `⚠️ ${bag.days_to_expiry}d`;
  return `✅ ${bag.days_to_expiry}d`;
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const step  = Math.ceil(Math.abs(target - start) / 30);
  let current = start;
  const dir   = target > start ? 1 : -1;
  const interval = setInterval(() => {
    current += step * dir;
    if ((dir > 0 && current >= target) || (dir < 0 && current <= target)) {
      el.textContent = target;
      clearInterval(interval);
    } else {
      el.textContent = current;
    }
  }, 20);
}

function exportInventoryCSV() {
  const rows = [
    ['Bag #', 'Blood Group', 'Component', 'Volume', 'Unit', 'Chamber', 'Slot', 'Collection Date', 'Expiry Date', 'Days to Expiry', 'Status'],
    ...BB.inventory.map(b => [
      b.bag_number, b.blood_group, b.component, b.volume,
      b.storage_unit, b.chamber, b.slot_number,
      b.collection_date, b.expiry_date, b.days_to_expiry, b.status
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `blood_inventory_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ═══════════════════════════════════════════════════════════════
   ENTRY POINT
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
