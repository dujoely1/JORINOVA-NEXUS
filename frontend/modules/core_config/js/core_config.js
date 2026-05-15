/**
 * JORINOVA NEXUS ALIS-X — Core Configuration
 * Hospital, Departments, Test Catalog, Shifts, Users, Reference Ranges
 */
'use strict';

(function () {
  const CSRF  = () => window.NEXUS?.csrf || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  const API   = () => window.NEXUS?.apiBase || '/api/v1';
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);

  /* Demo departments */
  const DEPARTMENTS = [
    { code:'HEM', name:'Hematology', abbr:'HEMA', color:'#E74C3C', tube_color:'#9B59B6', tests:14, active:true },
    { code:'CHM', name:'Chemistry',  abbr:'CHEM', color:'#F39C12', tube_color:'#E74C3C', tests:42, active:true },
    { code:'MIC', name:'Microbiology', abbr:'MICRO', color:'#27AE60', tube_color:'#2980B9', tests:28, active:true },
    { code:'SER', name:'Serology / Immunology', abbr:'SERO', color:'#2980B9', tube_color:'#F39C12', tests:18, active:true },
    { code:'BB',  name:'Blood Bank', abbr:'BLOOD', color:'#C0392B', tube_color:'#9B59B6', tests:8, active:true },
    { code:'COA', name:'Coagulation', abbr:'COAG', color:'#3498DB', tube_color:'#2980B9', tests:6, active:true },
    { code:'MOL', name:'Molecular / PCR', abbr:'MOL', color:'#8E44AD', tube_color:'#95A5A6', tests:12, active:true },
    { code:'PAT', name:'Anatomical Pathology', abbr:'PATH', color:'#16A085', tube_color:'#BDC3C7', tests:15, active:true },
    { code:'TOX', name:'Toxicology', abbr:'TOX', color:'#7F8C8D', tube_color:'#95A5A6', tests:22, active:true },
    { code:'URN', name:'Urinalysis', abbr:'URINE', color:'#F1C40F', tube_color:'#F1C40F', tests:10, active:true },
  ];

  /* Demo catalog */
  const CATALOG = [
    { code:'CBC001', name:'Full Blood Count (CBC)', short:'CBC', dept:'Hematology', tube:'purple_edta', specimen:'Whole Blood (EDTA)', tat:2, price:3000, active:true },
    { code:'CBC002', name:'ESR — Erythrocyte Sedimentation Rate', short:'ESR', dept:'Hematology', tube:'purple_edta', specimen:'Whole Blood (EDTA)', tat:2, price:1500, active:true },
    { code:'CHM001', name:'Glucose (Fasting)', short:'FBS', dept:'Chemistry', tube:'grey_fluoride', specimen:'Plasma (Fluoride)', tat:1, price:1500, active:true },
    { code:'CHM002', name:'Creatinine', short:'Creat', dept:'Chemistry', tube:'yellow_sst', specimen:'Serum', tat:2, price:2000, active:true },
    { code:'CHM003', name:'Urea', short:'Urea', dept:'Chemistry', tube:'yellow_sst', specimen:'Serum', tat:2, price:1500, active:true },
    { code:'SER001', name:'HIV Ag/Ab Combo', short:'HIV', dept:'Serology / Immunology', tube:'yellow_sst', specimen:'Serum', tat:1, price:2000, active:true },
    { code:'SER002', name:'Hepatitis B Surface Antigen (HBsAg)', short:'HBsAg', dept:'Serology / Immunology', tube:'yellow_sst', specimen:'Serum', tat:1, price:3000, active:true },
    { code:'MOL001', name:'GeneXpert MTB/RIF', short:'Xpert MTB', dept:'Molecular / PCR', tube:'swab', specimen:'Sputum', tat:2, price:8000, active:true },
  ];

  /* Demo users */
  const USERS = [
    { name:'NKURUNZIZA Jean-Baptiste', email:'jb.nkurunziza@nexuslab.rw', role:'Lab Manager', dept:'Administration', last_login:'Today 08:14', status:'active' },
    { name:'UWERA Vestine', email:'v.uwera@nexuslab.rw', role:'Pathologist', dept:'Hematology', last_login:'Today 07:55', status:'active' },
    { name:'HABIMANA Eric', email:'e.habimana@nexuslab.rw', role:'Lab Technician', dept:'Chemistry', last_login:'Today 08:01', status:'active' },
    { name:'MUKAMANA Rose', email:'r.mukamana@nexuslab.rw', role:'Receptionist', dept:'Reception', last_login:'Today 08:20', status:'active' },
    { name:'KAMANZI Paul', email:'p.kamanzi@nexuslab.rw', role:'Phlebotomist', dept:'Blood Collection', last_login:'Yesterday', status:'active' },
    { name:'INGABIRE Alice', email:'a.ingabire@nexuslab.rw', role:'IT Admin', dept:'IT', last_login:'2 days ago', status:'active' },
  ];

  function initTabs() {
    document.querySelectorAll('.cfg-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cfg-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cfg-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        const actions = {
          'cfg-departments-pane': loadDepartments,
          'cfg-catalog-pane':     loadCatalog,
          'cfg-shifts-pane':      loadShifts,
          'cfg-users-pane':       loadUsers,
          'cfg-refrange-pane':    loadRefRanges,
        };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  function loadDepartments() {
    const tbody = document.getElementById('dept-table-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    tbody.innerHTML = DEPARTMENTS.map(d => `<tr>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(d.code)}</span></td>
      <td><strong>${esc(d.name)}</strong></td>
      <td>${esc(d.abbr)}</td>
      <td><span style="display:inline-flex;align-items:center;gap:6px">
        <span style="width:14px;height:14px;border-radius:50%;background:${esc(d.color)};display:inline-block;box-shadow:0 0 4px rgba(0,0,0,.3)"></span>
        <code style="font-size:10px">${esc(d.color)}</code>
      </span></td>
      <td><span style="display:inline-flex;align-items:center;gap:6px">
        <span style="width:14px;height:14px;border-radius:50%;background:${esc(d.tube_color)};display:inline-block"></span>
        <code style="font-size:10px">${esc(d.tube_color)}</code>
      </span></td>
      <td style="text-align:center;font-family:var(--font-mono)">${d.tests}</td>
      <td><span class="badge ${d.active?'badge-green':'badge-red'}">${d.active?'Active':'Inactive'}</span></td>
      <td><button class="btn btn-ghost btn-sm">✏️</button></td>
    </tr>`).join('');
  }

  function loadCatalog() {
    const tbody = document.getElementById('catalog-table-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    tbody.innerHTML = CATALOG.map(t => `<tr>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(t.code)}</span></td>
      <td><strong style="font-size:var(--text-sm)">${esc(t.name)}</strong></td>
      <td><span class="badge badge-blue">${esc(t.short)}</span></td>
      <td style="font-size:var(--text-xs)">${esc(t.dept)}</td>
      <td style="font-size:11px">${esc(t.tube.replace(/_/g,' '))}</td>
      <td style="font-size:11px">${esc(t.specimen)}</td>
      <td style="text-align:center;font-family:var(--font-mono)">${t.tat}h</td>
      <td style="font-family:var(--font-mono)">${(t.price).toLocaleString()}</td>
      <td><span class="badge ${t.active?'badge-green':'badge-red'}">${t.active?'✅':'❌'}</span></td>
      <td><button class="btn btn-ghost btn-sm">✏️</button></td>
    </tr>`).join('');
  }

  function loadShifts() {
    const el = document.getElementById('shifts-config');
    if (!el || el.innerHTML !== '') return;
    const shifts = [
      { name:'Morning ☀️', start:'06:00', end:'14:00', icon:'☀️' },
      { name:'Afternoon 🌤️', start:'14:00', end:'22:00', icon:'🌤️' },
      { name:'Night 🌙', start:'22:00', end:'06:00', icon:'🌙' },
    ];
    el.innerHTML = shifts.map(s => `
      <div style="background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-lg);padding:var(--space-lg);margin-bottom:var(--space-md)">
        <div style="font-family:var(--font-display);font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-md)">${esc(s.name)}</div>
        <div style="display:flex;gap:var(--space-md);align-items:center">
          <div class="form-group" style="margin:0;flex:1"><label class="form-label">Start</label><input type="time" class="form-input" value="${esc(s.start)}"></div>
          <div style="color:var(--text-muted);padding-top:20px">→</div>
          <div class="form-group" style="margin:0;flex:1"><label class="form-label">End</label><input type="time" class="form-input" value="${esc(s.end)}"></div>
        </div>
      </div>`).join('');
  }

  function loadUsers() {
    const tbody = document.getElementById('users-table-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    tbody.innerHTML = USERS.map(u => `<tr>
      <td><strong style="font-size:var(--text-sm)">${esc(u.name)}</strong></td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(u.email)}</td>
      <td><span class="badge badge-blue">${esc(u.role)}</span></td>
      <td style="font-size:var(--text-xs)">${esc(u.dept)}</td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(u.last_login)}</td>
      <td><span class="badge badge-green">Active</span></td>
      <td><button class="btn btn-ghost btn-sm">✏️ Edit</button></td>
    </tr>`).join('');
  }

  function loadRefRanges() {
    const tbody = document.getElementById('refrange-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    const ranges = [
      { test:'Glucose (Fasting)', pop:'Adult', gender:'All', age_from:'18', age_to:'120', lo:'3.9', hi:'6.1', crit_lo:'2.5', crit_hi:'22.0', unit:'mmol/L' },
      { test:'Haemoglobin (HGB)', pop:'Adult', gender:'M', age_from:'18', age_to:'120', lo:'13.0', hi:'17.0', crit_lo:'7.0', crit_hi:'20.0', unit:'g/dL' },
      { test:'Haemoglobin (HGB)', pop:'Adult', gender:'F', age_from:'18', age_to:'120', lo:'12.0', hi:'16.0', crit_lo:'7.0', crit_hi:'20.0', unit:'g/dL' },
      { test:'Platelet (PLT)', pop:'Adult', gender:'All', age_from:'18', age_to:'120', lo:'150', hi:'400', crit_lo:'50', crit_hi:'1000', unit:'×10³/µL' },
      { test:'Creatinine', pop:'Adult', gender:'M', age_from:'18', age_to:'120', lo:'62', hi:'106', crit_lo:'20', crit_hi:'1200', unit:'µmol/L' },
    ];
    tbody.innerHTML = ranges.map(r => `<tr>
      <td style="font-size:var(--text-xs)">${esc(r.test)}</td>
      <td><span class="badge badge-blue">${esc(r.pop)}</span></td>
      <td>${esc(r.gender)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${esc(r.age_from)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${esc(r.age_to)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--alert-blue);text-align:center">${esc(r.lo)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--blue-glow);text-align:center">${esc(r.hi)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--alert-red);text-align:center">${esc(r.crit_lo)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--alert-red);text-align:center">${esc(r.crit_hi)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(r.unit)}</td>
      <td><button class="btn btn-ghost btn-sm">✏️</button></td>
    </tr>`).join('');
  }

  function initHospital() {
    document.getElementById('cfg-save-hosp-btn')?.addEventListener('click', () => toast('Hospital settings saved', 'success'));
  }

  function init() {
    initTabs();
    initHospital();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
