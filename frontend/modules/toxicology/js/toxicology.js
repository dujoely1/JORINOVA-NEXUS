/**
 * JORINOVA NEXUS ALIS-X — Toxicology Intelligence
 * UDS · TDM · Poisoning Assessment · ISO 15189 DSS
 */
'use strict';

(function () {
  const toast = (m, t) => window.NEXUS?.Toast?.show?.(m, t);
  const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ─── Tab switching ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll('.tox-tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tox-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tox-body .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.pane);
        if (pane) pane.classList.add('active');
        if (btn.dataset.pane === 'tox-analytics-pane') loadAnalytics();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     UDS PANEL
  ══════════════════════════════════════════════════════════════ */
  const PANELS = {
    '5':  ['Amphetamines','Cocaine (BZE)','THC / Cannabis','Opiates','Benzodiazepines'],
    '10': ['Amphetamines','Cocaine (BZE)','THC / Cannabis','Opiates','Benzodiazepines','Methadone','Buprenorphine','Barbiturates','PCP','Methamphetamine'],
    '12': ['Amphetamines','Cocaine (BZE)','THC / Cannabis','Opiates','Benzodiazepines','Methadone','Buprenorphine','Barbiturates','PCP','Methamphetamine','MDMA / Ecstasy','Tricyclics (TCA)'],
  };
  const CUTOFFS = {
    'Amphetamines':'1000 ng/mL','Cocaine (BZE)':'300 ng/mL','THC / Cannabis':'50 ng/mL',
    'Opiates':'2000 ng/mL','Benzodiazepines':'200 ng/mL','Methadone':'300 ng/mL',
    'Buprenorphine':'10 ng/mL','Barbiturates':'200 ng/mL','PCP':'25 ng/mL',
    'Methamphetamine':'1000 ng/mL','MDMA / Ecstasy':'500 ng/mL','Tricyclics (TCA)':'1000 ng/mL',
  };
  const _drugResults = {};

  function renderUDSPanel(size) {
    const drugs = PANELS[size] || PANELS['5'];
    const grid = document.getElementById('uds-drug-grid');
    if (!grid) return;
    grid.innerHTML = drugs.map(d => `
      <div class="uds-drug-row" id="drug-row-${d.replace(/[^a-z]/gi,'_')}">
        <div>
          <div class="uds-drug-name">${esc(d)}</div>
          <div style="font-size:9px;color:var(--text-muted)">Cut-off: ${esc(CUTOFFS[d]||'—')}</div>
        </div>
        <div class="uds-drug-buttons">
          <button class="uds-btn" data-drug="${esc(d)}" data-result="negative" onclick="window.UDS.setResult('${d}','negative',this)">NEG</button>
          <button class="uds-btn" data-drug="${esc(d)}" data-result="positive" onclick="window.UDS.setResult('${d}','positive',this)">POS</button>
          <button class="uds-btn" data-drug="${esc(d)}" data-result="invalid"  onclick="window.UDS.setResult('${d}','invalid',this)">INV</button>
        </div>
      </div>`).join('');
    drugs.forEach(d => { _drugResults[d] = null; });
  }

  window.UDS = {
    setResult(drug, result, btn) {
      _drugResults[drug] = result;
      const row = document.getElementById('drug-row-' + drug.replace(/[^a-z]/gi,'_'));
      if (row) {
        row.querySelectorAll('.uds-btn').forEach(b => b.classList.remove('selected-neg','selected-pos','selected-inv'));
        btn.classList.add(`selected-${result === 'negative' ? 'neg' : result === 'positive' ? 'pos' : 'inv'}`);
      }
    },
    updatePanel(size) { renderUDSPanel(size); }
  };

  function initUDS() {
    renderUDSPanel('5');
    document.getElementById('uds-interpret-btn')?.addEventListener('click', () => {
      const positives = Object.entries(_drugResults).filter(([,v]) => v === 'positive').map(([k]) => k);
      const invalids  = Object.entries(_drugResults).filter(([,v]) => v === 'invalid').map(([k]) => k);
      const entered   = Object.entries(_drugResults).filter(([,v]) => v !== null).length;
      if (!entered) { toast('Set at least one drug result.', 'error'); return; }
      renderUDSResult(positives, invalids);
    });
  }

  function renderUDSResult(positives, invalids) {
    const panel = document.getElementById('uds-result-panel');
    const anyPositive = positives.length > 0;
    const gcms = positives.map(d => `<span class="reflex-tag" style="background:rgba(255,23,68,.10);border-color:rgba(255,23,68,.25);color:var(--alert-red)">🔬 GC-MS confirm: ${esc(d)}</span>`).join('');

    panel.innerHTML = `<div class="tox-result-content">
      <div>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary)">
          ${anyPositive ? '⚠️ POSITIVE RESULTS DETECTED' : '✅ ALL RESULTS NEGATIVE'}
        </div>
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 14px;border-radius:var(--radius-full);font-size:11px;font-weight:700;border:1px solid;margin-top:4px;
          ${anyPositive ? 'color:var(--alert-red);border-color:var(--alert-red);background:rgba(255,23,68,.08)' : 'color:var(--alert-green);border-color:var(--alert-green);background:rgba(0,230,118,.08)'}">
          ${positives.length} positive, ${invalids.length} invalid
        </span>
      </div>
      ${anyPositive ? `<div class="tox-interp-section" style="border-color:rgba(255,23,68,.25);background:rgba(255,23,68,.04)">
        <div class="tox-section-title">⚠️ Positive Substances</div>
        <div class="tox-finding">${positives.map(d=>`🔴 <strong>${esc(d)}</strong> — Screened POSITIVE (immunoassay). GC-MS/LC-MS confirmation required before clinical/legal action.`).join('<br>')}</div>
      </div>` : ''}
      <div class="tox-interp-section">
        <div class="tox-section-title">🤖 AI Clinical Context</div>
        <div class="tox-finding">
          ${positives.includes('Benzodiazepines') ? '⚠️ Benzodiazepines positive — verify prescribed medications (diazepam, clonazepam, lorazepam) before reporting abuse.<br>' : ''}
          ${positives.includes('Opiates') ? '⚠️ Opiates positive — cross-reactivity with codeine, tramadol. Confirm morphine vs therapeutic opioid.<br>' : ''}
          ${positives.includes('Amphetamines') ? '⚠️ Amphetamines — cross-reactivity with pseudoephedrine, some antidepressants (bupropion). Confirm by GC-MS.<br>' : ''}
          ${invalids.length ? `⚪ ${invalids.length} test(s) invalid — repeat testing recommended.<br>` : ''}
          ${!anyPositive ? 'All screened substances below detection cutoffs.' : ''}
        </div>
      </div>
      ${anyPositive ? `<div class="tox-interp-section"><div class="tox-section-title">🔬 Confirmatory Testing Required</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${gcms}</div>
      </div>` : ''}
      ${invalids.length ? '<div style="padding:var(--space-sm) var(--space-md);border-radius:var(--radius-sm);background:rgba(255,214,0,.06);border:1px solid rgba(255,214,0,.20);font-size:var(--text-xs);color:var(--alert-yellow)">⚪ INVALID results: dilute or adulterated sample suspected — repeat with observed collection</div>' : ''}
      <div class="iso-disclaimer">🔒 Immunoassay screening results — confirmatory GC-MS/LC-MS required · ISO 15189:2022</div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     TDM ENGINE
  ══════════════════════════════════════════════════════════════ */
  const TDM_DRUGS = {
    digoxin:     { unit:'µg/L',  trough:{lo:0.8, hi:2.0}, toxic:2.5,  critical:4.0,  dose_hint:'0.125–0.25mg/day oral. Adjust for renal function.' },
    phenytoin:   { unit:'mg/L',  trough:{lo:10,  hi:20},  toxic:20,   critical:30,   dose_hint:'300–400mg/day. Check albumin for free phenytoin.' },
    carbamazepine:{ unit:'mg/L', trough:{lo:4,   hi:12},  toxic:12,   critical:20,   dose_hint:'400–1600mg/day in divided doses.' },
    valproate:   { unit:'mg/L',  trough:{lo:50,  hi:100}, toxic:120,  critical:200,  dose_hint:'1000–2500mg/day. Check LFTs and ammonia if encephalopathy.' },
    lithium:     { unit:'mmol/L',trough:{lo:0.6, hi:1.2}, toxic:1.5,  critical:2.0,  dose_hint:'Trough 12hrs post-dose. Toxic: tremor, ataxia, confusion.' },
    gentamicin:  { unit:'mg/L',  peak:{lo:5,hi:10},trough:{lo:0,hi:2},toxic:2,critical:4, dose_hint:'Peak 30min post-infusion, trough pre-dose. Once-daily dosing: trough <1mg/L.' },
    vancomycin:  { unit:'mg/L',  trough:{lo:10, hi:20},  toxic:20,   critical:40,   dose_hint:'AUC/MIC 400–600 preferred over trough alone.' },
    tacrolimus:  { unit:'µg/L',  trough:{lo:5,  hi:15},  toxic:20,   critical:30,   dose_hint:'Target varies by transplant type/timing post-op. Check renal function.' },
    cyclosporine:{ unit:'µg/L',  trough:{lo:100,hi:300}, toxic:400,  critical:600,  dose_hint:'C2 monitoring preferred for cyclosporine A.' },
    theophylline:{ unit:'mg/L',  trough:{lo:10, hi:20},  toxic:20,   critical:30,   dose_hint:'Narrow TI. Toxicity: seizures, arrhythmias at >30mg/L.' },
    methotrexate:{ unit:'µmol/L',trough:{lo:0,  hi:0.1}, toxic:1.0,  critical:5.0,  dose_hint:'MTX >1µmol/L at 48h = delayed elimination — leucovorin rescue.' },
    amikacin:    { unit:'mg/L',  peak:{lo:20,hi:35},trough:{lo:0,hi:5}, toxic:5, critical:10, dose_hint:'Trough <5mg/L (nephrotoxicity), Peak 20–35mg/L (efficacy).' },
  };

  function initTDM() {
    const drugSel = document.getElementById('tdm-drug');
    const unitEl  = document.getElementById('tdm-unit');
    drugSel?.addEventListener('change', () => {
      const d = TDM_DRUGS[drugSel.value];
      if (d && unitEl) unitEl.textContent = d.unit;
    });
    if (unitEl && drugSel) unitEl.textContent = TDM_DRUGS[drugSel.value]?.unit || '—';

    document.getElementById('tdm-interpret-btn')?.addEventListener('click', () => {
      const drug   = document.getElementById('tdm-drug')?.value;
      const value  = parseFloat(document.getElementById('tdm-value')?.value);
      const timing = document.getElementById('tdm-timing')?.value || 'trough';
      if (!drug || isNaN(value)) { toast('Enter drug and measured level.', 'error'); return; }
      renderTDMResult(drug, value, timing);
    });
  }

  function renderTDMResult(drug, value, timing) {
    const spec = TDM_DRUGS[drug];
    if (!spec) return;
    const ref = timing === 'peak' && spec.peak ? spec.peak : spec.trough;
    const panel = document.getElementById('tdm-result-panel');

    let zone, zonePct, severity;
    if (value < ref.lo) {
      zone = 'sub-therapeutic'; severity = 'mild';
      zonePct = Math.min(95, Math.max(2, (value / ref.lo) * 30));
    } else if (value <= ref.hi) {
      zone = 'therapeutic'; severity = 'normal';
      zonePct = 30 + ((value - ref.lo) / (ref.hi - ref.lo)) * 25;
    } else if (value <= spec.toxic) {
      zone = 'potentially toxic'; severity = 'moderate';
      zonePct = 55 + ((value - ref.hi) / (spec.toxic - ref.hi)) * 20;
    } else {
      zone = 'TOXIC / CRITICAL'; severity = 'severe';
      zonePct = 75 + ((value - spec.toxic) / (spec.critical - spec.toxic)) * 20;
    }
    zonePct = Math.min(98, Math.max(2, zonePct));

    const totalWidth = ref.hi + (spec.critical - ref.hi);
    const pctSub = (ref.lo / totalWidth * 100).toFixed(1);
    const pctTher= ((ref.hi - ref.lo) / totalWidth * 100).toFixed(1);
    const pctTox = ((spec.toxic - ref.hi) / totalWidth * 100).toFixed(1);
    const pctCrit= ((spec.critical - spec.toxic) / totalWidth * 100).toFixed(1);

    const doseAdj = zone === 'sub-therapeutic' ? '⬆️ Consider dose increase — consult prescriber' :
                    zone === 'therapeutic' ? '✅ Level therapeutic — continue current dose' :
                    zone === 'potentially toxic' ? '⬇️ Consider dose reduction — monitor closely' :
                    '🚨 WITHHOLD dose — urgent clinical assessment';

    panel.innerHTML = `<div class="tox-result-content">
      ${zone === 'TOXIC / CRITICAL' ? '<div class="notify-clinical">🚨 CRITICAL LEVEL — NOTIFY CLINICAL TEAM IMMEDIATELY. Withhold next dose pending assessment.</div>' : ''}
      <div>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary)">${drug.toUpperCase()} — ${value} ${esc(spec.unit)}</div>
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 14px;border-radius:var(--radius-full);font-size:11px;font-weight:700;border:1px solid;margin-top:4px;
          ${severity==='normal'?'color:var(--alert-green);border-color:var(--alert-green);background:rgba(0,230,118,.08)':severity==='mild'?'color:var(--blue-glow);border-color:var(--blue-glow);background:rgba(0,153,255,.08)':severity==='moderate'?'color:var(--alert-orange);border-color:var(--alert-orange);background:rgba(255,109,0,.08)':'color:var(--alert-red);border-color:var(--alert-red);background:rgba(255,23,68,.08)'}">
          ${zone.toUpperCase()} (${timing})
        </span>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Therapeutic Range: ${ref.lo}–${ref.hi} ${esc(spec.unit)} (${timing})</div>
        <div class="tdm-range-container">
          <div class="tdm-zone tdm-zone-subtherapeutic" style="width:${pctSub}%">SUB</div>
          <div class="tdm-zone tdm-zone-therapeutic" style="width:${pctTher}%">THERAPEUTIC</div>
          <div class="tdm-zone tdm-zone-toxic" style="width:${pctTox}%">TOXIC</div>
          <div class="tdm-zone tdm-zone-critical" style="width:${pctCrit}%">CRIT</div>
          <div class="tdm-pointer" style="left:${zonePct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-top:4px">
          <span>0</span><span>${ref.lo}</span><span>${ref.hi}</span><span>${spec.toxic}</span><span>${spec.critical}+ ${esc(spec.unit)}</span>
        </div>
      </div>
      <div class="tox-interp-section">
        <div class="tox-section-title">💊 Dosage Guidance</div>
        <div class="tox-finding"><strong>${doseAdj}</strong><br><br>${esc(spec.dose_hint)}</div>
      </div>
      <div class="iso-disclaimer">🔒 TDM Decision Support — Consult clinical pharmacologist · ISO 15189:2022</div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     POISONING ASSESSMENT
  ══════════════════════════════════════════════════════════════ */
  const POISON_DB = {
    organophosphate: { antidote:'Atropine IV + Pralidoxime (2-PAM) within 6h', mechanism:'Cholinesterase inhibition → cholinergic crisis', symptoms:'SLUDGE: Salivation, Lacrimation, Urination, Defecation, GI distress, Emesis. Miosis, bradycardia, bronchospasm.', mgmt:'ABCDE stabilization. Atropine 2–4mg IV every 5–10min until secretions dry. Pralidoxime 1–2g IV over 15–30min.', severity:'severe' },
    paracetamol:     { antidote:'N-Acetylcysteine (NAC) IV', mechanism:'NAPQI accumulation → hepatocyte necrosis', symptoms:'Nausea/vomiting (0–24h), hepatotoxicity (24–72h), liver failure (>72h).', mgmt:'NAC 150mg/kg over 1h, then 50mg/kg over 4h, then 100mg/kg over 16h. Check LFTs, INR, creatinine.', severity:'moderate' },
    salicylate:      { antidote:'Sodium bicarbonate IV (urine alkalinization), Haemodialysis if severe', mechanism:'Uncoupling oxidative phosphorylation, respiratory alkalosis then metabolic acidosis', symptoms:'Tinnitus, hyperventilation, mixed acid-base disorder, hypoglycaemia.', mgmt:'IV bicarbonate to alkalinize urine (pH 7.5–8.5). Haemodialysis if level >700mg/L or renal failure.', severity:'moderate' },
    alcohol:         { antidote:'Supportive — no specific antidote', mechanism:'CNS depression, GABA potentiation', symptoms:'CNS depression, ataxia, respiratory depression at high levels, hypoglycaemia.', mgmt:'Airway protection, IV glucose, thiamine 100mg IV (prevent Wernicke\'s), monitor BGL.', severity:'mild' },
    methanol:        { antidote:'Fomepizole (4-MP) or Ethanol + Folic acid', mechanism:'Formate accumulation → optic nerve / CNS toxicity', symptoms:'Visual disturbance, anion gap metabolic acidosis, CNS depression.', mgmt:'Fomepizole 15mg/kg IV. Haemodialysis. Folic acid 50mg IV. Correct acidosis.', severity:'severe' },
    heavy_metal:     { antidote:'DMSA (succimer), DMPS, BAL (dimercaprol), EDTA depending on metal', mechanism:'Enzyme inhibition, cellular toxicity, mitochondrial disruption', symptoms:'Neurotoxicity, renal failure, GI symptoms, chronic exposure effects.', mgmt:'Chelation therapy. Identify specific metal. Nephrology + toxicology consultation.', severity:'moderate' },
    co:              { antidote:'100% O₂ via tight-fitting mask / hyperbaric oxygen', mechanism:'COHb formation, cellular hypoxia, cytochrome oxidase inhibition', symptoms:'Headache, confusion, cherry-red skin (late). COHb >25% = severe, >50% = coma.', mgmt:'Remove from exposure. 100% O₂ reduces COHb half-life from 5h to 60min. HBO for severe cases.', severity:'severe' },
    cyanide:         { antidote:'Hydroxocobalamin IV + Sodium thiosulphate', mechanism:'Cytochrome c oxidase inhibition → cellular asphyxia', symptoms:'Rapid loss of consciousness, lactic acidosis, almond odour (50% cannot detect).', mgmt:'Hydroxocobalamin 5g IV IMMEDIATELY. Sodium thiosulphate 12.5g IV. 100% O₂.', severity:'severe' },
    benzodiazepine:  { antidote:'Flumazenil (use with caution)', mechanism:'GABA-A potentiation → CNS depression', symptoms:'Sedation, ataxia, respiratory depression with co-ingestion.', mgmt:'Supportive. Flumazenil 0.2mg IV (risk of seizures in chronic users/mixed OD). Airway management.', severity:'mild' },
    opioid:          { antidote:'Naloxone IV/IM/IN', mechanism:'µ-opioid receptor agonism → respiratory depression, miosis', symptoms:'Triad: miosis, reduced consciousness, respiratory depression.', mgmt:'Naloxone 0.4–2mg IV/IM/IN. Repeat every 2–3min. Infusion for long-acting opioids. Monitor for re-narcotization.', severity:'severe' },
    rodenticide:     { antidote:'Vitamin K1 (phytonadione) oral/IV', mechanism:'Warfarin-type: vitamin K epoxide reductase inhibition → coagulopathy', symptoms:'Delayed coagulopathy (24–48h), bleeding from multiple sites.', mgmt:'Vitamin K1 100–300mg/day oral or slow IV infusion. Monitor PT/INR. FFP for acute bleeding.', severity:'moderate' },
  };

  function initPoisoning() {
    document.getElementById('poison-interpret-btn')?.addEventListener('click', () => {
      const substance = document.getElementById('poison-substance')?.value;
      const value = parseFloat(document.getElementById('poison-value')?.value);
      const unit  = document.getElementById('poison-unit')?.value || 'mg/L';
      const time  = parseFloat(document.getElementById('poison-time')?.value) || 0;
      if (!substance) { toast('Select a substance.', 'error'); return; }
      renderPoisonResult(substance, value, unit, time);
    });
  }

  function renderPoisonResult(substance, value, unit, time) {
    const db = POISON_DB[substance];
    if (!db) return;
    const panel = document.getElementById('poison-result-panel');
    const severityClass = `poison-${db.severity}`;

    panel.innerHTML = `<div class="tox-result-content">
      <div class="notify-clinical">🚨 NOTIFY CLINICAL TEAM — Suspected ${esc(substance.replace(/_/g,' ').toUpperCase())} toxicity${value ? ` (${value} ${esc(unit)})` : ''}</div>
      <div>
        <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary)">${esc(substance.replace(/_/g,' ').toUpperCase())} TOXICITY</div>
        <span class="poison-severity-badge ${severityClass}">${db.severity.toUpperCase()}</span>
      </div>
      <div class="tox-interp-section">
        <div class="tox-section-title">⚗️ Mechanism</div>
        <div class="tox-finding">${esc(db.mechanism)}</div>
      </div>
      <div class="tox-interp-section">
        <div class="tox-section-title">🔍 Expected Clinical Features</div>
        <div class="tox-finding">${esc(db.symptoms)}</div>
      </div>
      <div class="antidote-card">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:var(--space-sm)">💊 ANTIDOTE / SPECIFIC TREATMENT</div>
        <div style="font-weight:700;font-size:var(--text-sm)">${esc(db.antidote)}</div>
      </div>
      <div class="tox-interp-section">
        <div class="tox-section-title">🏥 Management Protocol</div>
        <div class="tox-finding">${esc(db.mgmt)}${time > 0 ? `<br><br>⏱️ Time since exposure: ~${time}h` : ''}</div>
      </div>
      <div class="iso-disclaimer">🔒 AI Toxicology DSS — Consult toxicologist/poison centre · ISO 15189:2022</div>
    </div>`;
  }

  /* ─── Worklist ──────────────────────────────────────────────── */
  function loadWorklist() {
    const tbody = document.getElementById('tox-worklist-tbody');
    if (!tbody) return;
    tbody.innerHTML = `
      <tr><td><div style="font-weight:600">NIYONZIMA Patrick</div><div style="font-size:10px;color:var(--text-muted)">RWA-2024-00521</div></td>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--blue-glow)">LAB-240515-010</span></td>
        <td>Paracetamol level</td><td><span class="badge badge-red">🚨 STAT</span></td>
        <td><span class="badge badge-yellow">Pending</span></td>
        <td style="text-align:right"><button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-pane=tox-poison-pane]').click()">☠️ Assess</button></td></tr>
      <tr><td><div style="font-weight:600">MUKAMANA Solange</div><div style="font-size:10px;color:var(--text-muted)">RWA-2024-00442</div></td>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--blue-glow)">LAB-240515-011</span></td>
        <td>Vancomycin trough</td><td><span class="badge badge-blue">Routine</span></td>
        <td><span class="badge badge-yellow">Pending</span></td>
        <td style="text-align:right"><button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-pane=tox-tdm-pane]').click()">🏥 TDM</button></td></tr>`;
  }

  /* ─── Analytics ─────────────────────────────────────────────── */
  function loadAnalytics() {
    const el1 = document.getElementById('tox-uds-chart');
    const el2 = document.getElementById('tox-tdm-chart');
    if (el1 && window.Chart && !el1._done) {
      el1._done = true;
      new Chart(el1, { type:'bar', data:{ labels:['THC','BZE','Opiates','Amph','Cocaine'], datasets:[{label:'Positive %',data:[12,8,6,4,2],backgroundColor:'rgba(168,85,247,.5)',borderRadius:4}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{color:'#8899aa',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,.04)'}},x:{ticks:{color:'#8899aa'},grid:{color:'rgba(255,255,255,.04)'}}}} });
    }
    if (el2 && window.Chart && !el2._done) {
      el2._done = true;
      new Chart(el2, { type:'bar', data:{ labels:['Vancomycin','Phenytoin','Valproate','Tacrolimus','Carbamazepine'], datasets:[{label:'Out-of-range %',data:[22,15,18,12,8],backgroundColor:'rgba(255,109,0,.5)',borderRadius:4}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{color:'#8899aa',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,.04)'}},x:{ticks:{color:'#8899aa'},grid:{color:'rgba(255,255,255,.04)'}}}} });
    }
  }

  /* ─── Init ──────────────────────────────────────────────────── */
  function init() { initTabs(); initUDS(); initTDM(); initPoisoning(); loadWorklist(); }
  document.addEventListener('DOMContentLoaded', init);
})();
