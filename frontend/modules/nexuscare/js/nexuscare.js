/**
 * JORINOVA NEXUS ALIS-X — NexusCare (Nursing & Clinical Management)
 * Patient care, medication, vital signs, nursing notes, ward management
 */
'use strict';

(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const PATIENTS = [
    { id:'RWA-2024-00142', name:'KAMANZI Jean', age:34, gender:'M', ward:'Medical Ward A', bed:'A-12', admission:'2026-05-13', dx:'Severe Malaria + Anaemia', attending:'Dr. UWERA', vitals:{ bp:'110/70', hr:88, temp:38.2, spo2:97, rr:18 }, alerts:['Critical CBC pending','IV Artesunate Day 2'] },
    { id:'RWA-2024-00287', name:'UWIMANA Grace', age:28, gender:'F', ward:'Maternity', bed:'M-04', admission:'2026-05-14', dx:'Pre-eclampsia (G2P1)', attending:'Dr. HABIMANA', vitals:{ bp:'150/95', hr:92, temp:36.8, spo2:99, rr:16 }, alerts:['BP monitoring Q1hr','Magnesium sulphate infusion'] },
    { id:'RWA-2024-00388', name:'HABIMANA Eric', age:52, gender:'M', ward:'ICU', bed:'ICU-03', admission:'2026-05-12', dx:'Septic Shock — Gram-negative bacteraemia', attending:'Dr. NKURUNZIZA', vitals:{ bp:'85/50', hr:118, temp:39.4, spo2:94, rr:24 }, alerts:['🚨 CRITICAL — Vasopressors','BSL-2 enhanced precautions','Blood culture ×2 pending'] },
    { id:'RWA-2024-00501', name:'MUKAMANA Rose', age:42, gender:'F', ward:'Oncology', bed:'O-07', admission:'2026-05-10', dx:'Ca Cervix Stage IIB — Chemoradiation', attending:'Dr. UWIMANA', vitals:{ bp:'118/76', hr:74, temp:36.6, spo2:98, rr:14 }, alerts:['Cisplatin Day 5','CBC monitoring'] },
  ];

  function initTabs() {
    document.querySelectorAll('.care-tab-nav .tab-btn, .tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.closest('.care-tab-nav, .tab-nav');
        nav?.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(btn.dataset.pane)?.classList.add('active');
      });
    });
  }

  function loadWardBoard() {
    const grid = document.getElementById('ward-board');
    if (!grid || grid.innerHTML !== '') return;
    grid.innerHTML = PATIENTS.map(p => {
      const isCritical = p.ward === 'ICU';
      const tempAlert  = p.vitals.temp > 38;
      const bpAlert    = parseInt(p.vitals.bp) > 140;
      return `<div class="care-patient-card ${isCritical ? 'care-card-critical' : ''}" onclick="window.CareModule.openPatient('${p.id}')">
        <div class="care-card-header">
          <div>
            <div class="care-patient-name">${esc(p.name)}</div>
            <div class="care-patient-meta">${p.age}y ${p.gender} · ${esc(p.ward)} · Bed ${esc(p.bed)}</div>
          </div>
          <div class="care-ward-badge ${isCritical ? 'care-badge-critical' : ''}">${isCritical ? '🚨 ICU' : '🏥 ' + p.ward.split(' ')[0]}</div>
        </div>
        <div class="care-dx">${esc(p.dx)}</div>
        <div class="care-vitals-strip">
          <div class="care-vital ${bpAlert ? 'vital-alert' : ''}"><span>💉 BP</span><strong>${esc(p.vitals.bp)}</strong></div>
          <div class="care-vital ${p.vitals.hr > 100 ? 'vital-alert' : ''}"><span>💓 HR</span><strong>${p.vitals.hr}</strong></div>
          <div class="care-vital ${tempAlert ? 'vital-alert' : ''}"><span>🌡️ Temp</span><strong>${p.vitals.temp}°C</strong></div>
          <div class="care-vital ${p.vitals.spo2 < 95 ? 'vital-alert' : ''}"><span>🫁 SpO₂</span><strong>${p.vitals.spo2}%</strong></div>
        </div>
        ${p.alerts.length ? `<div class="care-alerts">${p.alerts.map(a => `<div class="care-alert-pill ${a.startsWith('🚨')?'alert-critical':''}">${esc(a)}</div>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  window.CareModule = {
    openPatient(pid) {
      const p = PATIENTS.find(x => x.id === pid);
      if (!p) return;
      window.NEXUS?.Toast?.show?.(`Opened: ${p.name}`, 'info');
    }
  };

  function init() { initTabs(); loadWardBoard(); }
  document.addEventListener('DOMContentLoaded', init);
})();
