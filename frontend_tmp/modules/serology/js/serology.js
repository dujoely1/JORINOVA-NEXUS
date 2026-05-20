/**
 * JORINOVA NEXUS ALIS-X — Serology Module
 * Worklist · Rapid Tests · Titration · ELISA · Positivity Analytics
 *
 * window.NEXUS.csrf    — CSRF token
 * window.NEXUS.apiBase — API base URL (/api/v1)
 */
'use strict';

(function () {

  const API  = window.NEXUS?.apiBase ?? '/api/v1';
  const CSRF = () => window.NEXUS?.csrf ?? document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';

  /* ── Test Catalog ────────────────────────────────────────────── */
  const SERO_TESTS = {
    hiv_rapid:   { code: 'hiv_rapid',   name: 'HIV 1/2 Rapid Test',      type: 'rapid',     category: 'HIV',        pill: 'pill-hiv'      },
    hiv_conf:    { code: 'hiv_conf',    name: 'HIV Confirmatory (Western Blot)', type: 'confirmatory', category: 'HIV', pill: 'pill-hiv' },
    hbsag:       { code: 'hbsag',       name: 'HBsAg (Hepatitis B)',      type: 'rapid',     category: 'Hepatitis',  pill: 'pill-hbsag'    },
    anti_hcv:    { code: 'anti_hcv',    name: 'Anti-HCV (Hepatitis C)',   type: 'rapid',     category: 'Hepatitis',  pill: 'pill-hcv'      },
    vdrl:        { code: 'vdrl',        name: 'VDRL/RPR (Syphilis)',      type: 'titre',     category: 'Syphilis',   pill: 'pill-syphilis' },
    brucella:    { code: 'brucella',    name: 'Brucella Agglutination',   type: 'titre',     category: 'Brucella',   pill: 'pill-brucella' },
    widal:       { code: 'widal',       name: 'Widal Test (Typhoid)',     type: 'titre',     category: 'Typhoid',    pill: 'pill-widal'    },
    aso:         { code: 'aso',         name: 'ASO Titre',                type: 'titre',     category: 'Strep',      pill: 'pill-aso'      },
    rf:          { code: 'rf',          name: 'Rheumatoid Factor',        type: 'titre',     category: 'Autoimmune', pill: 'pill-rf'       },
    crp:         { code: 'crp',         name: 'CRP (C-Reactive Protein)', type: 'quantitative', category: 'Inflammation', pill: 'pill-crp' },
    ana:         { code: 'ana',         name: 'ANA / Anti-dsDNA',         type: 'elisa',     category: 'Autoimmune', pill: 'pill-ana'      },
    malaria_rdt: { code: 'malaria_rdt', name: 'Malaria RDT / Antigen',    type: 'rapid',     category: 'Parasitology',pill: 'pill-malaria' },
    dengue_ns1:  { code: 'dengue_ns1',  name: 'Dengue NS1/IgM/IgG',       type: 'rapid',     category: 'Virology',   pill: 'pill-dengue'   },
  };

  /* ── Demo Worklist ───────────────────────────────────────────── */
  const DEMO_WORKLIST = [
    { id: 'SRL-2025-0041', patient: 'Jean-Pierre Nkurunziza', pid: 'NX-2025-001234', age: 37, gender: 'M', tests: ['hiv_rapid', 'hbsag', 'malaria_rdt'], tat: 45, priority: 'stat',    status: 'pending',    doctor: 'Dr. Uwimana', received: '09:15' },
    { id: 'SRL-2025-0042', patient: 'Amina Uwase',            pid: 'NX-2025-001892', age: 29, gender: 'F', tests: ['vdrl', 'anti_hcv'],                  tat: 80, priority: 'urgent',  status: 'processing', doctor: 'Dr. Kabera',  received: '09:32' },
    { id: 'SRL-2025-0043', patient: 'David Mugisha',          pid: 'NX-2025-002104', age: 53, gender: 'M', tests: ['widal', 'brucella', 'crp'],           tat: 120,priority: 'routine', status: 'pending',    doctor: 'Dr. Nkusi',   received: '10:05' },
    { id: 'SRL-2025-0044', patient: 'Grace Habimana',         pid: 'NX-2025-002567', age: 24, gender: 'F', tests: ['malaria_rdt', 'dengue_ns1'],          tat: 30, priority: 'stat',    status: 'pending',    doctor: 'Dr. Uwimana', received: '10:20' },
    { id: 'SRL-2025-0045', patient: 'Emmanuel Bizimana',      pid: 'NX-2025-003011', age: 60, gender: 'M', tests: ['ana', 'rf', 'aso'],                   tat: 240,priority: 'routine', status: 'processing', doctor: 'Dr. Habayo',  received: '08:50' },
    { id: 'SRL-2025-0046', patient: 'Claudine Mukandori',     pid: 'NX-2025-003204', age: 18, gender: 'F', tests: ['hiv_rapid'],                          tat: 25, priority: 'urgent',  status: 'validated',  doctor: 'Dr. Nkusi',   received: '08:15' },
    { id: 'SRL-2025-0047', patient: 'Patrick Nzeyimana',      pid: 'NX-2025-003390', age: 44, gender: 'M', tests: ['hbsag', 'anti_hcv', 'vdrl'],          tat: 90, priority: 'routine', status: 'pending',    doctor: 'Dr. Kabera',  received: '11:00' },
  ];

  /* ── Shared helpers ──────────────────────────────────────────── */
  async function apiFetch(url, opts = {}) {
    try {
      const res = await fetch(API + url, {
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF(), ...(opts.headers || {}) },
        ...opts,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('[Serology] API:', e.message);
      return null;
    }
  }

  function toast(type, title, msg) {
    if (window.NEXUS?.toast) { window.NEXUS.toast(type, title, msg); return; }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-body"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>
      <button class="toast-close">✕</button>`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-in'));
    t.querySelector('.toast-close').onclick = () => t.remove();
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 400); }, 5000);
  }

  /* ── Tab Navigation ──────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.sero-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sero-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sero-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.pane)?.classList.add('active');

        if (btn.dataset.pane === 'sero-worklist')     loadWorklist();
        if (btn.dataset.pane === 'sero-results')      loadResultsTab();
        if (btn.dataset.pane === 'sero-dashboard')    loadDashboard();
        if (btn.dataset.pane === 'sero-confirmatory') loadConfirmatory();
      });
    });
  }

  /* ── Worklist ────────────────────────────────────────────────── */
  async function loadWorklist(filters = {}) {
    const tbody = document.getElementById('sero-worklist-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7"><div style="padding:var(--space-2xl);text-align:center;color:var(--text-muted)">
      <i class="fas fa-spinner" style="animation:spin 0.65s linear infinite;font-size:24px"></i>
      <p style="margin-top:8px">Loading…</p></div></td></tr>`;

    // Try API
    const qs = new URLSearchParams({ department: 'serology', ...filters }).toString();
    const apiData = await apiFetch(`/lab/requests/?${qs}`);
    const rows = apiData?.results || DEMO_WORKLIST;

    renderWorklist(rows);
    updateHeaderCounts(rows);

    const cnt = document.getElementById('sero-result-count');
    if (cnt) cnt.textContent = `${rows.length} request${rows.length !== 1 ? 's' : ''}`;
  }

  function updateHeaderCounts(rows) {
    const pending  = rows.filter(r => ['pending','processing'].includes(r.status)).length;
    const critical = rows.filter(r => r.priority === 'stat').length;
    const done     = rows.filter(r => r.status === 'validated').length;
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('sero-count-pending',  pending);
    el('sero-count-critical', critical);
    el('sero-count-done',     done);
  }

  function renderWorklist(rows) {
    const tbody = document.getElementById('sero-worklist-tbody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:var(--space-2xl)">
        <div class="empty-state-icon">🔬</div><h3>No Serology Requests</h3>
        <p>No pending serology tests at this time.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const tests = (row.tests || []).map(tc => {
        const t = SERO_TESTS[tc];
        return t ? `<span class="sero-test-pill ${t.pill}">${t.name}</span>` : `<span class="sero-test-pill pill-other">${tc}</span>`;
      }).join('');

      const tatPct   = Math.min(100, Math.round((row.tat || 0) / 240 * 100));
      const tatColor = row.tat < 60 ? 'var(--alert-green)' : row.tat < 120 ? 'var(--alert-yellow)' : row.tat < 180 ? 'var(--alert-orange)' : 'var(--alert-red)';

      const statusMap = {
        pending:    '<span class="badge badge-gold">⏳ Pending</span>',
        processing: '<span class="badge badge-blue">🔄 Processing</span>',
        validated:  '<span class="badge badge-green">✅ Validated</span>',
        cancelled:  '<span class="badge badge-grey">❌ Cancelled</span>',
      };

      const priorityMap = {
        stat:    `<span class="badge priority-stat">🚨 STAT</span>`,
        urgent:  `<span class="badge priority-urgent">⚡ Urgent</span>`,
        routine: `<span class="badge priority-routine">📋 Routine</span>`,
      };

      return `<tr>
        <td>
          <div style="font-weight:700;font-size:var(--text-sm)">${row.patient}</div>
          <div class="sero-lab-id" style="font-size:10px">${row.pid}</div>
          <div style="font-size:10px;color:var(--text-muted)">${row.gender} · ${row.age}y · ${row.doctor || '—'}</div>
        </td>
        <td><span class="sero-lab-id">${row.id}</span></td>
        <td><div class="sero-test-pills">${tests}</div></td>
        <td>
          <div class="sero-tat-wrap">
            <div class="sero-tat-bar">
              <div class="sero-tat-fill" style="width:${tatPct}%;background:${tatColor}"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:10px;color:${tatColor}">${row.tat}min</span>
          </div>
        </td>
        <td>${statusMap[row.status] || row.status}</td>
        <td>${priorityMap[row.priority] || row.priority}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="sero-action-btn sero-enter-btn" data-id="${row.id}" ${row.status === 'validated' ? 'disabled' : ''}>
              🧪 Enter Results
            </button>
            <button class="sero-action-btn sero-view-btn" data-id="${row.id}">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Bind enter-result buttons
    tbody.querySelectorAll('.sero-enter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = rows.find(r => r.id === btn.dataset.id);
        if (!row) return;
        // Switch to results tab and load this request
        document.querySelectorAll('.sero-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sero-body .tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-pane="sero-results"]')?.classList.add('active');
        document.querySelector('.sero-tab-nav .tab-btn[data-pane="sero-results"]')?.classList.add('active');
        loadResultsTab();
        openResultEntry(row);
      });
    });
  }

  /* ── Result Entry Tab ────────────────────────────────────────── */
  function loadResultsTab() {
    const list = document.getElementById('sero-req-list');
    if (!list || list.dataset.loaded) return;
    list.dataset.loaded = '1';

    list.innerHTML = DEMO_WORKLIST
      .filter(r => r.status !== 'validated')
      .map(r => {
        const testNames = r.tests.map(tc => SERO_TESTS[tc]?.name || tc).join(', ');
        return `<div class="sero-req-item" data-id="${r.id}">
          <div class="sro-patient-name">${r.patient}</div>
          <div class="sro-lab-id">${r.id}</div>
          <div class="sro-tests-mini">${testNames}</div>
        </div>`;
      }).join('');

    list.querySelectorAll('.sero-req-item').forEach(item => {
      item.addEventListener('click', () => {
        list.querySelectorAll('.sero-req-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const row = DEMO_WORKLIST.find(r => r.id === item.dataset.id);
        if (row) openResultEntry(row);
      });
    });

    // Req search
    document.getElementById('sero-req-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      list.querySelectorAll('.sero-req-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }

  function openResultEntry(row) {
    const badge   = document.getElementById('sero-req-id-badge');
    const patBar  = document.getElementById('sero-patient-bar');
    const avatar  = document.getElementById('sero-patient-avatar');
    const pname   = document.getElementById('sero-patient-name');
    const pmeta   = document.getElementById('sero-patient-meta');
    const bslEl   = document.getElementById('bsl-alert');
    const area    = document.getElementById('sero-tests-area');
    const footer  = document.getElementById('sero-result-footer');

    if (badge) badge.textContent = row.id;

    if (patBar) {
      const initials = row.patient.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      if (avatar) avatar.textContent = initials;
      if (pname)  pname.textContent  = row.patient;
      if (pmeta)  pmeta.textContent  = `${row.pid} · ${row.gender} · ${row.age}y · ${row.doctor || '—'}`;
      patBar.style.display = 'flex';
    }

    // Check if any test triggers BSL-2
    const bsl2Tests = ['hiv_rapid', 'hiv_conf', 'hbsag', 'anti_hcv'];
    const needsBsl2 = row.tests.some(t => bsl2Tests.includes(t));
    if (bslEl) bslEl.style.display = needsBsl2 ? 'flex' : 'none';

    // Render each test entry form
    if (area) {
      area.innerHTML = row.tests.map(tc => renderTestEntry(tc, row)).join('');
      area.querySelectorAll('.rtd-btn').forEach(btn => bindRapidBtn(btn));
      area.querySelectorAll('.titre-btn').forEach(btn => bindTitreBtn(btn));
      area.querySelectorAll('[data-elisa-field]').forEach(f => bindElisaField(f));
    }

    if (footer) footer.style.display = 'flex';

    // Save button
    document.getElementById('sero-save-btn')?.addEventListener('click', () => {
      toast('success', 'Results Saved', `Results saved for ${row.id} — ${row.patient}`);
    }, { once: true });

    document.getElementById('sero-validate-btn')?.addEventListener('click', () => {
      toast('success', 'Results Validated', `All results validated by pathologist for ${row.id}`);
    }, { once: true });
  }

  /* ── Render Individual Test Entry Forms ─────────────────────── */
  function renderTestEntry(testCode, row) {
    const test = SERO_TESTS[testCode] || { code: testCode, name: testCode, type: 'rapid', pill: 'pill-other' };

    if (test.type === 'rapid' || test.type === 'confirmatory') {
      return renderRapidTestUI(test);
    } else if (test.type === 'titre') {
      return renderTitreUI(test);
    } else if (test.type === 'elisa') {
      return renderElisaUI(test);
    } else {
      return renderQuantitativeUI(test);
    }
  }

  function renderRapidTestUI(test) {
    const bsl2 = ['hiv_rapid', 'hiv_conf', 'hbsag', 'anti_hcv'].includes(test.code);
    return `
<div class="sero-test-entry" data-test="${test.code}">
  <div class="sero-test-entry-header">
    <span class="sero-test-pill ${test.pill}" style="font-size:12px">${test.name}</span>
    <span class="sero-test-name">${test.category}</span>
    ${bsl2 ? '<span class="bsl-alert bsl-2" style="font-size:11px;padding:3px 10px"><span>⚠️</span>BSL-2</span>' : ''}
    <span class="badge badge-blue">Rapid Test</span>
  </div>
  <div class="sero-test-entry-body">
    <div class="rapid-test-display">
      <div class="rtd-cassette">

        <!-- Visual cassette diagram -->
        <div class="cassette-visual">
          <div class="cassette-body">
            <div class="cassette-label">${test.name.slice(0, 12)}</div>
            <div class="cassette-window" id="cw-${test.code}">
              <div class="test-line">
                <span class="tl-label">C</span>
                <div class="tl-bar control-line-active" id="ctrl-${test.code}"></div>
              </div>
              <div class="test-line">
                <span class="tl-label">T</span>
                <div class="tl-bar test-line-negative" id="testline-${test.code}"></div>
              </div>
            </div>
            <div class="cassette-well">S</div>
          </div>
        </div>

        <!-- Result buttons -->
        <div class="rtd-controls">
          <div class="rtd-result-btns">
            <button class="rtd-btn rtd-positive" data-test="${test.code}" data-result="POSITIVE">
              <span class="rtd-btn-icon">🔴</span>
              <span class="rtd-btn-label positive-result">POSITIVE</span>
              <span class="rtd-btn-sub">C + T lines present</span>
            </button>
            <button class="rtd-btn rtd-negative" data-test="${test.code}" data-result="NEGATIVE">
              <span class="rtd-btn-icon">🟢</span>
              <span class="rtd-btn-label negative-result">NEGATIVE</span>
              <span class="rtd-btn-sub">C line only</span>
            </button>
            <button class="rtd-btn rtd-invalid" data-test="${test.code}" data-result="INVALID">
              <span class="rtd-btn-icon">⚪</span>
              <span class="rtd-btn-label" style="color:var(--alert-yellow)">INVALID</span>
              <span class="rtd-btn-sub">No C line</span>
            </button>
          </div>

          <!-- Reflex recommendation (shown if positive) -->
          <div class="sero-reflex-rec" id="reflex-${test.code}">
            <span>⚡</span>
            <span>${getReflexRecommendation(test.code)}</span>
          </div>

          <!-- AI Suggestion -->
          <div class="sero-ai-suggestion" style="margin-top:var(--space-sm)">
            <span class="sero-ai-icon">🤖</span>
            <span>AI interpretation pending result entry. ⚠️ Requires pathologist validation before reporting.</span>
          </div>

          <!-- Notes -->
          <div class="fg" style="margin-top:var(--space-sm)">
            <label class="fl">Notes / Observations</label>
            <textarea class="fi fi-ta" style="min-height:54px" placeholder="Optional notes for this test…"></textarea>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
  }

  function renderTitreUI(test) {
    const titres = ['Negative', '1:2', '1:4', '1:8', '1:16', '1:32', '1:64', '1:128', '1:256', '1:512', '1:1024'];
    return `
<div class="sero-test-entry" data-test="${test.code}">
  <div class="sero-test-entry-header">
    <span class="sero-test-pill ${test.pill}">${test.name}</span>
    <span class="badge badge-gold">Titration</span>
  </div>
  <div class="sero-test-entry-body">
    <div class="titre-selector">
      <label class="fl">Select Titre Result</label>
      <div class="titre-btns">
        ${titres.map(t =>
          `<button class="titre-btn" data-test="${test.code}" data-titre="${t}">${t}</button>`
        ).join('')}
      </div>
      <div class="titre-display" id="titre-display-${test.code}">— Not selected —</div>
    </div>
    <div class="sero-ai-suggestion" style="margin-top:var(--space-sm)">
      <span class="sero-ai-icon">🤖</span>
      <span>Clinically significant titre: typically ≥ 1:80 for ${test.name}. ⚠️ Requires pathologist validation.</span>
    </div>
    <div class="fg" style="margin-top:var(--space-sm)">
      <label class="fl">Notes</label>
      <textarea class="fi fi-ta" style="min-height:54px" placeholder="Optional notes…"></textarea>
    </div>
  </div>
</div>`;
  }

  function renderElisaUI(test) {
    return `
<div class="sero-test-entry" data-test="${test.code}">
  <div class="sero-test-entry-header">
    <span class="sero-test-pill ${test.pill}">${test.name}</span>
    <span class="badge badge-purple">ELISA</span>
  </div>
  <div class="sero-test-entry-body">
    <div class="elisa-ratio-display">
      <div class="elisa-field">
        <div class="elisa-field-lbl">OD Value</div>
        <input type="number" class="fi" id="elisa-od-${test.code}" data-elisa-field="od" data-test="${test.code}"
               placeholder="0.000" step="0.001" min="0" max="4">
        <div class="elisa-field-val" id="od-display-${test.code}">—</div>
      </div>
      <div class="elisa-field">
        <div class="elisa-field-lbl">Cutoff Value</div>
        <input type="number" class="fi" id="elisa-co-${test.code}" data-elisa-field="co" data-test="${test.code}"
               placeholder="0.000" step="0.001" min="0" max="4">
        <div class="elisa-field-val" id="co-display-${test.code}">—</div>
      </div>
      <div class="elisa-field">
        <div class="elisa-field-lbl">OD/Cutoff Ratio</div>
        <div class="elisa-field-val" id="elisa-ratio-${test.code}" style="font-size:24px;color:var(--blue-glow)">—</div>
        <div style="font-size:11px;color:var(--text-muted)">≥1.0 = Reactive</div>
      </div>
    </div>

    <div class="elisa-interpretation" id="elisa-interp-${test.code}" style="display:none"></div>

    <div class="sero-ai-suggestion" style="margin-top:var(--space-sm)">
      <span class="sero-ai-icon">🤖</span>
      <span>Enter OD and Cutoff values to compute ratio. ⚠️ Borderline results (0.9–1.1) require repeat testing.</span>
    </div>

    <div class="fg" style="margin-top:var(--space-sm)">
      <label class="fl">Interpretation Note</label>
      <textarea class="fi fi-ta" style="min-height:54px" id="elisa-note-${test.code}" placeholder="Clinical interpretation…"></textarea>
    </div>
  </div>
</div>`;
  }

  function renderQuantitativeUI(test) {
    return `
<div class="sero-test-entry" data-test="${test.code}">
  <div class="sero-test-entry-header">
    <span class="sero-test-pill ${test.pill}">${test.name}</span>
    <span class="badge badge-blue">Quantitative</span>
  </div>
  <div class="sero-test-entry-body">
    <div class="fg">
      <label class="fl required">Result Value</label>
      <div style="display:flex;gap:var(--space-sm);align-items:center">
        <input type="number" class="fi" placeholder="0.0" step="0.1" min="0" style="max-width:160px">
        <span style="font-size:var(--text-sm);color:var(--text-muted);font-family:var(--font-mono)">mg/L</span>
      </div>
    </div>
    <div class="fg" style="margin-top:var(--space-sm)">
      <label class="fl">Reference Range</label>
      <div style="font-size:var(--text-xs);color:var(--text-secondary)">CRP: &lt; 5.0 mg/L (normal). Elevated: 5–200. High: &gt;200.</div>
    </div>
    <div class="fg" style="margin-top:var(--space-sm)">
      <label class="fl">Notes</label>
      <textarea class="fi fi-ta" style="min-height:54px" placeholder="Optional notes…"></textarea>
    </div>
  </div>
</div>`;
  }

  /* ── Reflex recommendations ──────────────────────────────────── */
  function getReflexRecommendation(code) {
    const map = {
      hiv_rapid:   'HIV Rapid POSITIVE — Recommend: HIV Ag/Ab Combo + Western Blot confirmatory.',
      hbsag:       'HBsAg REACTIVE — Recommend: HBeAg, Anti-HBe, HBV DNA quantification.',
      anti_hcv:    'Anti-HCV REACTIVE — Recommend: HCV RNA PCR + HCV Genotyping.',
      malaria_rdt: 'Malaria RDT POSITIVE — Recommend: Thick/Thin blood film + Species ID.',
      dengue_ns1:  'Dengue NS1 POSITIVE — Recommend: Dengue IgM/IgG + CBC with Platelet trend.',
    };
    return map[code] || 'Positive result — confirm and consult clinician for further workup.';
  }

  /* ── Bind Rapid Test Buttons ─────────────────────────────────── */
  function bindRapidBtn(btn) {
    btn.addEventListener('click', () => {
      const testCode = btn.dataset.test;
      const result   = btn.dataset.result;

      // Update button states
      btn.closest('.rtd-result-btns').querySelectorAll('.rtd-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      // Update cassette visual
      const testLine = document.getElementById(`testline-${testCode}`);
      const ctrlLine = document.getElementById(`ctrl-${testCode}`);
      if (testLine) {
        testLine.className = 'tl-bar ' + (result === 'POSITIVE' ? 'test-line-reactive' : result === 'NEGATIVE' ? 'test-line-negative' : '');
      }
      if (ctrlLine) {
        ctrlLine.className = 'tl-bar ' + (result !== 'INVALID' ? 'control-line-active' : '');
      }

      // Show/hide reflex recommendation
      const reflexEl = document.getElementById(`reflex-${testCode}`);
      if (reflexEl) {
        reflexEl.classList.toggle('visible', result === 'POSITIVE');
      }

      // BSL alert for certain positive tests
      const bslAlert = document.getElementById('bsl-alert');
      if (bslAlert && ['hiv_rapid', 'hbsag', 'anti_hcv'].includes(testCode) && result === 'POSITIVE') {
        bslAlert.style.display = 'flex';
      }
    });
  }

  /* ── Bind Titre Buttons ──────────────────────────────────────── */
  function bindTitreBtn(btn) {
    btn.addEventListener('click', () => {
      btn.closest('.titre-btns').querySelectorAll('.titre-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const display = document.getElementById(`titre-display-${btn.dataset.test}`);
      if (display) {
        const t = btn.dataset.titre;
        const significant = t !== 'Negative' && !['1:2', '1:4'].includes(t);
        display.textContent = t;
        display.style.color = significant ? 'var(--alert-orange)' : 'var(--alert-green)';
      }
    });
  }

  /* ── Bind ELISA Fields ───────────────────────────────────────── */
  function bindElisaField(field) {
    field.addEventListener('input', () => {
      const testCode = field.dataset.test;
      const odInput  = document.getElementById(`elisa-od-${testCode}`);
      const coInput  = document.getElementById(`elisa-co-${testCode}`);
      const ratioEl  = document.getElementById(`elisa-ratio-${testCode}`);
      const interpEl = document.getElementById(`elisa-interp-${testCode}`);

      const od = parseFloat(odInput?.value) || 0;
      const co = parseFloat(coInput?.value) || 0;

      if (od > 0 && co > 0) {
        const ratio = od / co;
        if (ratioEl) {
          ratioEl.textContent = ratio.toFixed(3);
          if (ratio >= 1.0) ratioEl.style.color = 'var(--alert-red)';
          else if (ratio >= 0.9) ratioEl.style.color = 'var(--gold)';
          else ratioEl.style.color = 'var(--alert-green)';
        }

        if (interpEl) {
          interpEl.style.display = 'flex';
          if (ratio >= 1.0) {
            interpEl.className = 'elisa-interpretation elisa-reactive';
            interpEl.innerHTML = '🔴 <strong>REACTIVE</strong> — OD/Cutoff ratio ≥ 1.0. Confirmatory testing recommended.';
          } else if (ratio >= 0.9) {
            interpEl.className = 'elisa-interpretation elisa-borderline';
            interpEl.innerHTML = '⚠️ <strong>BORDERLINE</strong> — Repeat testing in 2 weeks recommended.';
          } else {
            interpEl.className = 'elisa-interpretation elisa-negative';
            interpEl.innerHTML = '🟢 <strong>NON-REACTIVE</strong> — Below cutoff threshold.';
          }
        }
      }
    });
  }

  /* ── Dashboard ───────────────────────────────────────────────── */
  async function loadDashboard() {
    // Load stats
    const apiStats = await apiFetch('/reports/serology-stats/');
    const stats = apiStats || { total: 847, reactive: 62, critical: 11, validated: 124 };

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('sd-total',     stats.total);
    el('sd-reactive',  stats.reactive);
    el('sd-critical',  stats.critical);
    el('sd-validated', stats.validated);

    renderPositivityGrid();
    renderCriticalList();
    renderReactiveTable();
    renderBslList();
    renderDashboardCharts();
  }

  function renderPositivityGrid() {
    const grid = document.getElementById('sero-positivity-grid');
    if (!grid) return;

    const data = [
      { name: 'HIV 1/2 (Rapid)',     positive: 18, total: 274,  color: 'var(--alert-red)' },
      { name: 'HBsAg',               positive: 12, total: 188,  color: 'var(--alert-orange)' },
      { name: 'Anti-HCV',            positive: 4,  total: 97,   color: '#D500F9' },
      { name: 'VDRL/RPR',            positive: 8,  total: 121,  color: 'var(--gold)' },
      { name: 'Malaria RDT',         positive: 42, total: 312,  color: 'var(--alert-red)' },
      { name: 'Widal (Typhoid)',      positive: 22, total: 162,  color: 'var(--blue-glow)' },
      { name: 'Brucella',            positive: 3,  total: 44,   color: 'var(--cyan)' },
      { name: 'ASO Titre',           positive: 19, total: 88,   color: '#A78BFA' },
      { name: 'CRP (Elevated)',       positive: 56, total: 203,  color: 'var(--alert-orange)' },
      { name: 'Rheumatoid Factor',   positive: 11, total: 72,   color: 'var(--alert-green)' },
      { name: 'Dengue NS1/IgM/IgG', positive: 7,  total: 34,   color: 'var(--gold)' },
      { name: 'ANA / Anti-dsDNA',    positive: 5,  total: 29,   color: 'var(--cyan)' },
    ];

    grid.innerHTML = data.map(d => {
      const pct = ((d.positive / d.total) * 100).toFixed(1);
      return `<div class="sero-pos-item">
        <div class="sero-pos-name">${d.name}</div>
        <div class="positivity-bar">
          <div class="positivity-fill" style="width:${pct}%;background:${d.color}"></div>
        </div>
        <div class="pos-pct" style="color:${d.color}">${pct}%</div>
        <div class="pos-count">${d.positive}/${d.total}</div>
      </div>`;
    }).join('');
  }

  function renderCriticalList() {
    const list = document.getElementById('sero-critical-list');
    if (!list) return;

    const criticals = [
      { name: 'Jean-Pierre Nkurunziza', test: 'HIV Ag/Ab REACTIVE', time: '09:42', pid: 'NX-001234' },
      { name: 'Emmanuel Bizimana',      test: 'HBsAg REACTIVE — High viral load', time: '10:15', pid: 'NX-003011' },
      { name: 'Grace Habimana',         test: 'Malaria P. falciparum ++++', time: '10:28', pid: 'NX-002567' },
    ];

    list.innerHTML = criticals.map(c => `
      <div class="sero-critical-item">
        <div class="sero-ci-dot"></div>
        <div class="sero-ci-body">
          <div class="sero-ci-name">${c.name} <span style="font-family:var(--font-mono);font-size:10px;color:var(--blue-glow)">(${c.pid})</span></div>
          <div class="sero-ci-test">🚨 ${c.test}</div>
          <div class="sero-ci-time">${c.time}</div>
        </div>
      </div>
    `).join('');
  }

  function renderReactiveTable() {
    const tbody = document.getElementById('sero-reactive-tbody');
    if (!tbody) return;

    const reactives = [
      { patient: 'Jean-Pierre Nkurunziza', test: 'HIV 1/2 Rapid',     result: '🔴 POSITIVE',       time: '09:42', action: 'Western Blot ordered' },
      { patient: 'Emmanuel Bizimana',      test: 'HBsAg',             result: '🔴 REACTIVE',        time: '09:15', action: 'HBV DNA ordered' },
      { patient: 'Grace Habimana',         test: 'Malaria RDT',       result: '🔴 POSITIVE (Pf)', time: '10:28', action: 'Blood film ordered' },
      { patient: 'Amina Uwase',            test: 'VDRL/RPR',          result: '🔴 REACTIVE 1:16',  time: '10:05', action: 'RPR confirmatory pending' },
      { patient: 'Patrick Nzeyimana',      test: 'Anti-HCV',          result: '🔴 REACTIVE',        time: '11:02', action: 'HCV RNA PCR ordered' },
    ];

    tbody.innerHTML = reactives.map(r => `
      <tr>
        <td style="font-weight:600">${r.patient}</td>
        <td>${r.test}</td>
        <td class="positive-result">${r.result}</td>
        <td class="fo-mono" style="font-size:11px">${r.time}</td>
        <td><span class="badge badge-orange" style="font-size:10px">${r.action}</span></td>
      </tr>
    `).join('');
  }

  function renderBslList() {
    const list = document.getElementById('sero-bsl-list');
    if (!list) return;

    const bslItems = [
      { pid: 'NX-001234', name: 'Jean-Pierre N.', test: 'HIV+',    level: 'bsl-2' },
      { pid: 'NX-003011', name: 'Emmanuel B.',    test: 'HBsAg+',  level: 'bsl-2' },
      { pid: 'NX-003204', name: 'Patrick N.',     test: 'Anti-HCV+', level: 'bsl-2' },
    ];

    list.innerHTML = `
      <div class="bsl-alert bsl-2" style="margin-right:var(--space-sm)">⚠️ BSL-2 ENHANCED — Samples Below</div>
      ${bslItems.map(item => `
        <div class="bsl-badge-item">
          <span class="bsl-alert ${item.level}" style="font-size:10px;padding:2px 8px">${item.test}</span>
          <span style="font-weight:600;font-size:var(--text-xs)">${item.name}</span>
          <span class="bsl-badge-pid">${item.pid}</span>
        </div>
      `).join('')}`;
  }

  function renderDashboardCharts() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#7FA8CC';

    // HIV positivity trend
    const hivCtx = document.getElementById('sero-hiv-trend')?.getContext('2d');
    if (hivCtx && !hivCtx.canvas._chartInstance) {
      const chart = new Chart(hivCtx, {
        type: 'line',
        data: {
          labels: ['Dec','Jan','Feb','Mar','Apr','May'],
          datasets: [
            {
              label: 'HIV Positive',
              data: [12, 15, 9, 18, 14, 18],
              borderColor: 'rgba(255,23,68,0.9)',
              backgroundColor: 'rgba(255,23,68,0.06)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointBackgroundColor: 'rgba(255,23,68,0.9)',
            },
            {
              label: 'HIV Total Tests',
              data: [210, 248, 198, 267, 254, 274],
              borderColor: 'rgba(0,153,255,0.6)',
              backgroundColor: 'rgba(0,153,255,0.04)',
              borderWidth: 1.5,
              borderDash: [4, 3],
              fill: false,
              tension: 0.4,
              pointRadius: 3,
              yAxisID: 'y2',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#7FA8CC', boxWidth: 10 } },
            tooltip: { backgroundColor: 'rgba(7,20,40,0.95)' },
          },
          scales: {
            x: { grid: { color: 'rgba(0,153,255,0.06)' }, ticks: { color: '#4A6880' } },
            y: { grid: { color: 'rgba(0,153,255,0.06)' }, ticks: { color: '#FF1744' }, title: { display: true, text: 'Positive', color: '#FF1744', font: { size: 10 } } },
            y2: { position: 'right', grid: { display: false }, ticks: { color: '#0099FF' }, title: { display: true, text: 'Total Tests', color: '#0099FF', font: { size: 10 } } },
          },
        },
      });
      hivCtx.canvas._chartInstance = chart;
    }

    // Volume distribution pie
    const volCtx = document.getElementById('sero-vol-pie')?.getContext('2d');
    if (volCtx && !volCtx.canvas._chartInstance) {
      const volData = [
        ['HIV 1/2',   274, 'rgba(255,23,68,0.75)'],
        ['HBsAg',     188, 'rgba(255,109,0,0.75)'],
        ['Malaria',   312, 'rgba(255,215,0,0.75)'],
        ['VDRL/RPR',  121, 'rgba(213,0,249,0.65)'],
        ['Widal',     162, 'rgba(0,153,255,0.75)'],
        ['Other',     250, 'rgba(100,100,120,0.5)'],
      ];
      const chart = new Chart(volCtx, {
        type: 'doughnut',
        data: {
          labels: volData.map(d => d[0]),
          datasets: [{
            data: volData.map(d => d[1]),
            backgroundColor: volData.map(d => d[2]),
            borderColor: 'rgba(2,8,24,0.8)',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { display: true, position: 'right', labels: { color: '#7FA8CC', boxWidth: 10, font: { size: 10 } } },
            tooltip: { backgroundColor: 'rgba(7,20,40,0.95)' },
          },
        },
      });
      volCtx.canvas._chartInstance = chart;
    }
  }

  /* ── Confirmatory Tab ────────────────────────────────────────── */
  function loadConfirmatory() {
    const confTbody    = document.getElementById('sero-conf-tbody');
    const reflexTbody  = document.getElementById('sero-reflex-tbody');
    const referralTbody = document.getElementById('sero-referral-tbody');

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('conf-pending-count', 4);
    el('reflex-queue-count', 6);
    el('ext-referral-count', 2);
    el('conf-count-badge',   '4 pending');

    if (confTbody) {
      const confTests = [
        { patient: 'Jean-Pierre Nkurunziza', pid:'NX-001234', screen:'HIV 1/2 Rapid',  screenResult:'POSITIVE',  conf:'HIV Western Blot',       status:'pending' },
        { patient: 'Emmanuel Bizimana',      pid:'NX-003011', screen:'HBsAg (rapid)',   screenResult:'REACTIVE',  conf:'HBV DNA + HBeAg',        status:'in_progress' },
        { patient: 'Patrick Nzeyimana',      pid:'NX-003390', screen:'Anti-HCV',        screenResult:'REACTIVE',  conf:'HCV RNA PCR',            status:'pending' },
        { patient: 'Amina Uwase',            pid:'NX-001892', screen:'VDRL',            screenResult:'REACTIVE 1:16', conf:'TPHA (Treponema)',   status:'pending' },
      ];

      confTbody.innerHTML = confTests.map(c => `
        <tr>
          <td>
            <div style="font-weight:700">${c.patient}</div>
            <div class="sero-lab-id" style="font-size:10px">${c.pid}</div>
          </td>
          <td>${c.screen}</td>
          <td class="positive-result">${c.screenResult}</td>
          <td><span class="badge badge-blue">${c.conf}</span></td>
          <td>${c.status === 'in_progress' ? '<span class="badge badge-blue">🔄 In Progress</span>' : '<span class="badge badge-gold">⏳ Pending</span>'}</td>
          <td>${new Date().toLocaleDateString('en-GB')}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="sero-action-btn sero-enter-btn">Enter Result</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    if (reflexTbody) {
      const reflexTests = [
        { patient: 'Jean-Pierre N.', pid: 'NX-001234', trigger: 'HIV 1/2 Rapid', reflex: 'HIV Ag/Ab Combo (4th Gen)', result: 'POSITIVE', status: 'ordered' },
        { patient: 'Emmanuel B.',    pid: 'NX-003011', trigger: 'HBsAg',          reflex: 'HBV DNA Quantitative',      result: 'REACTIVE',  status: 'ordered' },
        { patient: 'Grace H.',       pid: 'NX-002567', trigger: 'Malaria RDT',    reflex: 'Blood Film Microscopy',     result: 'POSITIVE',  status: 'processing' },
        { patient: 'Amina U.',       pid: 'NX-001892', trigger: 'VDRL',           reflex: 'TPHA Confirmatory',         result: 'REACTIVE',  status: 'ordered' },
        { patient: 'Patrick N.',     pid: 'NX-003390', trigger: 'Anti-HCV',       reflex: 'HCV RNA PCR',               result: 'REACTIVE',  status: 'ordered' },
        { patient: 'Claudine M.',    pid: 'NX-003204', trigger: 'HIV 1/2 Rapid',  reflex: 'CD4 Count',                result: 'POSITIVE',  status: 'processing' },
      ];

      reflexTbody.innerHTML = reflexTests.map(r => `
        <tr>
          <td>
            <div style="font-weight:700">${r.patient}</div>
            <div class="sero-lab-id" style="font-size:10px">${r.pid}</div>
          </td>
          <td>${r.trigger}</td>
          <td><span class="badge badge-blue">${r.reflex}</span></td>
          <td class="positive-result">${r.result}</td>
          <td>${r.status === 'processing' ? '<span class="badge badge-blue">🔄 Processing</span>' : '<span class="badge badge-gold">📋 Ordered</span>'}</td>
          <td>
            <button class="sero-action-btn sero-enter-btn" style="font-size:10px">
              ${r.status === 'processing' ? '✅ Enter Result' : '👁 View'}
            </button>
          </td>
        </tr>
      `).join('');
    }

    if (referralTbody) {
      const referrals = [
        { patient: 'Jean-Pierre N.',  pid:'NX-001234', test:'HIV Western Blot', lab:'CHUK National Lab', sent:'2025-05-12', expected:'2025-05-19', status:'sent' },
        { patient: 'Patrick N.',      pid:'NX-003390', test:'HCV Genotyping',   lab:'Rwanda Biomedical Centre', sent:'2025-05-13', expected:'2025-05-20', status:'processing' },
      ];

      referralTbody.innerHTML = referrals.map(r => `
        <tr>
          <td>
            <div style="font-weight:700">${r.patient}</div>
            <div class="sero-lab-id" style="font-size:10px">${r.pid}</div>
          </td>
          <td>${r.test}</td>
          <td style="font-weight:600;color:var(--blue-glow)">${r.lab}</td>
          <td class="fo-mono" style="font-size:11px">${r.sent}</td>
          <td class="fo-mono" style="font-size:11px">${r.expected}</td>
          <td>${r.status === 'processing' ? '<span class="badge badge-blue">🔄 Processing</span>' : '<span class="badge badge-gold">📤 Sent</span>'}</td>
          <td>
            <button class="sero-action-btn sero-view-btn"><i class="fas fa-eye"></i></button>
          </td>
        </tr>
      `).join('');
    }
  }

  /* ── Filter handlers ─────────────────────────────────────────── */
  function initFilters() {
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const reload = debounce(() => {
      const s = document.getElementById('sero-filter-status')?.value;
      const p = document.getElementById('sero-filter-priority')?.value;
      const d = document.getElementById('sero-filter-date')?.value;
      const t = document.getElementById('sero-filter-test')?.value;
      loadWorklist({ status: s, priority: p, date: d, test: t });
    }, 300);

    ['sero-filter-status', 'sero-filter-priority', 'sero-filter-date', 'sero-filter-test'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', reload)
    );

    document.getElementById('sero-search')?.addEventListener('input', debounce(e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#sero-worklist-tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }, 200));
  }

  /* ── Modal ───────────────────────────────────────────────────── */
  function initModal() {
    document.getElementById('sero-modal-close')?.addEventListener('click', () => {
      document.getElementById('sero-rapid-modal')?.classList.remove('open');
    });
    document.getElementById('sero-modal-cancel')?.addEventListener('click', () => {
      document.getElementById('sero-rapid-modal')?.classList.remove('open');
    });
    document.getElementById('sero-rapid-modal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('sero-rapid-modal')) {
        document.getElementById('sero-rapid-modal').classList.remove('open');
      }
    });
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    initTabs();
    initFilters();
    initModal();
    loadWorklist();

    document.getElementById('sero-refresh-btn')?.addEventListener('click', () => loadWorklist());
  }

  document.addEventListener('DOMContentLoaded', init);

})();
