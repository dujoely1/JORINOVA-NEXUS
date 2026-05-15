/**
 * JORINOVA NEXUS ALIS-X — Interoperability Hub
 * HL7/FHIR · RBC · MOH · CDC · WHO · LID Sync · External Systems
 */
'use strict';

(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const SYSTEMS = [
    { name:'Rwanda MOH HMIS', type:'Ministry of Health', proto:'HL7 v2.5', status:'healthy',  send:true,  recv:false, msgs_today:84  },
    { name:'RBC Blood System', type:'Rwanda Biomedical Centre', proto:'FHIR R4', status:'healthy', send:true, recv:true, msgs_today:23 },
    { name:'Butare University Hospital', type:'Hospital HIS', proto:'HL7 v2.5', status:'healthy', send:true, recv:true, msgs_today:47 },
    { name:'King Faisal Hospital', type:'Hospital HIS', proto:'FHIR R4', status:'degraded', send:true, recv:false, msgs_today:12 },
    { name:'Community Clinics Network', type:'Clinic EMR', proto:'REST/JSON', status:'healthy', send:false, recv:true, msgs_today:156 },
    { name:'Zipline Rwanda', type:'Zipline Drone Delivery', proto:'REST/JSON', status:'healthy', send:true, recv:true, msgs_today:8 },
    { name:'CDC FETP Rwanda', type:'CDC', proto:'FHIR R4', status:'unknown', send:true, recv:false, msgs_today:2 },
    { name:'WHO AFRO Surveillance', type:'WHO', proto:'REST/JSON', status:'healthy', send:true, recv:false, msgs_today:1 },
    { name:'RSSB Insurance', type:'Insurance Provider', proto:'SOAP/XML', status:'healthy', send:true, recv:true, msgs_today:31 },
  ];

  const MESSAGES = [
    { dir:'out', type:'ORU', system:'Butare University Hospital', pid:'RWA-2024-00142', id:'MSG-HL7-240515-001', ms:142, status:'processed' },
    { dir:'in',  type:'ORM', system:'Community Clinics Network',  pid:'RWA-2024-00890', id:'MSG-REST-240515-002', ms:87, status:'processed' },
    { dir:'out', type:'FHIR_Obs', system:'Rwanda MOH HMIS', pid:'RWA-2024-00388', id:'MSG-FHIR-240515-003', ms:203, status:'processed' },
    { dir:'out', type:'FHIR_Bundle', system:'CDC FETP Rwanda', pid:null, id:'MSG-FHIR-240515-004', ms:315, status:'failed' },
    { dir:'in',  type:'ADT', system:'King Faisal Hospital', pid:'RWA-2024-00612', id:'MSG-HL7-240515-005', ms:0, status:'queued' },
    { dir:'out', type:'ORU', system:'RBC Blood System', pid:null, id:'MSG-FHIR-240515-006', ms:98, status:'processed' },
    { dir:'in',  type:'ORM', system:'Community Clinics Network', pid:'RWA-2024-00723', id:'MSG-REST-240515-007', ms:55, status:'processed' },
  ];

  const FHIR_RESOURCES = ['Patient','Observation','DiagnosticReport','ServiceRequest','Specimen','Practitioner','Organization','Location','Bundle','Task','AuditEvent'];

  function initTabs() {
    document.querySelectorAll('.interop-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.interop-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.interop-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        const actions = {
          'interop-systems-pane':  loadSystems,
          'interop-messages-pane': loadMessages,
          'interop-fhir-pane':     loadFHIR,
          'interop-lid-pane':      loadLIDSync,
        };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  function loadDashboard() {
    const el = id => document.getElementById(id);
    if(el('ik-connected'))    el('ik-connected').textContent    = SYSTEMS.filter(s=>s.status==='healthy').length;
    if(el('ik-msgs-today'))   el('ik-msgs-today').textContent   = SYSTEMS.reduce((a,s)=>a+s.msgs_today,0);
    if(el('ik-success-rate')) el('ik-success-rate').textContent = '97.3%';
    if(el('ik-failed'))       el('ik-failed').textContent       = MESSAGES.filter(m=>m.status==='failed').length;
    if(el('ik-lid-syncs'))    el('ik-lid-syncs').textContent    = '34';

    const statusEl = document.getElementById('interop-system-status');
    if (statusEl) {
      statusEl.innerHTML = SYSTEMS.slice(0,6).map(s => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-dim);font-size:var(--text-xs)">
          <div>
            <span class="sys-status-dot sys-${s.status}" style="background:${s.status==='healthy'?'var(--alert-green)':s.status==='degraded'?'var(--alert-orange)':'var(--text-muted)'}"></span>
            <strong style="color:var(--text-primary)">${esc(s.name)}</strong>
          </div>
          <span style="color:var(--text-muted)">${s.msgs_today} msgs</span>
        </div>`).join('');
    }

    setTimeout(() => {
      const canvas = document.getElementById('interop-volume-chart');
      if (canvas && window.Chart && !canvas._done) {
        canvas._done = true;
        new Chart(canvas, {
          type:'bar',
          data:{ labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets:[
            { label:'Inbound', data:[312,287,356,298,341,187,124], backgroundColor:'rgba(0,212,255,.4)', borderRadius:3 },
            { label:'Outbound', data:[289,264,310,275,312,198,148], backgroundColor:'rgba(0,153,255,.4)', borderRadius:3 },
          ]},
          options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aab',font:{size:10}}}},scales:{x:{ticks:{color:'#8899aa'},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#8899aa'},grid:{color:'rgba(255,255,255,.04)'}}}}
        });
      }
    }, 100);
  }

  function loadSystems() {
    const grid = document.getElementById('interop-systems-grid');
    if (!grid || grid.innerHTML !== '') return;
    grid.innerHTML = SYSTEMS.map(s => `
      <div class="interop-system-card sys-${s.status}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div class="sys-name">${esc(s.name)}</div>
            <div class="sys-type">${esc(s.type)}</div>
            <div class="sys-proto">${esc(s.proto)}</div>
          </div>
          <span class="badge ${s.status==='healthy'?'badge-green':s.status==='degraded'?'badge-yellow':'badge-blue'}">
            <span class="sys-status-dot" style="background:${s.status==='healthy'?'var(--alert-green)':s.status==='degraded'?'var(--alert-orange)':'var(--text-muted)'}"></span>
            ${s.status}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:var(--space-md)">
          <div style="font-size:11px"><span style="color:var(--text-muted)">Today:</span> <strong>${s.msgs_today}</strong> msgs</div>
          <div style="font-size:11px"><span style="color:var(--text-muted)">Direction:</span> <strong>${s.send&&s.recv?'↔ Both':s.send?'→ Send':'← Receive'}</strong></div>
        </div>
        <div style="display:flex;gap:6px;margin-top:var(--space-sm)">
          <button class="btn btn-ghost btn-sm">⚙️ Config</button>
          <button class="btn btn-ghost btn-sm">📨 Test</button>
        </div>
      </div>`).join('');
  }

  function loadMessages() {
    const tbody = document.getElementById('msg-log-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    tbody.innerHTML = MESSAGES.map(m => `<tr>
      <td>${m.dir==='in'?'📥':'📤'}</td>
      <td><span style="font-family:var(--font-mono);font-size:10px;color:var(--cyan)">${esc(m.id)}</span></td>
      <td><span class="badge badge-blue">${esc(m.type)}</span></td>
      <td style="font-size:var(--text-xs)">${esc(m.system)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${m.pid ? esc(m.pid) : '—'}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${m.ms ? m.ms+'ms' : '—'}</td>
      <td><span class="badge ${m.status==='processed'?'badge-green':m.status==='failed'?'badge-red':'badge-yellow'}">${esc(m.status)}</span></td>
      <td><button class="btn btn-ghost btn-sm">👁️</button></td>
    </tr>`).join('');
  }

  function loadFHIR() {
    const list = document.getElementById('fhir-resource-list');
    if (!list || list.innerHTML !== '') return;
    list.innerHTML = FHIR_RESOURCES.map(r => `
      <button class="fhir-resource-btn" onclick="window.InteropModule.showFHIR('${r}',this)">
        <span>⚕️</span> ${esc(r)}
      </button>`).join('');
  }

  window.InteropModule = {
    showFHIR(resource, btn) {
      document.querySelectorAll('.fhir-resource-btn').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      const detail = document.getElementById('fhir-resource-detail');
      if (!detail) return;

      const examples = {
        Patient: { resourceType:'Patient', id:'RWA-2024-00142', identifier:[{system:'urn:nexus:lid',value:'NXS-LID-2024-0000142'}], name:[{family:'KAMANZI',given:['Jean']}], gender:'male', birthDate:'1992-03-15' },
        Observation: { resourceType:'Observation', id:'obs-001', status:'final', code:{coding:[{system:'http://loinc.org',code:'718-7',display:'Hemoglobin [Mass/volume] in Blood'}]}, valueQuantity:{value:6.2,unit:'g/dL'}, interpretation:[{coding:[{code:'LL',display:'Critical Low'}]}] },
        DiagnosticReport: { resourceType:'DiagnosticReport', id:'rpt-001', status:'final', category:[{coding:[{code:'LAB'}]}], code:{text:'CBC Full Blood Count'}, conclusion:'Severe anaemia. HGB 6.2 g/dL — critical low.' },
      };

      const example = examples[resource] || { resourceType: resource, note: `NEXUS ${resource} resource — see API docs for full schema` };
      detail.innerHTML = `
        <div style="font-family:var(--font-display);font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-md)">
          ⚕️ FHIR ${esc(resource)} Resource
        </div>
        <div style="background:rgba(0,0,0,.3);border-radius:var(--radius-md);padding:var(--space-lg);overflow:auto;max-height:300px">
          <pre style="font-family:var(--font-mono);font-size:11px;color:#00FF96;line-height:1.5;margin:0">${esc(JSON.stringify(example,null,2))}</pre>
        </div>
        <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md)">
          <a href="/api/v1/fhir/${resource}/" target="_blank" class="btn btn-ghost btn-sm">🔗 Endpoint</a>
          <button class="btn btn-ghost btn-sm">📋 Copy</button>
        </div>`;
    }
  };

  function loadLIDSync() {
    const tbody = document.getElementById('lid-sync-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    const syncs = [
      { clinic:'Nyamata Health Centre', pid:'NYC-2024-0891', name:'UWIMANA Jean-Baptiste', conf:97, status:'matched' },
      { clinic:'Remera Clinic', pid:'REM-P-0234', name:'MUKAMANA Vestine', conf:84, status:'matched' },
      { clinic:'Kimironko Medical Centre', pid:'KMC-24-1102', name:'HABIMANA Pierre', conf:61, status:'conflict' },
      { clinic:'Kacyiru Hospital', pid:'KCY-2024-0567', name:'NKURUNZIZA Alice', conf:99, status:'matched' },
      { clinic:'External Clinic (unknown)', pid:'EXT-0012', name:'INGABIRE (unknown DOB)', conf:32, status:'pending' },
    ];
    tbody.innerHTML = syncs.map(s => `<tr>
      <td style="font-size:var(--text-xs)">${esc(s.clinic)}</td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(s.pid)}</span></td>
      <td>${esc(s.name)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;background:var(--bg-glass);border-radius:var(--radius-full);height:6px;overflow:hidden">
            <div style="height:100%;border-radius:var(--radius-full);background:${s.conf>=90?'var(--alert-green)':s.conf>=60?'var(--alert-yellow)':'var(--alert-red)'};width:${s.conf}%"></div>
          </div>
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:${s.conf>=90?'var(--alert-green)':s.conf>=60?'var(--alert-yellow)':'var(--alert-red)'}">${s.conf}%</span>
        </div>
      </td>
      <td><span class="badge ${s.status==='matched'?'badge-green':s.status==='conflict'?'badge-red':'badge-yellow'}">${esc(s.status)}</span></td>
      <td>
        ${s.status==='pending'||s.status==='conflict'
          ? `<button class="btn btn-primary btn-sm">🔍 Review</button>`
          : `<span style="font-size:11px;color:var(--alert-green)">✅ Linked</span>`}
      </td>
    </tr>`).join('');

    const stats = document.getElementById('lid-sync-stats');
    if (stats) {
      const items = [
        { label:'Auto-matched (>90%)', val:'847', color:'var(--alert-green)' },
        { label:'Manual review (60-89%)', val:'23', color:'var(--alert-yellow)' },
        { label:'Conflicts (<60%)', val:'5', color:'var(--alert-red)' },
        { label:'New LIDs created', val:'124', color:'var(--blue-glow)' },
        { label:'Total syncs this month', val:'999', color:'var(--text-primary)' },
      ];
      stats.innerHTML = items.map(i => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--border-dim)">
          <span style="font-size:var(--text-xs);color:var(--text-secondary)">${esc(i.label)}</span>
          <strong style="font-family:var(--font-display);font-size:16px;color:${i.color}">${esc(i.val)}</strong>
        </div>`).join('');
    }
  }

  function init() { initTabs(); loadDashboard(); }
  document.addEventListener('DOMContentLoaded', init);
})();
