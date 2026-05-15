/**
 * JORINOVA NEXUS ALIS-X — IoT Analyzer Hub
 * Real-time device monitoring, calibration, maintenance, LIS connectivity
 */
'use strict';

(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ─── Demo analyzer data ────────────────────────────────────── */
  const ANALYZERS = [
    { id:1,  name:'Sysmex XN-1000', model:'XN Series', dept:'Hematology', status:'online',  state:'Running', tests_today:47, qc_pass:true,  temp:null, error:null, last_result:'2 min ago', cartridges:null },
    { id:2,  name:'Mindray BS-480', model:'Chemistry Analyzer', dept:'Chemistry', status:'online', state:'Ready', tests_today:62, qc_pass:true, temp:null, error:null, last_result:'8 min ago', cartridges:null },
    { id:3,  name:'Roche Cobas e411', model:'Immunoassay', dept:'Immunology', status:'warning', state:'Cal Due', tests_today:28, qc_pass:true, temp:null, error:'E-CAL-003: Calibration expired', last_result:'35 min ago', cartridges:null },
    { id:4,  name:'GeneXpert MTB/RIF', model:'Cepheid GeneXpert VIII', dept:'Molecular', status:'online', state:'Ready', tests_today:6, qc_pass:true, temp:null, error:null, last_result:'1 hr ago', cartridges:3 },
    { id:5,  name:'BD BACTEC FX', model:'Blood Culture System', dept:'Microbiology', status:'online', state:'Incubating', tests_today:12, qc_pass:true, temp:36.5, error:null, last_result:'Continuous', cartridges:null },
    { id:6,  name:'Tosoh G8', model:'HbA1c / Hb Variants', dept:'Hematology', status:'online', state:'Ready', tests_today:18, qc_pass:true, temp:null, error:null, last_result:'22 min ago', cartridges:null },
    { id:7,  name:'Werfen ACL 700', model:'Coagulation Analyzer', dept:'Coagulation', status:'online', state:'Ready', tests_today:23, qc_pass:true, temp:null, error:null, last_result:'15 min ago', cartridges:null },
    { id:8,  name:'Abaxis Piccolo', model:'Point-of-Care Chemistry', dept:'POC', status:'offline', state:'No Power', tests_today:0, qc_pass:false, temp:null, error:'E-PWR-001: Battery failure', last_result:'3 hrs ago', cartridges:null },
    { id:9,  name:'BD FACSCount', model:'CD4 Counter', dept:'Immunology', status:'standby', state:'Standby', tests_today:4, qc_pass:true, temp:null, error:null, last_result:'2 hrs ago', cartridges:null },
    { id:10, name:'Hettich Centrifuge', model:'Rotanta 460', dept:'Central Lab', status:'online', state:'Idle', tests_today:null, qc_pass:null, temp:null, error:null, last_result:'10 min ago', cartridges:null },
    { id:11, name:'BSC Class II A2', model:'Biosafety Cabinet #1', dept:'Microbiology', status:'online', state:'Certified ✅', tests_today:null, qc_pass:true, temp:null, error:null, last_result:'Continuous', cartridges:null },
    { id:12, name:'Blood Bank Fridge #1', model:'Helmer iLR105', dept:'Blood Bank', status:'warning', state:'Temp Alert', tests_today:null, qc_pass:null, temp:7.2, error:'⚠️ Temp 7.2°C — above 6°C limit!', last_result:'Continuous', cartridges:null },
  ];

  function renderAnalyzerCard(a) {
    const statusClass = `status-${a.status}`;
    const dotClass    = `dot-${a.status}`;
    return `<div class="analyzer-card ${statusClass}" id="analyzer-${a.id}">
      <div class="analyzer-status-bar"></div>
      <div class="analyzer-card-header">
        <div>
          <div class="analyzer-name">${esc(a.name)}</div>
          <div class="analyzer-model">${esc(a.model)} · ${esc(a.dept)}</div>
        </div>
        <div class="analyzer-status-dot ${dotClass}"></div>
      </div>
      <div class="analyzer-metrics">
        <div class="analyzer-metric">
          <div class="am-label">Status</div>
          <div class="am-value" style="${a.status==='offline'?'color:var(--alert-red)':a.status==='warning'?'color:var(--alert-orange)':a.status==='online'?'color:var(--alert-green)':'color:var(--text-muted)'}">${esc(a.state)}</div>
        </div>
        <div class="analyzer-metric">
          <div class="am-label">Last Result</div>
          <div class="am-value">${esc(a.last_result)}</div>
        </div>
        ${a.tests_today !== null ? `<div class="analyzer-metric"><div class="am-label">Tests Today</div><div class="am-value">${a.tests_today}</div></div>` : '<div class="analyzer-metric"><div class="am-label">Mode</div><div class="am-value">N/A</div></div>'}
        ${a.qc_pass !== null ? `<div class="analyzer-metric"><div class="am-label">QC Status</div><div class="am-value"><span class="qc-pill ${a.qc_pass?'pass':'fail'}">${a.qc_pass?'✅ Pass':'❌ Fail'}</span></div></div>` : ''}
        ${a.temp !== null ? `<div class="analyzer-metric"><div class="am-label">Temperature</div><div class="am-value"><span class="temp-value ${a.temp > 6 ? 'alert':'normal'}">${a.temp}°C</span></div></div>` : ''}
        ${a.cartridges !== null ? `<div class="analyzer-metric"><div class="am-label">Cartridges</div><div class="am-value" style="color:${a.cartridges < 5 ? 'var(--alert-orange)':'var(--text-primary)'}">${a.cartridges} remaining</div></div>` : ''}
      </div>
      ${a.error ? `<div class="analyzer-error-banner">🔴 <span class="error-code">ERROR</span> ${esc(a.error)}</div>` : ''}
    </div>`;
  }

  function renderDashboard() {
    const grid = document.getElementById('analyzer-grid');
    if (!grid) return;
    grid.innerHTML = ANALYZERS.map(renderAnalyzerCard).join('');
    document.getElementById('sum-online')  && (document.getElementById('sum-online').textContent  = ANALYZERS.filter(a=>a.status==='online').length);
    document.getElementById('sum-offline') && (document.getElementById('sum-offline').textContent = ANALYZERS.filter(a=>a.status==='offline').length);
    document.getElementById('sum-warning') && (document.getElementById('sum-warning').textContent = ANALYZERS.filter(a=>a.status==='warning').length);
    document.getElementById('sum-alerts')  && (document.getElementById('sum-alerts').textContent  = ANALYZERS.filter(a=>a.error).length);
    document.getElementById('sum-today')   && (document.getElementById('sum-today').textContent   = ANALYZERS.reduce((s,a)=>s+(a.tests_today||0),0));
  }

  /* ─── Tab switching ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.iot-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.iot-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.iot-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.pane);
        if (pane) pane.classList.add('active');
        const actions = {
          'iot-calibration-pane': loadCalibration,
          'iot-maintenance-pane': loadMaintenance,
          'iot-connectivity-pane': loadConnectivity,
        };
        actions[btn.dataset.pane]?.();
      });
    });
    document.getElementById('iot-refresh-all')?.addEventListener('click', renderDashboard);
  }

  /* ─── Calibration ───────────────────────────────────────────── */
  function loadCalibration() {
    const tbody = document.getElementById('cal-table-body');
    if (!tbody || tbody.innerHTML !== '') return;
    const data = [
      { analyzer:'Sysmex XN-1000', calibrator:'Sysmex E-CHECK', freq:'Daily', last:'2026-05-14', next:'2026-05-15', days:1, pass:true },
      { analyzer:'Mindray BS-480', calibrator:'Mindray Cal Set', freq:'Weekly', last:'2026-05-11', next:'2026-05-18', days:3, pass:true },
      { analyzer:'Roche Cobas e411', calibrator:'Roche CalSet', freq:'2 weeks', last:'2026-04-28', next:'2026-05-12', days:-3, pass:false },
      { analyzer:'Tosoh G8', calibrator:'Tosoh Calibrator', freq:'Monthly', last:'2026-05-01', next:'2026-06-01', days:17, pass:true },
      { analyzer:'Werfen ACL 700', calibrator:'Normal/Ab plasma', freq:'Weekly', last:'2026-05-10', next:'2026-05-17', days:2, pass:true },
      { analyzer:'BD FACSCount', calibrator:'CD4 Calibrators', freq:'Monthly', last:'2026-04-15', next:'2026-05-15', days:0, pass:true },
    ];
    tbody.innerHTML = data.map(d => `<tr>
      <td><strong>${esc(d.analyzer)}</strong></td>
      <td style="font-size:var(--text-xs)">${esc(d.calibrator)}</td>
      <td><span class="badge badge-blue">${esc(d.freq)}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(d.last)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(d.next)}</td>
      <td><span class="cal-due-badge ${d.days < 0 ? 'cal-overdue' : d.days <= 2 ? 'cal-soon' : 'cal-ok'}">${d.days < 0 ? `${Math.abs(d.days)}d overdue` : d.days === 0 ? 'TODAY' : `${d.days}d left`}</span></td>
      <td><span class="badge ${d.pass?'badge-green':'badge-red'}">${d.pass?'✅ Pass':'❌ Failed'}</span></td>
      <td><button class="btn btn-primary btn-sm">✅ Mark Done</button></td>
    </tr>`).join('');
  }

  /* ─── Maintenance ───────────────────────────────────────────── */
  function loadMaintenance() {
    const tbody = document.getElementById('maint-table-body');
    if (!tbody || tbody.innerHTML !== '') return;
    const data = [
      { analyzer:'Sysmex XN-1000', task:'Daily probe cleaning + sheath fluid check', type:'Daily PM', by:'Lab Tech', date:'2026-05-14', next:'2026-05-15', done:true },
      { analyzer:'BD BACTEC FX', task:'Weekly incubator temperature verification', type:'Weekly PM', by:'Lab Manager', date:'2026-05-12', next:'2026-05-19', done:true },
      { analyzer:'Abaxis Piccolo', task:'Battery replacement — dead battery', type:'Repair', by:'IT Admin', date:'2026-05-15', next:'—', done:false },
      { analyzer:'Blood Bank Fridge #1', task:'Temperature recalibration + door seal inspection', type:'Urgent Repair', by:'Biomedical Eng', date:'—', next:'2026-05-15', done:false },
      { analyzer:'Hettich Centrifuge', task:'Monthly rotor inspection + balance check', type:'Monthly PM', by:'Lab Tech', date:'2026-05-01', next:'2026-06-01', done:true },
    ];
    tbody.innerHTML = data.map(d => `<tr>
      <td><strong>${esc(d.analyzer)}</strong></td>
      <td style="font-size:var(--text-xs)">${esc(d.task)}</td>
      <td><span class="badge ${d.type.includes('Urgent')||d.type==='Repair'?'badge-red':'badge-blue'}">${esc(d.type)}</span></td>
      <td style="font-size:var(--text-xs);color:var(--text-muted)">${esc(d.by)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(d.date)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:${d.next==='—'?'var(--text-muted)':d.next<='2026-05-15'?'var(--alert-orange)':'var(--text-secondary)'}">${esc(d.next)}</td>
      <td><span class="badge ${d.done?'badge-green':'badge-yellow'}">${d.done?'✅ Done':'⏳ Pending'}</span></td>
    </tr>`).join('');
  }

  /* ─── Connectivity ──────────────────────────────────────────── */
  function loadConnectivity() {
    const tbody = document.getElementById('conn-table-body');
    if (!tbody || tbody.innerHTML !== '') return;
    const data = [
      { analyzer:'Sysmex XN-1000', protocol:'ASTM LIS2-A2', dir:'Bi-directional', last:'2 min ago', orders:47, results:47, ok:true },
      { analyzer:'Mindray BS-480', protocol:'HL7 v2.5', dir:'Bi-directional', last:'8 min ago', orders:62, results:61, ok:true },
      { analyzer:'Roche Cobas e411', protocol:'ASTM', dir:'Results only', last:'35 min ago', orders:0, results:28, ok:true },
      { analyzer:'GeneXpert MTB/RIF', protocol:'Serial RS-232', dir:'Results only', last:'1 hr ago', orders:0, results:6, ok:true },
      { analyzer:'Abaxis Piccolo', protocol:'USB', dir:'Manual', last:'3 hrs ago', orders:0, results:0, ok:false },
      { analyzer:'BD FACSCount', protocol:'FACS Link', dir:'Results only', last:'2 hrs ago', orders:0, results:4, ok:true },
    ];
    tbody.innerHTML = data.map(d => `<tr>
      <td><strong>${esc(d.analyzer)}</strong></td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(d.protocol)}</td>
      <td><span class="badge badge-blue">${esc(d.dir)}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(d.last)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${d.orders}</td>
      <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${d.results}</td>
      <td><span class="badge ${d.ok?'badge-green':'badge-red'}"><span class="conn-status-dot" style="background:${d.ok?'var(--alert-green)':'var(--alert-red)'}"></span>${d.ok?'Connected':'Disconnected'}</span></td>
    </tr>`).join('');
  }

  /* ─── Polling (temp update simulation) ──────────────────────── */
  function startPolling() {
    setInterval(() => {
      const fridgeCard = document.getElementById('analyzer-12');
      if (!fridgeCard) return;
      const newTemp = (7.0 + Math.random() * 0.5).toFixed(1);
      const tempEl  = fridgeCard.querySelector('.temp-value');
      if (tempEl) tempEl.textContent = newTemp + '°C';
    }, 30000);
  }

  /* ─── Init ──────────────────────────────────────────────────── */
  function init() { initTabs(); renderDashboard(); startPolling(); }
  document.addEventListener('DOMContentLoaded', init);
})();
