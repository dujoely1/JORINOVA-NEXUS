/* ═══════════════════════════════════════════════════════════════
   JORINOVA NEXUS ALIS-X — StaffHub Module JS
   HR & Workforce Management · Full Rebuild
   ES6 · Vanilla JS · No build step
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── Demo Data ─────────────────────────────────────────────────── */
const DEMO_STAFF = [
  { id: 1,  initials: 'JN', name: 'Dr. Jean Nkurunziza',    role: 'Pathologist',     dept: 'Hematology',   shift: 'Morning',   sphere: 'sphere-blue',   status: 'active',  perf: 96, phone: '+250 788 001 001', email: 'j.nkurunziza@nexuslab.rw', start: '2019-03-01', empId: 'EMP-001' },
  { id: 2,  initials: 'MM', name: 'Marie Mutoni',           role: 'Lab Technician',  dept: 'Chemistry',    shift: 'Morning',   sphere: 'sphere-green',  status: 'active',  perf: 88, phone: '+250 788 001 002', email: 'm.mutoni@nexuslab.rw',    start: '2020-06-15', empId: 'EMP-002' },
  { id: 3,  initials: 'PH', name: 'Patrick Habimana',       role: 'Lab Technician',  dept: 'Microbiology', shift: 'Afternoon', sphere: 'sphere-orange', status: 'active',  perf: 91, phone: '+250 788 001 003', email: 'p.habimana@nexuslab.rw',   start: '2021-01-20', empId: 'EMP-003' },
  { id: 4,  initials: 'AU', name: 'Alice Uwimana',          role: 'Receptionist',    dept: 'Reception',    shift: 'Morning',   sphere: 'sphere-purple', status: 'active',  perf: 85, phone: '+250 788 001 004', email: 'a.uwimana@nexuslab.rw',    start: '2022-04-10', empId: 'EMP-004' },
  { id: 5,  initials: 'RK', name: 'Robert Kayitesi',        role: 'Phlebotomist',    dept: 'Phlebotomy',   shift: 'Morning',   sphere: 'sphere-teal',   status: 'active',  perf: 82, phone: '+250 788 001 005', email: 'r.kayitesi@nexuslab.rw',   start: '2021-09-05', empId: 'EMP-005' },
  { id: 6,  initials: 'HE', name: 'Honorine Espérance',     role: 'Nurse',           dept: 'Reception',    shift: 'Night',     sphere: 'sphere-red',    status: 'leave',   perf: 79, phone: '+250 788 001 006', email: 'h.esperance@nexuslab.rw',  start: '2023-02-14', empId: 'EMP-006' },
  { id: 7,  initials: 'CM', name: 'Claude Mugisha',         role: 'Lab Manager',     dept: 'Hematology',   shift: 'Morning',   sphere: 'sphere-blue',   status: 'active',  perf: 94, phone: '+250 788 001 007', email: 'c.mugisha@nexuslab.rw',    start: '2018-07-22', empId: 'EMP-007' },
  { id: 8,  initials: 'NK', name: 'Nadine Karabo',          role: 'Lab Technician',  dept: 'Blood Bank',   shift: 'Afternoon', sphere: 'sphere-green',  status: 'active',  perf: 87, phone: '+250 788 001 008', email: 'n.karabo@nexuslab.rw',     start: '2022-11-01', empId: 'EMP-008' },
  { id: 9,  initials: 'BM', name: 'Bruno Murenzi',          role: 'Pathologist',     dept: 'Microbiology', shift: 'Night',     sphere: 'sphere-purple', status: 'active',  perf: 72, phone: '+250 788 001 009', email: 'b.murenzi@nexuslab.rw',    start: '2020-03-18', empId: 'EMP-009' },
  { id: 10, initials: 'ES', name: 'Eliza Semana',           role: 'Lab Manager',     dept: 'Chemistry',    shift: 'Morning',   sphere: 'sphere-teal',   status: 'active',  perf: 93, phone: '+250 788 001 010', email: 'e.semana@nexuslab.rw',     start: '2017-12-01', empId: 'EMP-010' },
];

const DEMO_LEAVES = [
  { id: 1, staffId: 7, staffName: 'Claude Mugisha',     role: 'Lab Manager',    type: 'Annual Leave', from: '2026-05-20', to: '2026-05-24', days: 5, reason: 'Family vacation',          status: 'pending'  },
  { id: 2, staffId: 6, staffName: 'Honorine Espérance', role: 'Nurse',          type: 'Sick Leave',   from: '2026-05-13', to: '2026-05-14', days: 2, reason: 'Medical appointment',       status: 'approved' },
  { id: 3, staffId: 3, staffName: 'Patrick Habimana',   role: 'Lab Technician', type: 'Study Leave',  from: '2026-06-01', to: '2026-06-05', days: 5, reason: 'Lab certification course',  status: 'pending'  },
  { id: 4, staffId: 5, staffName: 'Robert Kayitesi',    role: 'Phlebotomist',   type: 'Emergency',    from: '2026-05-10', to: '2026-05-11', days: 2, reason: 'Family emergency',         status: 'approved' },
];

const LEAVE_TYPES_EMOJI = {
  'Annual Leave': '🌴',
  'Sick Leave':   '🏥',
  'Maternity':    '🤱',
  'Emergency':    '🚨',
  'Study Leave':  '📚',
};

const LEAVE_BALANCE = {
  'Annual Leave': { total: 21, used: 4 },
  'Sick Leave':   { total: 14, used: 2 },
  'Maternity':    { total: 84, used: 0 },
  'Emergency':    { total: 5,  used: 2 },
  'Study Leave':  { total: 10, used: 0 },
};

const DEMO_FAULTS = [
  { id: 1, staffId: 9, staffName: 'Bruno Murenzi',   type: 'auto',   faultType: 'tat_missed',       category: '⏱️ TAT',         severity: 'Major',    pts: -5,  desc: 'CBC result reported 2h 20min after TAT deadline', date: '2026-05-12', impact: 'Patient discharge delayed', action: 'Counselled', source: 'TAT Monitor' },
  { id: 2, staffId: 2, staffName: 'Marie Mutoni',    type: 'auto',   faultType: 'qc_failure',       category: '🔬 Analytical',   severity: 'Major',    pts: -3,  desc: 'QC failure on glucose analyser (L2 OOS)', date: '2026-05-11', impact: '15 results held for repeat', action: 'QC repeated, instrument recalibrated', source: 'QC System' },
  { id: 3, staffId: 9, staffName: 'Bruno Murenzi',   type: 'auto',   faultType: 'tat_missed',       category: '⏱️ TAT',         severity: 'Minor',    pts: -1,  desc: 'Urinalysis TAT breach — 15 min overrun', date: '2026-05-10', impact: 'Minimal', action: 'Workload reviewed', source: 'TAT Monitor' },
  { id: 4, staffId: 3, staffName: 'Patrick Habimana', type: 'manual', faultType: 'missing_entry',   category: '📝 Documentation', severity: 'Minor',   pts: -2,  desc: 'Patient ID missing on culture request form', date: '2026-05-09', impact: 'Specimen nearly rejected', action: 'Retrained on SOP-DOC-04', source: 'Supervisor' },
  { id: 5, staffId: 7, staffName: 'Claude Mugisha',  type: 'positive', faultType: 'innovation',     category: '🌟 Achievement',  severity: null,       pts: +5,  desc: 'Proposed and implemented new specimen barcode tracking workflow — adopted lab-wide', date: '2026-05-08', impact: 'Reduced pre-analytical errors by 30%', action: '', source: 'Director' },
  { id: 6, staffId: 2, staffName: 'Marie Mutoni',    type: 'positive', faultType: 'exceptional_care', category: '🌟 Achievement', severity: null,       pts: +2,  desc: 'Exceptional patient communication during difficult venepuncture scenario', date: '2026-05-07', impact: 'Patient satisfaction score improved', action: '', source: 'HOD' },
];

