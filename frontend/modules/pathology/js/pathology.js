/**
 * JORINOVA NEXUS ALIS-X — Anatomical Pathology & AI Vision
 * Histopathology · IHC · Slide AI · Cancer Registry · ISO 15189 DSS
 */
'use strict';

(function () {
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ─── Tab switching ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.path-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.path-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.path-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.pane);
        if (pane) pane.classList.add('active');
        const actions = {
          'path-slide-pane': loadSlideList,
          'path-registry-pane': loadRegistry,
        };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  /* ─── Worklist ──────────────────────────────────────────────── */
  const WORKLIST_DEMO = [
    { id:'SP-2024-0521', patient:'UWIMANA Vestine', type:'Breast Core Biopsy', site:'Right breast, 10 o\'clock', urgency:'urgent', workflow:['Grossing','Processing','Embedding','Sectioning','Staining','Reading'], step:3, path:'Dr. NKURUNZIZA' },
    { id:'SP-2024-0522', patient:'KAMANZI Jean-Paul', type:'Colorectal Biopsy', site:'Sigmoid colon (colonoscopy)', urgency:'routine', workflow:['Grossing','Processing','Embedding','Sectioning','Staining','Reading'], step:1, path:'Dr. UWERA' },
    { id:'SP-2024-0520', patient:'MUKAGATARE Rose', type:'Frozen Section', site:'Ovarian mass (intraoperative)', urgency:'frozen', workflow:['Grossing','Frozen','Reading','Report'], step:2, path:'Dr. NKURUNZIZA' },
    { id:'SP-2024-0519', patient:'HABIMANA Eric', type:'FNAC', site:'Neck lymph node', urgency:'routine', workflow:['Smear','Stain','Reading'], step:3, path:'Dr. UWERA' },
  ];

  function renderWorkflow(steps, step) {
    return `<div class="spec-workflow">
      ${steps.map((s,i) => `<span class="spec-step ${i<step?'done':i===step?'active':'pending'}">${esc(s)}</span>`).join('')}
    </div>`;
  }

  function loadWorklist() {
    const tbody = document.getElementById('path-worklist-tbody');
    if (!tbody) return;
    tbody.innerHTML = WORKLIST_DEMO.map(c => `<tr>
      <td><div style="font-weight:600;font-size:var(--text-sm)">${esc(c.patient)}</div></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(c.id)}</span></td>
      <td><span class="badge badge-blue">${esc(c.type)}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(c.site)}</td>
      <td>${c.urgency === 'frozen' ? '<span class="frozen-alert">🚨 FROZEN SECTION</span>' : `<span class="badge ${c.urgency==='urgent'?'badge-orange':'badge-blue'}">${c.urgency}</span>`}</td>
      <td>${renderWorkflow(c.workflow, c.step)}</td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(c.path)}</td>
      <td style="text-align:right">
        <button class="btn btn-primary btn-sm" onclick="window.PathModule.openSlide('${c.id}')">🔬 Review</button>
      </td>
    </tr>`).join('');
  }

  /* ─── Slide AI Vision ───────────────────────────────────────── */
  function loadSlideList() {
    const list = document.getElementById('path-slide-list');
    if (!list || list.innerHTML !== '') return;
    list.innerHTML = WORKLIST_DEMO.map(c => `
      <div class="path-slide-item" onclick="window.PathModule.openSlide('${c.id}')">
        <div class="path-slide-icon">${c.urgency==='frozen'?'🧊':'🔬'}</div>
        <div>
          <div class="path-slide-info-name">${esc(c.id)}</div>
          <div class="path-slide-info-meta">${esc(c.patient)}<br>${esc(c.type)} · ${esc(c.site)}</div>
        </div>
      </div>`).join('');
  }

  window.PathModule = {
    openSlide(id) {
      document.querySelector('[data-pane="path-slide-pane"]')?.click();
      const viewer = document.getElementById('path-viewer-area');
      if (!viewer) return;
      viewer.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-xl);padding:var(--space-2xl)">
          <div style="font-size:48px">🔬</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary)">Specimen: <strong>${esc(id)}</strong></div>
          <div style="color:var(--text-muted);font-size:var(--text-xs)">In a full deployment, the digitized slide image appears here with pan/zoom controls.</div>
          <div class="path-mag-bar">
            <button class="mag-btn">4×</button><button class="mag-btn">10×</button>
            <button class="mag-btn active">20×</button><button class="mag-btn">40×</button><button class="mag-btn">100× Oil</button>
          </div>
          <button class="btn btn-primary" onclick="window.PathModule.runAI('${id}')">🤖 Analyze with AI Vision</button>
        </div>`;
      viewer.querySelectorAll('.mag-btn').forEach(b => {
        b.addEventListener('click', () => { viewer.querySelectorAll('.mag-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
      });
      document.getElementById('path-ai-output').style.display = 'none';
    },
    runAI(id) {
      const aiOut = document.getElementById('path-ai-output');
      if (!aiOut) return;
      aiOut.style.display = 'block';
      aiOut.innerHTML = '<div style="padding:var(--space-md);color:var(--text-muted);font-size:var(--text-xs)"><i class="fas fa-spinner fa-spin"></i> AI Vision analysing slide…</div>';
      setTimeout(() => {
        aiOut.innerHTML = renderAIVisionResult();
      }, 1500);
    }
  };

  function renderAIVisionResult() {
    const malignancyPct = 78;
    const grade = 2;
    const diffs = [
      { name:'Invasive Ductal Carcinoma (NST)', conf:78 },
      { name:'Invasive Lobular Carcinoma', conf:14 },
      { name:'Mucinous Carcinoma', conf:5 },
      { name:'Other / Benign', conf:3 },
    ];
    const color = malignancyPct > 70 ? 'var(--alert-red)' : malignancyPct > 40 ? 'var(--alert-orange)' : 'var(--alert-green)';

    return `<div style="display:flex;flex-direction:column;gap:var(--space-md)">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)">🤖 AI VISION ANALYSIS</div>
      <div class="malignancy-gauge-wrap">
        <div style="min-width:90px;font-size:11px;color:var(--text-muted)">Malignancy Score</div>
        <div class="malignancy-gauge-bar"><div class="malignancy-gauge-fill" style="width:${malignancyPct}%;background:${color}"></div></div>
        <div class="malignancy-pct" style="color:${color}">${malignancyPct}%</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)">
        <div>
          <div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:4px">TISSUE FEATURES</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.7">
            Architecture: <strong>Invasive cords and glands</strong><br>
            Cellularity: <strong>Hypercellular</strong><br>
            N:C Ratio: <strong>High</strong><br>
            Pleomorphism: <strong>Moderate (Grade 2)</strong><br>
            Mitoses: <strong>8/10 HPF</strong><br>
            Necrosis: <strong>Focal comedonecrosis</strong>
          </div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:4px">AI DIFFERENTIAL DIAGNOSIS</div>
          ${diffs.map(d => `<div class="ai-diff-row">
            <span class="ai-diff-name">${esc(d.name)}</span>
            <div class="ai-conf-bar"><div class="ai-conf-fill" style="width:${d.conf}%"></div></div>
            <span class="ai-conf-pct">${d.conf}%</span>
          </div>`).join('')}
        </div>
      </div>
      <div style="padding:var(--space-sm) var(--space-md);background:rgba(138,43,226,.08);border:1px solid rgba(138,43,226,.20);border-radius:var(--radius-sm);font-size:var(--text-xs);color:var(--text-secondary)">
        💊 <strong>IHC Recommendation:</strong> ER, PR, HER2, Ki-67 — prognostic markers required
      </div>
      <div style="padding:var(--space-xs) var(--space-md);background:rgba(0,153,255,.05);border:1px solid rgba(0,153,255,.15);border-radius:var(--radius-sm);font-size:10px;color:var(--text-muted)">
        ⚠️ AI VISION IS SUGGESTIVE ONLY — HISTOPATHOLOGIST INTERPRETATION AND SIGN-OFF MANDATORY · ISO 15189:2022
      </div>
    </div>`;
  }

  /* ─── Accessioning ──────────────────────────────────────────── */
  const IHC_PRESETS = {
    carcinoma: ['CK7','CK20','CK5/6','CKAE1/AE3','p63','EMA','CEA'],
    lymphoma:  ['CD3','CD20','CD45','CD30','CD138','BCL2','BCL6'],
    breast:    ['ER','PR','HER2','Ki67','p53','CK5/6'],
    neural:    ['S100','GFAP','Synaptophysin','Chromogranin A','NSE','CD56'],
  };
  document.querySelectorAll('.ihc-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const markers = IHC_PRESETS[btn.dataset.preset] || [];
      const wrap = document.getElementById('ihc-selected');
      if (!wrap) return;
      markers.forEach(m => {
        if (!wrap.querySelector(`[data-marker="${m}"]`)) {
          const span = document.createElement('span');
          span.dataset.marker = m;
          span.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:var(--radius-full);background:rgba(138,43,226,.10);border:1px solid rgba(138,43,226,.25);font-size:11px;color:#b87cff;cursor:pointer';
          span.innerHTML = `${esc(m)} ×`;
          span.addEventListener('click', () => span.remove());
          wrap.appendChild(span);
        }
      });
    });
  });

  document.getElementById('acc-submit-btn')?.addEventListener('click', () => {
    const id = `SP-${new Date().getFullYear()}-${String(Math.floor(Math.random()*1000)+500).padStart(4,'0')}`;
    toast(`Specimen registered: ${id}`, 'success');
  });

  /* ─── Report ────────────────────────────────────────────────── */
  function initReport() {
    document.getElementById('rpt-print-btn')?.addEventListener('click', () => {
      if (!window.NexusSig) { window.print(); return; }
      const sig = window.NexusSig.autosignForPrint('path-report-form', {
        docType:'administrative', docId:`PATH-RPT-${Date.now()}`,
        docTitle:'Anatomical Pathology Report', leaderName:'Dr. Chief Pathologist',
      });
      if (sig) {
        const area = document.getElementById('rpt-sig-area');
        if (area) area.innerHTML = window.NexusSig.renderHTML(sig);
      }
      setTimeout(() => window.print(), 300);
    });
    document.getElementById('rpt-release-btn')?.addEventListener('click', () => toast('Report released to requesting clinician', 'success'));
    document.getElementById('rpt-save-btn')?.addEventListener('click', () => toast('Draft saved', 'success'));
  }

  /* ─── Registry ──────────────────────────────────────────────── */
  function loadRegistry() {
    const tbody = document.getElementById('registry-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    const data = [
      { id:'SP-2024-0510', patient:'MUKAMANA Grace', dx:'Invasive Ductal Carcinoma Grade 2, ER+/PR+/HER2-', site:'Breast', grade:'G2', date:'2024-05-08', path:'Dr. NKURUNZIZA' },
      { id:'SP-2024-0488', patient:'HABIMANA Jean', dx:'Moderately differentiated adenocarcinoma', site:'Colon', grade:'G2', date:'2024-04-28', path:'Dr. UWERA' },
      { id:'SP-2024-0501', patient:'UWIMANA Solange', dx:'High-grade squamous intraepithelial lesion (HSIL/CIN3)', site:'Cervix', grade:'G3', date:'2024-05-02', path:'Dr. NKURUNZIZA' },
      { id:'SP-2024-0476', patient:'NIYOMUGABO Paul', dx:'Diffuse Large B-Cell Lymphoma (DLBCL)', site:'Lymph Node', grade:'High', date:'2024-04-20', path:'Dr. UWERA' },
      { id:'SP-2024-0455', patient:'NYIRANEZA Alice', dx:'Papillary thyroid carcinoma', site:'Thyroid', grade:'G1', date:'2024-04-10', path:'Dr. NKURUNZIZA' },
    ];
    tbody.innerHTML = data.map(d => `<tr>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(d.id)}</span></td>
      <td style="font-size:var(--text-sm)">${esc(d.patient)}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${esc(d.dx)}</td>
      <td><span class="badge badge-blue">${esc(d.site)}</span></td>
      <td><span class="badge ${d.grade==='G1'?'badge-green':d.grade==='High'||d.grade==='G3'?'badge-red':'badge-orange'}">${esc(d.grade)}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(d.date)}</td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(d.path)}</td>
    </tr>`).join('');

    const canvas1 = document.getElementById('path-cancer-chart');
    const canvas2 = document.getElementById('path-volume-chart');
    if (canvas1 && window.Chart && !canvas1._done) {
      canvas1._done = true;
      new Chart(canvas1, { type:'doughnut', data:{ labels:['Breast','Colorectal','Cervix','Lymphoma','Thyroid','Other'], datasets:[{ data:[28,20,18,12,8,14], backgroundColor:['rgba(255,23,68,.5)','rgba(255,109,0,.5)','rgba(138,43,226,.5)','rgba(0,153,255,.5)','rgba(0,230,118,.5)','rgba(100,100,100,.5)'], borderWidth:1 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#aab',font:{size:10}}}} } });
    }
    if (canvas2 && window.Chart && !canvas2._done) {
      canvas2._done = true;
      new Chart(canvas2, { type:'bar', data:{ labels:['Jan','Feb','Mar','Apr','May'], datasets:[{label:'Biopsies',data:[42,38,51,47,34],backgroundColor:'rgba(138,43,226,.5)',borderRadius:4},{label:'FNAC',data:[18,22,20,25,15],backgroundColor:'rgba(0,200,255,.4)',borderRadius:4}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#aab',font:{size:10}}}}, scales:{x:{ticks:{color:'#8899aa'},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#8899aa'},grid:{color:'rgba(255,255,255,.04)'}}} } });
    }
  }

  /* ─── Init ──────────────────────────────────────────────────── */
  function init() { initTabs(); loadWorklist(); initReport(); }
  document.addEventListener('DOMContentLoaded', init);
})();
