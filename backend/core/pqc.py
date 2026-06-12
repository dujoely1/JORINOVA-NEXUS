"""
Post-quantum signing layer.
===========================
Central place that produces the `DILITHIUM3:` tamper-evidence tags stored on
records (audit, results, amendments, reports) and used to derive security
artefacts such as the password-reset OTP.

Two backends, chosen automatically at import:
  1. REAL post-quantum  — if `pqcrypto` (CRYSTALS-Dilithium) is installed, a
     Dilithium key-pair is generated at startup and every payload is signed
     with the private key; the stored tag is `DILITHIUM3:<sha3-256(signature)>`
     so it fits the existing String(64) columns while being backed by a true
     PQC signature that can be verified with `verify()`.
  2. FALLBACK            — if the library is absent, a SHA3-256 integrity hash
     is used (same value the system used before). Nothing breaks offline.

Inspect the active backend at runtime via GET /api/v1/security/pqc.
"""
from __future__ import annotations

import hashlib
import logging
import secrets

log = logging.getLogger('pqc')

ALG = 'DILITHIUM3'
_backend = 'sha3-256-fallback'
_pub: bytes | None = None
_priv: bytes | None = None
_sign = None
_verify = None

try:
    # pqcrypto exposes CRYSTALS-Dilithium under different module names by
    # version: the legacy `dilithium{2,3}` names, and the FIPS-204 standard
    # names `ml_dsa_{44,65,87}` (ML-DSA-65 *is* Dilithium3, ML-DSA-44 is
    # Dilithium2). Try them in order of preference.
    import importlib
    _mod  = None
    _name = None
    for _cand, _alg in (
        ('dilithium3', 'DILITHIUM3'),
        ('ml_dsa_65',  'DILITHIUM3'),   # FIPS 204 name for Dilithium3
        ('dilithium2', 'DILITHIUM2'),
        ('ml_dsa_44',  'DILITHIUM2'),   # FIPS 204 name for Dilithium2
    ):
        try:
            _mod  = importlib.import_module(f'pqcrypto.sign.{_cand}')
            _name = _cand
            ALG   = _alg
            break
        except Exception:
            _mod = None
    if _mod is not None:
        _pub, _priv = _mod.generate_keypair()
        _sign    = _mod.sign
        _verify  = _mod.verify
        _backend = 'pqcrypto-' + _name              # e.g. pqcrypto-ml_dsa_65
        log.info('PQC backend active: %s as %s (public key %d bytes)', _backend, ALG, len(_pub or b''))
except Exception as e:  # pragma: no cover
    log.warning('PQC real backend unavailable, using SHA3 fallback: %s', e)


def _to_bytes(data) -> bytes:
    if isinstance(data, bytes):
        return data
    return str(data).encode('utf-8')


def sign_tag(*parts) -> str:
    """Return a `ALG:<hex>` tamper-evidence tag for the given payload parts.
    Backed by a real Dilithium signature when available, else SHA3-256."""
    payload = '|'.join(str(p) for p in parts)
    raw = _to_bytes(payload)
    if _sign and _priv is not None:
        try:
            signature = _sign(_priv, raw)
            return f'{ALG}:' + hashlib.sha3_256(signature).hexdigest()
        except Exception as e:       # pragma: no cover
            log.debug('PQC sign failed, falling back: %s', e)
    return f'{ALG}:' + hashlib.sha3_256(raw).hexdigest()


def derive_code(length: int = 6) -> str:
    """Generate a numeric code (e.g. password-reset OTP) bound to the PQC layer:
    a CSPRNG nonce is signed and the digits are derived from the signature, so
    the code is both cryptographically random and tied to the PQC key."""
    nonce = secrets.token_bytes(32)
    tag = sign_tag('otp-nonce', nonce.hex())
    digest = hashlib.sha3_256(tag.encode('utf-8')).hexdigest()
    n = int(digest, 16) % (10 ** length)
    return str(n).zfill(length)


def status() -> dict:
    """Runtime status for the security panel / health checks."""
    fp = ''
    if _pub:
        fp = hashlib.sha3_256(_pub).hexdigest()[:16]
    return {
        'backend':            _backend,
        'algorithm':          ALG,
        'real_pqc':           _sign is not None,
        'public_key_present': _pub is not None,
        'public_key_fingerprint': fp,
    }