const DEMO_PERFORMANCE_CATEGORIES = {
  1:  { Accuracy: 98, Punctuality: 96, Documentation: 94, 'Patient Safety': 99, 'Equipment Care': 95, Teamwork: 94 },
  2:  { Accuracy: 87, Punctuality: 88, Documentation: 85, 'Patient Safety': 90, 'Equipment Care': 86, Teamwork: 92 },
  3:  { Accuracy: 92, Punctuality: 89, Documentation: 90, 'Patient Safety': 93, 'Equipment Care': 88, Teamwork: 91 },
  4:  { Accuracy: 84, Punctuality: 87, Documentation: 88, 'Patient Safety': 84, 'Equipment Care': 82, Teamwork: 85 },
  5:  { Accuracy: 83, Punctuality: 81, Documentation: 79, 'Patient Safety': 86, 'Equipment Care': 84, Teamwork: 80 },
  6:  { Accuracy: 78, Punctuality: 77, Documentation: 82, 'Patient Safety': 80, 'Equipment Care': 75, Teamwork: 83 },
  7:  { Accuracy: 95, Punctuality: 94, Documentation: 96, 'Patient Safety': 95, 'Equipment Care': 92, Teamwork: 94 },
  8:  { Accuracy: 88, Punctuality: 86, Documentation: 84, 'Patient Safety': 90, 'Equipment Care': 87, Teamwork: 89 },
  9:  { Accuracy: 71, Punctuality: 69, Documentation: 74, 'Patient Safety': 73, 'Equipment Care': 70, Teamwork: 75 },
  10: { Accuracy: 94, Punctuality: 93, Documentation: 92, 'Patient Safety': 95, 'Equipment Care': 91, Teamwork: 93 },
};

const TREND_MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];

const DEMO_ATTENDANCE = [
  { staffId: 1, staffName: 'Dr. Jean Nkurunziza', role: 'Pathologist',    checkIn: '06:02', checkOut: '14:08', hours: '8h 06m', status: 'present' },
  { staffId: 2, staffName: 'Marie Mutoni',         role: 'Lab Technician', checkIn: '06:18', checkOut: '14:10', hours: '7h 52m', status: 'late'    },
  { staffId: 3, staffName: 'Patrick Habimana',     role: 'Lab Technician', checkIn: '14:01', checkOut: '22:05', hours: '8h 04m', status: 'present' },
  { staffId: 4, staffName: 'Alice Uwimana',         role: 'Receptionist',   checkIn: '05:58', checkOut: '14:02', hours: '8h 04m', status: 'present' },
  { staffId: 5, staffName: 'Robert Kayitesi',       role: 'Phlebotomist',   checkIn: '06:00', checkOut: '14:00', hours: '8h 00m', status: 'present' },
  { staffId: 6, staffName: 'Honorine Espérance',    role: 'Nurse',          checkIn: '—',     checkOut: '—',     hours: '—',      status: 'leave'   },
  { staffId: 7, staffName: 'Claude Mugisha',        role: 'Lab Manager',    checkIn: '06:00', checkOut: '14:05', hours: '8h 05m', status: 'present' },
  { staffId: 8, staffName: 'Nadine Karabo',         role: 'Lab Technician', checkIn: '14:00', checkOut: '22:02', hours: '8h 02m', status: 'present' },
  { staffId: 9, staffName: 'Bruno Murenzi',         role: 'Pathologist',    checkIn: '—',     checkOut: '—',     hours: '—',      status: 'absent'  },
  { staffId: 10, staffName: 'Eliza Semana',         role: 'Lab Manager',    checkIn: '06:05', checkOut: '14:10', hours: '8h 05m', status: 'present' },
];

const DEMO_TRAINING = [
  { programme: 'Biosafety Level 2 Refresher',          staff: 'All Lab Technicians', date: '2026-05-28', duration: '4h', status: 'upcoming'   },
  { programme: 'Haematology QC Fundamentals',          staff: 'Marie Mutoni',        date: '2026-06-02', duration: '8h', status: 'upcoming'   },
  { programme: 'Blood Bank Crossmatch SOP',            staff: 'Nadine Karabo',       date: '2026-05-16', duration: '3h', status: 'completed'  },
  { programme: 'Laboratory Management Certification',  staff: 'Eliza Semana',        date: '2026-04-10', duration: '3d', status: 'completed'  },
  { programme: 'Patient Communication Workshop',       staff: 'All Staff',           date: '2026-06-15', duration: '2h', status: 'upcoming'   },
];

const DEMO_CERTS = [
  { icon: '🏆', name: 'Best Performer Q1 2026', staff: 'Dr. Jean Nkurunziza', date: 'Mar 2026' },
  { icon: '🎖️', name: 'Innovation Award',       staff: 'Claude Mugisha',      date: 'May 2026' },
  { icon: '📜', name: 'BSL-2 Certified',        staff: 'Nadine Karabo',       date: 'Apr 2026' },
  { icon: '⭐', name: 'Patient Care Award',     staff: 'Marie Mutoni',        date: 'May 2026' },
  { icon: '🥇', name: 'Zero Error Month',       staff: 'Eliza Semana',        date: 'Feb 2026' },
  { icon: '📚', name: 'CPD Excellence',         staff: 'Patrick Habimana',    date: 'Mar 2026' },
];

const DEMO_CPD = [
  { staffId: 1,  staffName: 'Dr. Jean Nkurunziza', dept: 'Hematology',   pts: 48, target: 50 },
  { staffId: 7,  staffName: 'Claude Mugisha',       dept: 'Hematology',   pts: 45, target: 50 },
  { staffId: 10, staffName: 'Eliza Semana',         dept: 'Chemistry',    pts: 42, target: 50 },
  { staffId: 3,  staffName: 'Patrick Habimana',     dept: 'Microbiology', pts: 30, target: 50 },
  { staffId: 2,  staffName: 'Marie Mutoni',         dept: 'Chemistry',    pts: 27, target: 50 },
  { staffId: 8,  staffName: 'Nadine Karabo',        dept: 'Blood Bank',   pts: 25, target: 50 },
];

/* ── State ─────────────────────────────────────────────────────── */
let state = {
  staffList:        [...DEMO_STAFF],
  leaveRequests:    [...DEMO_LEAVES],
  faults:           [...DEMO_FAULTS],
  currentWeekStart: null,   // Monday of current week (Date)
  timetableData:    {},      // { 'staffId-YYYY-MM-DD': shift }
  selectedStaffId:  DEMO_STAFF[0].id,
  perfChart:        null,
  faultMode:        'auto',  // 'auto' | 'manual'
  selectedFaultSeverity: 'Major',
  isPublished:      false,
  pickerTarget:     null,    // { staffId, date }
};

/* ── Utilities ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

function fmt(date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function scoreColor(score) {
  if (score >= 90) return 'var(--alert-green)';
  if (score >= 75) return 'var(--blue-glow)';
  if (score >= 60) return 'var(--alert-yellow)';
  return 'var(--alert-red)';
}

function showToast(msg, type = 'success') {
  if (window.NEXUS && window.NEXUS.toast) { window.NEXUS.toast(msg, type); return; }
  const t = el('div', `toast toast-${type}`, msg);
  t.style.cssText = `
    position:fixed;bottom:20px;right:20px;z-index:99999;
    background:var(--bg-elevated);border:1px solid var(--border-mid);
    padding:10px 18px;border-radius:var(--radius-md);font-size:var(--text-sm);
    color:var(--text-primary);box-shadow:var(--glass-shadow);
    animation:toastIn 0.2s var(--ease-out);
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

/* API helpers */
const BASE = (window.NEXUS && window.NEXUS.apiBase) || '/api/v1';
const CSRF = () => (window.NEXUS && window.NEXUS.csrf) || '';

