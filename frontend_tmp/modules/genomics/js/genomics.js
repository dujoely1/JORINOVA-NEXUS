/**
 * JORINOVA NEXUS ALIS-X — MedGenome Intelligence
 * PCR · Sequencing · Genomic interpretation · Molecular epidemiology
 * ISO 15189 — Decision Support Only
 */
'use strict';

(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function initTabs() {
    document.querySelectorAll('.genome-tab-nav .tab-btn, .tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.closest('.tab-nav, .genome-tab-nav');
        nav?.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        const actions = { 'genome-pipeline-pane': loadPipeline, 'genome-seq-pane': loadSequencing, 'genome-epi-pane': loadEpidemiology };
        actions[btn.dataset.pane]?.();
      });
    });
  }

  function loadDashboard() {
    const kpis = [
      { id:'kpi-genome-pcr',  val:'24',  label:'PCR Tests Today',      color:'var(--blue-glow)' },
      { id:'kpi-genome-seq',  val:'3',   label:'Sequences in Progress', color:'var(--cyan)' },
      { id:'kpi-genome-mut',  val:'7',   label:'Mutations Flagged',     color:'var(--alert-orange)' },
      { id:'kpi-genome-epi',  val:'2',   label:'Cluster Alerts',        color:'var(--alert-red)' },
    ];
    kpis.forEach(k => {
      const el = document.getElementById(k.id); if (el) { el.textContent = k.val; el.style.color = k.color; }
    });

    const tbody = document.getElementById('genome-pcr-tbody');
    if (tbody && tbody.innerHTML === '') {
      const pcr = [
        { id:'PCR-0521', patient:'KAMANZI Jean', test:'GeneXpert MTB/RIF', ct:'—',  result:'MTB Detected — RIF Susceptible', flag:'POSITIVE', color:'var(--alert-orange)' },
        { id:'PCR-0522', patient:'UWIMANA Grace', test:'SARS-CoV-2 RT-PCR', ct:'28.4', result:'SARS-CoV-2 Detected', flag:'POSITIVE', color:'var(--alert-red)' },
        { id:'PCR-0523', patient:'HABIMANA Eric', test:'HIV-1 Viral Load', ct:'—', result:'< 50 copies/mL (Undetectable)', flag:'NEGATIVE', color:'var(--alert-green)' },
        { id:'PCR-0524', patient:'MUKAMANA Rose', test:'HPV High-Risk PCR', ct:'—', result:'HPV 16 Detected', flag:'POSITIVE', color:'var(--alert-red)' },
        { id:'PCR-0525', patient:'NIYOMUGABO Paul', test:'Flu A/B + RSV', ct:'32.1', result:'Influenza A Detected', flag:'POSITIVE', color:'var(--alert-orange)' },
      ];
      tbody.innerHTML = pcr.map(p => `<tr>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${esc(p.id)}</span></td>
        <td>${esc(p.patient)}</td>
        <td style="font-size:var(--text-xs)">${esc(p.test)}</td>
        <td style="font-family:var(--font-mono);text-align:center">${esc(p.ct)}</td>
        <td style="font-size:11px;color:${p.color};font-weight:600">${esc(p.result)}</td>
        <td><span class="badge ${p.flag==='POSITIVE'?'badge-red':'badge-green'}">${esc(p.flag)}</span></td>
        <td style="text-align:right"><button class="btn btn-ghost btn-sm">📋 Report</button></td>
      </tr>`).join('');
    }
  }

  function loadPipeline() {
    const el = document.getElementById('genome-pipeline-status');
    if (!el || el.innerHTML !== '') return;
    const steps = [
      { name:'Sample QC', status:'done', detail:'Quality check passed — RIN > 8.0' },
      { name:'Extraction', status:'done', detail:'DNA/RNA extracted — 450 ng/µL' },
      { name:'Library Prep', status:'done', detail:'Nextera XT library prepared' },
      { name:'Sequencing', status:'active', detail:'Illumina MiSeq running — Cycle 142/300' },
      { name:'Base Calling', status:'pending', detail:'Waiting for sequencing completion' },
      { name:'Alignment', status:'pending', detail:'Queued — reference genome hg38' },
      { name:'Variant Calling', status:'pending', detail:'GATK HaplotypeCaller' },
      { name:'Annotation', status:'pending', detail:'VEP + ClinVar + dbSNP' },
      { name:'Report Generation', status:'pending', detail:'Clinical interpretation pending' },
    ];
    el.innerHTML = steps.map((s,i) => `
      <div style="display:flex;align-items:center;gap:16px;padding:10px var(--space-lg);border-bottom:1px solid var(--border-dim)">
        <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;
          background:${s.status==='done'?'rgba(0,230,118,.15)':s.status==='active'?'rgba(0,153,255,.15)':'var(--bg-glass)'};
          border:1.5px solid ${s.status==='done'?'var(--alert-green)':s.status==='active'?'var(--blue-glow)':'var(--border-dim)'};
          color:${s.status==='done'?'var(--alert-green)':s.status==='active'?'var(--blue-glow)':'var(--text-muted)'};
          ${s.status==='active'?'animation:pulse-step 1.2s infinite':''}">
          ${s.status==='done'?'✓':s.status==='active'?'⟳':i+1}
        </div>
        <div style="flex:1">
          <div style="font-size:var(--text-sm);font-weight:600;color:${s.status==='pending'?'var(--text-muted)':'var(--text-primary)'}">${esc(s.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(s.detail)}</div>
        </div>
        <span class="badge ${s.status==='done'?'badge-green':s.status==='active'?'badge-blue':'badge-blue'}" style="${s.status==='pending'?'opacity:.4':''}">
          ${s.status==='done'?'✅ Done':s.status==='active'?'🔄 Running':'⏳ Queued'}
        </span>
      </div>`).join('');
  }

  function loadSequencing() {
    const el = document.getElementById('genome-seq-list');
    if (!el || el.innerHTML !== '') return;
    const seqs = [
      { id:'SEQ-2024-001', type:'WGS', organism:'M. tuberculosis', status:'Complete', coverage:'98×', variants:12, lineage:'L4.2 (Euro-American)', clinical_sig:'MDR-TB pattern detected' },
      { id:'SEQ-2024-002', type:'Amplicon', organism:'SARS-CoV-2', status:'Running', coverage:'620×', variants:3, lineage:'JN.1 (Omicron)', clinical_sig:'Known variant — no novel mutations' },
      { id:'SEQ-2024-003', type:'Metagenomics', organism:'Unknown pathogen', status:'Queued', coverage:'—', variants:null, lineage:'—', clinical_sig:'Sepsis workup — direct metagenomic' },
    ];
    el.innerHTML = seqs.map(s => `
      <div style="background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-lg);padding:var(--space-lg);margin-bottom:var(--space-md)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm)">
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--cyan)">${esc(s.id)}</span>
          <span class="badge ${s.status==='Complete'?'badge-green':s.status==='Running'?'badge-blue':'badge-yellow'}">${esc(s.status)}</span>
        </div>
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary)">${esc(s.type)} — <em>${esc(s.organism)}</em></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);margin-top:var(--space-sm)">
          <div style="font-size:11px"><span style="color:var(--text-muted)">Coverage:</span> <strong>${esc(s.coverage)}</strong></div>
          <div style="font-size:11px"><span style="color:var(--text-muted)">Variants:</span> <strong>${s.variants ?? '—'}</strong></div>
          <div style="font-size:11px"><span style="color:var(--text-muted)">Lineage:</span> <strong style="color:var(--cyan)">${esc(s.lineage)}</strong></div>
        </div>
        ${s.clinical_sig ? `<div style="margin-top:var(--space-sm);padding:6px 10px;background:rgba(0,153,255,.06);border-radius:var(--radius-sm);font-size:11px;color:var(--text-secondary)">🧬 ${esc(s.clinical_sig)}</div>` : ''}
      </div>`).join('');
  }

  function loadEpidemiology() {
    const el = document.getElementById('genome-epi-content');
    if (!el || el.innerHTML !== '') return;
    el.innerHTML = `
      <div style="padding:var(--space-lg)">
        <div style="background:rgba(255,109,0,.08);border:1px solid rgba(255,109,0,.25);border-radius:var(--radius-md);padding:var(--space-md);margin-bottom:var(--space-md)">
          <div style="font-weight:700;color:var(--alert-orange)">⚠️ CLUSTER ALERT — M. tuberculosis L4.2</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:6px">7 isolates with >99.8% genome similarity detected across Kigali hospitals. Possible nosocomial transmission chain. Notify infection control and public health authority.</div>
        </div>
        <div style="background:rgba(0,153,255,.06);border:1px solid rgba(0,153,255,.15);border-radius:var(--radius-md);padding:var(--space-md)">
          <div style="font-weight:700;color:var(--blue-glow)">🧬 SARS-CoV-2 Variant Surveillance</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:6px">100% JN.1 (Omicron subvariant) in current sequenced cases. No novel variants of concern detected. Continue routine monitoring.</div>
        </div>
      </div>`;
  }

  function init() { initTabs(); loadDashboard(); }
  document.addEventListener('DOMContentLoaded', init);
})();
