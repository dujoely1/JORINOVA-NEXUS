/**
 * JORINOVA NEXUS ALIS-X — Quality Management System
 * IQC Levey-Jennings · Westgard Rules · EQA · SOP · NCR/CAPA · ISO 15189
 */
'use strict';

(function () {
  const CSRF  = () => window.NEXUS?.csrf || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ─── Tab switching ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.qm-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qm-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.qm-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.pane);
        if (pane) pane.classList.add('active');
        const actions = {
          'qm-dashboard-pane': loadDashboard,
          'qm-iqc-pane':       () => {},
          'qm-eqa-pane':       loadEQA,
          'qm-sop-pane':       loadSOPs,
          'qm-ncr-pane':       loadNCR,
          'qm-iso-pane':       loadISO,
        };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     WESTGARD RULES ENGINE
  ══════════════════════════════════════════════════════════════ */
  function checkWestgard(values, mean, sd) {
    const violations = [];
    const n = values.length;

    values.forEach((v, i) => {
      const z = (v - mean) / sd;
      if (Math.abs(z) >= 3) violations.push({ rule:'1:3S', idx:i, z, msg:`Run ${i+1}: value ${v.toFixed(2)} exceeds ±3SD — REJECT` });
    });

    // 2:2S — two consecutive on same side beyond 2SD
    for (let i = 1; i < n; i++) {
      const z1 = (values[i-1] - mean) / sd;
      const z2 = (values[i]   - mean) / sd;
      if (z1 > 2 && z2 > 2)   violations.push({ rule:'2:2S', idx:i, msg:`Runs ${i},${i+1}: two consecutive >+2SD — REJECT` });
      if (z1 < -2 && z2 < -2) violations.push({ rule:'2:2S', idx:i, msg:`Runs ${i},${i+1}: two consecutive <-2SD — REJECT` });
    }

    // 4:1S — four consecutive >1SD same side
    for (let i = 3; i < n; i++) {
      const zs = [values[i-3],values[i-2],values[i-1],values[i]].map(v => (v - mean)/sd);
      if (zs.every(z => z > 1))  violations.push({ rule:'4:1S', idx:i, msg:`Runs ${i-2}–${i+1}: four consecutive >+1SD — REJECT` });
      if (zs.every(z => z < -1)) violations.push({ rule:'4:1S', idx:i, msg:`Runs ${i-2}–${i+1}: four consecutive <-1SD — REJECT` });
    }

    // 10x — ten consecutive same side of mean
    for (let i = 9; i < n; i++) {
      const zs = values.slice(i-9, i+1).map(v => (v - mean)/sd);
      if (zs.every(z => z > 0)) violations.push({ rule:'10x', idx:i, msg:`Runs ${i-8}–${i+1}: 10 consecutive above mean — REJECT (systematic error)` });
      if (zs.every(z => z < 0)) violations.push({ rule:'10x', idx:i, msg:`Runs ${i-8}–${i+1}: 10 consecutive below mean — REJECT (systematic error)` });
    }

    // Warnings: 1:2S
    const warnings = [];
    values.forEach((v, i) => {
      const z = (v - mean) / sd;
      if (Math.abs(z) >= 2 && Math.abs(z) < 3) warnings.push(i);
    });

    return { violations, warnings };
  }

  /* ─── Point color classification ─────────────────────────── */
  function classifyPoints(values, mean, sd, violations) {
    const violIdx = new Set(violations.map(v => v.idx));
    return values.map((v, i) => {
      const z = Math.abs((v - mean) / sd);
      if (violIdx.has(i) || z >= 3) return '#FF1744';
      if (z >= 2) return '#FFD600';
      return '#00E676';
    });
  }

  /* ─── Demo IQC data generator ───────────────────────────── */
  const IQC_TARGETS = {
    glucose:     { mean:5.50, sd:0.15, target:5.50, unit:'mmol/L' },
    creatinine:  { mean:88.0, sd:4.5,  target:88.0, unit:'µmol/L' },
    hgb:         { mean:12.5, sd:0.30, target:12.5, unit:'g/dL'   },
    sodium:      { mean:140,  sd:2.0,  target:140,  unit:'mmol/L' },
    potassium:   { mean:4.20, sd:0.12, target:4.20, unit:'mmol/L' },
    cholesterol: { mean:5.20, sd:0.20, target:5.20, unit:'mmol/L' },
    alt:         { mean:35.0, sd:3.0,  target:35.0, unit:'U/L'    },
    ast:         { mean:32.0, sd:3.0,  target:32.0, unit:'U/L'    },
  };

  function generateDemoIQC(analyte, level, nRuns) {
    const t = IQC_TARGETS[analyte] || IQC_TARGETS.glucose;
    let m = t.mean, sd = t.sd;
    if (level === 'low')  m = t.mean * 0.7;
    if (level === 'high') m = t.mean * 1.4;

    const rng = (seed => { let s = seed; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }; })(Date.now());

    const vals = [];
    let drift = 0;
    for (let i = 0; i < nRuns; i++) {
      drift += (rng() - 0.5) * 0.04;
      drift = Math.max(-0.8, Math.min(0.8, drift));
      vals.push(parseFloat((m + drift * sd + (rng() - 0.5) * 2 * sd).toFixed(3)));
    }
    // Inject a 1:3S violation for demo
    vals[Math.floor(nRuns * 0.7)] = parseFloat((m + 3.2 * sd).toFixed(3));
    return { values: vals, mean: m, sd, unit: t.unit };
  }

  let _ljChart = null;

  function renderLJ(analyte, level, nRuns, canvasId, compact) {
    const d = generateDemoIQC(analyte, level, nRuns);
    const wg = checkWestgard(d.values, d.mean, d.sd);
    const colors = classifyPoints(d.values, d.mean, d.sd, wg.violations);
    const labels = d.values.map((_, i) => `R${i+1}`);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (_ljChart && canvasId === 'lj-main-chart') { _ljChart.destroy(); _ljChart = null; }

    const sdLines = (mult) => d.values.map(() => d.mean + mult * d.sd);
    const datasets = [
      { label:`+3SD`, data:sdLines(3),  borderColor:'rgba(255,23,68,.5)',  borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, tension:0 },
      { label:`+2SD`, data:sdLines(2),  borderColor:'rgba(255,214,0,.5)', borderWidth:1,   borderDash:[4,4], pointRadius:0, fill:false, tension:0 },
      { label:`Mean`, data:sdLines(0),  borderColor:'rgba(0,170,255,.6)', borderWidth:1.5, pointRadius:0, fill:false, tension:0 },
      { label:`-2SD`, data:sdLines(-2), borderColor:'rgba(255,214,0,.5)', borderWidth:1,   borderDash:[4,4], pointRadius:0, fill:false, tension:0 },
      { label:`-3SD`, data:sdLines(-3), borderColor:'rgba(255,23,68,.5)',  borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false, tension:0 },
      {
        label:`${analyte} (${level})`,
        data:d.values, borderColor:'rgba(0,200,255,.5)', borderWidth:1.5,
        pointBackgroundColor:colors, pointBorderColor:colors,
        pointRadius:compact?4:6, pointHoverRadius:8, fill:false, tension:0.15,
      },
    ];
    const chart = new Chart(canvas, {
      type:'line',
      data:{ labels, datasets },
      options:{
        responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.dataset.label===`${analyte} (${level})`?`Value: ${ctx.raw} ${d.unit} | z=${((ctx.raw-d.mean)/d.sd).toFixed(2)}`:''}}},
        scales:{
          x:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#8899aa',font:{size:10}}, display:!compact },
          y:{ grid:{color:'rgba(255,255,255,.06)'}, ticks:{color:'#8899aa',font:{size:10}}, title:{display:!compact,text:`${analyte} (${d.unit})`,color:'#8899aa'} }
        }
      }
    });
    if (canvasId === 'lj-main-chart') _ljChart = chart;

    return { wg, data:d };
  }

  /* ─── Dashboard ─────────────────────────────────────────────── */
  function loadDashboard() {
    const el = id => document.getElementById(id);
    if (el('kpi-iqc-pass'))    el('kpi-iqc-pass').textContent = '94.2%';
    if (el('kpi-eqa-pass'))    el('kpi-eqa-pass').textContent = '91.7%';
    if (el('kpi-open-ncr'))    el('kpi-open-ncr').textContent = '7';
    if (el('kpi-overdue-capa'))el('kpi-overdue-capa').textContent = '2';
    if (el('kpi-iso-score'))   el('kpi-iso-score').textContent = '73%';

    setTimeout(() => {
      renderLJ('glucose', 'normal', 20, 'lj-dash-chart', true);
    }, 100);

    const ncr = document.getElementById('ncr-dash-list');
    if (ncr) {
      const items = [
        { id:'NCR-025', type:'Analytical', sev:'major',   desc:'QC failure — Glucose, 2 consecutive rejections' },
        { id:'NCR-026', type:'Pre-analytical', sev:'moderate', desc:'Hemolysed sample accepted — CBC' },
        { id:'NCR-027', type:'Equipment', sev:'minor',    desc:'Centrifuge timer deviation ±15s' },
      ];
      ncr.innerHTML = items.map(i => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border-dim);font-size:var(--text-xs)">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-family:var(--font-mono);color:var(--cyan)">${esc(i.id)}</span>
            <span class="badge ${i.sev==='major'?'badge-orange':i.sev==='moderate'?'badge-yellow':'badge-blue'}">${esc(i.sev)}</span>
          </div>
          <div style="color:var(--text-secondary);margin-top:3px">${esc(i.desc)}</div>
        </div>`).join('');
    }
  }

  /* ─── IQC Tab ────────────────────────────────────────────────── */
  function initIQC() {
    document.getElementById('iqc-load-btn')?.addEventListener('click', () => {
      const analyte = document.getElementById('iqc-analyte')?.value || 'glucose';
      const level   = document.getElementById('iqc-level')?.value   || 'normal';
      const nRuns   = parseInt(document.getElementById('iqc-days')?.value) || 20;
      document.getElementById('iqc-stats-row').style.display = 'flex';

      const result = renderLJ(analyte, level, nRuns, 'lj-main-chart', false);
      if (!result) return;
      const { wg, data:d } = result;

      const mean = d.values.reduce((a,b)=>a+b,0)/d.values.length;
      const sd = Math.sqrt(d.values.reduce((a,b)=>a+(b-mean)**2,0)/d.values.length);
      const cv = (sd/mean*100).toFixed(1);
      const bias = ((mean - d.mean)/d.mean*100).toFixed(1);

      const el = id => document.getElementById(id);
      if (el('iqc-mean'))       el('iqc-mean').textContent = mean.toFixed(2) + ` ${d.unit}`;
      if (el('iqc-sd'))         el('iqc-sd').textContent   = sd.toFixed(3);
      if (el('iqc-cv'))         el('iqc-cv').textContent   = cv + '%';
      if (el('iqc-bias'))       el('iqc-bias').textContent = bias + '%';
      if (el('iqc-runs'))       el('iqc-runs').textContent = nRuns;
      if (el('iqc-violations')) el('iqc-violations').textContent = wg.violations.length || '0 ✅';

      const alertEl = document.getElementById('iqc-westgard-alert');
      if (alertEl) {
        if (wg.violations.length) {
          alertEl.style.display = 'flex';
          alertEl.innerHTML = `⚠️ Westgard Rule Violation${wg.violations.length>1?'s':''} —
            ${wg.violations.slice(0,3).map(v=>`<span class="westgard-rule-badge">${esc(v.rule)}</span>`).join(' ')}
            <br><small>${wg.violations[0].msg}</small>
            <strong style="margin-left:auto;color:var(--alert-red)">⛔ INSTRUMENT LOCKOUT RECOMMENDED</strong>`;
        } else {
          alertEl.style.display = 'none';
        }
      }
    });
  }

  /* ─── EQA ────────────────────────────────────────────────────── */
  function loadEQA() {
    const tbody = document.getElementById('eqa-table-body');
    if (!tbody || tbody.innerHTML !== '') return;
    const EQA = [
      { prog:'RIQAS Chemistry', provider:'Bio-Rad', analytes:'Glucose, Creat, Na, K, ALT, AST', cycle:'Monthly', deadline:'2026-05-31', z:0.4, pass:true },
      { prog:'NEQAS Hematology', provider:'UKNEQAS', analytes:'CBC, Differential', cycle:'Monthly', deadline:'2026-05-25', z:1.1, pass:true },
      { prog:'RIQAS Immunology', provider:'Bio-Rad', analytes:'HbA1c, TSH, FT4', cycle:'Quarterly', deadline:'2026-06-15', z:2.3, pass:false },
      { prog:'RBC EQA Blood Bank', provider:'RBC Rwanda', analytes:'ABO, Rh, Crossmatch', cycle:'Quarterly', deadline:'2026-06-30', z:0.2, pass:true },
      { prog:'WHO Malaria EQS', provider:'WHO AFRO', analytes:'Malaria Microscopy', cycle:'Biannual', deadline:'2026-07-01', z:0.8, pass:true },
    ];
    tbody.innerHTML = EQA.map(e => `<tr>
      <td><strong>${esc(e.prog)}</strong></td>
      <td style="font-size:var(--text-xs);color:var(--text-muted)">${esc(e.provider)}</td>
      <td style="font-size:var(--text-xs)">${esc(e.analytes)}</td>
      <td><span class="badge badge-blue">${esc(e.cycle)}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px;color:${e.deadline < '2026-05-20' ? 'var(--alert-orange)':'var(--text-secondary)'}">${esc(e.deadline)}</td>
      <td><span class="eqa-z-badge ${Math.abs(e.z)<2?'eqa-z-pass':Math.abs(e.z)<3?'eqa-z-warn':'eqa-z-fail'}">${e.z >= 0 ? '+':''}${e.z}</span></td>
      <td><span class="badge ${e.pass?'badge-green':'badge-red'}">${e.pass?'✅ Pass':'❌ Fail'}</span></td>
      <td><button class="btn btn-ghost btn-sm">📤 Submit</button></td>
    </tr>`).join('');

    const canvas = document.getElementById('eqa-zscore-chart');
    if (canvas && window.Chart) {
      const labels = ['Q3 2025','Q4 2025','Q1 2026','Q2 2026'];
      new Chart(canvas, {
        type:'bar',
        data:{ labels, datasets:[
          { label:'Glucose', data:[0.3,0.5,0.2,0.4], backgroundColor:'rgba(0,200,255,.5)', borderRadius:3 },
          { label:'HbA1c', data:[1.2,1.8,2.1,2.3], backgroundColor:'rgba(255,109,0,.5)', borderRadius:3 },
          { label:'CBC', data:[0.8,0.5,0.7,1.1], backgroundColor:'rgba(0,230,118,.5)', borderRadius:3 },
        ]},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{legend:{labels:{color:'#aab'}}},
          scales:{
            y:{ min:-3, max:3, grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#8899aa'},
              title:{display:true,text:'Z-Score',color:'#8899aa'} },
            x:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#8899aa'} }
          }
        }
      });
    }
  }

  /* ─── SOPs ────────────────────────────────────────────────────── */
  function loadSOPs() {
    const tbody = document.getElementById('sop-table-body');
    if (!tbody || tbody.innerHTML !== '') return;
    const SOPS = [
      { code:'SOP-HEM-001', title:'CBC Analysis — Sysmex XN-1000', dept:'Hematology', ver:'3.1', review:'2026-08-01', signoffs:'12/14', status:'current' },
      { code:'SOP-CHM-005', title:'Glucose — Hexokinase Method', dept:'Chemistry', ver:'2.4', review:'2026-05-20', signoffs:'8/10', status:'review' },
      { code:'SOP-MIC-003', title:'Blood Culture Protocol', dept:'Microbiology', ver:'1.8', review:'2025-12-01', signoffs:'6/9', status:'overdue' },
      { code:'SOP-BB-002', title:'Crossmatch — IAT Technique', dept:'Blood Bank', ver:'4.0', review:'2026-10-15', signoffs:'5/5', status:'current' },
      { code:'SOP-QC-001', title:'IQC Procedure — Westgard Rules', dept:'Quality', ver:'2.2', review:'2026-07-30', signoffs:'14/14', status:'current' },
      { code:'SOP-SER-004', title:'HIV Rapid Test Algorithm', dept:'Serology', ver:'3.3', review:'2026-06-01', signoffs:'9/11', status:'current' },
    ];
    tbody.innerHTML = SOPS.map(s => `<tr>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(s.code)}</span></td>
      <td><strong style="font-size:var(--text-sm)">${esc(s.title)}</strong></td>
      <td><span class="badge badge-blue">${esc(s.dept)}</span></td>
      <td><span class="badge badge-blue">v${esc(s.ver)}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px;color:${s.status==='overdue'?'var(--alert-red)':s.status==='review'?'var(--alert-yellow)':'var(--text-muted)'}">${esc(s.review)}</td>
      <td style="font-size:var(--text-xs);color:var(--text-muted)">${esc(s.signoffs)}</td>
      <td><span class="sop-status-badge sop-${s.status}">${s.status==='current'?'✅ Current':s.status==='review'?'⚠️ Review Due':'❌ Overdue'}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm">👁️ View</button>
        <button class="btn btn-ghost btn-sm">✍️ Sign</button>
      </td>
    </tr>`).join('');
  }

  /* ─── NCR & CAPA ──────────────────────────────────────────────── */
  function loadNCR() {
    const tbody = document.getElementById('ncr-table-body');
    if (!tbody || tbody.innerHTML !== '') return;
    const NCRS = [
      { id:'NCR-025', type:'Analytical', sev:'major', owner:'Lab Manager', due:'2026-05-20', status:'Open' },
      { id:'NCR-026', type:'Pre-analytical', sev:'moderate', owner:'Phlebotomist', due:'2026-05-25', status:'In Progress' },
      { id:'NCR-027', type:'Equipment', sev:'minor', owner:'IT Admin', due:'2026-06-01', status:'Open' },
      { id:'NCR-023', type:'Documentation', sev:'moderate', owner:'Lab Technician', due:'2026-05-18', status:'Overdue' },
    ];
    tbody.innerHTML = NCRS.map(n => `<tr class="ncr-severity-${n.sev}">
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(n.id)}</span></td>
      <td>${esc(n.type)}</td>
      <td><span class="badge ${n.sev==='major'?'badge-orange':n.sev==='moderate'?'badge-yellow':'badge-blue'}">${esc(n.sev)}</span></td>
      <td style="font-size:var(--text-xs)">${esc(n.owner)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:${n.status==='Overdue'?'var(--alert-red)':'var(--text-secondary)'}">${esc(n.due)}</td>
      <td><span class="badge ${n.status==='Overdue'?'badge-red':n.status==='In Progress'?'badge-blue':'badge-yellow'}">${esc(n.status)}</span></td>
    </tr>`).join('');

    const capaList = document.getElementById('capa-list');
    if (capaList) {
      const capas = [
        { id:'CAPA-012', ncr:'NCR-025', title:'Instrument recalibration + QC rerun', steps:4, done:2 },
        { id:'CAPA-011', ncr:'NCR-023', title:'Documentation retraining for lab staff', steps:3, done:3 },
        { id:'CAPA-013', ncr:'NCR-026', title:'Sample rejection protocol revision', steps:5, done:1 },
      ];
      capaList.innerHTML = capas.map(c => `
        <div class="capa-card">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(c.id)}</span>
            <span class="badge badge-blue">${esc(c.ncr)}</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px">${esc(c.title)}</div>
          <div class="capa-steps" style="margin-top:var(--space-sm)">
            ${Array.from({length:c.steps}).map((_,i)=>
              `<div class="capa-step ${i<c.done?'done':i===c.done?'active':''}"></div>`).join('')}
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Step ${c.done}/${c.steps} · ${c.done===c.steps?'Closed':'In Progress'}</div>
        </div>`).join('');
    }

    const modal = document.getElementById('ncr-modal-overlay');
    document.getElementById('new-ncr-btn')?.addEventListener('click', () => { if(modal) modal.style.display='flex'; });
    document.getElementById('ncr-modal-close')?.addEventListener('click', () => { if(modal) modal.style.display='none'; });
    document.getElementById('ncr-cancel-btn')?.addEventListener('click', () => { if(modal) modal.style.display='none'; });
    document.getElementById('ncr-submit-btn')?.addEventListener('click', () => {
      toast?.('NCR submitted successfully', 'success');
      if(modal) modal.style.display='none';
    });
  }

  /* ─── ISO 15189 Checklist ─────────────────────────────────────── */
  const ISO_CLAUSES = [
    { code:'4.1',  title:'Impartiality', status:'compliant' },
    { code:'4.2',  title:'Confidentiality', status:'compliant' },
    { code:'5.1',  title:'Legal Entity', status:'compliant' },
    { code:'5.5',  title:'Organizational Structure', status:'partial' },
    { code:'6.1',  title:'Personnel', status:'compliant' },
    { code:'6.2',  title:'Facilities & Environmental Conditions', status:'partial' },
    { code:'6.3',  title:'Equipment, Reagents & Consumables', status:'compliant' },
    { code:'6.4',  title:'Equipment Calibration & Metrological Traceability', status:'partial' },
    { code:'6.5',  title:'Externally Provided Products & Services', status:'compliant' },
    { code:'7.1',  title:'Review of Requests & Tenders', status:'compliant' },
    { code:'7.3',  title:'Pre-examination Processes', status:'partial' },
    { code:'7.4',  title:'Examination Processes', status:'compliant' },
    { code:'7.5',  title:'Ensuring Quality of Examination Results', status:'partial' },
    { code:'7.6',  title:'Post-examination Processes', status:'compliant' },
    { code:'7.7',  title:'Management of Nonconforming Work', status:'partial' },
    { code:'7.8',  title:'Control of Data & Information Management', status:'non_compliant' },
    { code:'8.1',  title:'Options for Improvement', status:'compliant' },
    { code:'8.3',  title:'Control of Nonconformities', status:'partial' },
    { code:'8.6',  title:'Internal Audits', status:'non_compliant' },
    { code:'8.7',  title:'Management Reviews', status:'partial' },
    { code:'8.8',  title:'Complaints', status:'compliant' },
  ];

  function loadISO() {
    const container = document.getElementById('iso-checklist');
    if (!container) return;

    let filter = '';
    function render() {
      const clauses = filter ? ISO_CLAUSES.filter(c => c.status === filter) : ISO_CLAUSES;
      container.innerHTML = clauses.map(c => `
        <div class="iso-clause-row" data-status="${c.status}">
          <span class="iso-clause-code">${esc(c.code)}</span>
          <span style="font-size:var(--text-xs);color:var(--text-secondary)">${esc(c.title)}</span>
          <span class="iso-status-badge iso-${c.status.replace('_','-')}">
            ${c.status==='compliant'?'✅ Compliant':c.status==='partial'?'⚠️ Partial':c.status==='non_compliant'?'❌ Non-Compliant':'— N/A'}
          </span>
          <button class="btn btn-ghost btn-sm" style="font-size:10px">📋 Evidence</button>
        </div>`).join('');
    }
    render();

    document.querySelectorAll('.iso-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.iso-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filter = btn.dataset.filter;
        render();
      });
    });

    const total = ISO_CLAUSES.length;
    const compliant = ISO_CLAUSES.filter(c => c.status === 'compliant').length;
    const partial   = ISO_CLAUSES.filter(c => c.status === 'partial').length;
    const pct = Math.round((compliant + partial * 0.5) / total * 100);
    const pctEl = document.getElementById('iso-compliance-pct');
    if (pctEl) pctEl.textContent = pct + '%';
    const arc = document.getElementById('iso-gauge-arc');
    if (arc) {
      const circumference = 2 * Math.PI * 68;
      arc.setAttribute('stroke-dashoffset', (circumference * (1 - pct/100)).toFixed(1));
    }
    document.getElementById('kpi-iso-score') && (document.getElementById('kpi-iso-score').textContent = pct + '%');
  }

  /* ─── Init ──────────────────────────────────────────────────── */
  function init() {
    initTabs();
    initIQC();
    loadDashboard();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