async function apiFetch(url, options = {}) {
  const defaults = {
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF() }
  };
  try {
    const res = await fetch(BASE + url, { ...defaults, ...options, headers: { ...defaults.headers, ...(options.headers || {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null; // fallback to demo data
  }
}

/* ── Init ──────────────────────────────────────────────────────── */
function init() {
  state.currentWeekStart = getMonday(new Date());
  buildInitialTimetable();
  initTabs();
  loadKPIs();
  loadStaffDirectory({});
  renderTimetable();
  loadLeaveRequests();
  loadPerformance(state.selectedStaffId);
  loadAttendance();
  loadRecognition();
  bindGlobalEvents();
}

/* ── KPIs ──────────────────────────────────────────────────────── */
function loadKPIs() {
  const total   = DEMO_STAFF.length;
  const onDuty  = DEMO_STAFF.filter(s => s.status === 'active' && ['Morning','Afternoon','Night'].includes(s.shift)).length;
  const onLeave = DEMO_STAFF.filter(s => s.status === 'leave').length;
  const pending = DEMO_LEAVES.filter(l => l.status === 'pending').length;
  const night   = DEMO_STAFF.filter(s => s.shift === 'Night').length;
  const avgPerf = Math.round(DEMO_STAFF.reduce((a, s) => a + s.perf, 0) / DEMO_STAFF.length);

  animateCounter($('kpi-total'),   total);
  animateCounter($('kpi-onduty'),  onDuty);
  animateCounter($('kpi-onleave'), onLeave);
  animateCounter($('kpi-pending'), pending);
  animateCounter($('kpi-night'),   night);
  $('kpi-avgperf').textContent = avgPerf + '%';
}

function animateCounter(el, target) {
  if (!el) return;
  let cur = 0;
  const step = Math.ceil(target / 20);
  const iv = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(iv);
  }, 40);
}

/* ── Tab System ────────────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('#sh-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sh-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sh-body .tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = $(btn.dataset.pane);
      if (pane) pane.classList.add('active');
    });
  });
}

/* ── Staff Directory ───────────────────────────────────────────── */
function loadStaffDirectory(filters = {}) {
  let list = [...state.staffList];
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(s => s.name.toLowerCase().includes(q) || s.dept.toLowerCase().includes(q) || s.empId.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
  }
  if (filters.dept)  list = list.filter(s => s.dept === filters.dept);
  if (filters.role)  list = list.filter(s => s.role === filters.role);
  if (filters.shift) list = list.filter(s => s.shift === filters.shift);
  renderStaffCards(list);
}

function renderStaffCards(list) {
  const grid = $('staff-grid');
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No staff found</div></div>`;
    return;
  }
  grid.innerHTML = list.map(s => `
    <div class="staff-card" data-staff-id="${s.id}" role="button" tabindex="0" aria-label="View ${s.name} profile">
      <div class="staff-avatar-sphere ${s.sphere}" style="position:relative">
        ${s.initials}
        <div class="staff-status-dot ${s.status === 'active' ? 'dot-active' : s.status === 'leave' ? 'dot-leave' : 'dot-off'}"></div>
      </div>
      <div class="staff-card-info">
        <div class="staff-name">${s.name}</div>
        <div class="staff-role">🏷️ ${s.role}</div>
        <div class="staff-dept">${deptEmoji(s.dept)} ${s.dept}</div>
        <div class="staff-emp-id">${s.empId}</div>
      </div>
      <div class="staff-card-meta">
        <span class="shift-badge shift-${s.shift.toLowerCase()}">${shiftEmoji(s.shift)} ${s.shift}</span>
        <div class="staff-perf-ring">
          <div class="staff-perf-score" style="color:${scoreColor(s.perf)}">${s.perf}</div>
          <div class="staff-perf-label">Score</div>
        </div>
      </div>
      <div class="staff-card-actions">
        <button class="btn-icon btn-icon-sm btn" title="View Profile" onclick="event.stopPropagation(); openFlyout(${s.id})"><i class="fas fa-eye"></i></button>
        <button class="btn-icon btn-icon-sm btn" title="Performance" onclick="event.stopPropagation(); openPerfTab(${s.id})"><i class="fas fa-chart-line"></i></button>
      </div>
    </div>
  `).join('');

  $('dir-count').textContent = `${list.length} staff`;

  grid.querySelectorAll('.staff-card').forEach(card => {
    card.addEventListener('click', () => openFlyout(+card.dataset.staffId));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openFlyout(+card.dataset.staffId); });
  });
}

function deptEmoji(dept) {
  const map = { Hematology: '🔴', Chemistry: '🧫', Microbiology: '🦠', 'Blood Bank': '🩸', Reception: '📡', Phlebotomy: '💉' };
  return map[dept] || '🏥';
}

function shiftEmoji(shift) {
  const map = { Morning: '☀️', Afternoon: '🌤️', Night: '🌙', Off: '🔴', Leave: '🟡' };
  return map[shift] || '—';
}

/* ── Staff Flyout ──────────────────────────────────────────────── */
function openFlyout(staffId) {
  const s = DEMO_STAFF.find(x => x.id === staffId);
  if (!s) return;
  const overlay = $('sh-flyout-overlay');
  const flyout  = $('sh-flyout');
  const body    = $('sh-flyout-body');
  $('flyout-title').textContent = '👤 Staff Profile';

  const faults   = state.faults.filter(f => f.staffId === staffId && f.type !== 'positive');
  const pos      = state.faults.filter(f => f.staffId === staffId && f.type === 'positive');
  const leaveHist = state.leaveRequests.filter(l => l.staffId === staffId);
  const attRec   = DEMO_ATTENDANCE.find(a => a.staffId === staffId);
  const cats     = DEMO_PERFORMANCE_CATEGORIES[staffId] || {};
  const catAvg   = Object.values(cats).length ? Math.round(Object.values(cats).reduce((a,b)=>a+b,0)/Object.values(cats).length) : s.perf;

  body.innerHTML = `
    <div class="sh-flyout-avatar-row">
      <div class="staff-avatar-sphere sh-flyout-avatar ${s.sphere}" style="position:relative">
        ${s.initials}
        <div class="staff-status-dot ${s.status === 'active' ? 'dot-active' : 'dot-leave'}"></div>
      </div>
      <div>
        <div class="sh-flyout-info-name">${s.name}</div>
        <div class="sh-flyout-info-role">🏷️ ${s.role}</div>
        <div class="sh-flyout-info-dept">${deptEmoji(s.dept)} ${s.dept} · ${s.empId}</div>
        <div style="margin-top:6px"><span class="shift-badge shift-${s.shift.toLowerCase()}">${shiftEmoji(s.shift)} ${s.shift}</span></div>
      </div>
    </div>

    <div class="sh-flyout-section-title">📊 Performance Overview</div>
    <div class="sh-flyout-stat-row">
      <div class="sh-flyout-stat">
        <div class="sh-flyout-stat-val" style="color:${scoreColor(s.perf)}">${s.perf}</div>
        <div class="sh-flyout-stat-lbl">Overall Score</div>
      </div>
      <div class="sh-flyout-stat">
        <div class="sh-flyout-stat-val" style="color:var(--alert-orange)">${faults.length}</div>
        <div class="sh-flyout-stat-lbl">Fault Events</div>
      </div>
      <div class="sh-flyout-stat">
        <div class="sh-flyout-stat-val" style="color:var(--alert-green)">${pos.length}</div>
        <div class="sh-flyout-stat-lbl">Positive Marks</div>
      </div>
      <div class="sh-flyout-stat">
        <div class="sh-flyout-stat-val">${leaveHist.length}</div>
        <div class="sh-flyout-stat-lbl">Leave Records</div>
      </div>
    </div>

    <div class="sh-flyout-section-title">📋 Contact & Info</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:var(--space-lg)">
      <div style="display:flex;gap:var(--space-sm);font-size:var(--text-xs);color:var(--text-secondary)">
        <span style="color:var(--text-muted);width:80px;flex-shrink:0">📧 Email</span><span>${s.email}</span>
      </div>
      <div style="display:flex;gap:var(--space-sm);font-size:var(--text-xs);color:var(--text-secondary)">
        <span style="color:var(--text-muted);width:80px;flex-shrink:0">📞 Phone</span><span>${s.phone}</span>
      </div>
      <div style="display:flex;gap:var(--space-sm);font-size:var(--text-xs);color:var(--text-secondary)">
        <span style="color:var(--text-muted);width:80px;flex-shrink:0">📅 Started</span><span>${s.start}</span>
      </div>
      <div style="display:flex;gap:var(--space-sm);font-size:var(--text-xs);color:var(--text-secondary)">
        <span style="color:var(--text-muted);width:80px;flex-shrink:0">⏰ Today</span>
        <span>${attRec ? (attRec.status === 'present' ? `✅ Present · In: ${attRec.checkIn}` : attRec.status === 'late' ? `🟡 Late · In: ${attRec.checkIn}` : attRec.status === 'leave' ? '🌴 On Leave' : '❌ Absent') : '—'}</span>
      </div>
    </div>

    <div class="sh-flyout-section-title">⭐ Recent Marks</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${state.faults.filter(f => f.staffId === staffId).slice(0, 4).map(f => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:6px;background:var(--bg-deep);border-radius:var(--radius-sm);border-left:3px solid ${f.type==='positive' ? 'var(--alert-green)' : f.type==='auto' ? 'var(--blue-glow)' : 'var(--alert-orange)'}">
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:${f.pts>0?'var(--alert-green)':'var(--alert-red)'};flex-shrink:0">${f.pts>0?'+':''}${f.pts}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--text-primary)">${f.desc}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${f.date}</div>
          </div>
        </div>
      `).join('') || '<div style="font-size:var(--text-xs);color:var(--text-muted);padding:8px 0">No recent marks</div>'}
    </div>

    <div style="margin-top:var(--space-lg);display:flex;gap:var(--space-sm)">
      <button class="btn btn-primary btn-sm" style="flex:1" onclick="openPerfTab(${s.id})"><span>⭐</span> Full Performance</button>
    </div>
  `;

  overlay.classList.add('open');
  flyout.classList.add('open');
}

function closeFlyout() {
  $('sh-flyout-overlay').classList.remove('open');
  $('sh-flyout').classList.remove('open');
}

function openPerfTab(staffId) {
  closeFlyout();
  document.querySelectorAll('#sh-tabs .tab-btn')[3].click();
  state.selectedStaffId = staffId;
  const sel = $('perf-staff-select');
  if (sel) sel.value = staffId;
  loadPerformance(staffId);
}

/* ── Timetable ─────────────────────────────────────────────────── */
function buildInitialTimetable() {
  const shifts = ['Morning', 'Afternoon', 'Night', 'Morning', 'Off', 'Off'];
  DEMO_STAFF.forEach(s => {
    for (let d = 0; d < 7; d++) {
      const date = addDays(state.currentWeekStart, d);
      const key = `${s.id}-${fmtISO(date)}`;
      let shift;
      if (s.status === 'leave') {
        shift = 'Leave';
      } else if (d >= 5) {
        shift = 'Off';
      } else {
        const rotIdx = ((s.id - 1) + d) % shifts.length;
        shift = shifts[rotIdx];
        if (shift === 'Off') shift = s.shift;
      }
      state.timetableData[key] = shift;
    }
  });
}

function renderTimetable(deptFilter = '') {
  const thead = $('tt-thead');
  const tbody = $('tt-tbody');
  if (!thead || !tbody) return;

  const today = fmtISO(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.currentWeekStart, i));
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Week label
  const endDate = addDays(state.currentWeekStart, 6);
  $('tt-week-label').textContent = `Week of ${fmt(state.currentWeekStart)}`;

  // Header
  thead.innerHTML = `<tr>
    <th style="text-align:left;padding-left:var(--space-md)">👤 Staff</th>
    ${days.map((d, i) => {
      const iso = fmtISO(d);
      const isToday = iso === today;
      return `<th><div class="timetable-header-day ${isToday ? 'tt-day-today' : ''}">
        <span class="tt-day-name">${dayNames[i]}</span>
        <span class="tt-day-date">${d.getDate()} ${d.toLocaleString('en',{month:'short'})}</span>
      </div></th>`;
    }).join('')}
  </tr>`;

  // Rows
  let staff = deptFilter ? DEMO_STAFF.filter(s => s.dept === deptFilter) : [...DEMO_STAFF];

  tbody.innerHTML = staff.map(s => {
    const cells = days.map(d => {
      const iso = fmtISO(d);
      const key = `${s.id}-${iso}`;
      const shift = state.timetableData[key] || 'Off';
      const isToday = iso === today;
      return `<td class="timetable-cell cell-${shift.toLowerCase()}${isToday?' cell-today':''}"
        data-staff-id="${s.id}" data-date="${iso}"
        title="Click to change shift">
        <span class="shift-badge shift-${shift.toLowerCase()}">${shiftEmoji(shift)} ${shift}</span>
      </td>`;
    }).join('');

    return `<tr>
      <td class="tt-staff-cell">
        <div class="sh-mini-sphere ${s.sphere}">${s.initials}</div>
        <div>
          <div class="tt-staff-name">${s.name.split(' ').slice(-1)[0].length > 8 ? s.name.split(' ').slice(0,2).map((n,i)=>i===0?n[0]+'.':n).join(' ') : s.name}</div>
          <div class="tt-staff-role">${s.role}</div>
        </div>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  // Stats
  const allShifts = Object.entries(state.timetableData).filter(([k]) => {
    const parts = k.split('-');
    const date = parts.slice(1).join('-');
    return days.some(d => fmtISO(d) === date);
  });
  const covered = allShifts.filter(([, v]) => v !== 'Off' && v !== 'Leave').length;
  const understaffed = days.filter(d => {
    const iso = fmtISO(d);
    const active = DEMO_STAFF.filter(s => {
      const key = `${s.id}-${iso}`;
      const shift = state.timetableData[key] || 'Off';
      return shift !== 'Off' && shift !== 'Leave';
    }).length;
    return active < 6;
  }).length;
  const onLeaveCount = DEMO_STAFF.filter(s => {
    const key = `${s.id}-${today}`;
    return (state.timetableData[key] || '') === 'Leave';
  }).length;

  $('tt-shifts-covered').textContent = covered;
  $('tt-understaffed').textContent   = understaffed;
  $('tt-leave-count').textContent    = onLeaveCount;

  const warnWrap = $('tt-understaffed-wrap');
  if (warnWrap) warnWrap.style.opacity = understaffed > 0 ? '1' : '0.4';

  // Cell click → shift picker
  tbody.querySelectorAll('.timetable-cell').forEach(cell => {
    cell.addEventListener('click', e => openShiftPicker(e, cell));
  });
}

function openShiftPicker(e, cell) {
  e.stopPropagation();
  const picker = $('shift-picker');
  if (!picker) return;
  state.pickerTarget = { staffId: +cell.dataset.staffId, date: cell.dataset.date };
  const rect = cell.getBoundingClientRect();
  picker.style.display = 'block';
  picker.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
  picker.style.top  = (rect.bottom + 4) + 'px';
}

function closeShiftPicker() {
  const picker = $('shift-picker');
  if (picker) picker.style.display = 'none';
  state.pickerTarget = null;
}

function assignShift(staffId, date, shift) {
  const key = `${staffId}-${date}`;
  state.timetableData[key] = shift;
  const deptFilter = $('tt-dept-filter') ? $('tt-dept-filter').value : '';
  renderTimetable(deptFilter);
  showToast(`✅ Shift assigned: ${shiftEmoji(shift)} ${shift}`);
  // POST to API (fire and forget)
  apiFetch('/staffhub/shifts/', {
    method: 'POST',
    body: JSON.stringify({ staff_id: staffId, date, shift })
  });
}

/* ── Leave Management ──────────────────────────────────────────── */
function loadLeaveRequests(statusFilter = 'pending') {
  let list = [...state.leaveRequests];
  if (statusFilter) list = list.filter(l => l.status === statusFilter);
  renderLeaveTable(list);
  renderLeaveCalendar();
  populateLeaveBalanceStaff();
  renderLeaveBalance(DEMO_STAFF[0].id);
}

function renderLeaveTable(list) {
  const tbody = $('leave-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:var(--space-xl)">🌴 No leave requests found</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(l => {
    const emoji = LEAVE_TYPES_EMOJI[l.type] || '📋';
    const statusBadge = l.status === 'pending'
      ? `<span class="badge badge-yellow">⏳ Pending</span>`
      : l.status === 'approved'
      ? `<span class="badge badge-green">✅ Approved</span>`
      : `<span class="badge badge-red">❌ Rejected</span>`;
    const actions = l.status === 'pending' ? `
      <div style="display:flex;gap:4px">
        <button class="btn btn-success btn-xs" onclick="approveLeave(${l.id})"><i class="fas fa-check"></i> Approve</button>
        <button class="btn btn-danger btn-xs" onclick="rejectLeave(${l.id})"><i class="fas fa-xmark"></i> Reject</button>
      </div>` : '';

    return `<tr class="leave-${l.status}">
      <td><div class="sh-table-staff">
        <div class="sh-mini-sphere">${l.staffName.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
        ${l.staffName}
      </div></td>
      <td>${l.role}</td>
      <td><span class="badge">${emoji} ${l.type}</span></td>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${l.from}</td>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${l.to}</td>
      <td style="text-align:center;font-weight:700;color:var(--blue-glow)">${l.days}</td>
      <td style="font-size:var(--text-xs);color:var(--text-muted);max-width:160px">${l.reason}</td>
      <td>${statusBadge}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

function approveLeave(id) {
  const leave = state.leaveRequests.find(l => l.id === id);
  if (!leave) return;
  leave.status = 'approved';
  loadLeaveRequests($('leave-status-filter').value || undefined);
  loadKPIs();
  showToast('✅ Leave approved');
  apiFetch(`/staffhub/leave/${id}/`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
}

function rejectLeave(id) {
  const leave = state.leaveRequests.find(l => l.id === id);
  if (!leave) return;
  leave.status = 'rejected';
  loadLeaveRequests($('leave-status-filter').value || undefined);
  showToast('❌ Leave rejected', 'danger');
  apiFetch(`/staffhub/leave/${id}/`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
}

function populateLeaveBalanceStaff() {
  const sel = $('leave-balance-staff');
  if (!sel || sel.options.length > 0) return;
  DEMO_STAFF.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

function renderLeaveBalance(staffId) {
  const grid = $('leave-balance-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(LEAVE_BALANCE).map(([type, bal]) => `
    <div class="sh-balance-row">
      <div class="sh-balance-label">${LEAVE_TYPES_EMOJI[type] || '📋'} ${type}</div>
      <div>
        <span class="sh-balance-days">${bal.total - bal.used}</span>
        <span class="sh-balance-used"> / ${bal.total} remaining</span>
      </div>
    </div>
  `).join('');
}

function renderLeaveCalendar() {
  const container = $('leave-mini-calendar');
  if (!container) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  $('leave-cal-month').textContent = now.toLocaleString('en', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

  // Build set of leave dates
  const leaveDates = new Set();
  state.leaveRequests.filter(l => l.status === 'approved').forEach(l => {
    const from = new Date(l.from);
    const to   = new Date(l.to);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
      if (d.getFullYear() === year && d.getMonth() === month) {
        leaveDates.add(d.getDate());
      }
    }
  });

  const headers = ['M','T','W','T','F','S','S'].map(h => `<div class="sh-cal-day-header">${h}</div>`).join('');
  const blanks  = Array(startDow).fill('<div class="sh-cal-day cal-other-month"></div>').join('');
  const cells   = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const isToday = day === now.getDate();
    const isLeave = leaveDates.has(day);
    const cls = isToday ? 'cal-today' : isLeave ? 'cal-leave' : '';
    return `<div class="sh-cal-day ${cls}">${day}</div>`;
  }).join('');

  container.innerHTML = `<div class="sh-cal-grid">${headers}${blanks}${cells}</div>`;
}

/* ── Performance ───────────────────────────────────────────────── */
function loadPerformance(staffId) {
  state.selectedStaffId = staffId;
  const s = DEMO_STAFF.find(x => x.id === staffId);
  if (!s) return;
  renderScorecard(s);
  renderFaultList(staffId);
  renderPerfChart(staffId);
}

function renderScorecard(s) {
  const container = $('perf-scorecard');
  if (!container) return;
  const cats = DEMO_PERFORMANCE_CATEGORIES[s.id] || {};
  const catLabels = ['Accuracy', 'Punctuality', 'Documentation', 'Patient Safety', 'Equipment Care', 'Teamwork'];
  const catKeys   = ['accuracy', 'punctuality', 'documentation', 'safety', 'equipment', 'teamwork'];

  const score = s.perf;
  const circ  = 2 * Math.PI * 45;
  const fill  = (score / 100) * circ;
  const color = scoreColor(score);

  const catBars = catLabels.map((label, i) => {
    const val = cats[label] || 0;
    return `
      <div class="score-category-bar scb-${catKeys[i]}">
        <div class="scb-label">${label}</div>
        <div class="scb-track"><div class="scb-fill" style="width:${val}%"></div></div>
        <div class="scb-val">${val}</div>
      </div>`;
  }).join('');

  const faultEvents = state.faults.filter(f => f.staffId === s.id && f.type !== 'positive');
  const posEvents   = state.faults.filter(f => f.staffId === s.id && f.type === 'positive');
  const deductions  = faultEvents.reduce((a, f) => a + Math.abs(f.pts), 0);
  const additions   = posEvents.reduce((a, f) => a + Math.abs(f.pts), 0);

  container.innerHTML = `
    <div class="sh-perf-top">
      <div class="performance-ring-wrap">
        <svg class="performance-ring" viewBox="0 0 100 100" width="120" height="120">
          <circle class="perf-ring-bg" cx="50" cy="50" r="45"/>
          <circle class="perf-ring-fill"
            cx="50" cy="50" r="45"
            stroke="${color}"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${circ - fill}"
            style="transition:stroke-dashoffset 1s var(--ease-out)"
          />
        </svg>
        <div class="perf-ring-label">
          <div class="perf-ring-score" style="color:${color}">${score}</div>
          <div class="perf-ring-max">/100</div>
        </div>
      </div>
      <div class="sh-perf-categories">${catBars}</div>
    </div>
    <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap">
      <div style="background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-md);padding:10px 16px;flex:1;min-width:100px;text-align:center">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--alert-red)">−${deductions}</div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-top:2px">Deductions</div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-md);padding:10px 16px;flex:1;min-width:100px;text-align:center">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--alert-green)">+${additions}</div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-top:2px">Positive Marks</div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-md);padding:10px 16px;flex:1;min-width:100px;text-align:center">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:${color}">${score}</div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-top:2px">Net Score</div>
      </div>
    </div>
  `;
}

function renderFaultList(staffId) {
  const list = $('sh-fault-list');
  if (!list) return;
  const faults = state.faults.filter(f =>
    state.faultMode === 'auto'
      ? f.staffId === staffId && f.type === 'auto'
      : f.staffId === staffId
  );

  if (!faults.length) {
    list.innerHTML = `<div style="padding:var(--space-lg);text-align:center;color:var(--text-muted);font-size:var(--text-xs)">No ${state.faultMode === 'auto' ? 'auto-detected' : ''} events found</div>`;
    return;
  }

  list.innerHTML = faults.map(f => {
    const sevBadge = f.type === 'positive'
      ? `<span class="severity-positive">✨ Achievement</span>`
      : `<span class="severity-${(f.severity||'').toLowerCase()}">${f.severity}</span>`;

    const ptsStr = f.pts > 0
      ? `<span class="fault-points pts-pos">+${f.pts}pts</span>`
      : `<span class="fault-points pts-neg">${f.pts}pts</span>`;

    return `
      <div class="fault-log-entry fault-${f.type}">
        <div class="fault-entry-header">
          <span class="fault-entry-type">${f.category}</span>
          <div class="fault-entry-meta">
            ${sevBadge}
            ${ptsStr}
          </div>
        </div>
        <div class="fault-entry-desc">${f.desc}</div>
        <div class="fault-entry-staff" style="margin-top:3px">
          ${f.type === 'auto' ? `🤖 Auto-detected by ${f.source}` : f.type === 'positive' ? `🌟 Awarded by ${f.source}` : `✍️ Logged by ${f.source}`}
        </div>
        <div class="fault-entry-date">${f.date}</div>
      </div>`;
  }).join('');
}

function renderPerfChart(staffId) {
  const canvas = $('perf-trend-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (state.perfChart) { state.perfChart.destroy(); }

  const s = DEMO_STAFF.find(x => x.id === staffId);
  const baseScore = s ? s.perf : 80;
  const data = TREND_MONTHS.map((_, i) => {
    const variation = (i - 2.5) * 1.5 + (Math.random() * 4 - 2);
    return Math.min(100, Math.max(40, Math.round(baseScore + variation)));
  });
  data[data.length - 1] = baseScore; // current month is exact

  state.perfChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: TREND_MONTHS,
      datasets: [{
        label: 'Performance Score',
        data,
        borderColor: '#00AAFF',
        backgroundColor: 'rgba(0,170,255,0.08)',
        pointBackgroundColor: '#00AAFF',
        pointBorderColor: '#00AAFF',
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,22,53,0.95)',
          borderColor: 'rgba(0,170,255,0.3)',
          borderWidth: 1,
          titleColor: '#7FA8CC',
          bodyColor: '#E8F4FF',
          callbacks: { label: ctx => ` Score: ${ctx.raw}` }
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,170,255,0.06)' },
          ticks: { color: '#4A6880', font: { family: 'Rajdhani', size: 12 } },
        },
        y: {
          min: 40,
          max: 100,
          grid: { color: 'rgba(0,170,255,0.06)' },
          ticks: { color: '#4A6880', font: { family: 'JetBrains Mono', size: 11 } },
        },
      },
    },
  });
}

function logFault(staffId, data) {
  const s = DEMO_STAFF.find(x => x.id === staffId);
  if (!s) return;
  const ptsMap = { Minor: -2, Major: -5, Critical: -15 };
  const pts = ptsMap[data.severity] || -5;
  const faultCatMap = {
    incorrect_result: '🔬 Analytical', qc_failure: '🔬 Analytical', calibration_error: '🔬 Analytical',
    wrong_tube: '📋 Pre-analytical', insufficient_volume: '📋 Pre-analytical', sample_rejection: '📋 Pre-analytical',
    missing_entry: '📝 Documentation', wrong_patient: '📝 Documentation', incomplete_data: '📝 Documentation',
    tat_missed: '⏱️ TAT', delay_reporting: '⏱️ TAT',
    biosafety_breach: '🛡️ Safety', ppe_violation: '🛡️ Safety', spill_unreported: '🛡️ Safety',
    absence: '🤝 Conduct', insubordination: '🤝 Conduct', patient_complaint: '🤝 Conduct',
  };
  const newFault = {
    id: state.faults.length + 1,
    staffId,
    staffName: s.name,
    type: 'manual',
    faultType: data.faultType,
    category: faultCatMap[data.faultType] || '📋 Other',
    severity: data.severity,
    pts,
    desc: data.desc,
    date: new Date().toISOString().split('T')[0],
    impact: data.impact,
    action: data.action,
    source: 'Supervisor',
  };
  state.faults.unshift(newFault);
  // Update performance score
  const staff = DEMO_STAFF.find(x => x.id === staffId);
  if (staff) staff.perf = Math.max(0, staff.perf + pts);

  loadPerformance(staffId);
  showToast(`⚠️ Fault logged: ${pts}pts deduction`, 'danger');
  apiFetch('/staffhub/faults/', { method: 'POST', body: JSON.stringify({ staff_id: staffId, ...data }) });
}

function addPositiveMark(staffId, data) {
  const s = DEMO_STAFF.find(x => x.id === staffId);
  if (!s) return;
  const ptsMap = { exceptional_care: 2, innovation: 5, training: 1, commendation: 1 };
  const pts = ptsMap[data.typeKey] || 1;
  state.faults.unshift({
    id: state.faults.length + 1,
    staffId,
    staffName: s.name,
    type: 'positive',
    faultType: data.typeKey,
    category: '🌟 Achievement',
    severity: null,
    pts: +pts,
    desc: data.notes || data.typeLabel,
    date: new Date().toISOString().split('T')[0],
    impact: '',
    action: '',
    source: 'HOD',
  });
  s.perf = Math.min(100, s.perf + pts);
  loadPerformance(staffId);
  showToast(`🌟 Positive mark added: +${pts}pts`);
}

function generatePerformanceReport(staffId) {
  const s = DEMO_STAFF.find(x => x.id === staffId);
  if (!s) return;
  showToast('📤 Generating signed performance report…');
  setTimeout(() => {
    if (window.NexusSig && typeof window.NexusSig.sign === 'function') {
      window.NexusSig.sign({ type: 'performance_report', staffId, staffName: s.name, score: s.perf });
    }
    window.print();
  }, 600);
}

/* ── Attendance ────────────────────────────────────────────────── */
function loadAttendance() {
  renderAttendanceBoard(DEMO_ATTENDANCE);
  populateAttSummaryStaff();
  renderAttSummary(DEMO_STAFF[0].id);
}

function renderAttendanceBoard(list) {
  // Status pills
  const statusRow = $('att-status-row');
  if (statusRow) {
    const counts = { present: 0, late: 0, absent: 0, leave: 0 };
    list.forEach(a => counts[a.status] = (counts[a.status] || 0) + 1);
    statusRow.innerHTML = `
      <div class="sh-att-status-pill att-pill-present">✅ Present <strong>${counts.present}</strong></div>
      <div class="sh-att-status-pill att-pill-late">🟡 Late <strong>${counts.late}</strong></div>
      <div class="sh-att-status-pill att-pill-absent">❌ Absent <strong>${counts.absent}</strong></div>
      <div class="sh-att-status-pill att-pill-leave">🌴 Leave <strong>${counts.leave}</strong></div>
    `;
  }

  const tbody = $('att-log-tbody');
  if (!tbody) return;

  const statusBadge = s =>
    s === 'present' ? '<span class="badge badge-green">✅ Present</span>'
  : s === 'late'    ? '<span class="badge badge-orange">🟡 Late</span>'
  : s === 'absent'  ? '<span class="badge badge-red">❌ Absent</span>'
  : '<span class="badge badge-yellow">🌴 Leave</span>';

  tbody.innerHTML = list.map(a => {
    const initials = a.staffName.split(' ').map(n=>n[0]).slice(0,2).join('');
    const rowCls = a.status === 'late' ? 'att-row-late' : a.status === 'absent' ? 'att-row-absent' : '';
    return `<tr class="${rowCls}">
      <td><div class="sh-table-staff">
        <div class="sh-mini-sphere">${initials}</div>
        ${a.staffName}
      </div></td>
      <td style="font-size:var(--text-xs);color:var(--text-muted)">${a.role}</td>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs);color:${a.status==='late'?'var(--alert-orange)':'inherit'}">${a.checkIn}</td>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${a.checkOut}</td>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--alert-green)">${a.hours}</td>
      <td>${statusBadge(a.status)}</td>
      <td style="font-size:var(--text-xs);color:var(--text-muted)">${a.status==='late'?'Arrived 18 min late':a.status==='absent'?'No notification':a.status==='leave'?'Approved leave':''}</td>
    </tr>`;
  }).join('');
}

function populateAttSummaryStaff() {
  const sel = $('att-summary-staff');
  if (!sel || sel.options.length > 0) return;
  DEMO_STAFF.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

function renderAttSummary(staffId) {
  const container = $('att-month-stats');
  if (!container) return;
  const stats = [
    { label: '📅 Work Days (May)', val: '14 / 22' },
    { label: '✅ Present',         val: '12' },
    { label: '🟡 Late Arrivals',  val: '2', color: 'var(--alert-orange)' },
    { label: '❌ Absent',          val: '0', color: 'var(--alert-green)' },
    { label: '🌴 Leave Taken',    val: '2' },
    { label: '📊 Attendance %',   val: '86%', color: 'var(--blue-glow)' },
    { label: '⏱️ Overtime Hours',  val: '3h 20m', color: 'var(--cyan)' },
  ];
  container.innerHTML = stats.map(s => `
    <div class="sh-att-stat-row">
      <span class="sh-att-stat-label">${s.label}</span>
      <span class="sh-att-stat-val" style="color:${s.color||'var(--text-primary)'}">${s.val}</span>
    </div>
  `).join('');
}

/* ── Recognition ───────────────────────────────────────────────── */
function loadRecognition() {
  renderLeaderboard();
  renderCPD();
  renderTraining();
  renderCertificates();
}

function renderLeaderboard() {
  const list = $('leaderboard-list');
  if (!list) return;
  const sorted = [...DEMO_STAFF].sort((a, b) => b.perf - a.perf).slice(0, 8);
  list.innerHTML = sorted.map((s, i) => {
    const rank = i + 1;
    const rankCls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const change = s.perf > 88 ? '▲ +2' : s.perf > 78 ? '— 0' : '▼ -1';
    const changeCls = s.perf > 88 ? 'change-up' : s.perf > 78 ? 'change-same' : 'change-down';

    return `
      <div class="sh-leader-row">
        <div class="sh-leader-rank ${rankCls}">${rankIcon}</div>
        <div class="sh-mini-sphere ${s.sphere}">${s.initials}</div>
        <div class="sh-leader-info">
          <div class="sh-leader-name">${s.name}</div>
          <div class="sh-leader-role">${s.role} · ${deptEmoji(s.dept)} ${s.dept}</div>
        </div>
        <div class="sh-leader-score">
          <div class="sh-leader-score-val">${s.perf}</div>
          <div class="sh-leader-score-lbl">score</div>
        </div>
        <div class="sh-leader-change ${changeCls}">${change}</div>
      </div>`;
  }).join('');
}

function renderCPD() {
  const list = $('cpd-list');
  if (!list) return;
  list.innerHTML = DEMO_CPD.map(c => `
    <div class="sh-cpd-row">
      <div>
        <div class="sh-cpd-staff">${c.staffName}</div>
        <div class="sh-cpd-dept">${deptEmoji(c.dept)} ${c.dept}</div>
      </div>
      <div class="sh-cpd-bar-wrap">
        <div class="sh-cpd-track"><div class="sh-cpd-fill" style="width:${(c.pts/c.target)*100}%"></div></div>
        <div class="sh-cpd-pts">${c.pts}<span class="sh-cpd-target">/${c.target}</span></div>
      </div>
    </div>
  `).join('');
}

function renderTraining() {
  const tbody = $('training-tbody');
  if (!tbody) return;
  tbody.innerHTML = DEMO_TRAINING.map(t => {
    const badge = t.status === 'completed'
      ? `<span class="badge badge-green">✅ Completed</span>`
      : `<span class="badge badge-blue">📅 Upcoming</span>`;
    return `<tr>
      <td style="font-weight:600;color:var(--text-primary)">${t.programme}</td>
      <td style="font-size:var(--text-xs);color:var(--text-secondary)">${t.staff}</td>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${t.date}</td>
      <td style="font-size:var(--text-xs);color:var(--text-muted)">${t.duration}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

function renderCertificates() {
  const grid = $('cert-grid');
  if (!grid) return;
  grid.innerHTML = DEMO_CERTS.map(c => `
    <div class="sh-cert-card">
      <div class="sh-cert-icon">${c.icon}</div>
      <div class="sh-cert-name">${c.name}</div>
      <div class="sh-cert-staff">${c.staff}</div>
      <div class="sh-cert-date">${c.date}</div>
    </div>
  `).join('');
}

/* ── Populate Selects ──────────────────────────────────────────── */
function populateStaffSelects() {
  const ids = ['perf-staff-select', 'fault-staff-sel', 'pos-staff-sel', 'leave-staff-sel'];
  ids.forEach(id => {
    const sel = $(id);
    if (!sel) return;
    DEMO_STAFF.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.empId})`;
      sel.appendChild(opt);
    });
    if (id === 'perf-staff-select') sel.value = state.selectedStaffId;
  });
}

/* ── Modal Helpers ─────────────────────────────────────────────── */
function openModal(id) {
  const m = $(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = $(id);
  if (m) m.classList.remove('open');
}

/* ── Bind Global Events ────────────────────────────────────────── */
function bindGlobalEvents() {
  populateStaffSelects();

  // Directory filters
  const dirSearch = $('dir-search');
  if (dirSearch) {
    dirSearch.addEventListener('input', () => {
      loadStaffDirectory(getDirectoryFilters());
    });
  }

  ['dir-dept-filter', 'dir-role-filter', 'dir-shift-filter'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', () => loadStaffDirectory(getDirectoryFilters()));
  });

  // Add staff
  const addBtn = $('sh-add-staff-btn');
  if (addBtn) addBtn.addEventListener('click', () => openModal('add-staff-modal'));

  const addConfirm = $('add-staff-confirm');
  if (addConfirm) addConfirm.addEventListener('click', () => {
    const fname = $('add-fname') && $('add-fname').value.trim();
    const lname = $('add-lname') && $('add-lname').value.trim();
    if (!fname || !lname) { showToast('Please enter first and last name', 'danger'); return; }
    const newStaff = {
      id: DEMO_STAFF.length + 1,
      initials: fname[0] + lname[0],
      name: `${fname} ${lname}`,
      role: $('add-role').value,
      dept: $('add-dept').value,
      shift: $('add-shift').value,
      sphere: 'sphere-blue',
      status: 'active',
      perf: 80,
      phone: $('add-phone').value,
      email: $('add-email').value,
      start: $('add-start').value || new Date().toISOString().split('T')[0],
      empId: `EMP-${String(DEMO_STAFF.length + 1).padStart(3,'0')}`,
    };
    DEMO_STAFF.push(newStaff);
    state.staffList = [...DEMO_STAFF];
    closeModal('add-staff-modal');
    loadStaffDirectory({});
    loadKPIs();
    showToast(`✅ ${newStaff.name} added to StaffHub`);
  });

  // Flyout close
  const flyoutClose = $('sh-flyout-close');
  const flyoutOverlay = $('sh-flyout-overlay');
  if (flyoutClose) flyoutClose.addEventListener('click', closeFlyout);
  if (flyoutOverlay) flyoutOverlay.addEventListener('click', closeFlyout);

  // Timetable
  const prevWeek = $('tt-prev-week');
  const nextWeek = $('tt-next-week');
  if (prevWeek) prevWeek.addEventListener('click', () => {
    state.currentWeekStart = addDays(state.currentWeekStart, -7);
    renderTimetable($('tt-dept-filter') ? $('tt-dept-filter').value : '');
  });
  if (nextWeek) nextWeek.addEventListener('click', () => {
    state.currentWeekStart = addDays(state.currentWeekStart, 7);
    renderTimetable($('tt-dept-filter') ? $('tt-dept-filter').value : '');
  });

  const ttDept = $('tt-dept-filter');
  if (ttDept) ttDept.addEventListener('change', () => renderTimetable(ttDept.value));

  const ttPublish = $('tt-publish');
  if (ttPublish) ttPublish.addEventListener('click', () => {
    state.isPublished = true;
    const badge = $('tt-published-badge');
    if (badge) badge.style.display = 'block';
    showToast('📤 Schedule published and locked');
  });

  const ttCopyPrev = $('tt-copy-prev');
  if (ttCopyPrev) ttCopyPrev.addEventListener('click', () => {
    showToast('📋 Previous week\'s schedule copied');
  });

  const ttPrint = $('tt-print');
  if (ttPrint) ttPrint.addEventListener('click', () => {
    if (window.NexusSig && window.NexusSig.sign) window.NexusSig.sign({ type: 'timetable' });
    window.print();
  });

  // Shift picker
  const picker = $('shift-picker');
  if (picker) {
    picker.querySelectorAll('.shift-picker-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!state.pickerTarget) return;
        assignShift(state.pickerTarget.staffId, state.pickerTarget.date, btn.dataset.shift);
        closeShiftPicker();
      });
    });
  }

  document.addEventListener('click', e => {
    const picker = $('shift-picker');
    if (picker && picker.style.display === 'block' && !picker.contains(e.target)) {
      closeShiftPicker();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeFlyout();
      closeShiftPicker();
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
  });

  // Leave
  const newLeaveBtn = $('sh-new-leave-btn');
  if (newLeaveBtn) newLeaveBtn.addEventListener('click', () => openModal('new-leave-modal'));

  const submitLeave = $('submit-leave-btn');
  if (submitLeave) submitLeave.addEventListener('click', () => {
    const staffSel   = $('leave-staff-sel');
    const typeSel    = $('leave-type-sel');
    const fromInput  = $('leave-from');
    const toInput    = $('leave-to');
    const reasonTxt  = $('leave-reason');
    if (!staffSel.value || !fromInput.value || !toInput.value) {
      showToast('Please fill all required fields', 'danger'); return;
    }
    const staffId = +staffSel.value;
    const s = DEMO_STAFF.find(x => x.id === staffId);
    const from = fromInput.value;
    const to   = toInput.value;
    const days = Math.ceil((new Date(to) - new Date(from)) / 86400000) + 1;
    state.leaveRequests.push({
      id: state.leaveRequests.length + 1,
      staffId,
      staffName: s ? s.name : 'Unknown',
      role: s ? s.role : '',
      type: typeSel.value,
      from, to, days,
      reason: reasonTxt ? reasonTxt.value : '',
      status: 'pending',
    });
    closeModal('new-leave-modal');
    loadLeaveRequests($('leave-status-filter').value || 'pending');
    loadKPIs();
    showToast('🌴 Leave request submitted');
  });

  const leaveStatusFilter = $('leave-status-filter');
  if (leaveStatusFilter) leaveStatusFilter.addEventListener('change', () => loadLeaveRequests(leaveStatusFilter.value));

  const leaveBalanceStaff = $('leave-balance-staff');
  if (leaveBalanceStaff) leaveBalanceStaff.addEventListener('change', () => renderLeaveBalance(+leaveBalanceStaff.value));

  // Performance
  const perfStaffSel = $('perf-staff-select');
  if (perfStaffSel) perfStaffSel.addEventListener('change', () => loadPerformance(+perfStaffSel.value));

  const perfMonthSel = $('perf-month-select');
  if (perfMonthSel) perfMonthSel.addEventListener('change', () => loadPerformance(state.selectedStaffId));

  const perfGenReport = $('perf-gen-report');
  if (perfGenReport) perfGenReport.addEventListener('click', () => generatePerformanceReport(state.selectedStaffId));

  // Fault mode toggle
  ['fault-mode-auto','fault-mode-manual'].forEach(id => {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.faultMode = btn.dataset.mode;
      document.querySelectorAll('.sh-fault-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('sh-fault-form')    && ($('sh-fault-form').style.display = 'none');
      $('sh-positive-form') && ($('sh-positive-form').style.display = 'none');
      $('sh-fault-actions') && ($('sh-fault-actions').style.display = 'flex');
      renderFaultList(state.selectedStaffId);
    });
  });

  // Log fault button
  const logFaultBtn = $('log-fault-btn');
  if (logFaultBtn) logFaultBtn.addEventListener('click', () => {
    $('sh-fault-form').style.display = 'block';
    $('sh-positive-form').style.display = 'none';
    $('sh-fault-actions').style.display = 'none';
    const faultStaffSel = $('fault-staff-sel');
    if (faultStaffSel) faultStaffSel.value = state.selectedStaffId;
  });

  const faultFormCancel = $('fault-form-cancel');
  if (faultFormCancel) faultFormCancel.addEventListener('click', () => {
    $('sh-fault-form').style.display = 'none';
    $('sh-fault-actions').style.display = 'flex';
  });

  // Fault severity buttons
  const sevBtns = document.querySelectorAll('.sh-sev-btn');
  sevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sevBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedFaultSeverity = btn.dataset.sev;
    });
  });

  // Submit fault
  const faultSubmit = $('fault-submit-btn');
  if (faultSubmit) faultSubmit.addEventListener('click', () => {
    const staffId  = +($('fault-staff-sel') && $('fault-staff-sel').value) || state.selectedStaffId;
    const faultType = $('fault-type-sel') && $('fault-type-sel').value;
    const desc     = $('fault-desc') && $('fault-desc').value.trim();
    const impact   = $('fault-impact') && $('fault-impact').value.trim();
    const action   = $('fault-action') && $('fault-action').value.trim();
    if (!faultType || !desc) { showToast('Please select fault type and add a description', 'danger'); return; }
    logFault(staffId, { faultType, severity: state.selectedFaultSeverity, desc, impact, action });
    $('sh-fault-form').style.display = 'none';
    $('sh-fault-actions').style.display = 'flex';
    if ($('fault-desc')) $('fault-desc').value = '';
    if ($('fault-impact')) $('fault-impact').value = '';
    if ($('fault-action')) $('fault-action').value = '';
  });

  // Add positive mark
  const addPosBtn = $('add-positive-btn');
  if (addPosBtn) addPosBtn.addEventListener('click', () => {
    $('sh-positive-form').style.display = 'block';
    $('sh-fault-form').style.display = 'none';
    $('sh-fault-actions').style.display = 'none';
    const posStaffSel = $('pos-staff-sel');
    if (posStaffSel) posStaffSel.value = state.selectedStaffId;
  });

  const posFormCancel = $('pos-form-cancel');
  if (posFormCancel) posFormCancel.addEventListener('click', () => {
    $('sh-positive-form').style.display = 'none';
    $('sh-fault-actions').style.display = 'flex';
  });

  const posSubmit = $('pos-submit-btn');
  if (posSubmit) posSubmit.addEventListener('click', () => {
    const staffId = +($('pos-staff-sel') && $('pos-staff-sel').value) || state.selectedStaffId;
    const typeSel = $('pos-type-sel');
    const notes   = $('pos-notes') && $('pos-notes').value.trim();
    if (!typeSel.value) { showToast('Please select achievement type', 'danger'); return; }
    addPositiveMark(staffId, { typeKey: typeSel.value, typeLabel: typeSel.options[typeSel.selectedIndex].text, notes });
    $('sh-positive-form').style.display = 'none';
    $('sh-fault-actions').style.display = 'flex';
    if ($('pos-notes')) $('pos-notes').value = '';
  });

  // Attendance
  const attDate = $('att-date');
  if (attDate) attDate.addEventListener('change', () => {
    // In production would fetch from API; use same demo data
    renderAttendanceBoard(DEMO_ATTENDANCE);
  });

  const attSummaryStaff = $('att-summary-staff');
  if (attSummaryStaff) attSummaryStaff.addEventListener('change', () => renderAttSummary(+attSummaryStaff.value));

  const attExport = $('att-export');
  if (attExport) attExport.addEventListener('click', () => showToast('📤 Attendance data exported'));

  // Modal close buttons
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Export
  const exportBtn = $('sh-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', () => showToast('📤 Exporting StaffHub data…'));

  // CPD / Training add (placeholder)
  const cpdAdd = $('cpd-add-btn');
  if (cpdAdd) cpdAdd.addEventListener('click', () => showToast('📚 CPD logging coming soon'));

  const trainingAdd = $('training-add-btn');
  if (trainingAdd) trainingAdd.addEventListener('click', () => showToast('🎓 Training schedule form coming soon'));
}

function getDirectoryFilters() {
  return {
    search: $('dir-search') ? $('dir-search').value : '',
    dept:   $('dir-dept-filter') ? $('dir-dept-filter').value : '',
    role:   $('dir-role-filter') ? $('dir-role-filter').value : '',
    shift:  $('dir-shift-filter') ? $('dir-shift-filter').value : '',
  };
}

/* ── Boot ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);

/* ── Public API (for inline onclick handlers) ─────────────────── */
window.openFlyout    = openFlyout;
window.openPerfTab   = openPerfTab;
window.approveLeave  = approveLeave;
window.rejectLeave   = rejectLeave;
