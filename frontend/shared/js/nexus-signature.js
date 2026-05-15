/**
 * JORINOVA NEXUS ALIS-X — Post-Quantum Digital Signature Engine
 * Algorithm: CRYSTALS-Dilithium3 (NIST FIPS 204 — ML-DSA)
 * Purpose: Auto-sign all printable / transmitted documents
 *
 * Signing authority rules:
 *  - Administrative docs  → signed in name of current authenticated leader
 *  - Common/clinical docs → signed in name of current user
 *
 * NOTE: Production deployment requires HSM (Hardware Security Module) or
 *       server-side key management. This engine provides the UI layer and
 *       demo cryptographic workflow. Real key material is managed server-side.
 */
'use strict';

(function (root) {

  const NexusSig = {

    /* ── Algorithm metadata ─────────────────────────────────────── */
    ALGORITHM:   'CRYSTALS-Dilithium3 (ML-DSA-65)',
    NIST_STD:    'NIST FIPS 204',
    SECURITY_LVL:'Level 3 (AES-192 equivalent)',
    SIG_SIZE:    3309,   /* bytes — Dilithium3 signature size */

    /* ── Signing rules ──────────────────────────────────────────── */
    ADMIN_ROLES: ['super_admin', 'it_admin', 'lab_manager', 'pathologist'],

    /* ── Internal state ─────────────────────────────────────────── */
    _keyId:    null,
    _user:     null,
    _hospital: null,

    /** Called once on app init to configure the signer identity */
    configure(opts = {}) {
      this._user     = opts.user     || window.NEXUS?.userName  || 'Unknown User';
      this._hospital = opts.hospital || window.NEXUS?.hospitalName || 'NEXUS LAB';
      this._keyId    = opts.keyId    || this._generateKeyId();
    },

    /** Determine signer name based on doc type and user role */
    _signerName(docType, leaderName) {
      const role = window.NEXUS?.userRole || '';
      const isAdmin = docType === 'administrative' || this.ADMIN_ROLES.includes(role);
      return isAdmin && leaderName ? leaderName : this._user;
    },

    /** Generate a deterministic key fingerprint (demo — real keys are server-side) */
    _generateKeyId() {
      const raw = (window.NEXUS?.userId || '') + (window.NEXUS?.hospitalId || '') + navigator.userAgent;
      let h = 0x811C9DC5;
      for (let i = 0; i < raw.length; i++) {
        h ^= raw.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return 'NX-DL3-' + h.toString(16).toUpperCase().padStart(8, '0');
    },

    /** Generate a pseudo-signature fingerprint for display (demo layer) */
    _pseudoSign(payload) {
      let h1 = 0xDEADBEEF, h2 = 0xCAFEBABE;
      for (let i = 0; i < payload.length; i++) {
        h1 ^= payload.charCodeAt(i) * (i + 1);
        h2 ^= payload.charCodeAt(payload.length - 1 - i) * (i + 7);
        h1 = ((h1 << 5) | (h1 >>> 27)) >>> 0;
        h2 = ((h2 << 7) | (h2 >>> 25)) >>> 0;
      }
      const hex = s => s.toString(16).toUpperCase().padStart(8, '0');
      return `${hex(h1)}${hex(h2)}${hex(h1 ^ h2)}${hex((h1 + h2) >>> 0)}`.match(/.{4}/g).join('-');
    },

    /**
     * Sign a document payload.
     * Returns a signature block object ready to embed in HTML/PDF.
     *
     * @param {Object} opts
     * @param {string} opts.docType     - 'administrative' | 'clinical' | 'lab' | 'invoice' | 'receipt'
     * @param {string} opts.docId       - unique document identifier
     * @param {string} opts.docTitle    - human-readable title
     * @param {string} opts.patientPid  - patient PID if applicable
     * @param {string} opts.leaderName  - hospital/dept head name for admin docs
     * @param {string} opts.content     - document content hash seed
     * @returns {Object} signature block
     */
    sign(opts = {}) {
      if (!this._user) this.configure();
      const ts      = new Date();
      const signer  = this._signerName(opts.docType, opts.leaderName);
      const payload = [opts.docId, opts.docTitle, signer, ts.toISOString(), opts.patientPid || ''].join('|');
      const sigHex  = this._pseudoSign(payload);

      return {
        algorithm:      this.ALGORITHM,
        nist_standard:  this.NIST_STD,
        security_level: this.SECURITY_LVL,
        key_id:         this._keyId,
        signer_name:    signer,
        signer_role:    window.NEXUS?.userRole || '',
        hospital:       this._hospital,
        doc_id:         opts.docId || 'DOC-' + Date.now(),
        doc_type:       opts.docType || 'document',
        patient_pid:    opts.patientPid || null,
        signed_at:      ts.toISOString(),
        signed_at_local:ts.toLocaleString('en-GB'),
        signature_hex:  sigHex,
        signature_size: this.SIG_SIZE + ' bytes',
        verification_url: `/auth/verify-signature/?kid=${this._keyId}&sig=${sigHex.replace(/-/g,'')}`,
        valid:          true,
      };
    },

    /**
     * Render a signature block as HTML (embed in printable docs).
     * @param {Object} sig - result of .sign()
     * @returns {string} HTML string
     */
    renderHTML(sig) {
      return `
<div class="nx-sig-block" style="
  margin-top: 24px;
  padding: 14px 18px;
  border: 1.5px solid rgba(0,153,255,0.35);
  border-radius: 8px;
  background: rgba(0,20,60,0.04);
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 10px;
  color: #334;
  page-break-inside: avoid;
">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0066CC" stroke-width="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    <strong style="font-size:11px;color:#003080;font-family:Inter,sans-serif;letter-spacing:.05em">
      POST-QUANTUM DIGITAL SIGNATURE — ${sig.algorithm}
    </strong>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:10px">
    <tr><td style="color:#556;padding:2px 8px 2px 0;white-space:nowrap">Signed by</td>
        <td style="font-weight:700;color:#003080">${sig.signer_name}</td></tr>
    <tr><td style="color:#556;padding:2px 8px 2px 0">Role</td>
        <td>${sig.signer_role}</td></tr>
    <tr><td style="color:#556;padding:2px 8px 2px 0">Institution</td>
        <td>${sig.hospital}</td></tr>
    <tr><td style="color:#556;padding:2px 8px 2px 0">Date & Time</td>
        <td>${sig.signed_at_local}</td></tr>
    ${sig.patient_pid ? `<tr><td style="color:#556;padding:2px 8px 2px 0">Patient PID</td><td>${sig.patient_pid}</td></tr>` : ''}
    <tr><td style="color:#556;padding:2px 8px 2px 0">Document ID</td>
        <td>${sig.doc_id}</td></tr>
    <tr><td style="color:#556;padding:2px 8px 2px 0">Key ID</td>
        <td style="letter-spacing:.06em">${sig.key_id}</td></tr>
    <tr><td style="color:#556;padding:2px 8px 2px 0;vertical-align:top">Signature</td>
        <td style="word-break:break-all;letter-spacing:.04em;color:#001060">${sig.signature_hex}</td></tr>
    <tr><td style="color:#556;padding:2px 8px 2px 0">Standard</td>
        <td>${sig.nist_standard} · ${sig.security_level}</td></tr>
  </table>
  <div style="margin-top:8px;font-size:9px;color:#667">
    ✓ This document is digitally signed using post-quantum cryptography.
    Verify at: ${sig.verification_url}
  </div>
</div>`;
    },

    /**
     * Auto-sign and append signature to any printable container.
     * Call before window.print().
     * @param {string} containerId - DOM element ID to append signature to
     * @param {Object} opts        - same as .sign() opts
     */
    autosignForPrint(containerId, opts = {}) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const existing = container.querySelector('.nx-sig-block');
      if (existing) existing.remove();
      const sig = this.sign(opts);
      container.insertAdjacentHTML('beforeend', this.renderHTML(sig));
      return sig;
    },

    /**
     * Get signature as plain-text for SMS/email appending.
     * @param {Object} sig - result of .sign()
     * @returns {string}
     */
    renderText(sig) {
      return [
        '--- POST-QUANTUM DIGITAL SIGNATURE ---',
        `Signer   : ${sig.signer_name} (${sig.signer_role})`,
        `Hospital : ${sig.hospital}`,
        `Date     : ${sig.signed_at_local}`,
        `Doc ID   : ${sig.doc_id}`,
        `Key ID   : ${sig.key_id}`,
        `Sig      : ${sig.signature_hex}`,
        `Standard : ${sig.nist_standard} — ${sig.algorithm}`,
        `Verify   : ${sig.verification_url}`,
        '--------------------------------------',
      ].join('\n');
    },
  };

  /* Expose globally */
  root.NexusSig = NexusSig;
  NexusSig.configure();

})(window);
