/**
 * JORINOVA NEXUS ALIS-X — Hematology AI Intelligence
 * CBC interpretation, Anemia classification, Coagulation, Inflammation
 * ISO 15189 — Decision Support Only
 */
'use strict';

(function () {
  const CSRF   = () => window.NEXUS?.csrf || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  const toast  = (m, t) => window.NEXUS?.Toast?.show?.(m, t);
  const esc    = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ─── Tab switching ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.hema-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.hema-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.hema-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.pane);
        if (pane) pane.classList.add('active');
        if (btn.dataset.pane === 'hema-analytics-pane') loadAnalytics();
      });
    });
  }

  /* ─── Live CBC field validation ─────────────────────────────── */
  const CBC_RANGES = {
    wbc:  { lo:4.5,  hi:11.0,  crit_lo:2.0,  crit_hi:30.0 },
    rbc:  { lo:3.8,  hi:5.8,   crit_lo:2.0,  crit_hi:7.0  },
    hgb:  { lo:11.5, hi:17.5,  crit_lo:7.0,  crit_hi:20.0 },
    hct:  { lo:35,   hi:52,    crit_lo:20,   crit_hi:60   },
    mcv:  { lo:80,   hi:100,   crit_lo:60,   crit_hi:120  },
    mch:  { lo:27,   hi:33,    crit_lo:20,   crit_hi:40   },
    mchc: { lo:32,   hi:36,    crit_lo:28,   crit_hi:38   },
    rdw:  { lo:11.5, hi:14.5,  crit_lo:null, crit_hi:null },
    plt:  { lo:150,  hi:400,   crit_lo:50,   crit_hi:1000 },
    mpv:  { lo:7.5,  hi:12.5,  crit_lo:null, crit_hi:null },
    neut: { lo:50,   hi:70,    crit_lo:null, crit_hi:null },
    lymph:{ lo:20,   hi:40,    crit_lo:null, crit_hi:null },
    mono: { lo:2,    hi:8,     crit_lo:null, crit_hi:null },
    eo:   { lo:1,    hi:4,     crit_lo:null, crit_hi:null },
    baso: { lo:0,    hi:1,     crit_lo:null, crit_hi:null },
    blast:{ lo:0,    hi:0,     crit_lo:null, crit_hi:0.1  },
  };

  function initLiveValidation() {
    Object.keys(CBC_RANGES).forEach(key => {
      const el = document.getElementById('cbc-' + key);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        const r = CBC_RANGES[key];
        el.classList.remove('abnormal', 'critical');
        if (isNaN(v)) return;
        if ((r.crit_lo !== null && v <= r.crit_lo) || (r.crit_hi !== null && v >= r.crit_hi)) {
          el.classList.add('critical');
        } else if (v < r.lo || v > r.hi) {
          el.classList.add('abnormal');
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     CBC AI INTERPRETATION ENGINE
  ══════════════════════════════════════════════════════════════ */
  function interpretCBC(d) {
    const out = { primary: '', severity: 'normal', sections: [], reflexes: [], leukemia_flag: false, critical_values: [] };

    // Critical value check
    if (d.hgb <= 7.0)  out.critical_values.push(`HGB ${d.hgb} g/dL — CRITICAL LOW → immediate transfusion evaluation`);
    if (d.hgb >= 20.0) out.critical_values.push(`HGB ${d.hgb} g/dL — CRITICAL HIGH`);
    if (d.plt <= 50)   out.critical_values.push(`PLT ${d.plt} ×10³/µL — CRITICAL LOW → bleeding risk`);
    if (d.wbc >= 30)   out.critical_values.push(`WBC ${d.wbc} ×10³/µL — CRITICAL HIGH → leukemia/sepsis`);
    if (d.wbc <= 2.0)  out.critical_values.push(`WBC ${d.wbc} ×10³/µL — CRITICAL LOW → severe neutropenia`);

    // ── Anemia Classification ──
    const anemia = d.hgb < (d.gender === 'F' ? 12.0 : 13.0);
    let anemiaType = '', anemiaDetail = '', anemiaReflex = [];
    if (anemia) {
      if (d.mcv < 80) {
        if (d.mchc < 32) {
          anemiaType = 'MICROCYTIC HYPOCHROMIC ANEMIA';
          anemiaDetail = 'Pattern consistent with iron deficiency anaemia (IDA). Low MCV + low MCHC. High RDW expected. Consider serum ferritin, TIBC, serum iron.';
          anemiaReflex = ['Serum Ferritin', 'Serum Iron + TIBC', 'Peripheral blood smear', 'Reticulocyte count'];
          out.severity = d.hgb < 8 ? 'severe' : d.hgb < 10 ? 'moderate' : 'mild';
        } else {
          anemiaType = 'MICROCYTIC NORMOCHROMIC ANEMIA';
          anemiaDetail = 'Microcytic anaemia with normal MCHC. Thalassaemia trait or sideroblastic anaemia likely. Low RDW may indicate thalassaemia trait.';
          anemiaReflex = ['Hb Electrophoresis', 'Serum Ferritin', 'Peripheral smear', 'HbA2 + HbF quantification'];
          out.severity = 'moderate';
        }
      } else if (d.mcv > 100) {
        anemiaType = 'MACROCYTIC ANEMIA';
        anemiaDetail = 'Raised MCV indicates macrocytosis. Vitamin B12 or folate deficiency most common. Consider also liver disease, hypothyroidism, alcohol, or antifolate drugs.';
        anemiaReflex = ['Serum Vitamin B12', 'Red cell folate', 'Serum folate', 'Peripheral smear (hypersegmented neutrophils?)', 'LFT + TFT'];
        out.severity = 'moderate';
      } else {
        anemiaType = 'NORMOCYTIC NORMOCHROMIC ANEMIA';
        anemiaDetail = 'Normal MCV + MCHC with anaemia suggests early IDA, chronic disease (ACD), haemolysis, aplasia, or haemorrhage. Reticulocyte count differentiates hypoproliferative from haemolytic causes.';
        anemiaReflex = ['Reticulocyte count', 'Peripheral smear', 'Serum CRP/ESR', 'LFT + RFT', 'Direct Coombs test (if haemolysis suspected)'];
        out.severity = 'mild';
      }
      out.primary = anemiaType;
      out.sections.push({ title: '🔴 Anemia Classification', text: anemiaDetail });
      out.reflexes.push(...anemiaReflex);
    }

    // ── WBC Analysis ──
    let wbcFindings = [];
    if (d.wbc > 11.0) {
      const neutAbs = d.wbc * (d.neut / 100);
      if (d.neut > 70) { wbcFindings.push(`Neutrophilic leukocytosis (Neut: ${d.neut}%, ANC≈${neutAbs.toFixed(1)} ×10³/µL) — bacterial infection, inflammation, or stress response`); }
      if (d.lymph > 45) { wbcFindings.push(`Lymphocytosis (${d.lymph}%) — viral infection, CLL, or reactive lymphocytosis`); }
      if (d.eo > 6) { wbcFindings.push(`Eosinophilia (${d.eo}%) — parasitic infection, allergy, or hypereosinophilic syndrome`); }
      if (d.mono > 10) { wbcFindings.push(`Monocytosis (${d.mono}%) — chronic infection, malignancy`); }
      if (d.wbc > 30) {
        out.leukemia_flag = true;
        wbcFindings.push(`⚠️ EXTREME LEUKOCYTOSIS (WBC ${d.wbc}) — leukaemia, leukaemoid reaction, or sepsis. URGENT REVIEW.`);
      }
      if (!anemia) { out.primary = 'LEUKOCYTOSIS'; out.severity = d.wbc > 20 ? 'severe' : 'moderate'; }
    } else if (d.wbc < 4.5) {
      const neutAbs = d.wbc * (d.neut / 100);
      wbcFindings.push(`Leukopenia (WBC ${d.wbc} ×10³/µL).`);
      if (neutAbs < 1.5) { wbcFindings.push(`Neutropenia (ANC ≈ ${neutAbs.toFixed(1)} ×10³/µL) — infection risk. ${neutAbs < 0.5 ? '⚠️ SEVERE — agranulocytosis: isolate patient.' : 'Monitor closely.'}`); }
      if (!anemia) { out.primary = 'LEUKOPENIA'; out.severity = neutAbs < 0.5 ? 'severe' : 'moderate'; }
    }
    if (d.blast > 0) {
      out.leukemia_flag = true;
      wbcFindings.push(`⚠️ BLAST CELLS DETECTED (${d.blast}%) — ACUTE LEUKAEMIA MUST BE EXCLUDED. Urgent review and bone marrow examination.`);
      out.reflexes.push('Urgent bone marrow aspiration', 'Flow cytometry immunophenotyping', 'Cytogenetics + FISH', 'LDH');
    }
    if (wbcFindings.length) {
      out.sections.push({ title: '⚪ White Cell Analysis', text: wbcFindings.join('<br>') });
    }

    // ── Platelet Analysis ──
    if (d.plt < 150) {
      let thrombDetail = d.plt < 50 ? '⚠️ SEVERE thrombocytopaenia — significant bleeding risk.' : d.plt < 100 ? 'Moderate thrombocytopaenia — monitor for bleeding.' : 'Mild thrombocytopaenia.';
      thrombDetail += ` Consider: ITP, viral infection, HUS/TTP, DIC, bone marrow suppression, drug-induced.`;
      out.sections.push({ title: '🟣 Platelet Analysis', text: thrombDetail });
      if (!anemia && out.primary === '') { out.primary = 'THROMBOCYTOPAENIA'; out.severity = d.plt < 50 ? 'severe' : 'mild'; }
      out.reflexes.push('Peripheral smear', 'Coagulation screen (PT/APTT/D-dimer)');
    } else if (d.plt > 400) {
      out.sections.push({ title: '🟣 Platelet Analysis', text: `Thrombocytosis (PLT ${d.plt} ×10³/µL). Reactive: infection, iron deficiency, post-splenectomy. Primary: essential thrombocythaemia.` });
    }

    if (!out.primary) out.primary = 'WITHIN NORMAL LIMITS';
    return out;
  }

  function renderCBCResult(interp) {
    const panel = document.getElementById('cbc-result-panel');
    const critHtml = interp.critical_values.length
      ? `<div class="sepsis-alert">🚨 CRITICAL VALUES: ${interp.critical_values.join(' | ')}</div>`
      : '';
    const leukHtml = interp.leukemia_flag
      ? `<div class="leukemia-flag">⚠️ LEUKAEMIA / BLAST ALERT — URGENT PATHOLOGIST REVIEW REQUIRED</div>`
      : '';
    const sectionsHtml = interp.sections.map(s =>
      `<div class="interp-section">
        <div class="interp-section-title">${esc(s.title)}</div>
        <div class="interp-finding">${s.text}</div>
      </div>`
    ).join('');
    const reflexHtml = interp.reflexes.length
      ? `<div class="interp-section">
          <div class="interp-section-title">🔬 Reflex Test Suggestions</div>
          <div class="reflex-tags">${interp.reflexes.map(r => `<span class="reflex-tag">🧪 ${esc(r)}</span>`).join('')}</div>
        </div>` : '';

    panel.innerHTML = `<div class="ai-result-content">
      ${critHtml}${leukHtml}
      <div>
        <div class="finding-primary">${esc(interp.primary)}</div>
        <span class="finding-severity sev-${interp.severity}">${interp.severity.toUpperCase()}</span>
      </div>
      ${sectionsHtml}${reflexHtml}
      <div class="iso-disclaimer">🔒 AI INTERPRETATION — REQUIRES VALIDATION BY CERTIFIED LABORATORY PROFESSIONAL · ISO 15189:2022</div>
    </div>`;
  }

  function initCBC() {
    document.getElementById('cbc-interpret-btn')?.addEventListener('click', () => {
      const g = id => parseFloat(document.getElementById('cbc-' + id)?.value) || 0;
      const data = {
        wbc: g('wbc'), rbc: g('rbc'), hgb: g('hgb'), hct: g('hct'),
        mcv: g('mcv'), mch: g('mch'), mchc: g('mchc'), rdw: g('rdw'),
        plt: g('plt'), mpv: g('mpv'),
        neut: g('neut'), lymph: g('lymph'), mono: g('mono'), eo: g('eo'), baso: g('baso'), blast: g('blast'),
        gender: document.getElementById('cbc-gender')?.value || 'M',
      };
      if (!data.hgb) { toast('Enter at least HGB to interpret.', 'error'); return; }
      renderCBCResult(interpretCBC(data));
    });
  }

  /* ─── Peripheral Smear ──────────────────────────────────────── */
  function initSmear() {
    const zone = document.getElementById('smear-upload-zone');
    const input = document.getElementById('smear-file-input');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) processSmearFile(e.dataTransfer.files[0]); });
    }
    if (input) input.addEventListener('change', e => { if (e.target.files[0]) processSmearFile(e.target.files[0]); });

    document.getElementById('smear-analyze-btn')?.addEventListener('click', () => {
      renderSmearResult(generateDemoSmearResult());
    });
  }

  function processSmearFile(file) {
    const zone = document.getElementById('smear-upload-zone');
    if (zone) zone.innerHTML = `<div class="smear-upload-icon">✅</div><div style="font-size:var(--text-sm);color:var(--alert-green)">${esc(file.name)}</div>`;
  }

  function generateDemoSmearResult() {
    return {
      red_cell_morphology: [
        { name: 'Normocytes', pct: 60, color: '#00E676' },
        { name: 'Hypochromic cells', pct: 20, color: '#FFD600' },
        { name: 'Microcytes', pct: 12, color: '#FF6D00' },
        { name: 'Target cells (codocytes)', pct: 5, color: '#FF6D00' },
        { name: 'Poikilocytes', pct: 3, color: '#FF1744' },
      ],
      wbc_diff: { neutrophils:65, lymphocytes:28, monocytes:5, eosinophils:2, basophils:0, blast:0 },
      platelet_estimate: 'Adequate',
      parasite: null,
      impression: 'Hypochromic microcytic anaemia pattern — iron deficiency likely',
      confidence: 87,
    };
  }

  function renderSmearResult(r) {
    const panel = document.getElementById('smear-result-panel');
    const morphBars = r.red_cell_morphology.map(m =>
      `<div class="morphology-row">
        <span class="morphology-name">${esc(m.name)}</span>
        <div class="morphology-bar-wrap"><div class="morphology-bar-fill" style="width:${m.pct}%;background:${m.color}"></div></div>
        <span class="morphology-pct">${m.pct}%</span>
      </div>`
    ).join('');
    panel.innerHTML = `<div class="ai-result-content">
      <div>
        <div class="finding-primary">🔬 ${esc(r.impression)}</div>
        <span class="finding-severity sev-mild">AI Confidence: ${r.confidence}%</span>
      </div>
      <div class="interp-section">
        <div class="interp-section-title">🔴 Red Cell Morphology</div>${morphBars}
      </div>
      <div class="interp-section">
        <div class="interp-section-title">⚪ WBC Differential (Smear)</div>
        <div class="interp-finding">
          Neutrophils: <strong>${r.wbc_diff.neutrophils}%</strong> &nbsp;|&nbsp;
          Lymphocytes: <strong>${r.wbc_diff.lymphocytes}%</strong> &nbsp;|&nbsp;
          Monocytes: <strong>${r.wbc_diff.monocytes}%</strong> &nbsp;|&nbsp;
          Eosinophils: <strong>${r.wbc_diff.eosinophils}%</strong>
          ${r.wbc_diff.blast > 0 ? `<br><strong style="color:var(--alert-red)">⚠️ BLASTS: ${r.wbc_diff.blast}%</strong>` : ''}
        </div>
      </div>
      <div class="interp-section">
        <div class="interp-section-title">🟣 Platelet Estimate</div>
        <div class="interp-finding">${esc(r.platelet_estimate)}</div>
      </div>
      ${r.parasite ? `<div class="leukemia-flag">⚠️ PARASITE DETECTED: ${esc(r.parasite)}</div>` : ''}
      <div class="iso-disclaimer">⚠️ AI SUGGESTIVE ONLY — Manual microscopist confirmation required · ISO 15189:2022</div>
    </div>`;
  }

  /* ─── Coagulation ───────────────────────────────────────────── */
  function interpretCoagulation(d) {
    const findings = [];
    const reflexes = [];

    if (d.inr > 3.0)     findings.push(`INR ${d.inr} — Markedly elevated. ${d.therapy === 'Warfarin' ? 'Supratherapeutic Warfarin — risk of major bleeding.' : 'Severe coagulopathy — liver failure or DIC suspected.'}`);
    else if (d.inr > 1.5) findings.push(`INR ${d.inr} — Elevated. ${d.therapy === 'Warfarin' ? 'Warfarin therapy — monitor.' : 'Mild coagulation defect — PT pathway affected.'}`);

    if (d.aptt > 40 && d.pt_elevated) {
      findings.push('PT + APTT both prolonged — DIC pattern, warfarin/heparin, liver disease, or factor deficiency.');
      reflexes.push('D-dimer', 'Fibrinogen', 'Thrombin time', 'Mixing study');
    } else if (d.aptt > 40) {
      findings.push(`APTT ${d.aptt}s prolonged — intrinsic pathway defect. Heparin therapy, Factor VIII/IX/XI deficiency, lupus anticoagulant.`);
      reflexes.push('Mixing study (immediate + incubated)', 'Factor VIII/IX assay', 'Lupus anticoagulant screen');
    }

    if (d.ddimer > 0.5) {
      findings.push(`D-dimer ${d.ddimer} µg/mL elevated — thrombosis, DIC, PE/DVT, post-surgery, inflammation. Correlate with clinical Wells score.`);
      reflexes.push('Doppler USS (DVT)', 'CT-PA (if PE suspected)', 'Fibrinogen + FDP');
    }

    if (d.fibr < 1.5) {
      findings.push(`Fibrinogen ${d.fibr} g/L — LOW. Consumption coagulopathy (DIC), severe liver disease, or hypofibrinogenaemia.`);
    }

    if (findings.length === 0) findings.push('Coagulation profile within normal limits.');

    return { primary: d.inr > 2 ? 'COAGULOPATHY' : findings.length > 1 ? 'HAEMOSTASIS ABNORMALITY' : 'NORMAL HAEMOSTASIS', findings, reflexes, severity: d.inr > 3 || d.ddimer > 2 ? 'severe' : d.inr > 1.5 ? 'moderate' : 'normal' };
  }

  function initCoagulation() {
    document.getElementById('coag-interpret-btn')?.addEventListener('click', () => {
      const g = id => parseFloat(document.getElementById('coag-' + id)?.value) || 0;
      const data = {
        pt: g('pt'), inr: g('inr'), aptt: g('aptt'), fibr: g('fibr'),
        ddimer: g('ddimer'), tt: g('tt'),
        therapy: document.getElementById('coag-therapy')?.value || '',
        pt_elevated: g('pt') > 13,
      };
      const interp = interpretCoagulation(data);
      const panel = document.getElementById('coag-result-panel');
      panel.innerHTML = `<div class="ai-result-content">
        <div><div class="finding-primary">${esc(interp.primary)}</div>
        <span class="finding-severity sev-${interp.severity}">${interp.severity.toUpperCase()}</span></div>
        <div class="interp-section">
          <div class="interp-section-title">🧬 Coagulation Analysis</div>
          <div class="interp-finding">${interp.findings.map(f => `• ${esc(f)}`).join('<br>')}</div>
        </div>
        ${interp.reflexes.length ? `<div class="interp-section"><div class="interp-section-title">🔬 Reflex Suggestions</div>
          <div class="reflex-tags">${interp.reflexes.map(r => `<span class="reflex-tag">🧪 ${esc(r)}</span>`).join('')}</div></div>` : ''}
        <div class="iso-disclaimer">🔒 AI Coagulation DSS — ISO 15189:2022 — Pathologist validation required</div>
      </div>`;
    });
  }

  /* ─── Inflammation ──────────────────────────────────────────── */
  function interpretInflammation(d) {
    const findings = [];
    const severity = d.pct > 2 ? 'severe' : d.crp > 50 ? 'moderate' : d.crp > 10 ? 'mild' : 'normal';
    const isSepsis = d.pct > 2;
    const isAcute = d.crp > 10 && d.esr > (d.gender === 'F' ? 20 : 15);
    const isChronic = d.esr > 50 && d.crp < 20;

    if (isSepsis) findings.push(`🚨 PCT ${d.pct} µg/L — SEPSIS HIGHLY LIKELY. Immediate blood cultures and antimicrobial therapy evaluation.`);
    if (d.pct > 0.5 && d.pct < 2) findings.push(`PCT ${d.pct} µg/L — Elevated. Systemic bacterial infection possible. Monitor closely.`);
    if (isAcute) findings.push(`CRP ${d.crp} mg/L + ESR ${d.esr} mm/hr — Acute inflammatory response. Bacterial infection, tissue injury, or autoimmune process.`);
    if (isChronic) findings.push(`Elevated ESR with low/normal CRP pattern — chronic inflammation, autoimmune disease, or malignancy.`);
    if (d.ferritin > 1000) findings.push(`Hyperferritinaemia (${d.ferritin} µg/L) — haemophagocytic syndrome (HLH), severe sepsis, or iron overload.`);
    if (findings.length === 0) findings.push('Inflammatory markers within normal reference intervals. No acute inflammatory response detected.');

    return { isSepsis, findings, severity, primary: isSepsis ? 'SEPSIS — CRITICAL ALERT' : isAcute ? 'ACUTE INFLAMMATORY RESPONSE' : 'NORMAL INFLAMMATORY PROFILE' };
  }

  function initInflammation() {
    document.getElementById('infl-interpret-btn')?.addEventListener('click', () => {
      const g = id => parseFloat(document.getElementById('infl-' + id)?.value) || 0;
      const data = { esr:g('esr'), crp:g('crp'), pct:g('pct'), ferritin:g('ferritin'), ldh:g('ldh'), il6:g('il6'),
                     gender:document.getElementById('infl-gender')?.value || 'M', age:g('age') };
      const interp = interpretInflammation(data);
      const panel = document.getElementById('infl-result-panel');
      panel.innerHTML = `<div class="ai-result-content">
        ${interp.isSepsis ? '<div class="sepsis-alert">🚨 SEPSIS ALERT — IMMEDIATE CLINICAL ACTION REQUIRED</div>' : ''}
        <div><div class="finding-primary">${esc(interp.primary)}</div>
        <span class="finding-severity sev-${interp.severity}">${interp.severity.toUpperCase()}</span></div>
        <div class="interp-section">
          <div class="interp-section-title">📊 Inflammatory Analysis</div>
          <div class="interp-finding">${interp.findings.map(f => `• ${f}`).join('<br>')}</div>
        </div>
        <div class="iso-disclaimer">🔒 AI Inflammation DSS — ISO 15189:2022</div>
      </div>`;
    });
  }

  /* ─── Worklist (demo) ──────────────────────────────────────── */
  function loadWorklist() {
    const tbody = document.getElementById('hema-worklist-tbody');
    if (!tbody) return;
    const DEMO = [
      { name:'KAMANZI Jean', pid:'RWA-2024-00142', lab_id:'LAB-240515-001', tests:'CBC, Retic', tat:'32 min', priority:'routine', status:'processing' },
      { name:'UWIMANA Grace', pid:'RWA-2024-00287', lab_id:'LAB-240515-002', tests:'CBC, ESR, CRP', tat:'12 min', priority:'urgent', status:'pending' },
      { name:'HABIMANA Eric', pid:'RWA-2024-00388', lab_id:'LAB-240515-003', tests:'CBC DIFF, PT, APTT', tat:'58 min', priority:'emergency', status:'pending' },
    ];
    tbody.innerHTML = DEMO.map(r => `
      <tr>
        <td><div style="font-weight:600;font-size:var(--text-sm)">${esc(r.name)}</div>
            <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${esc(r.pid)}</div></td>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--blue-glow)">${esc(r.lab_id)}</span></td>
        <td><span style="font-size:var(--text-xs)">${esc(r.tests)}</span></td>
        <td><span style="font-family:var(--font-mono);font-size:11px">${esc(r.tat)}</span></td>
        <td><span class="badge ${r.priority === 'emergency' ? 'badge-red' : r.priority === 'urgent' ? 'badge-orange' : 'badge-blue'}">${esc(r.priority)}</span></td>
        <td><span class="badge ${r.status === 'validated' ? 'badge-green' : r.status === 'processing' ? 'badge-blue' : 'badge-yellow'}">${esc(r.status)}</span></td>
        <td style="text-align:right">
          <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-pane=hema-cbc-pane]').click()">🔬 Enter Results</button>
        </td>
      </tr>`).join('');
  }

  /* ─── Analytics ─────────────────────────────────────────────── */
  function loadAnalytics() {
    document.getElementById('kpi-hema-total')?.textContent !== '—' && (document.getElementById('kpi-hema-total').textContent = '47');
    const el = id => document.getElementById(id);
    if (el('kpi-hema-total')) el('kpi-hema-total').textContent = '47';
    if (el('kpi-hema-abnormal')) el('kpi-hema-abnormal').textContent = '12';
    if (el('kpi-hema-critical')) el('kpi-hema-critical').textContent = '3';
    if (el('kpi-hema-tat')) el('kpi-hema-tat').textContent = '38';

    const findings = document.getElementById('hema-top-findings');
    if (findings) {
      const top = [['Iron Deficiency Anaemia',18],['Leukocytosis',9],['Thrombocytopaenia',7],['Pancytopaenia',4],['Polycythaemia',2]];
      findings.innerHTML = top.map(([name, cnt]) =>
        `<div style="display:flex;align-items:center;gap:var(--space-sm);padding:5px 0;border-bottom:1px solid var(--border-dim)">
          <div style="flex:1;font-size:var(--text-xs);color:var(--text-secondary)">${esc(name)}</div>
          <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text-primary)">${cnt}</div>
        </div>`
      ).join('');
    }

    const chartEl = document.getElementById('hema-volume-chart');
    if (chartEl && window.Chart) {
      if (chartEl._chartInstance) chartEl._chartInstance.destroy();
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      chartEl._chartInstance = new Chart(chartEl, {
        type: 'bar',
        data: { labels: days, datasets: [{ label: 'CBC Tests', data: [38,44,52,41,47,29,18], backgroundColor: 'rgba(255,23,68,0.4)', borderColor: '#FF4466', borderWidth: 1.5, borderRadius: 3 }] },
        options: { responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false} }, scales:{ x:{grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#8899aa'}}, y:{grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#8899aa'}} } }
      });
    }
  }

  /* ─── Init ──────────────────────────────────────────────────── */
  function init() {
    initTabs();
    initLiveValidation();
    initCBC();
    initSmear();
    initCoagulation();
    initInflammation();
    loadWorklist();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
