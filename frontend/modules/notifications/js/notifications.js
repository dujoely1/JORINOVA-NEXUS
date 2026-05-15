/**
 * JORINOVA NEXUS ALIS-X — Notifications Centre
 * Real-time alerts, critical results, SMS log, system events
 */
'use strict';

(function () {
  const CSRF  = () => window.NEXUS?.csrf || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  const API   = () => window.NEXUS?.apiBase || '/api/v1';
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);

  /* Demo notifications */
  const DEMO = [
    { id:1, type:'critical_result', priority:'critical', title:'🚨 Critical Result — Glucose 0.8 mmol/L', message:'Patient KAMANZI Jean (PID: RWA-2024-00142). Critical low glucose. Notify attending physician immediately.', time:'2 min ago', read:false, action_url:'/laboratory/' },
    { id:2, type:'result_ready',    priority:'normal',   title:'✅ Results Validated — LAB-240515-008',   message:'CBC + Differential for UWIMANA Grace validated and released. SMS sent to patient.', time:'18 min ago', read:false, action_url:'/laboratory/' },
    { id:3, type:'tat_breach',      priority:'high',     title:'⏱️ TAT Breach — 3 samples overdue',       message:'Hematology: 3 samples exceed 2-hour TAT. LAB-240515-003, 005, 007.', time:'35 min ago', read:false, action_url:'/laboratory/' },
    { id:4, type:'low_stock',       priority:'high',     title:'⚠️ Low Stock — Glucose Reagent',          message:'Mindray BS-480 glucose reagent below minimum level (8 tests remaining). Reorder required.', time:'1 hr ago', read:true, action_url:'/inventory/' },
    { id:5, type:'biosafety_alert', priority:'critical', title:'☣️ Biosafety Alert — ZN Positive (TB)',  message:'Patient HABIMANA Eric (PID: RWA-2024-00388). AFB positive ZN stain. BSL-3 precautions. Report to public health.', time:'2 hrs ago', read:true, action_url:'/micro-ai/' },
    { id:6, type:'system_alert',    priority:'normal',   title:'🔔 Fridge #1 Temperature Alert',         message:'Blood Bank Fridge #1 temperature: 7.2°C (above 6°C limit). Check door seal and call biomedical engineering.', time:'3 hrs ago', read:true, action_url:'/iot-analyzers/' },
    { id:7, type:'result_ready',    priority:'normal',   title:'✅ EQA Results Submitted — RIQAS Chemistry','message':'Monthly RIQAS Chemistry EQA submission completed. Z-scores within acceptable range.', time:'5 hrs ago', read:true, action_url:'/quality/' },
    { id:8, type:'shift_change',    priority:'normal',   title:'🔄 Shift Change — Afternoon Shift',       message:'Afternoon shift started at 14:00. 12 pending requests handed over to afternoon team.', time:'8 hrs ago', read:true, action_url:'/dashboard/' },
  ];

  const TYPE_ICONS = {
    critical_result:'🚨', result_ready:'✅', tat_breach:'⏱️',
    low_stock:'⚠️', biosafety_alert:'☣️', system_alert:'🔔',
    shift_change:'🔄', sample_rejected:'❌',
  };
  const PRIORITY_COLORS = {
    critical:'var(--alert-red)', high:'var(--alert-orange)',
    normal:'var(--blue-glow)', low:'var(--text-muted)',
  };

  function initTabs() {
    document.querySelectorAll('.notif-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.notif-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.notif-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        if (btn.dataset.pane === 'notif-sms-pane') loadSMSLog();
      });
    });
  }

  function renderNotification(n) {
    const color = PRIORITY_COLORS[n.priority] || 'var(--text-muted)';
    return `<div class="notif-item ${n.read ? '' : 'notif-unread'} notif-priority-${n.priority}"
              data-id="${n.id}" onclick="window.NotifModule.markRead(${n.id}, this)">
      <div class="notif-icon" style="color:${color}">${TYPE_ICONS[n.type] || '🔔'}</div>
      <div class="notif-content">
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-msg">${esc(n.message)}</div>
        <div class="notif-meta">
          <span class="notif-time">${esc(n.time)}</span>
          ${n.action_url ? `<a href="${esc(n.action_url)}" class="notif-action-link">View →</a>` : ''}
        </div>
      </div>
      ${!n.read ? '<div class="notif-dot"></div>' : ''}
    </div>`;
  }

  function loadNotifications(filter) {
    const list = document.getElementById('notif-list');
    if (!list) return;
    let items = DEMO;
    if (filter === 'unread')   items = DEMO.filter(n => !n.read);
    if (filter === 'critical') items = DEMO.filter(n => n.priority === 'critical');
    if (!items.length) { list.innerHTML = '<div class="notif-empty"><div style="font-size:40px">🔔</div><p>No notifications</p></div>'; return; }
    list.innerHTML = items.map(renderNotification).join('');
    const unread = DEMO.filter(n => !n.read).length;
    const badge  = document.getElementById('notif-unread-count');
    if (badge) badge.textContent = unread || '';
    badge && (badge.style.display = unread ? 'flex' : 'none');
  }

  function loadSMSLog() {
    const tbody = document.getElementById('sms-log-tbody');
    if (!tbody || tbody.innerHTML !== '') return;
    const SMS = [
      { patient:'KAMANZI Jean', pid:'RWA-2024-00142', phone:'+25078XXXXXXX', msg:'NEXUS LAB: Your results are ready. Visit or ask your doctor. Ref: LAB-240515-001', time:'14:32', status:'Delivered' },
      { patient:'UWIMANA Grace', pid:'RWA-2024-00287', phone:'+25079XXXXXXX', msg:'NEXUS LAB: CBC + ESR results validated. Collect at reception or ask your physician. Ref: LAB-240515-002', time:'13:45', status:'Delivered' },
      { patient:'MUKAMANA Rose', pid:'RWA-2024-00501', phone:'+25072XXXXXXX', msg:'NEXUS LAB: Your HIV test result is ready. Please see your doctor for counselling. Ref: LAB-240515-009', time:'11:20', status:'Delivered' },
    ];
    tbody.innerHTML = SMS.map(s => `<tr>
      <td><div style="font-weight:600;font-size:var(--text-sm)">${esc(s.patient)}</div>
          <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${esc(s.pid)}</div></td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(s.phone)}</td>
      <td style="font-size:11px;color:var(--text-secondary);max-width:300px">${esc(s.msg)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(s.time)}</td>
      <td><span class="badge badge-green">✅ ${esc(s.status)}</span></td>
    </tr>`).join('');
  }

  window.NotifModule = {
    markRead(id, el) {
      const item = DEMO.find(n => n.id === id);
      if (item) item.read = true;
      el?.classList.remove('notif-unread');
      el?.querySelector('.notif-dot')?.remove();
      const unread = DEMO.filter(n => !n.read).length;
      const badge  = document.getElementById('notif-unread-count');
      if (badge) { badge.textContent = unread || ''; badge.style.display = unread ? 'flex' : 'none'; }
    },
    markAllRead() {
      DEMO.forEach(n => n.read = true);
      loadNotifications(document.querySelector('.notif-tab-nav .tab-btn.active')?.dataset?.filter || '');
    },
  };

  function init() {
    initTabs();
    loadNotifications();
    document.getElementById('notif-mark-all-btn')?.addEventListener('click', () => window.NotifModule.markAllRead());
    document.querySelectorAll('.notif-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadNotifications(btn.dataset.filter);
      });
    });
    /* Poll for new notifications every 60s */
    setInterval(() => {
      const badge = document.getElementById('notif-unread-count');
      if (badge) { const u = DEMO.filter(n=>!n.read).length; badge.textContent = u||''; badge.style.display=u?'flex':'none'; }
    }, 60000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
