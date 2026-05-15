/**
 * JORINOVA NEXUS ALIS-X — Doctor Portal
 * Patient results, critical alerts, cross-hospital LID history, test ordering
 */
'use strict';

(function () {
  const CSRF  = () => window.NEXUS?.csrf || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  const API   = () => window.NEXUS?.apiBase || '/api/v1';
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);

  /* ─── Demo patients (my patients) ──────────────────────────── */
  const PATIENTS = [
    { id:'RWA-2024-00142', lid:'NXS-LID-2024-0000142', name:'KAMANZI Jean', age:34, gender:'M', ward:'Medical Ward A', bed:'A-12', dx:'Severe Malaria + Anaemia', pending:3, critical:1, last_result:'CBC: HGB 6.2 g/dL — CRITICAL LOW' },
    { id:'RWA-2024-00287', lid:'NXS-LID-2024-0000287', name:'UWIMANA Grace', age:28, gender:'F', ward:'Maternity', bed:'M-04', dx:'Pre-eclampsia G2P1', pending:2, critical:0, last_result:'BP trend elevated. Urine protein 2+.' },
    { id:'RWA-2024-00388', lid:'NXS-LID-2024-0000388', name:'HABIMANA Eric', age:52, gender:'M', ward:'ICU', bed:'ICU-03', dx:'Septic Shock', pending:4, critical:2, last_result:'Culture: K. pneumoniae — CRE suspected' },
    { id:'RWA-2024-00501', lid:'NXS-LID-2024-0000501', name:'MUKAMANA Rose', age:42, gender:'F', ward:'Oncology', bed:'O-07', dx:'Ca Cervix Stage IIB', pending:1, critical:0, last_result:'CBC: PLT 98×10³ (Low)' },
    { id:'RWA-2024-00612', lid:'NXS-LID-2024-0000612', name:'NIYOMUGABO Paul', age:67, gender:'M', ward:'Medical Ward B', bed:'B-09', dx:'Chronic Kidney Disease Stage 4 + DM2', pending:2, critical:0, last_result:'Creatinine 320 µmol/L (↑)' },
    { id:'RWA-2024-00723', lid:'NXS-LID-2024-0000723', name:'INGABIRE Marie', age:22, gender:'F', ward:'Outpatient', bed:'—', dx:'HIV+ on ART (VL monitoring)', pending:1, critical:0, last_result:'HIV VL: Undetectable (<50 cp/mL) ✅' },
  ];

  /* ─── Demo results ──────────────────────────────────────────── */
  const RESULTS = [
    { pid:'RWA-2024-00388', lab_id:'LAB-240515-003', test:'Blood Culture × 2', dept:'Microbiology', result:'K. pneumoniae — CRE pattern suspected', flag:'HH', released:'10 min ago', acknowledged:false },
    { pid:'RWA-2024-00142', lab_id:'LAB-240515-001', test:'HGB (CBC)', dept:'Hematology', result:'6.2 g/dL', flag:'LL', released:'25 min ago', acknowledged:false },
    { pid:'RWA-2024-00388', lab_id:'LAB-240515-003', test:'Procalcitonin (PCT)', dept:'Chemistry', result:'18.4 µg/L', flag:'HH', released:'30 min ago', acknowledged:false },
    { pid:'RWA-2024-00287', lab_id:'LAB-240515-002', test:'Urine Protein', dept:'Chemistry', result:'2+ (Dipstick)', flag:'H', released:'1 hr ago', acknowledged:true },
    { pid:'RWA-2024-00501', lab_id:'LAB-240515-009', test:'PLT (CBC)', dept:'Hematology', result:'98 ×10³/µL', flag:'L', released:'2 hr ago', acknowledged:true },
    { pid:'RWA-2024-00612', lab_id:'LAB-240515-015', test:'Creatinine', dept:'Chemistry', result:'320 µmol/L', flag:'H', released:'3 hrs ago', acknowledged:true },
    { pid:'RWA-2024-00723', lab_id:'LAB-240515-018', test:'HIV-1 Viral Load', dept:'Molecular', result:'< 50 copies/mL (Undetectable)', flag:'N', released:'4 hrs ago', acknowledged:true },
  ];

  /* ─── Demo LID cross-hospital history ─────────────────────── */
  const LID_HISTORY = {
    'NXS-LID-2024-0000142': [
      { date:'2026-05-14', hospital:'ALIS-X Main Lab', test:'CBC', result:'HGB 6.2 g/dL — CRITICAL', flag:'LL' },
      { date:'2026-05-10', hospital:'ALIS-X Main Lab', test:'Malaria RDT', result:'P. falciparum POSITIVE', flag:'H' },
      { date:'2026-03-15', hospital:'Butare University Hospital', test:'CBC', result:'HGB 9.8 g/dL (Low)', flag:'L' },
      { date:'2025-11-02', hospital:'Kigali Health Institute', test:'HBsAg', result:'Negative', flag:'N' },
      { date:'2025-08-12', hospital:'ALIS-X Main Lab', test:'CBC + Retic', result:'HGB 11.2 g/dL, Retic 3.8%', flag:'N' },
    ],
    'NXS-LID-2024-0000388': [
      { date:'2026-05-14', hospital:'ALIS-X Main Lab', test:'Blood Culture × 2', result:'K. pneumoniae — CRE', flag:'HH' },
      { date:'2026-05-12', hospital:'ALIS-X Main Lab', test:'PCT + CRP', result:'PCT 18.4 µg/L, CRP 184 mg/L', flag:'HH' },
      { date:'2026-05-12', hospital:'ALIS-X Main Lab', test:'CBC', result:'WBC 22.4 ×10³ (Leukocytosis)', flag:'H' },
      { date:'2025-12-01', hospital:'Rwanda Military Hospital', test:'LFT Panel', result:'All within normal limits', flag:'N' },
    ],
  };

  /* ─── Tab switching ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.dp-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dp-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.dp-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        const actions = {
          'dp-patients-pane':  loadPatients,
          'dp-results-pane':   loadResults,
          'dp-critical-pane':  loadCritical,
        };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  /* ─── My Patients ───────────────────────────────────────────── */
  function loadPatients() {
    const grid = document.getElementById('dp-patient-grid');
    if (!grid || grid.innerHTML.includes('dp-patient-card')) return;
    grid.innerHTML = PATIENTS.map(p => `
      <div class="dp-patient-card ${p.critical > 0 ? 'has-critical' : p.pending > 0 ? 'has-pending' : ''}"
           onclick="window.DPModule.openHistory('${p.lid}', '${p.name}')">
        <div class="dp-card-header">
          <div>
            <div class="dp-patient-name">${esc(p.name)}</div>
            <div class="dp-patient-meta">${p.age}y ${p.gender} · ${esc(p.ward)}${p.bed !== '—' ? ' · Bed ' + p.bed : ''}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
            ${p.critical > 0 ? `<span class="badge badge-red">🚨 ${p.critical} critical</span>` : ''}
            ${p.pending  > 0 ? `<span class="badge badge-yellow">⏳ ${p.pending} pending</span>` : ''}
          </div>
        </div>
        <div class="dp-dx">${esc(p.dx)}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${esc(p.last_result)}</div>
        <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-sm)">
          <span style="font-size:10px;color:var(--text-muted)">LID: <code style="color:var(--cyan)">${esc(p.lid)}</code></span>
        </div>
      </div>`).join('');
    const cnt = document.getElementById('dp-patient-count');
    if (cnt) cnt.textContent = `${PATIENTS.length} patients`;
  }

  /* ─── Results ───────────────────────────────────────────────── */
  function loadResults() {
    const tbody = document.getElementById('dp-results-tbody');
    if (!tbody || tbody.innerHTML.includes('<tr>') && !tbody.innerHTML.includes('Loading')) return;
    tbody.innerHTML = RESULTS.map(r => `<tr>
      <td>
        <div style="font-weight:600;font-size:var(--text-sm)">${esc(PATIENTS.find(p=>p.id===r.pid)?.name || r.pid)}</div>
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${esc(r.pid)}</div>
      </td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(r.lab_id)}</span></td>
      <td><div style="font-size:var(--text-xs)">${esc(r.test)}</div>
          <div style="font-size:10px;color:var(--text-muted)">${esc(r.dept)}</div></td>
      <td style="font-weight:600;font-size:var(--text-sm)">${esc(r.result)}</td>
      <td><span class="result-flag-${r.flag}" style="font-family:var(--font-mono);font-size:12px">${r.flag}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(r.released)}</td>
      <td>
        ${!r.acknowledged
          ? `<button class="btn btn-primary btn-sm" onclick="window.DPModule.acknowledge('${r.lab_id}',this)">✅ Acknowledge</button>`
          : `<span style="font-size:11px;color:var(--alert-green)">✅ Acknowledged</span>`}
      </td>
    </tr>`).join('');
  }

  /* ─── Critical Alerts ────────────────────────────────────────── */
  function loadCritical() {
    const list = document.getElementById('dp-critical-list');
    if (!list || list.innerHTML !== '') return;
    const critical = RESULTS.filter(r => !r.acknowledged && (r.flag === 'HH' || r.flag === 'LL'));
    if (!critical.length) {
      list.innerHTML = '<div class="empty-state"><div style="font-size:40px">✅</div><p>No unacknowledged critical results.</p></div>';
      return;
    }
    list.innerHTML = critical.map(r => `
      <div class="dp-critical-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div class="dp-critical-title">🚨 ${esc(r.test)} — ${esc(r.result)}</div>
            <div class="dp-critical-meta">
              Patient: <strong>${esc(PATIENTS.find(p=>p.id===r.pid)?.name || r.pid)}</strong> ·
              ${esc(r.lab_id)} · Released ${esc(r.released)}
            </div>
          </div>
          <button class="btn btn-success btn-sm" onclick="window.DPModule.acknowledge('${r.lab_id}',this)">✅ Acknowledge</button>
        </div>
        <div style="margin-top:var(--space-sm);padding:var(--space-sm) var(--space-md);background:rgba(0,0,0,.15);border-radius:var(--radius-sm);font-size:11px;color:var(--text-secondary)">
          🏷️ Flag: <strong class="result-flag-${r.flag}">${r.flag}</strong> ·
          Dept: ${esc(r.dept)} ·
          <a href="/laboratory/" style="color:var(--blue-glow)">View full result →</a>
        </div>
      </div>`).join('');
  }

  /* ─── LID Cross-Hospital History ─────────────────────────────── */
  function initHistory() {
    document.getElementById('dp-lid-search-btn')?.addEventListener('click', () => {
      const q = document.getElementById('dp-lid-input')?.value?.trim();
      if (!q) { toast('Enter a LID or PID to search', 'error'); return; }
      const patient = PATIENTS.find(p => p.lid === q || p.id === q || p.name.toLowerCase().includes(q.toLowerCase()));
      const container = document.getElementById('dp-history-results');
      if (!container) return;
      if (!patient) {
        container.innerHTML = '<div class="empty-state"><p>No patient found for that LID/PID. Only patients referred from this facility are accessible.</p></div>';
        return;
      }
      const history = LID_HISTORY[patient.lid] || [];
      container.innerHTML = `
        <div style="background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-lg);padding:var(--space-lg);margin-bottom:var(--space-lg)">
          <div style="display:flex;align-items:center;gap:var(--space-md)">
            <div style="font-size:32px">🧬</div>
            <div>
              <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700;color:var(--text-primary)">${esc(patient.name)}</div>
              <div style="display:flex;gap:var(--space-sm);margin-top:4px;flex-wrap:wrap">
                <span class="badge badge-blue">LID: ${esc(patient.lid)}</span>
                <span class="badge badge-blue">PID: ${esc(patient.id)}</span>
                <span class="badge badge-blue">${patient.age}y ${patient.gender}</span>
              </div>
            </div>
          </div>
        </div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:var(--space-md)">
          📚 ${history.length} Laboratory Visits Across All Facilities
        </div>
        <div class="dp-history-timeline">
          ${history.map(h => `
            <div class="dp-history-entry">
              <div class="dp-history-dot"></div>
              <div class="dp-history-content">
                <div class="dp-history-date">${esc(h.date)}</div>
                <div class="dp-history-test">${esc(h.test)}</div>
                <div class="dp-history-val">${esc(h.result)} <span class="result-flag-${h.flag}">[${h.flag}]</span></div>
                <div class="dp-history-hosp">📍 ${esc(h.hospital)}</div>
              </div>
            </div>`).join('')}
        </div>`;
    });
  }

  /* ─── Test ordering ─────────────────────────────────────────── */
  const TEST_PRESETS = {
    'FBC Panel': ['CBC (Full Blood Count)','ESR','CRP'],
    'U+E Panel': ['Glucose','Creatinine','Urea','Sodium','Potassium','Chloride'],
    'LFT Panel': ['ALT','AST','ALP','Bilirubin (Total+Direct)','Albumin','GGT'],
    'Serology Screen': ['HIV Ag/Ab Combo','HBsAg','Anti-HCV','VDRL (Syphilis)'],
    'Malaria Panel': ['Malaria RDT','Blood Film (Giemsa)','CBC'],
    'TB Panel': ['GeneXpert MTB/RIF','ZN Stain (Sputum)','Culture (LJ/MGIT)'],
  };
  const selectedTests = new Set();

  function initOrdering() {
    document.querySelectorAll('.dp-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const tests = TEST_PRESETS[btn.textContent.replace(/^[^\w]+/,'').trim()] || [];
        tests.forEach(t => selectedTests.add(t));
        renderSelectedTests();
        btn.classList.toggle('selected', true);
      });
    });

    document.getElementById('dp-submit-order-btn')?.addEventListener('click', () => {
      if (!selectedTests.size) { toast('Select at least one test', 'error'); return; }
      toast(`✅ Order submitted: ${Array.from(selectedTests).join(', ')}`, 'success');
      selectedTests.clear();
      renderSelectedTests();
    });
  }

  function renderSelectedTests() {
    const wrap = document.getElementById('dp-selected-tests');
    if (!wrap) return;
    if (!selectedTests.size) {
      wrap.innerHTML = '<span style="color:var(--text-muted);font-size:11px;padding:3px">No tests selected — choose a panel or add individually</span>';
      return;
    }
    wrap.innerHTML = Array.from(selectedTests).map(t =>
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:var(--radius-full);background:rgba(0,153,255,.10);border:1px solid rgba(0,153,255,.25);font-size:11px;color:var(--blue-glow);cursor:pointer"
             onclick="window.DPModule.removeTest('${esc(t)}',this)">
        🧪 ${esc(t)} ×
      </span>`).join('');
  }

  window.DPModule = {
    acknowledge(labId, btn) {
      const r = RESULTS.find(x => x.lab_id === labId);
      if (r) r.acknowledged = true;
      if (btn) { btn.textContent = '✅ Acknowledged'; btn.disabled = true; btn.className = 'btn btn-ghost btn-sm'; }
      toast('Result acknowledged and logged', 'success');
    },
    openHistory(lid, name) {
      document.querySelector('[data-pane="dp-history-pane"]')?.click();
      const input = document.getElementById('dp-lid-input');
      if (input) { input.value = lid; }
      setTimeout(() => document.getElementById('dp-lid-search-btn')?.click(), 100);
    },
    removeTest(test, el) {
      selectedTests.delete(test);
      renderSelectedTests();
    },
  };

  /* ─── Init ──────────────────────────────────────────────────── */
  function init() {
    initTabs();
    loadPatients();
    initHistory();
    initOrdering();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
