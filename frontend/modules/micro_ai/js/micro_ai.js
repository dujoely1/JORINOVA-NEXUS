/**
 * JORINOVA NEXUS ALIS-X — Microbiology AI Intelligence Module
 * ISO 15189 — Decision Support Only
 * Initialisation stub — main logic lives in micro_ai.html extra_scripts block.
 */
'use strict';

(function () {
  /* Expose a minimal public surface so external integrations can call init */
  window.MicroAIModule = {
    version: '1.0.0',
    iso:     'ISO 15189:2022',
    role:    'Decision Support System ONLY',

    /** Called automatically by MicroAI (defined in template extra_scripts) */
    init() {
      if (typeof window.MicroAI !== 'undefined' && typeof window.MicroAI.init === 'function') {
        window.MicroAI.init();
      }
    },
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.MicroAIModule.init();
  });
})();
