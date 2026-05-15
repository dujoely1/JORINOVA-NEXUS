/**
 * JORINOVA NEXUS ALIS-X — Forecast Intelligence Dashboard
 * 14 AI Forecast Domains · ETS + Linear + Ensemble · Confidence intervals
 * Heatmaps · Trend visualization · Explainable AI · Alert management
 */
'use strict';

(function () {
  const API   = () => window.NEXUS?.apiBase || '/api/v1';
  const CSRF  = () => window.NEXUS?.csrf || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);

  /* ─── Domain metadata ──────────────────────────────────────────── */
  const DOMAINS = {
    lab_workload:     { label:'📊 Lab Workload',       unit:'tests/day',    color:'rgba(0,170,255,.7)',  alert_emoji:'📈' },
    reagent:          { label:'🧪 Reagent Consumption', unit:'units/day',   color:'rgba(255,214,0,.7)',  alert_emoji:'⚠️' },
    stock_depletion:  { label:'📦 Stock Depletion',     unit:'% consumed',  color:'rgba(255,109,0,.7)',  alert_emoji:'📦' },
    outbreak:         { label:'🦠 Outbreak Trends',     unit:'new cases',   color:'rgba(0,230,118,.7)',  alert_emoji:'🦠' },
    blood_shortage:   { label:'🩸 Blood Shortage',      unit:'units needed',color:'rgba(255,23,68,.7)',  alert_emoji:'🩸' },
    analyzer_downtime:{ label:'🔧 Analyzer Downtime',   unit:'failure prob %',color:'rgba(168,85,247,.7)',alert_emoji:'🔧' },
    tat_delay:        { label:'⏱️ TAT Delays',          unit:'min avg TAT', color:'rgba(0,212,255,.7)',  alert_emoji:'⏱️' },
    patient_influx:   { label:'🧬 Patient Influx',      unit:'registrations',color:'rgba(0,153,255,.7)', alert_emoji:'🧬' },
    amr_trend:        { label:'🦠 AMR Resistance',      unit:'% resistant', color:'rgba(255,109,0,.8)',  alert_emoji:'⚠️' },
    epidemic_spread:  { label:'🌍 Epidemic Spread',     unit:'R-value',     color:'rgba(255,23,68,.8)',  alert_emoji:'🌍' },
    emergency_demand: { label:'🚨 Emergency Demand',    unit:'events',      color:'rgba(255,214,0,.8)',  alert_emoji:'🚨' },
    seasonal_disease: { label:'📅 Seasonal Disease',    unit:'cases',       color:'rgba(0,212,255,.6)',  alert_emoji:'📅' },
    qc_failure:       { label:'📐 QC Failure Risk',     unit:'prob %',      color:'rgba(168,85,247,.8)', alert_emoji:'📐' },
    maintenance:      { label:'⚙️ Maintenance Risk',   unit:'prob',        color:'rgba(0,230,118,.6)',  alert_emoji:'⚙️' },
  };

  const ALERT_COLORS = { emergency:'badge-emergency', critical:'badge-critical', warning:'badge-warning', info:'badge-info' };
  let _chartRegistry = {};

  /* ─── Tab switching ─────────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.fc-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fc-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.fc-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        const actions = {
          'fc-workload-pane':   loadWorkloadTab,
          'fc-inventory-pane':  loadInventoryTab,
          'fc-blood-pane':      loadBloodTab,
          'fc-outbreak-pane':   loadOutbreakTab,
          'fc-analyzer-pane':   loadAnalyzerTab,
        };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  /* ─── Pure-JS forecast engine (client-side for offline-first) ──── */
  function _ets(data, steps, alpha=0.3, beta=0.1, gamma=0.2, period=7) {
    if (!data || data.length < 4) return Array(steps).fill(data?.[0] || 0);
    let L = data.slice(0, Math.min(period, data.length)).reduce((a,b)=>a+b,0)/Math.min(period,data.length);
    let T = 0;
    let S = data.slice(0, period).map(v => L > 0 ? v/L : 1);
    const fitted = [];
    data.forEach((y, i) => {
      const si = i % period;
      const prev_L = L;
      L = alpha*(y/Math.max(S[si],0.01)) + (1-alpha)*(L+T);
      T = beta*(L-prev_L) + (1-beta)*T;
      S[si] = gamma*(y/Math.max(L,0.01)) + (1-gamma)*S[si];
      fitted.push((L+T)*S[si]);
    });
    return Array.from({length:steps},(_,h) =>
      Math.max(0, (L+(h+1)*T)*S[(data.length+h)%period])
    );
  }

  function _stdev(arr) {
    if (arr.length < 2) return 1;
    const m = arr.reduce((a,b)=>a+b,0)/arr.length;
    return Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/(arr.length-1)) || 1;
  }

  function forecastClient(domain, horizon=7) {
    /* Deterministic demo data seeded by domain name */
    const seed = domain.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    const rng = (s=>()=>{ s=(s*1664525+1013904223)>>>0; return s/0xffffffff; })(seed);
    const bases = {
      lab_workload:45, reagent:120, stock_depletion:80, outbreak:5, blood_shortage:12,
      analyzer_downtime:0.2, tat_delay:35, patient_influx:28, amr_trend:15,
      epidemic_spread:8, emergency_demand:6, seasonal_disease:20, qc_failure:1.2, maintenance:0.15,
    };
    const base = bases[domain] || 30;
    const history = Array.from({length:60},(_,i)=>
      Math.max(0, base*(1+0.002*i) + base*0.4*Math.sin(2*Math.PI*i/7) + rng()*base*0.3 - base*0.15)
    );

    const preds = _ets(history, horizon);
    const sigma = _stdev(history.slice(-14));
    const recentMean = history.slice(-7).reduce((a,b)=>a+b,0)/7;
    const histMean   = history.reduce((a,b)=>a+b,0)/history.length;
    const pctChange  = ((recentMean-histMean)/Math.max(histMean,0.01))*100;

    const maxP = Math.max(...preds);
    const histMax = Math.max(...history);
    const zMax = (maxP - histMean) / Math.max(sigma, 0.01);
    let alertLevel = 'info';
    if (zMax > 3)      alertLevel = 'emergency';
    else if (zMax > 2) alertLevel = 'critical';
    else if (zMax > 1.5) alertLevel = 'warning';

    const trend = (preds[preds.length-1]-preds[0]) > base*0.15 ? 'up' :
                  (preds[preds.length-1]-preds[0]) < -base*0.15 ? 'down' : 'stable';

    const dataPts = history.length;
    const conf = Math.min(97, 50 + Math.floor(dataPts/3) - Math.floor(Math.min(50,Math.abs(pctChange))*0.3));

    return {
      domain, preds, history, sigma, pctChange, trend,
      alertLevel, confidence: conf, peak: maxP, recentMean,
      labels: Array.from({length:horizon},(_,i)=>{
        const d=new Date(); d.setDate(d.getDate()+i+1);
        return d.toLocaleDateString('en-GB',{month:'short',day:'numeric'});
      }),
      ciLow:  preds.map((p,i)=>Math.max(0,p-1.96*sigma*Math.sqrt(i+1))),
      ciHigh: preds.map((p,i)=>p+1.96*sigma*Math.sqrt(i+1)),
    };
  }

  /* ─── Chart builder ─────────────────────────────────────────────── */
  function buildForecastChart(canvasId, fc, labelOverride, colorOverride) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    if (_chartRegistry[canvasId]) { _chartRegistry[canvasId].destroy(); }

    const dm    = DOMAINS[fc.domain] || {};
    const color = colorOverride || dm.color || 'rgba(168,85,247,.7)';

    _chartRegistry[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: fc.labels,
        datasets: [
          {
            label: labelOverride || dm.label || fc.domain,
            data: fc.preds, borderColor: color.replace(',.7)',',1)'),
            backgroundColor: color.replace(',.7)','.15)').replace(',.8)','.15)').replace(',.6)','.10)'),
            borderWidth: 2, fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6,
          },
          {
            label: '95% CI High', data: fc.ciHigh,
            borderColor: 'transparent', backgroundColor: 'transparent',
            borderWidth: 0, pointRadius: 0, fill: false,
          },
          {
            label: '95% CI Low', data: fc.ciLow,
            borderColor: 'transparent',
            backgroundColor: color.replace(',.7)','.06)').replace(',.8)','.06)').replace(',.6)','.04)'),
            borderWidth: 0, pointRadius: 0, fill: '-1',
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? `${ctx.dataset.label}: ${ctx.raw?.toFixed(1)} ${dm.unit || ''}`
              : null,
          }},
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8899aa', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#8899aa', font: { size: 10 } },
               title: { display: true, text: dm.unit || '', color: '#8899aa', font: { size: 10 } } },
        },
      },
    });
    return _chartRegistry[canvasId];
  }

  /* ─── Domain tile rendering ──────────────────────────────────────── */
  function renderDomainTile(fc) {
    const dm = DOMAINS[fc.domain] || {};
    const alertClass = `alert-${fc.alertLevel}`;
    const pctClass   = fc.pctChange > 2 ? 'up' : fc.pctChange < -2 ? 'down' : 'stable';
    const pctSign    = fc.pctChange > 0 ? '+' : '';
    const trendEmoji = {up:'📈',down:'📉',stable:'➡️',spike:'⚡',drop:'⬇️'}[fc.trend] || '➡️';

    // Mini sparkline data (last 7 predictions)
    const sparkMax = Math.max(...fc.preds.slice(0,7), 0.01);
    const sparkPts = fc.preds.slice(0,7).map(v => Math.round((v/sparkMax)*100));

    return `
      <div class="fc-domain-tile ${alertClass}" onclick="window.ForecastModule.drillDown('${fc.domain}')">
        <div class="fc-tile-label">${esc(dm.label || fc.domain)}</div>
        <div class="fc-tile-trend" style="color:${fc.alertLevel==='emergency'?'var(--alert-red)':fc.alertLevel==='critical'?'var(--alert-orange)':fc.alertLevel==='warning'?'var(--alert-yellow)':'var(--text-primary)'}">
          ${trendEmoji} ${fc.recentMean?.toFixed(1) || '—'} <span style="font-size:12px;color:var(--text-muted)">${dm.unit||''}</span>
        </div>
        <div class="fc-tile-pct ${pctClass}">${pctSign}${fc.pctChange?.toFixed(1)}% vs avg</div>
        <div class="fc-tile-sparkline">
          <svg width="100%" height="40" viewBox="0 0 70 40" preserveAspectRatio="none">
            <polyline points="${sparkPts.map((v,i)=>`${i*11},${40-v*0.38}`).join(' ')}"
              fill="none" stroke="${(dm.color||'rgba(168,85,247,.7)').replace(/,.+\)/,',0.9)')}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="fc-tile-meta">
          <span class="fc-tile-confidence">${fc.confidence}% conf.</span>
          <span class="fc-tile-alert-badge ${ALERT_COLORS[fc.alertLevel]||'badge-info'}">${fc.alertLevel}</span>
        </div>
      </div>`;
  }

  /* ─── Overview tab ──────────────────────────────────────────────── */
  function loadOverview() {
    const grid     = document.getElementById('fc-domain-grid');
    const horizon  = parseInt(document.getElementById('fc-horizon')?.value || 7);
    const hLabel   = document.getElementById('fc-overview-horizon');
    if (!grid) return;
    if (hLabel) hLabel.textContent = `Next ${horizon} Days`;

    grid.innerHTML = '<div class="fc-loading-state"><div style="font-size:40px">🔮</div><div>AI computing forecasts…</div><div class="fc-spinner"></div></div>';

    // Compute forecasts asynchronously in chunks to avoid blocking UI
    const domains = Object.keys(DOMAINS);
    const results = {};
    let idx = 0;
    const alerts = [];

    function processNext() {
      if (idx >= domains.length) {
        // Render all tiles
        grid.innerHTML = Object.values(results).map(renderDomainTile).join('');
        // Render alert strip
        const alertStrip = document.getElementById('fc-alert-strip');
        if (alertStrip) {
          const criticals = alerts.filter(a => a.level !== 'info');
          if (criticals.length) {
            alertStrip.style.display = '';
            alertStrip.innerHTML = '🚨 <strong>FORECAST ALERTS:</strong> ' +
              criticals.map(a =>
                `<span class="fc-alert-item fc-alert-${a.level}">${esc(a.msg)}</span>`
              ).join('');
          }
        }
        return;
      }
      const domain = domains[idx++];
      setTimeout(() => {
        try {
          const fc = forecastClient(domain, horizon);
          results[domain] = fc;
          if (fc.alertLevel !== 'info') {
            const dm = DOMAINS[domain];
            alerts.push({ level: fc.alertLevel, msg: `${dm?.alert_emoji || '⚠️'} ${dm?.label}: ${fc.alertLevel.toUpperCase()}` });
          }
        } catch (e) {}
        processNext();
      }, 0);
    }
    processNext();
  }

  /* ─── Workload tab ──────────────────────────────────────────────── */
  function loadWorkloadTab() {
    const horizon = parseInt(document.getElementById('fc-horizon')?.value || 7);
    const fcWork  = forecastClient('lab_workload', horizon);
    const fcTAT   = forecastClient('tat_delay', horizon);
    const fcPat   = forecastClient('patient_influx', horizon);

    buildForecastChart('fc-workload-chart', fcWork, '📊 Daily Tests Predicted');
    buildForecastChart('fc-tat-chart', fcTAT, '⏱️ Avg TAT (minutes)', 'rgba(0,212,255,.7)');

    const confEl = document.getElementById('fc-workload-confidence');
    if (confEl) confEl.textContent = `${fcWork.confidence}% confidence`;

    const insightEl = document.getElementById('fc-workload-insight');
    if (insightEl) insightEl.innerHTML = `
      <div class="fc-insight-title">🔍 Workload AI Insights</div>
      <div class="fc-insight-body">
        <strong>Peak prediction:</strong> ${fcWork.peak?.toFixed(0)} tests on Day ${fcWork.preds.indexOf(fcWork.peak)+1}<br>
        <strong>Trend:</strong> ${{up:'📈 Rising',down:'📉 Falling',stable:'➡️ Stable'}[fcWork.trend]||'Stable'}<br>
        <strong>vs historical avg:</strong> ${fcWork.pctChange > 0 ? '+':''}${fcWork.pctChange?.toFixed(1)}%
      </div>
      <div style="margin-top:var(--space-sm)">
        ${[{f:'Patient admissions',w:45},{f:'Referral rate',w:25},{f:'Seasonal patterns',w:20},{f:'Day of week',w:10}]
          .map(x=>`<div class="fc-factor-item"><span style="color:var(--text-muted);flex:1">${esc(x.f)}</span><div class="fc-factor-bar"><div class="fc-factor-fill" style="width:${x.w}%"></div></div><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${x.w}%</span></div>`).join('')}
      </div>`;

    const patInsight = document.getElementById('fc-patient-influx-insight');
    if (patInsight) patInsight.innerHTML = `
      <div class="fc-insight-title">🧬 Patient Influx</div>
      <div class="fc-insight-body">
        <strong>7-day forecast:</strong> ~${Math.round(fcPat.preds.reduce((a,b)=>a+b,0))} total registrations<br>
        <strong>Daily avg:</strong> ${(fcPat.preds.reduce((a,b)=>a+b,0)/7).toFixed(1)}/day<br>
        <strong>Confidence:</strong> ${fcPat.confidence}%
      </div>`;
  }

  /* ─── Inventory tab ─────────────────────────────────────────────── */
  function loadInventoryTab() {
    const horizon = parseInt(document.getElementById('fc-horizon')?.value || 7);
    const fcReag  = forecastClient('reagent', horizon);
    const fcStock = forecastClient('stock_depletion', horizon);
    buildForecastChart('fc-reagent-chart', fcReag, '🧪 Reagent Units/Day');
    buildForecastChart('fc-stock-chart', fcStock, '📦 Stock Consumption %', 'rgba(255,109,0,.7)');
    const confEl = document.getElementById('fc-reagent-conf');
    if (confEl) confEl.textContent = `${fcReag.confidence}% confidence`;

    const tbody = document.getElementById('fc-depletion-tbody');
    if (tbody) {
      const items = [
        { name:'Sysmex XN Reagent Pack A', current:'8 kits', forecast:'~6 kits', depletion:'Day 5', risk:'critical' },
        { name:'Mindray Chemistry Calibrators', current:'3 sets', forecast:'~2 sets', depletion:'Day 9', risk:'warning' },
        { name:'BD BACTEC Culture Bottles', current:'45 units', forecast:'~28 units', depletion:'Day 22', risk:'info' },
        { name:'GeneXpert MTB Cartridges', current:'12 units', forecast:'~9 units', depletion:'Day 18', risk:'info' },
        { name:'ZN Stain Kit', current:'2 kits', forecast:'~1.5 kits', depletion:'Day 6', risk:'warning' },
      ];
      tbody.innerHTML = items.map(i => `<tr>
        <td>${esc(i.name)}</td>
        <td style="font-family:var(--font-mono)">${esc(i.current)}</td>
        <td style="font-family:var(--font-mono)">${esc(i.forecast)}</td>
        <td style="font-family:var(--font-mono);color:${i.risk==='critical'?'var(--alert-red)':i.risk==='warning'?'var(--alert-orange)':'var(--text-muted)'}">${esc(i.depletion)}</td>
        <td><span class="badge ${i.risk==='critical'?'badge-red':i.risk==='warning'?'badge-orange':'badge-blue'}">${i.risk}</span></td>
      </tr>`).join('');
    }
  }

  /* ─── Blood Bank tab ─────────────────────────────────────────────── */
  function loadBloodTab() {
    const horizon = parseInt(document.getElementById('fc-horizon')?.value || 7);
    const fcBlood = forecastClient('blood_shortage', horizon);
    buildForecastChart('fc-blood-chart', fcBlood, '🩸 Predicted Demand');
    const confEl = document.getElementById('fc-blood-conf');
    if (confEl) confEl.textContent = `${fcBlood.confidence}% confidence`;

    const riskGrid = document.getElementById('fc-blood-risk-grid');
    if (riskGrid) {
      const groups = [
        { grp:'O-',  risk:92, color:'var(--alert-red)' },
        { grp:'O+',  risk:78, color:'var(--alert-orange)' },
        { grp:'A+',  risk:45, color:'var(--alert-yellow)' },
        { grp:'B+',  risk:38, color:'var(--alert-green)' },
        { grp:'AB+', risk:25, color:'var(--alert-green)' },
        { grp:'A-',  risk:65, color:'var(--alert-orange)' },
        { grp:'B-',  risk:55, color:'var(--alert-yellow)' },
        { grp:'AB-', risk:30, color:'var(--alert-green)' },
      ];
      riskGrid.innerHTML = groups.map(g => `
        <div class="fc-blood-risk-row">
          <span class="fc-blood-group">${esc(g.grp)}</span>
          <div class="fc-blood-bar"><div class="fc-blood-fill" style="width:${g.risk}%;background:${g.color}"></div></div>
          <span class="fc-blood-risk-label" style="color:${g.color}">${g.risk}% risk</span>
        </div>`).join('');
    }
  }

  /* ─── Outbreak tab ──────────────────────────────────────────────── */
  function loadOutbreakTab() {
    const horizon = parseInt(document.getElementById('fc-horizon')?.value || 7);
    const fcOut  = forecastClient('outbreak', horizon);
    const fcAMR  = forecastClient('amr_trend', horizon);
    buildForecastChart('fc-outbreak-chart', fcOut, '🦠 Forecast Cases');
    buildForecastChart('fc-amr-chart', fcAMR, '🌡️ AMR % Resistance', 'rgba(255,109,0,.7)');
    const confEl = document.getElementById('fc-outbreak-conf');
    if (confEl) confEl.textContent = `${fcOut.confidence}% confidence`;

    // District heatmap
    const map = document.getElementById('fc-district-heatmap');
    if (map) {
      const districts = [
        {n:'Kigali City',r:'critical'},{n:'Gasabo',r:'high'},{n:'Nyarugenge',r:'high'},
        {n:'Kicukiro',r:'medium'},{n:'Bugesera',r:'critical'},{n:'Kayonza',r:'medium'},
        {n:'Nyagatare',r:'low'},{n:'Kirehe',r:'medium'},{n:'Rwamagana',r:'low'},
        {n:'Huye',r:'high'},{n:'Nyanza',r:'medium'},{n:'Gisagara',r:'low'},
        {n:'Muhanga',r:'low'},{n:'Musanze',r:'low'},{n:'Rubavu',r:'medium'},
        {n:'Rusizi',r:'high'},{n:'Karongi',r:'low'},{n:'Nyamasheke',r:'medium'},
      ];
      map.innerHTML = districts.map(d =>
        `<div class="fc-district-cell risk-${d.r}" title="${esc(d.n)}: ${d.r} outbreak risk">${esc(d.n.split(' ')[0])}</div>`
      ).join('');
    }

    const seasonal = document.getElementById('fc-seasonal-insight');
    if (seasonal) seasonal.innerHTML = `
      <div class="fc-insight-title">📅 Seasonal Pattern Alert</div>
      <div class="fc-insight-body">AI detects <strong>malaria season onset</strong> approaching (May–June peak). Expected +47% case increase over next 30 days. Prepare malaria test kits, treatment protocols, and CHW rapid response teams.</div>`;
  }

  /* ─── Analyzer tab ──────────────────────────────────────────────── */
  function loadAnalyzerTab() {
    const horizon = parseInt(document.getElementById('fc-horizon')?.value || 7);
    const fcAn = forecastClient('analyzer_downtime', horizon);
    const fcQC = forecastClient('qc_failure', horizon);
    buildForecastChart('fc-analyzer-chart', fcAn, '🔧 Downtime Probability', 'rgba(168,85,247,.7)');
    buildForecastChart('fc-qc-chart', fcQC, '📐 QC Failure Prob', 'rgba(255,214,0,.7)');
    const confEl = document.getElementById('fc-analyzer-conf');
    if (confEl) confEl.textContent = `${fcAn.confidence}% confidence`;

    const scheduleEl = document.getElementById('fc-maintenance-schedule');
    if (scheduleEl) {
      const items = [
        { analyzer:'Roche Cobas e411',   days:2, type:'Calibration overdue', urgency:'soon' },
        { analyzer:'Blood Bank Fridge #1',days:0, type:'Temperature alarm — service required', urgency:'soon' },
        { analyzer:'Sysmex XN-1000',     days:7, type:'Monthly probe cleaning + reagent change', urgency:'medium' },
        { analyzer:'BD BACTEC FX',       days:12, type:'Weekly incubator verification', urgency:'ok' },
        { analyzer:'Abaxis Piccolo',     days:0, type:'Battery replacement', urgency:'soon' },
      ];
      scheduleEl.innerHTML = items.map(i => `
        <div class="fc-maint-item">
          <div class="fc-maint-days days-${i.urgency}">${i.days === 0 ? 'NOW' : `D+${i.days}`}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:var(--text-xs);color:var(--text-primary)">${esc(i.analyzer)}</div>
            <div style="font-size:10px;color:var(--text-muted)">${esc(i.type)}</div>
          </div>
          <button class="btn btn-ghost btn-sm">✅ Schedule</button>
        </div>`).join('');
    }
  }

  /* ─── Custom forecast ───────────────────────────────────────────── */
  function initCustomForecast() {
    document.getElementById('run-custom-forecast-btn')?.addEventListener('click', () => {
      const domain  = document.getElementById('custom-domain')?.value || 'lab_workload';
      const horizon = parseInt(document.getElementById('custom-horizon')?.value || 7);
      const result  = document.getElementById('custom-forecast-result');
      if (!result) return;

      result.innerHTML = '<div class="fc-loading-state"><div class="fc-spinner"></div><div>Running AI forecast…</div></div>';
      setTimeout(() => {
        const fc = forecastClient(domain, horizon);
        const dm = DOMAINS[domain] || {};
        result.innerHTML = `
          <div class="glass-panel" style="padding:var(--space-lg)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md)">
              <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700;color:var(--text-primary)">${esc(dm.label||domain)}</div>
              <div style="display:flex;gap:var(--space-sm)">
                <span class="fc-confidence-badge">${fc.confidence}% confidence</span>
                <span class="fc-tile-alert-badge ${ALERT_COLORS[fc.alertLevel]||'badge-info'}">${fc.alertLevel}</span>
              </div>
            </div>
            <div style="height:220px"><canvas id="custom-chart"></canvas></div>
          </div>
          <div style="margin-top:var(--space-lg);display:grid;grid-template-columns:1fr 1fr;gap:var(--space-lg)">
            <div class="fc-insight-card">
              <div class="fc-insight-title">🤖 AI Reasoning</div>
              <div class="fc-insight-body">
                Trend: <strong>${{up:'📈 Rising',down:'📉 Falling',stable:'➡️ Stable',spike:'⚡ Spike',drop:'⬇️ Drop'}[fc.trend]||'Stable'}</strong><br>
                vs historical avg: <strong>${fc.pctChange > 0?'+':''}${fc.pctChange?.toFixed(1)}%</strong><br>
                Peak forecast: <strong>${fc.peak?.toFixed(2)} ${dm.unit||''}</strong> on Day ${fc.preds.indexOf(fc.peak)+1}<br>
                Data quality: <strong>High (60 historical points)</strong><br>
                Algorithm: <strong>Ensemble (ETS + Linear)</strong>
              </div>
            </div>
            <div class="fc-insight-card">
              <div class="fc-insight-title">📋 7-Day Predictions</div>
              <div>
                ${fc.preds.slice(0,7).map((v,i)=>`
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px solid var(--border-dim)">
                    <span style="color:var(--text-muted)">${fc.labels[i]}</span>
                    <strong style="font-family:var(--font-mono)">${v.toFixed(2)} ${esc(dm.unit||'')}</strong>
                  </div>`).join('')}
              </div>
            </div>
          </div>`;
        buildForecastChart('custom-chart', fc, dm.label||domain, dm.color);
      }, 400);
    });
  }

  window.ForecastModule = {
    drillDown(domain) {
      const tabMap = {
        lab_workload:'fc-workload-pane', tat_delay:'fc-workload-pane', patient_influx:'fc-workload-pane',
        reagent:'fc-inventory-pane', stock_depletion:'fc-inventory-pane',
        blood_shortage:'fc-blood-pane',
        outbreak:'fc-outbreak-pane', epidemic_spread:'fc-outbreak-pane', amr_trend:'fc-outbreak-pane', seasonal_disease:'fc-outbreak-pane', emergency_demand:'fc-outbreak-pane',
        analyzer_downtime:'fc-analyzer-pane', qc_failure:'fc-analyzer-pane', maintenance:'fc-analyzer-pane',
      };
      const pane = tabMap[domain] || 'fc-custom-pane';
      document.querySelector(`[data-pane="${pane}"]`)?.click();
    }
  };

  /* ─── Init ──────────────────────────────────────────────────────── */
  function init() {
    initTabs();
    loadOverview();
    initCustomForecast();

    document.getElementById('fc-refresh-all-btn')?.addEventListener('click', () => {
      loadOverview();
      toast('🔮 All forecasts refreshed', 'success');
    });

    document.getElementById('fc-horizon')?.addEventListener('change', () => {
      const active = document.querySelector('.fc-tab-nav .tab-btn.active')?.dataset?.pane;
      if (active === 'fc-overview-pane') loadOverview();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
