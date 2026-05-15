/**
 * JORINOVA NEXUS ALIS-X — AI Nexus (Command Centre)
 * AI training, model management, analytics intelligence, research pipelines
 */
'use strict';

(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function initTabs() {
    document.querySelectorAll('.ai-tab-nav .tab-btn, .tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.closest('.ai-tab-nav, .tab-nav');
        nav?.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(btn.dataset.pane)?.classList.add('active');
        if (btn.dataset.pane === 'ai-models-pane') loadModels();
        if (btn.dataset.pane === 'ai-analytics-pane') loadAnalytics();
      });
    });
  }

  function loadDashboard() {
    const kpis = [
      { id:'kpi-ai-models', val:'12', label:'AI Models Active',      color:'var(--blue-glow)' },
      { id:'kpi-ai-preds',  val:'1,247', label:'Predictions Today',  color:'var(--cyan)' },
      { id:'kpi-ai-acc',    val:'94.3%', label:'Model Accuracy (avg)',color:'var(--alert-green)' },
      { id:'kpi-ai-flags',  val:'23',  label:'AI Flags Reviewed',    color:'var(--alert-yellow)' },
    ];
    kpis.forEach(k => {
      const el = document.getElementById(k.id); if (el) { el.textContent = k.val; el.style.color = k.color; }
    });
  }

  function loadModels() {
    const grid = document.getElementById('ai-model-grid');
    if (!grid || grid.innerHTML !== '') return;
    const models = [
      { name:'CBC Anemia Classifier', type:'Classification', dept:'Hematology', accuracy:96.2, predictions:247, status:'Active', last_trained:'2026-04-10' },
      { name:'Malaria Blood Film AI', type:'Image Recognition', dept:'Parasitology', accuracy:94.8, predictions:89, status:'Active', last_trained:'2026-03-22' },
      { name:'Gram Stain Morphology', type:'Image Segmentation', dept:'Microbiology', accuracy:91.5, predictions:134, status:'Active', last_trained:'2026-04-01' },
      { name:'Sepsis Early Warning', type:'Regression', dept:'Clinical', accuracy:88.3, predictions:312, status:'Active', last_trained:'2026-04-15' },
      { name:'Drug Interaction Checker', type:'NLP / Rules', dept:'Pharmacy', accuracy:99.1, predictions:58, status:'Active', last_trained:'2026-05-01' },
      { name:'Histopathology AI (Breast)', type:'Image CNN', dept:'Pathology', accuracy:93.7, predictions:42, status:'Beta', last_trained:'2026-04-28' },
      { name:'TB Resistance Predictor', type:'Genomic ML', dept:'Molecular', accuracy:97.4, predictions:18, status:'Active', last_trained:'2026-03-15' },
      { name:'EQA Performance Predictor', type:'Time Series', dept:'Quality', accuracy:82.1, predictions:12, status:'Experimental', last_trained:'2026-02-20' },
    ];
    grid.innerHTML = models.map(m => `
      <div class="ai-model-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:var(--space-sm)">
          <div>
            <div style="font-family:var(--font-display);font-size:var(--text-sm);font-weight:700;color:var(--text-primary)">${esc(m.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(m.type)} · ${esc(m.dept)}</div>
          </div>
          <span class="badge ${m.status==='Active'?'badge-green':m.status==='Beta'?'badge-blue':'badge-yellow'}">${esc(m.status)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:var(--space-sm)">
          <div style="font-size:11px"><span style="color:var(--text-muted)">Accuracy:</span>
            <strong style="color:${m.accuracy>95?'var(--alert-green)':m.accuracy>90?'var(--alert-yellow)':'var(--alert-orange)'}">${m.accuracy}%</strong></div>
          <div style="font-size:11px"><span style="color:var(--text-muted)">Predictions:</span> <strong>${m.predictions.toLocaleString()}</strong></div>
        </div>
        <div style="background:var(--bg-glass);border-radius:var(--radius-full);height:4px;overflow:hidden;margin-bottom:6px">
          <div style="height:100%;border-radius:var(--radius-full);background:${m.accuracy>95?'var(--alert-green)':m.accuracy>90?'var(--blue-glow)':'var(--alert-yellow)'};width:${m.accuracy}%"></div>
        </div>
        <div style="font-size:10px;color:var(--text-muted)">Last trained: ${esc(m.last_trained)}</div>
      </div>`).join('');
  }

  function loadAnalytics() {
    const canvas = document.getElementById('ai-accuracy-chart');
    if (!canvas || canvas._done || !window.Chart) return;
    canvas._done = true;
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['CBC Anemia','Malaria Film','Gram Stain','Sepsis Warning','Drug Interact.','Histopath','TB Resistance'],
        datasets: [{ label: 'Model Accuracy %', data:[96.2,94.8,91.5,88.3,99.1,93.7,97.4], backgroundColor:'rgba(0,153,255,.5)', borderColor:'var(--blue-glow)', borderWidth:1.5, borderRadius:4 }],
      },
      options: {
        responsive:true, maintainAspectRatio:false, indexAxis:'y',
        plugins:{ legend:{display:false} },
        scales:{
          x:{ min:75, max:100, grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#8899aa',callback:v=>v+'%'} },
          y:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#aab',font:{size:10}} },
        },
      },
    });
  }

  function init() { initTabs(); loadDashboard(); }
  document.addEventListener('DOMContentLoaded', init);
})();
