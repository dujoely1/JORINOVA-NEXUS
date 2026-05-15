/**
 * JORINOVA NEXUS ALIS-X — Operational Dashboard
 * Stat cards · 7-day bar chart · Department pie · TAT monitor · Alerts
 */
'use strict';

(function () {
  const { API, Toast, fmt } = window.NEXUS;

  /* ─── Chart instances ───────────────────────────────────────── */
  let barChart = null;
  let pieChart = null;

  /* ─── Refresh interval (60s) ────────────────────────────────── */
  let refreshTimer = null;
  const REFRESH_MS = 60_000;

  /* ════════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════════ */
  async function init() {
    initCharts();
    await loadAll();
    startAutoRefresh();
    initRefreshBtn();
  }

  /* ════════════════════════════════════════════════════════════
     LOAD ALL DATA
  ════════════════════════════════════════════════════════════ */
  async function loadAll() {
    await Promise.allSettled([
      loadStats(),
      loadTATs(),
      loadAlerts(),
    ]);
  }

  /* ─── Stats + charts ────────────────────────────────────────── */
  async function loadStats() {
    try {
      const r    = await API.get('/dashboard/stats/');
      await API.checkError(r);
      const data = await API.json(r);
      updateStatCards(data);
      updateBarChart(data.daily_bar  || []);
      updatePieChart(data.department_pie || []);
    } catch (err) {
      if (NEXUS.debug) console.warn('Dashboard stats error:', err.message);
    }
  }

  function updateStatCards(data) {
    animateCount('stat-today-patients', data.today_total     ?? 0);
    animateCount('stat-pending',        data.pending         ?? 0);
    animateCount('stat-completed',      data.completed       ?? 0);
  }

  /* ─── TAT monitor ────────────────────────────────────────────── */
  async function loadTATs() {
    const list = document.getElementById('tat-list');
    if (!list) return;
    try {
      const r    = await API.get('/dashboard/active-tats/');
      await API.checkError(r);
      const data = await API.json(r);
      renderTATs(data.tats || []);
    } catch (_) {}
  }

  function renderTATs(tats) {
    const list = document.getElementById('tat-list');
    if (!list) return;
    if (!tats.length) {
      list.innerHTML = `
        <div class="tat-empty">
          <i class="fas fa-check-circle"></i>
          <span>No active samples in queue</span>
        </div>`;
      return;
    }
    list.innerHTML = tats.map(t => `
      <div class="tat-item">
        <span class="tat-sid">${escHtml(t.sid)}</span>
        <div class="tat-info">
          <div class="tat-patient">${escHtml(t.patient)}</div>
          <div class="tat-dept">${escHtml(t.department)}</div>
        </div>
        <div class="tat-bar-col">
          <div class="tat-bar">
            <div class="tat-fill ${t.status}" style="width:${t.percentage}%"></div>
          </div>
        </div>
        <span class="tat-elapsed ${t.status}">${t.elapsed}m</span>
      </div>
    `).join('');
  }

  /* ─── Critical alerts ────────────────────────────────────────── */
  async function loadAlerts() {
    const list = document.getElementById('alert-list');
    if (!list) return;
    try {
      const r    = await API.get('/laboratory/requests/', { is_critical: true, page_size: 10 });
      const data = await API.json(r);
      const items= data.results ?? [];
      renderAlerts(items);
      updateStatCount('stat-critical', items.length);
      const critCard = document.getElementById('stat-card-critical');
      critCard?.classList.toggle('has-alerts', items.length > 0);
    } catch (_) {}
  }

  function renderAlerts(items) {
    const list = document.getElementById('alert-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `
        <div class="no-alerts">
          <i class="fas fa-shield-check"></i>
          <div><span>All Clear</span><br>No critical results pending notification</div>
        </div>`;
      return;
    }
    list.innerHTML = items.map(req => `
      <div class="alert-item">
        <div class="alert-dot critical"></div>
        <div class="alert-info">
          <div class="alert-msg">${escHtml(req.patient_name ?? '—')} — ${escHtml(req.lab_id)}</div>
          <div class="alert-time">${fmt.datetime(req.request_date)}</div>
        </div>
        <span class="badge badge-red">CRITICAL</span>
      </div>
    `).join('');
  }

  /* ════════════════════════════════════════════════════════════
     CHART.JS WRAPPERS
  ════════════════════════════════════════════════════════════ */
  function initCharts() {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.color     = '#7FA8CC';
    Chart.defaults.font.family = "'Inter','Segoe UI',sans-serif";
    Chart.defaults.font.size   = 11;

    /* 7-day bar chart */
    const barCtx = document.getElementById('chart-daily')?.getContext('2d');
    if (barCtx) {
      barChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{
          label: 'Requests',
          data: [],
          backgroundColor: 'rgba(0,153,255,0.25)',
          borderColor:     '#00AAFF',
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(0,170,255,0.45)',
        }]},
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(7,20,40,0.92)',
              borderColor: 'rgba(0,153,255,0.3)',
              borderWidth: 1,
              padding: 10,
              titleFont: { weight: '600' },
              callbacks: {
                label: ctx => ` ${ctx.parsed.y} lab requests`,
              },
            },
          },
          scales: {
            x: { grid: { color: 'rgba(0,153,255,0.06)' }, ticks: { color: '#4A6880' } },
            y: { grid: { color: 'rgba(0,153,255,0.06)' }, ticks: { color: '#4A6880', stepSize: 1 }, beginAtZero: true },
          },
        },
      });
    }

    /* Department pie chart */
    const pieCtx = document.getElementById('chart-depts')?.getContext('2d');
    if (pieCtx) {
      pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{
          data: [],
          backgroundColor: [],
          borderColor:     'rgba(2,8,24,0.8)',
          borderWidth: 2,
          hoverOffset: 6,
        }]},
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(7,20,40,0.92)',
              borderColor: 'rgba(0,153,255,0.3)',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.parsed} tests`,
              },
            },
          },
        },
      });
    }
  }

  function updateBarChart(dailyData) {
    if (!barChart || !dailyData.length) return;
    barChart.data.labels   = dailyData.map(d => d.date);
    barChart.data.datasets[0].data = dailyData.map(d => d.count);
    barChart.update('none');
  }

  function updatePieChart(deptData) {
    if (!pieChart || !deptData.length) return;
    const legend = document.getElementById('dept-legend');
    pieChart.data.labels   = deptData.map(d => d.name);
    pieChart.data.datasets[0].data = deptData.map(d => d.count);
    pieChart.data.datasets[0].backgroundColor = deptData.map(d => d.color || '#0099FF');
    pieChart.update('none');
    if (legend) {
      legend.innerHTML = deptData.map(d => `
        <div class="legend-item">
          <div class="legend-dot" style="background:${d.color || '#0099FF'}"></div>
          <span class="legend-label">${escHtml(d.name)}</span>
          <span class="legend-count">${d.count}</span>
        </div>
      `).join('');
    }
  }

  /* ════════════════════════════════════════════════════════════
     STAT CARD HELPERS
  ════════════════════════════════════════════════════════════ */
  function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const diff  = target - start;
    const steps = Math.min(Math.abs(diff), 30);
    const step  = diff / steps;
    let cur = start, n = 0;
    const tick = () => {
      n++;
      cur += step;
      el.textContent = Math.round(n < steps ? cur : target);
      if (n < steps) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function updateStatCount(id, count) {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  }

  /* ════════════════════════════════════════════════════════════
     AUTO REFRESH
  ════════════════════════════════════════════════════════════ */
  function startAutoRefresh() {
    refreshTimer = setInterval(loadAll, REFRESH_MS);
  }

  function initRefreshBtn() {
    const btn = document.getElementById('refresh-btn');
    btn?.addEventListener('click', async () => {
      btn.classList.add('spinning');
      await loadAll();
      setTimeout(() => btn.classList.remove('spinning'), 600);
    });
  }

  /* ─── Utility ────────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  /* ─── Boot ────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);

})();
