/**
 * JORINOVA NEXUS ALIS-X — Specimen Tracking, Labeling & Chain of Custody
 * Barcode labels · QR codes · Chain of custody · AI verification · Rejections
 * ISO 15189 — Full audit trail
 */
'use strict';

(function () {
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);
  const SHIFT = () => window.NEXUS?.ShiftEngine?.currentTag?.() || '☀️ Morning';

  /* Tube color map */
  const TUBE_COLORS = {
    purple_edta:'#9B59B6', red_plain:'#E74C3C', yellow_sst:'#F39C12',
    blue_citrate:'#2980B9', green_heparin:'#27AE60', grey_fluoride:'#95A5A6',
    urine_container:'#F1C40F', stool_container:'#784212', swab:'#EB984E', other:'#BDC3C7',
  };

  /* Demo sample data */
  const DEMO_SAMPLES = [
    { sid:'HEM-0515-001', pid:'RWA-2024-00142', lid:'NXS-LID-2024-0000142', name:'KAMANZI Jean', dept:'Hematology', tube:'purple_edta', status:'processing', tat_pct:72, location:'Hematology Analyzer 1' },
    { sid:'CHM-0515-001', pid:'RWA-2024-00287', lid:'NXS-LID-2024-0000287', name:'UWIMANA Grace', dept:'Chemistry', tube:'yellow_sst', status:'received', tat_pct:35, location:'Chemistry — Centrifuge' },
    { sid:'MIC-0515-001', pid:'RWA-2024-00388', lid:'NXS-LID-2024-0000388', name:'HABIMANA Eric', dept:'Microbiology', tube:'red_plain', status:'received', tat_pct:20, location:'BSC Cabinet #1' },
    { sid:'SER-0515-001', pid:'RWA-2024-00501', lid:'NXS-LID-2024-0000501', name:'MUKAMANA Rose', dept:'Serology', tube:'yellow_sst', status:'processing', tat_pct:88, location:'Serology Bench' },
  ];

  const DEMO_CUSTODY = [
    { sid:'HEM-0515-001', events:[
      { type:'ordered', label:'📋 Test Ordered', loc:'Reception', by:'MUKAMANA (Receptionist)', shift:'☀️ Morning', device:'REC-PC-01', time:'08:05', note:'CBC + ESR ordered by Dr. UWERA' },
      { type:'collected', label:'🩸 Collected', loc:'Collection Room A', by:'KAMANZI (Phlebotomist)', shift:'☀️ Morning', device:'SCANNER-01', time:'08:32', note:'Purple EDTA 3mL — patient fasting confirmed' },
      { type:'labeled', label:'🏷️ Labeled', loc:'Collection Room A', by:'KAMANZI (Phlebotomist)', shift:'☀️ Morning', device:'PRINTER-01', time:'08:33', note:'Barcode label printed — AI verification passed' },
      { type:'received', label:'📦 Received in Lab', loc:'Hematology Reception', by:'HABIMANA (Lab Tech)', shift:'☀️ Morning', device:'SCANNER-02', time:'08:45', note:'Sample received — condition: acceptable' },
      { type:'processing', label:'⚗️ Processing', loc:'Hematology Analyzer 1 (Sysmex XN-1000)', by:'HABIMANA (Lab Tech)', shift:'☀️ Morning', device:'SYSMEX-01', time:'09:02', note:'CBC loaded on analyzer' },
    ]},
  ];

  function initTabs() {
    document.querySelectorAll('.spec-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.spec-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.spec-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        const actions = {
          'spec-tracking-pane':  loadActiveSamples,
          'spec-custody-pane':   loadCustodyEvents,
          'spec-rejection-pane': loadRejections,
        };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  /* ─── LABEL GENERATION ──────────────────────────────────────── */
  function generateLabelHTML(sample, barcodeType) {
    const color = TUBE_COLORS[sample.tube] || '#BDC3C7';
    const shift = SHIFT();
    const now   = new Date();
    const dt    = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    const qrMock= barcodeType === 'qr' ? `<div style="width:38px;height:38px;background:url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"40\" height=\"40\" fill=\"%23000\"/><rect x=\"60\" width=\"40\" height=\"40\" fill=\"%23000\"/><rect y=\"60\" width=\"40\" height=\"40\" fill=\"%23000\"/><rect x=\"10\" y=\"10\" width=\"20\" height=\"20\" fill=\"%23fff\"/><rect x=\"70\" y=\"10\" width=\"20\" height=\"20\" fill=\"%23fff\"/><rect x=\"10\" y=\"70\" width=\"20\" height=\"20\" fill=\"%23fff\"/></svg>') center/contain no-repeat;border:1px solid #ccc"></div>` : '';

    return `
      <div class="tube-label">
        <div class="tube-label-color-bar" style="background:${color}"></div>
        <div class="tube-label-body">
          <div class="tube-label-name">${esc(sample.name)} · ${esc(sample.dept?.charAt?sample.dept.charAt(0):'')}${sample.age ? ' · '+sample.age : ''}</div>
          <div class="tube-label-pid">PID: ${esc(sample.pid)} | ${esc(sample.lid||'')}</div>
          <div class="tube-label-dept">${esc(sample.dept)} — ${esc(sample.tube?.replace?.(/_/g,' ') || '')}</div>
          <div class="tube-label-bc">||| |||| ||||| ${esc(sample.sid)}</div>
          <div class="tube-label-meta">${esc(dt)} | ${esc(shift)}${sample.is_high_risk ? ' | ☣️ HIGH RISK' : ''}</div>
        </div>
        ${barcodeType === 'qr' ? `<div class="tube-label-qr">${qrMock}</div>` : ''}
      </div>`;
  }

  function initLabels() {
    document.getElementById('demo-label-btn')?.addEventListener('click', () => {
      const type = document.getElementById('label-barcode-type')?.value || 'code128';
      const preview = document.getElementById('label-preview-area');
      if (!preview) return;
      preview.innerHTML = `
        <div style="margin-bottom:var(--space-lg)">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:var(--space-md)">Demo Labels — LAB-240515-001</div>
          ${DEMO_SAMPLES.slice(0,3).map(s => generateLabelHTML(s, type)).join('')}
        </div>
        <div style="padding:var(--space-sm) var(--space-md);background:rgba(0,230,118,.06);border:1px solid rgba(0,230,118,.20);border-radius:var(--radius-sm);font-size:11px;color:var(--alert-green)">
          🤖 AI Verification: All specimens acceptable for processing
        </div>`;
    });

    document.getElementById('generate-labels-btn')?.addEventListener('click', () => {
      const labId = document.getElementById('label-lab-id')?.value?.trim();
      if (!labId) { toast('Enter a Lab Request ID', 'error'); return; }
      toast(`Generating labels for ${labId}…`, 'info');
      setTimeout(() => {
        const type = document.getElementById('label-barcode-type')?.value || 'code128';
        const copies = parseInt(document.getElementById('label-copies')?.value) || 1;
        const preview = document.getElementById('label-preview-area');
        if (preview) {
          preview.innerHTML = `
            <div style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);background:rgba(0,230,118,.06);border:1px solid rgba(0,230,118,.20);border-radius:var(--radius-sm);font-size:11px;color:var(--alert-green)">
              ✅ ${DEMO_SAMPLES.length} labels generated · ${copies} cop${copies>1?'ies':'y'} each · AI verified
            </div>
            ${DEMO_SAMPLES.map(s => Array(copies).fill(generateLabelHTML(s,type)).join('')).join('<hr style="border:0;border-top:1px dashed var(--border-dim);margin:var(--space-sm) 0">')}
            <div style="margin-top:var(--space-lg);display:flex;gap:var(--space-sm)">
              <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Print All Labels</button>
              <button class="btn btn-ghost btn-sm">📤 Send to Label Printer</button>
            </div>`;
        }
        toast(`Labels ready: ${labId}`, 'success');
      }, 800);
    });
  }

  /* ─── TRACKING ──────────────────────────────────────────────── */
  function loadActiveSamples() {
    const tbody = document.getElementById('active-samples-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    tbody.innerHTML = DEMO_SAMPLES.map(s => {
      const tatColor = s.tat_pct >= 90 ? 'var(--alert-red)' : s.tat_pct >= 70 ? 'var(--alert-orange)' : 'var(--alert-green)';
      return `<tr>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(s.sid)}</span></td>
        <td><div style="font-size:var(--text-sm);font-weight:600">${esc(s.name)}</div>
            <div style="font-size:10px;color:var(--text-muted)">${esc(s.pid)}</div></td>
        <td>${esc(s.dept)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:5px">
          <span style="width:10px;height:10px;border-radius:50%;background:${TUBE_COLORS[s.tube]||'#ccc'}"></span>
          ${esc(s.tube?.replace?.(/_/g,' ')||'')}
        </span></td>
        <td><span class="badge ${s.status==='processing'?'badge-blue':s.status==='received'?'badge-yellow':'badge-green'}">${esc(s.status)}</span></td>
        <td>
          <div class="tat-mini-bar"><div class="tat-mini-fill" style="width:${s.tat_pct}%;background:${tatColor}"></div></div>
          <div style="font-size:9px;color:${tatColor};margin-top:2px">${s.tat_pct}%</div>
        </td>
        <td style="font-size:11px;color:var(--text-muted)">${esc(s.location)}</td>
      </tr>`;
    }).join('');
  }

  function initTracking() {
    document.getElementById('track-btn')?.addEventListener('click', () => {
      const q = document.getElementById('track-input')?.value?.trim();
      if (!q) return;
      const sample = DEMO_SAMPLES.find(s => s.sid === q || s.pid.includes(q) || s.name.toLowerCase().includes(q.toLowerCase()));
      const result = document.getElementById('track-result');
      if (!result) return;
      if (!sample) {
        result.innerHTML = '<div class="empty-state"><p>No sample found. Check the ID and try again.</p></div>';
        return;
      }
      const color = TUBE_COLORS[sample.tube] || '#ccc';
      result.innerHTML = `
        <div style="background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-lg);padding:var(--space-lg);max-width:600px;margin-bottom:var(--space-lg)">
          <div style="display:flex;align-items:center;gap:var(--space-md)">
            <span style="width:16px;height:16px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};flex-shrink:0"></span>
            <div>
              <div style="font-family:var(--font-mono);font-size:12px;color:var(--cyan)">${esc(sample.sid)}</div>
              <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700;color:var(--text-primary)">${esc(sample.name)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${esc(sample.pid)} · LID: ${esc(sample.lid||'')}</div>
            </div>
            <div style="margin-left:auto"><span class="badge badge-blue">${esc(sample.status)}</span></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);margin-top:var(--space-md)">
            <div style="font-size:11px"><span style="color:var(--text-muted)">Department:</span> <strong>${esc(sample.dept)}</strong></div>
            <div style="font-size:11px"><span style="color:var(--text-muted)">Current location:</span> <strong>${esc(sample.location)}</strong></div>
            <div style="font-size:11px"><span style="color:var(--text-muted)">TAT progress:</span> <strong>${sample.tat_pct}%</strong></div>
          </div>
        </div>`;
    });
  }

  /* ─── CHAIN OF CUSTODY ──────────────────────────────────────── */
  function loadCustodyEvents() {
    const tbody = document.getElementById('custody-events-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    const allEvents = DEMO_CUSTODY.flatMap(c => c.events.map(e => ({...e, sid:c.sid})));
    tbody.innerHTML = allEvents.map(e => `<tr>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(e.sid)}</span></td>
      <td style="font-size:var(--text-xs);font-weight:600">${esc(e.label)}</td>
      <td style="font-size:11px">${esc(e.loc)}</td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(e.by)}</td>
      <td style="font-size:11px">${esc(e.shift)}</td>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${esc(e.device)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(e.time)}</td>
    </tr>`).join('');
  }

  function initCustody() {
    document.getElementById('custody-load-btn')?.addEventListener('click', () => {
      const id = document.getElementById('custody-sample-id')?.value?.trim();
      if (!id) return;
      const chain = DEMO_CUSTODY.find(c => c.sid === id || c.sid.toLowerCase().includes(id.toLowerCase()));
      const container = document.getElementById('custody-chain');
      if (!container) return;
      if (!chain) {
        container.innerHTML = '<div class="empty-state"><p>No custody chain found for that sample ID.</p></div>';
        return;
      }
      container.innerHTML = `
        <div style="font-family:var(--font-display);font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-md)">
          ⛓️ Chain of Custody — ${esc(chain.sid)}
          <span style="font-size:11px;color:var(--text-muted);font-weight:400;margin-left:8px">${chain.events.length} custody events</span>
        </div>
        <div class="custody-timeline">
          ${chain.events.map(e => `
            <div class="custody-event event-${e.type}">
              <div class="custody-event-type">${esc(e.label)}</div>
              <div class="custody-event-detail">${esc(e.note)}</div>
              <div class="custody-event-meta">📍 ${esc(e.loc)} · 👤 ${esc(e.by)} · ${esc(e.shift)} · ⏱️ ${esc(e.time)} · 📟 ${esc(e.device)}</div>
            </div>`).join('')}
        </div>`;
    });
  }

  /* ─── REJECTION WORKFLOW ────────────────────────────────────── */
  function loadRejections() {
    const tbody = document.getElementById('rejections-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    const rejs = [
      { sid:'CHM-0515-002', reason:'Haemolysed', ai:true, time:'09:15', notified:true },
      { sid:'SER-0515-002', reason:'Insufficient volume', ai:false, time:'08:55', notified:true },
      { sid:'HEM-0515-003', reason:'Clotted', ai:true, time:'10:02', notified:false },
    ];
    tbody.innerHTML = rejs.map(r => `<tr>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(r.sid)}</span></td>
      <td class="rej-moderate">${esc(r.reason)}</td>
      <td>${r.ai ? '<span class="badge badge-blue">🤖 AI</span>' : '<span style="font-size:11px;color:var(--text-muted)">Manual</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(r.time)}</td>
      <td><span class="badge ${r.notified?'badge-green':'badge-red'}">${r.notified?'✅ Notified':'⏳ Pending'}</span></td>
    </tr>`).join('');

    document.getElementById('rej-submit-btn')?.addEventListener('click', () => {
      const id = document.getElementById('rej-sample-id')?.value?.trim();
      const reason = document.getElementById('rej-reason')?.value;
      if (!id || !reason) { toast('Enter sample ID and rejection reason', 'error'); return; }
      toast(`Sample ${id} rejected — doctor notified`, 'success');
      document.getElementById('rej-sample-id').value = '';
      document.getElementById('rej-reason').value = '';
      document.getElementById('rej-details').value = '';
    });
  }

  /* ─── AI VERIFICATION ───────────────────────────────────────── */
  function initAIVerify() {
    const zone = document.getElementById('spec-ai-upload');
    if (zone) {
      zone.addEventListener('click', () => toast('Camera/file access would open here in production', 'info'));
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--blue-glow)'; });
      zone.addEventListener('dragleave', () => zone.style.borderColor = '');
    }
    document.getElementById('ai-verify-btn')?.addEventListener('click', () => {
      const result = document.getElementById('ai-verify-result');
      if (!result) return;
      result.innerHTML = '<div style="padding:var(--space-md);color:var(--text-muted);font-size:var(--text-xs)"><i class="fas fa-spinner fa-spin"></i> AI analysing specimen…</div>';
      setTimeout(() => {
        const items = [
          { check:'Haemolysis', status:'pass', val:'None detected (Visual score: 0.02)' },
          { check:'Lipemia',    status:'pass', val:'Clear — no lipemia' },
          { check:'Clotting',   status:'pass', val:'No fibrin strands detected' },
          { check:'Volume adequacy', status:'pass', val:'~3.2mL — sufficient' },
          { check:'Tube type match', status:'pass', val:'Purple EDTA — correct for CBC' },
          { check:'Label integrity', status:'warn', val:'Minor smudge detected — readable' },
        ];
        const overall = items.every(i => i.status !== 'fail');
        result.innerHTML = `<div class="ai-spec-result">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:var(--space-sm)">🤖 AI SPECIMEN ASSESSMENT</div>
          <div style="display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-md)">
            <div class="ai-spec-score" style="color:${overall?'var(--alert-green)':'var(--alert-red)'}">${overall?'ACCEPTABLE':'REJECT'}</div>
            <div style="flex:1">
              <div class="ai-spec-bar"><div class="ai-spec-fill" style="width:91%;background:${overall?'var(--alert-green)':'var(--alert-red)'}"></div></div>
              <div style="font-size:10px;color:var(--text-muted)">AI Confidence: 91%</div>
            </div>
          </div>
          ${items.map(i => `<div class="ai-spec-item">
            <span style="color:var(--text-secondary)">${esc(i.check)}</span>
            <span>${esc(i.val)}</span>
            <span class="ai-spec-status ${i.status}">${i.status==='pass'?'✅':i.status==='warn'?'⚠️':'❌'}</span>
          </div>`).join('')}
          <div style="margin-top:var(--space-md);padding:var(--space-sm) var(--space-md);background:rgba(0,153,255,.05);border-radius:var(--radius-sm);font-size:10px;color:var(--text-muted)">
            🔒 AI verification logged to chain of custody · ISO 15189:2022
          </div>
        </div>`;
      }, 1500);
    });
  }

  /* ─── Init ──────────────────────────────────────────────────── */
  function init() { initTabs(); initLabels(); initTracking(); initCustody(); loadRejections(); initAIVerify(); }
  document.addEventListener('DOMContentLoaded', init);
})();
