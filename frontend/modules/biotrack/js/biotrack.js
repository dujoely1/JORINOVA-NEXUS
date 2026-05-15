/**
 * JORINOVA NEXUS ALIS-X — BioTrack Module
 * GeoTrack · Drone · Robot · Field Surveillance
 * ISO 15189 Decision Support Only
 */
'use strict';

(function () {

  const API    = window.NEXUS?.apiBase ? '' : '';  // routes are on same origin
  const CSRF   = () => window.NEXUS?.csrf || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  const toast  = (m, t) => window.NEXUS?.Toast?.show?.(m, t);
  const esc    = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ─── HTTP helpers ──────────────────────────────────────────── */
  async function getJSON(url) {
    const r = await fetch(url, { headers: { 'X-CSRFToken': CSRF() } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function postJSON(url, data) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF() },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  /* ─── Tab switching ──────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.biotrack-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.biotrack-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.biotrack-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.pane);
        if (pane) pane.classList.add('active');
      });
    });
  }

  /* ─── Colour helper ──────────────────────────────────────────── */
  function riskCss(color) {
    return `color:${color};border-color:${color};background:${color}18`;
  }

  /* ─── KPI update ─────────────────────────────────────────────── */
  function setKPI(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ════════════════════════════════════════════════════════════
     GEOTRACK
  ════════════════════════════════════════════════════════════ */
  function renderGeoResult(data) {
    const panel = document.getElementById('gt-result-panel');
    const outbreakRows = (data.active_outbreaks || []).map(o =>
      `<div class="bt-cluster-card" style="border-color:${o.trend === 'RISING' ? 'var(--alert-orange)' : 'var(--border-mid)'}">
        <div class="bt-cluster-header">
          <span class="bt-cluster-disease">${esc(o.disease)}</span>
          <span class="badge ${o.trend === 'RISING' ? 'badge-orange' : 'badge-blue'}">${esc(o.trend)}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary)">
          Cases (7d): <strong>${o.cases_7d}</strong> · Status: <strong>${esc(o.status)}</strong>
        </div>
      </div>`
    ).join('') || `<p style="color:var(--text-muted);font-size:var(--text-xs)">No active outbreaks detected.</p>`;

    panel.innerHTML = `
      <div class="bt-result-content">
        <div style="display:flex;align-items:center;gap:var(--space-md)">
          <div class="bt-risk-badge" style="${riskCss(data.risk_color)}">
            ${data.risk_level === 'HIGH' ? '🚨' : data.risk_level === 'MODERATE' ? '⚠️' : '✅'}
            ${esc(data.risk_level)} RISK
          </div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary)">${esc(data.district)}, ${esc(data.province)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-muted)">BSL Awareness: ${esc(data.bsl_awareness)}</div>
          </div>
        </div>

        ${(data.alerts || []).map(a => `<div class="bt-factor-row"><span>${esc(a)}</span></div>`).join('')}

        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:var(--space-sm)">🦠 Active Outbreaks</div>
        ${outbreakRows}

        <div style="font-size:var(--text-xs);color:var(--text-secondary)">${esc(data.epidemiological_context)}</div>
        <div class="bt-disclaimer">⚠️ ${esc(data.iso_disclaimer || 'Decision support only.')}</div>
      </div>`;
  }

  function initGeoTrack() {
    document.getElementById('gt-assess-btn')?.addEventListener('click', async () => {
      const district = document.getElementById('gt-district')?.value.trim() || 'Kigali';
      const province = document.getElementById('gt-province')?.value || 'Kigali City';
      const sample_id= document.getElementById('gt-sample-id')?.value.trim() || '';
      const btn = document.getElementById('gt-assess-btn');
      btn.disabled = true; btn.textContent = '⏳ Assessing…';
      try {
        const data = await getJSON(`/biotrack/api/geotrack/?district=${encodeURIComponent(district)}&province=${encodeURIComponent(province)}&sample_id=${encodeURIComponent(sample_id)}`);
        renderGeoResult(data);
        setKPI('bt-kpi-districts', '30');
      } catch (e) {
        toast?.('GeoTrack API error: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '🌐 Assess Epidemiological Risk';
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     DRONE
  ════════════════════════════════════════════════════════════ */
  function renderDroneResult(data) {
    const panel = document.getElementById('dr-result-panel');
    const factors = (data.sis_factors || []).map(f =>
      `<div class="bt-factor-row">
        <span class="bt-factor-deduction">${f.deduction}</span>
        <div><strong>${esc(f.factor)}</strong> — ${esc(f.note)}</div>
      </div>`
    ).join('');

    panel.innerHTML = `
      <div class="bt-result-content">
        <div style="display:flex;align-items:center;gap:var(--space-xl)">
          <div class="bt-score-circle" style="${riskCss(data.risk_color)}">
            <div class="bt-score-val">${data.sis_score}</div>
            <div class="bt-score-lbl">SIS</div>
          </div>
          <div>
            <div class="bt-risk-badge" style="${riskCss(data.risk_color)};font-size:var(--text-base)">
              ${esc(data.recommendation_emoji)} ${esc(data.recommendation?.replace(/_/g, ' '))}
            </div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:8px;max-width:280px;line-height:1.6">${esc(data.recommendation_note)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:6px">ETA: ~${data.estimated_eta_min} min · ${data.distance_km} km · ${esc(data.containment_class)}</div>
          </div>
        </div>

        ${factors ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)">Score Factors</div>${factors}` : ''}

        <div style="font-size:var(--text-xs);color:var(--text-secondary)">${esc(data.packaging_requirement)}</div>
        <div class="bt-disclaimer">🔒 ${esc(data.flight_authorization)}</div>
      </div>`;
  }

  function initDrone() {
    document.getElementById('dr-assess-btn')?.addEventListener('click', async () => {
      const payload = {
        sample_type:           document.getElementById('dr-sample-type')?.value,
        containment_class:     document.getElementById('dr-containment')?.value,
        distance_km:           parseFloat(document.getElementById('dr-distance')?.value || 15),
        transport_delay_min:   parseInt(document.getElementById('dr-delay')?.value || 30),
        origin_risk:           document.getElementById('dr-origin-risk')?.value,
        temperature_sensitive: document.getElementById('dr-temp-sensitive')?.checked,
        weather_ok:            document.getElementById('dr-weather-ok')?.checked,
        fragility:             'medium',
      };
      const btn = document.getElementById('dr-assess-btn');
      btn.disabled = true; btn.textContent = '⏳ Evaluating…';
      try {
        const data = await postJSON('/biotrack/api/drone/', payload);
        renderDroneResult(data);
        setKPI('bt-kpi-drones', (parseInt(document.getElementById('bt-kpi-drones')?.textContent || 0) + 1).toString());
      } catch (e) {
        toast?.('Drone API error: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '🚁 Evaluate Drone Transport';
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     ROBOT
  ════════════════════════════════════════════════════════════ */
  function renderRobotResult(data) {
    const area  = document.getElementById('robot-result-area');
    const laneColor = { ISOLATION_LANE:'#FF1744', ENTERIC_LANE:'#FF6D00', ROUTINE_LANE:'#00E676' };
    const rows  = (data.routing_plan || []).map(r => `
      <div class="bt-routing-row">
        <span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--text-muted)">#${r.priority}</span>
        <div>
          <div style="font-weight:700;font-size:var(--text-sm)">${esc(r.sample_id)}</div>
          <div style="font-size:10px;color:var(--text-muted)">${esc(r.sample_type)} · Risk: <strong style="color:${r.risk_level==='HIGH'?'var(--alert-red)':r.risk_level==='MEDIUM'?'var(--alert-orange)':'var(--alert-green)'}">${esc(r.risk_level)}</strong></div>
        </div>
        <span class="bt-lane-badge" style="background:${laneColor[r.lane]}22;color:${laneColor[r.lane]};border:1px solid ${laneColor[r.lane]}44">
          ${r.lane === 'ISOLATION_LANE' ? '🔒' : r.lane === 'ENTERIC_LANE' ? '⚠️' : '✅'} ${r.lane.replace(/_/g,' ')}
        </span>
        <span style="font-size:var(--text-xs);color:var(--text-secondary)">${esc(r.handling_instruction)}</span>
      </div>`).join('');

    const risks = (data.contamination_risks || []).map(r =>
      `<div class="bt-factor-row"><strong>${esc(r.sample)}</strong>: ${esc(r.risk)} — ${esc(r.action)}</div>`
    ).join('');

    area.innerHTML = `
      <div style="border-top:1px solid var(--border-dim)">${rows}</div>
      ${risks ? `<div style="padding:var(--space-md) var(--space-lg)"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--alert-red);margin-bottom:var(--space-sm)">⚠️ Contamination Risks</div>${risks}</div>` : ''}
      <div style="padding:var(--space-md) var(--space-lg)"><div class="bt-disclaimer">🤖 ${esc(data.safety_note)}</div></div>`;
  }

  function initRobot() {
    document.getElementById('robot-demo-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('robot-demo-btn');
      btn.disabled = true; btn.textContent = '⏳ Routing…';
      try {
        const data = await postJSON('/biotrack/api/robot/', { samples: [] });
        renderRobotResult(data);
        setKPI('bt-kpi-robots', (parseInt(document.getElementById('bt-kpi-robots')?.textContent || 0) + 1).toString());
      } catch (e) {
        toast?.('Robot API error: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '🤖 Run Demo Routing (5 samples)';
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     FIELD SURVEILLANCE
  ════════════════════════════════════════════════════════════ */
  function renderFieldResult(data) {
    const area = document.getElementById('field-result-area');
    const lbl  = document.getElementById('field-last-update');
    if (lbl) lbl.textContent = `Last updated: ${new Date(data.last_update || data.timestamp).toLocaleTimeString()}`;

    const clusters = (data.active_clusters || []).map(c => `
      <div class="bt-cluster-card" style="border-color:${c.color}">
        <div class="bt-cluster-header">
          <span class="bt-cluster-disease">${esc(c.disease)}</span>
          <span style="font-family:var(--font-mono);font-size:11px;color:${c.color}">${esc(c.trend)}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary)">
          📍 ${esc(c.district)} · Cases 7d: <strong>${c.cases_7d}</strong> · Positivity: <strong>${c.positivity_rate}%</strong>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:5px">${esc(c.action)}</div>
      </div>`).join('') || `<div class="bt-result-empty" style="min-height:100px;padding:var(--space-lg)"><span style="font-size:32px">✅</span><p>No active clusters detected.</p></div>`;

    const warnings = (data.early_warnings || []).map(w =>
      `<div class="bt-factor-row" style="border-left:3px solid ${w.color};padding-left:var(--space-md)">
        <span style="color:${w.color};font-weight:700">${esc(w.severity)}</span>
        <span>${esc(w.warning)}</span>
      </div>`
    ).join('');

    area.innerHTML = `
      <div style="padding:var(--space-lg);display:flex;flex-direction:column;gap:var(--space-md)">
        <div style="display:flex;align-items:center;gap:var(--space-md)">
          <div class="bt-risk-badge" style="${riskCss(data.status==='NORMAL'?'var(--alert-green)':'var(--alert-orange)')}">
            ${data.status === 'NORMAL' ? '✅' : '⚠️'} ${esc(data.insight)}
          </div>
        </div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)">🦠 Active Clusters</div>
        ${clusters}
        ${warnings ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)">⚡ Early Warnings</div>${warnings}` : ''}
        <div style="font-size:var(--text-xs);color:var(--text-secondary)">${esc(data.epidemiological_context)}</div>
        <div class="bt-disclaimer">🌐 ${esc(data.official_declaration)}</div>
      </div>`;

    setKPI('bt-kpi-clusters', String(data.active_clusters?.length || 0));
  }

  function initField() {
    document.getElementById('field-load-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('field-load-btn');
      btn.disabled = true; btn.textContent = '⏳ Loading…';
      try {
        const data = await getJSON('/biotrack/api/field/');
        renderFieldResult(data);
      } catch (e) {
        toast?.('Field API error: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '🔭 Refresh Surveillance Feed';
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     ISIS / ERAVS
  ════════════════════════════════════════════════════════════ */
  function renderISISResult(data) {
    const panel = document.getElementById('isis-result-panel');
    panel.innerHTML = `
      <div class="bt-result-content">
        <div style="display:flex;gap:var(--space-xl);align-items:center;flex-wrap:wrap">
          <div class="bt-score-circle" style="${riskCss(data.isis_color)}">
            <div class="bt-score-val">${data.isis}</div>
            <div class="bt-score-lbl">ISIS</div>
          </div>
          <div class="bt-score-circle" style="${riskCss(data.isis_color)}">
            <div class="bt-score-val">${data.eravs}</div>
            <div class="bt-score-lbl">ERAVS</div>
          </div>
          <div>
            <div class="bt-risk-badge" style="${riskCss(data.isis_color)};font-size:var(--text-base)">${esc(data.isis_label)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:8px;max-width:260px;line-height:1.6">${esc(data.validity_assessment)}</div>
          </div>
        </div>
        ${data.rejection_recommended ? `<div style="padding:var(--space-md);background:rgba(255,23,68,0.08);border:1px solid var(--alert-red);border-radius:var(--radius-md);color:var(--alert-red);font-weight:700;font-size:var(--text-sm)">🚫 SAMPLE REJECTION RECOMMENDED</div>` : ''}
        <div class="bt-disclaimer">⚖️ ${esc(data.iso_disclaimer)}</div>
      </div>`;
  }

  function initISIS() {
    document.getElementById('isis-compute-btn')?.addEventListener('click', async () => {
      const payload = {
        sis:               parseFloat(document.getElementById('isis-sis')?.value || 85),
        geo_risk:          document.getElementById('isis-geo-risk')?.value,
        transport_hours:   parseFloat(document.getElementById('isis-transport-h')?.value || 1),
        lab_handling_quality: document.getElementById('isis-handling')?.value,
        temperature_breach: document.getElementById('isis-temp-breach')?.checked,
      };
      const btn = document.getElementById('isis-compute-btn');
      btn.disabled = true; btn.textContent = '⏳ Computing…';
      try {
        const data = await postJSON('/biotrack/api/integrated/', payload);
        renderISISResult(data);
      } catch (e) {
        toast?.('ISIS API error: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '🧮 Compute ISIS / ERAVS';
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════════ */
  function init() {
    initTabs();
    initGeoTrack();
    initDrone();
    initRobot();
    initField();
    initISIS();
    setKPI('bt-kpi-districts', '30');
    setKPI('bt-kpi-drones', '0');
    setKPI('bt-kpi-robots', '0');
    setKPI('bt-kpi-clusters', '—');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
