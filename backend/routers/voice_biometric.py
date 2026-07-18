"""
Voice Biometric Router — Enrollment, Verification, Management
=============================================================
Endpoints:
  POST /voice-bio/check-access       — Check if user's role allows voice
  POST /voice-bio/enroll/start       — Start enrollment session
  POST /voice-bio/enroll/sample      — Upload one voice sample
  POST /voice-bio/enroll/confirm     — Finalise enrollment (admin approves)
  POST /voice-bio/verify             — Verify speaker before voice command
  GET  /voice-bio/status             — My enrollment status
  GET  /voice-bio/admin/enrollments  — All enrollments (admin)
  POST /voice-bio/admin/approve/{id} — Admin approve enrollment
  DELETE /voice-bio/admin/revoke/{uid} — Revoke voice access
  GET  /voice-bio/logs               — My verification logs
"""
from __future__ import annotations
import json
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from core.database import get_db
from core.security import get_current_user, create_access_token
from models.user import User
from models.voice_biometric import (
    VoiceEnrollment, VoiceVerificationLog, VoiceTrainingSession,
    VOICE_ALLOWED_ROLES, VOICE_BLOCKED_ROLES,
)
from ai_services.voice_biometric import (
    extract_embedding, verify_speaker, check_voice_access,
    compute_enrollment_quality, average_embeddings, get_enrollment_phrases,
    method_from_dim, recommended_threshold, cosine_similarity,
)

import numpy as np

router = APIRouter(prefix='/voice-bio', tags=['Voice Biometrics'])
logger = logging.getLogger('voice_bio_router')

ADMIN_ROLES = {'super_admin', 'it_admin', 'lab_manager'}
MIN_SAMPLES  = 3   # minimum voice samples for enrollment
LOCKOUT_SECS = 600 # 10-minute lockout after 5 failed verifications


# ── Role access check ──────────────────────────────────────────────────────────

@router.get('/check-access')
def check_access(user: User = Depends(get_current_user)) -> dict:
    """
    Check if the current user's role allows voice biometric access.
    Interns, visitors, and observers are blocked.
    """
    result = check_voice_access(user.role)
    enrollment = None
    try:
        from core.database import SessionLocal
        db = SessionLocal()
        enr = db.query(VoiceEnrollment).filter(VoiceEnrollment.user_id == user.id).first()
        if enr:
            enrollment = {
                'enrolled':   enr.is_active,
                'samples':    enr.samples_count,
                'quality':    enr.enrollment_quality,
                'method':     enr.embedding_method,
                'enrolled_at':enr.enrolled_at.isoformat() if enr.enrolled_at else None,
            }
        db.close()
    except Exception:
        pass
    return {
        **result,
        'role':       user.role,
        'username':   user.username,
        'enrollment': enrollment,
    }


# ── My enrollment status ───────────────────────────────────────────────────────

@router.get('/status')
def my_status(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> dict:
    """Get my current voice enrollment status."""
    access = check_voice_access(user.role)
    if not access['allowed']:
        return {'allowed': False, 'message': access['message'], 'enrollment': None}

    enr = db.query(VoiceEnrollment).filter(VoiceEnrollment.user_id == user.id).first()
    if not enr:
        return {
            'allowed':    True,
            'enrolled':   False,
            'active':     False,
            'message':    'Not enrolled. Complete voice training to enable voice commands.',
            'enrollment': None,
        }

    recent_logs = (db.query(VoiceVerificationLog)
                   .filter(VoiceVerificationLog.user_id == user.id)
                   .order_by(desc(VoiceVerificationLog.created_at))
                   .limit(5).all())

    return {
        'allowed':    True,
        'enrolled':   True,
        'active':     enr.is_active,
        'enrollment': {
            'id':                enr.id,
            'samples':           enr.samples_count,
            'quality':           enr.enrollment_quality,
            'method':            enr.embedding_method,
            'threshold':         enr.verification_threshold,
            'enrolled_at':       enr.enrolled_at.isoformat() if enr.enrolled_at else None,
            'approved':          enr.approved_by_id is not None,
            'failed_attempts':   enr.failed_attempts,
            'is_locked':         bool(enr.locked_until and enr.locked_until > datetime.now(timezone.utc)),
            'locked_until':      enr.locked_until.isoformat() if enr.locked_until else None,
            'total_verifications':   enr.total_verifications,
            'successful_verifications': enr.successful_verifications,
        },
        'recent_logs': [
            {
                'passed':     l.passed,
                'similarity': l.similarity_score,
                'timestamp':  l.created_at.isoformat() if l.created_at else None,
            }
            for l in recent_logs
        ],
    }


# ── Enrollment ─────────────────────────────────────────────────────────────────

@router.post('/enroll/start')
def start_enrollment(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> dict:
    """
    Start a voice enrollment session.
    Returns a session token and the phrases to read aloud.
    """
    access = check_voice_access(user.role)
    if not access['allowed']:
        raise HTTPException(403, access['message'])

    # Check for existing enrollment
    existing = db.query(VoiceEnrollment).filter(VoiceEnrollment.user_id == user.id).first()
    if existing and existing.is_active:
        raise HTTPException(400, 'You already have an active voice enrollment. '
                            'Contact your lab manager to re-enroll.')

    # Generate session
    token = secrets.token_urlsafe(32)
    phrases = get_enrollment_phrases(MIN_SAMPLES + 2)  # extra for quality
    expires = datetime.now(timezone.utc) + timedelta(hours=1)

    session = VoiceTrainingSession(
        user_id        = user.id,
        session_token  = token,
        phrases        = json.dumps(phrases),
        samples_needed = MIN_SAMPLES,
        samples_done   = 0,
        status         = 'IN_PROGRESS',
        expires_at     = expires,
    )
    db.add(session)
    db.commit()

    logger.info('Voice enrollment started: user=%s token=%s...', user.username, token[:8])
    return {
        'session_token':  token,
        'phrases':        phrases,
        'samples_needed': MIN_SAMPLES,
        'expires_at':     expires.isoformat(),
        'message':        (
            f'Read each phrase aloud clearly. '
            f'{MIN_SAMPLES} samples required for enrollment. '
            'Speak in your normal working voice — not louder or softer than usual.'
        ),
    }


@router.post('/enroll/sample')
async def add_sample(
    session_token: str       = Form(...),
    phrase_index:  int       = Form(...),
    audio:         UploadFile = File(..., description='WAV/WebM audio of the spoken phrase'),
    db:            Session    = Depends(get_db),
    user:          User       = Depends(get_current_user),
) -> dict:
    """Upload one voice sample for enrollment (one per phrase)."""
    access = check_voice_access(user.role)
    if not access['allowed']:
        raise HTTPException(403, access['message'])

    # Validate session
    session = (db.query(VoiceTrainingSession)
               .filter(VoiceTrainingSession.session_token == session_token,
                       VoiceTrainingSession.user_id == user.id,
                       VoiceTrainingSession.status == 'IN_PROGRESS')
               .first())
    if not session:
        raise HTTPException(404, 'Invalid or expired enrollment session. Please start over.')
    if session.expires_at and session.expires_at < datetime.now(timezone.utc):
        session.status = 'EXPIRED'
        db.commit()
        raise HTTPException(410, 'Enrollment session expired. Please start a new enrollment.')

    # Validate file
    if not audio.content_type or not any(t in audio.content_type
                                          for t in ['audio', 'video/webm', 'application/octet-stream']):
        raise HTTPException(400, f'Expected audio file, got: {audio.content_type}')

    audio_bytes = await audio.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(400, 'Audio file too small. Please record for at least 2 seconds.')

    # Extract embedding
    try:
        embedding, method = extract_embedding(audio_bytes)
    except ValueError as e:
        raise HTTPException(422, f'Audio processing failed: {e}')
    except Exception as e:
        logger.error('Embedding extraction error: %s', e)
        raise HTTPException(500, 'Voice feature extraction failed. Try again.')

    # Store embedding in session
    current = json.loads(session.collected_embeddings or '[]')
    current.append(embedding.tolist())
    session.collected_embeddings = json.dumps(current)
    session.samples_done = len(current)
    db.commit()

    samples_remaining = max(0, session.samples_needed - session.samples_done)
    is_complete = session.samples_done >= session.samples_needed

    logger.info('Voice sample %d/%d added: user=%s method=%s',
                session.samples_done, session.samples_needed, user.username, method)

    return {
        'sample_number':    session.samples_done,
        'samples_needed':   session.samples_needed,
        'samples_remaining':samples_remaining,
        'complete':         is_complete,
        'method':           method,
        'message':          (
            f'Sample {session.samples_done}/{session.samples_needed} recorded. '
            + ('Ready to confirm enrollment!' if is_complete else
               f'{samples_remaining} more sample(s) needed.')
        ),
    }


@router.post('/enroll/confirm')
def confirm_enrollment(
    session_token: str = Form(...),
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> dict:
    """
    Finalise enrollment — computes the voiceprint and submits for admin approval.
    """
    access = check_voice_access(user.role)
    if not access['allowed']:
        raise HTTPException(403, access['message'])

    session = (db.query(VoiceTrainingSession)
               .filter(VoiceTrainingSession.session_token == session_token,
                       VoiceTrainingSession.user_id == user.id,
                       VoiceTrainingSession.status == 'IN_PROGRESS')
               .first())
    if not session:
        raise HTTPException(404, 'Invalid enrollment session.')
    if session.samples_done < session.samples_needed:
        raise HTTPException(400, f'Not enough samples. Need {session.samples_needed}, '
                            f'have {session.samples_done}.')

    # Load all embeddings
    raw = json.loads(session.collected_embeddings or '[]')
    embeddings = [np.array(e, dtype=np.float32) for e in raw]

    # Compute quality score
    quality = compute_enrollment_quality(embeddings)
    if quality < 0.50:
        raise HTTPException(422,
            f'Voice recording quality too low ({quality:.1%}). '
            'Your samples sound inconsistent. Please re-record in a quiet environment.')

    # Average all samples into one representative voiceprint
    # Store all individual embeddings too (for richer comparison)
    avg_emb = average_embeddings(embeddings)

    # Derive the method + verification threshold from the embedding actually
    # produced (the server runs numpy MFCC unless resemblyzer/librosa are
    # installed). Each method has its own cosine scale, so the bar is method-
    # specific — not a fixed 0.75 that only suited resemblyzer.
    method    = method_from_dim(len(embeddings[0])) if embeddings else 'mfcc_numpy'
    threshold = recommended_threshold(method)

    # Create or update enrollment
    existing = db.query(VoiceEnrollment).filter(VoiceEnrollment.user_id == user.id).first()
    if existing:
        existing.embedding              = json.dumps([e.tolist() for e in embeddings])
        existing.embedding_method       = method
        existing.verification_threshold = threshold
        existing.samples_count          = len(embeddings)
        existing.enrollment_quality     = quality
        existing.enrolled_at            = datetime.now(timezone.utc)
        existing.is_active              = False   # needs admin approval
        existing.approved_by_id         = None
        existing.failed_attempts        = 0
        existing.locked_until           = None
        existing.enrollment_phrases     = session.phrases
        enr = existing
    else:
        enr = VoiceEnrollment(
            user_id                = user.id,
            embedding              = json.dumps([e.tolist() for e in embeddings]),
            embedding_method       = method,
            verification_threshold = threshold,
            samples_count          = len(embeddings),
            enrollment_quality     = quality,
            enrolled_at            = datetime.now(timezone.utc),
            is_active              = False,  # needs approval
            enrollment_phrases     = session.phrases,
        )
        db.add(enr)

    # Mark session complete
    session.status = 'COMPLETE'
    db.commit()
    db.refresh(enr)

    logger.info('Voice enrollment submitted: user=%s quality=%.2f samples=%d',
                user.username, quality, len(embeddings))

    # Notify admins
    _notify_admins_enrollment(user.username, enr.id, quality)

    return {
        'enrollment_id': enr.id,
        'quality':       quality,
        'samples':       len(embeddings),
        'method':        method,
        'threshold':     threshold,
        'status':        'PENDING_APPROVAL',
        'message':       (
            f'Voice enrollment submitted! Quality: {quality:.1%}. '
            'Your lab manager must approve before voice commands are enabled. '
            'You will be notified when approved.'
        ),
    }


# Voice-enrollment notifications, localized to the recipient's language.
_VOICE_NOTIF = {
    'pending.title':  {'en': 'Voice enrollment pending: {u}',
                       'fr': 'Enrôlement vocal en attente : {u}',
                       'rw': 'Kwiyandikisha kw’ijwi gutegereje: {u}'},
    'pending.body':   {'en': '{u} has submitted a voice enrollment (quality: {q}). Review and approve at Admin Dashboard → Voice Management.',
                       'fr': '{u} a soumis un enrôlement vocal (qualité : {q}). Vérifiez et approuvez dans Admin → Gestion vocale.',
                       'rw': '{u} yatanze kwiyandikisha kw’ijwi (ubwiza: {q}). Genzura wemeze kuri Admin → Voice Management.'},
    'approved.title': {'en': '✅ Voice enrollment approved!',
                       'fr': '✅ Enrôlement vocal approuvé !',
                       'rw': '✅ Kwiyandikisha kw’ijwi kwemejwe!'},
    'approved.body':  {'en': 'Your voice registration has been approved by {by}. You can now use voice commands in JORINOVA NEXUS ALIS-X.',
                       'fr': 'Votre enrôlement vocal a été approuvé par {by}. Vous pouvez désormais utiliser les commandes vocales dans JORINOVA NEXUS ALIS-X.',
                       'rw': 'Kwiyandikisha kw’ijwi ryawe kwemejwe na {by}. Ubu ushobora gukoresha amabwiriza y’ijwi muri JORINOVA NEXUS ALIS-X.'},
}


def _vt(key: str, lang: str, **kw) -> str:
    e = _VOICE_NOTIF.get(key, {})
    s = e.get(lang if lang in ('en', 'fr', 'rw') else 'en') or e.get('en') or key
    return s.format(**kw) if kw else s


def _notify_admins_enrollment(username: str, enrollment_id: int, quality: float):
    """Send in-app notification to admins about pending voice enrollment."""
    try:
        from core.database import SessionLocal
        from models.notifications import Notification
        db = SessionLocal()
        admins = db.query(User).filter(User.role.in_(ADMIN_ROLES), User.is_active==True).all()
        for admin in admins:
            lg = getattr(admin, 'preferred_language', 'en') or 'en'
            n = Notification(
                recipient_id=admin.id, sender_id=None,
                notif_type='VOICE_ENROLLMENT',
                title=_vt('pending.title', lg, u=username),
                body=_vt('pending.body', lg, u=username, q=f'{quality:.1%}'),
                priority='NORMAL',
                action_url=f'/admin/?tab=voice&enrollment_id={enrollment_id}',
            )
            db.add(n)
        db.commit()
        db.close()
    except Exception as e:
        logger.warning('Could not notify admins of enrollment: %s', e)


# ── Verification (called before every voice command) ──────────────────────────

@router.post('/verify')
async def verify_voice(
    audio:          UploadFile = File(...),
    command_hint:   str        = Form('', description='Transcribed voice command'),
    db:             Session    = Depends(get_db),
    user:           User       = Depends(get_current_user),
) -> dict:
    """
    Verify the current user's voice before executing a voice command.
    Called automatically by voice-command.js before any sensitive action.
    """
    # 1. Role check — fast, no audio processing needed
    access = check_voice_access(user.role)
    if not access['allowed']:
        _log_attempt(db, user.id, None, 0.0, False, access['reason'],
                     command_hint, '0.0.0.0')
        raise HTTPException(403, access['message'])

    # 2. Enrollment check
    enr = db.query(VoiceEnrollment).filter(VoiceEnrollment.user_id == user.id).first()
    if not enr:
        raise HTTPException(403,
            'Voice commands require enrollment. '
            'Go to Security → Voice Training to register your voice. '
            'Until enrolled, use keyboard and mouse to operate the system.')

    if not enr.is_active:
        raise HTTPException(403,
            'Your voice enrollment is pending admin approval. '
            'Ask your lab manager to approve it before using voice commands.')

    # 3. Lockout check
    if enr.locked_until and enr.locked_until > datetime.now(timezone.utc):
        remaining = int((enr.locked_until - datetime.now(timezone.utc)).total_seconds() / 60)
        raise HTTPException(429,
            f'Voice access locked due to too many failed attempts. '
            f'Try again in {remaining} minutes.')

    # 4. Process audio and verify
    audio_bytes = await audio.read()
    result = verify_speaker(
        audio_bytes             = audio_bytes,
        stored_embedding_json   = enr.embedding,
        threshold               = enr.verification_threshold,
    )

    # 5. Update enrollment stats
    enr.total_verifications += 1
    if result['passed']:
        enr.successful_verifications += 1
        enr.failed_attempts = 0
        enr.locked_until    = None
        enr.last_verified_at = datetime.now(timezone.utc)
    else:
        enr.failed_attempts += 1
        if enr.failed_attempts >= 5:
            enr.locked_until = datetime.now(timezone.utc) + timedelta(seconds=LOCKOUT_SECS)
            result['message'] += (
                f' Account locked for {LOCKOUT_SECS//60} minutes '
                'due to repeated verification failures.'
            )

    # 6. Write audit log (record the enrollment's own threshold, not a constant)
    _log_attempt(db, user.id, enr.id, result['similarity'], result['passed'],
                 result.get('failure_reason'), command_hint, '0.0.0.0',
                 result['duration_s'], threshold=result.get('threshold', enr.verification_threshold))

    db.commit()

    if not result['passed']:
        logger.warning('Voice DENIED: user=%s sim=%.3f attempts=%d',
                       user.username, result['similarity'], enr.failed_attempts)
        raise HTTPException(401, result['message'])

    logger.info('Voice VERIFIED: user=%s sim=%.3f', user.username, result['similarity'])
    return {
        'verified':   True,
        'similarity': result['similarity'],
        'method':     result['method'],
        'message':    result['message'],
        'user_id':    user.id,
        'username':   user.username,
        'role':       user.role,
    }


def _log_attempt(db, user_id, enrollment_id, similarity, passed,
                 failure_reason, command, ip, duration=0.0, threshold=0.75):
    try:
        log = VoiceVerificationLog(
            user_id=user_id, enrollment_id=enrollment_id,
            similarity_score=similarity, threshold=threshold,
            passed=passed, failure_reason=failure_reason,
            command_attempted=command[:200] if command else None,
            ip_address=ip, audio_duration_s=duration,
        )
        db.add(log)
        db.flush()
    except Exception as e:
        logger.warning('Could not write verification log: %s', e)


# ── Voice login (1:N) — speak to sign in as yourself ──────────────────────────

_VOICEPRINTS_CACHE = None


def _load_voiceprints() -> dict:
    """Load backend/models/voice/voiceprints.json (resemblyzer centroids exported
    by the Colab training notebook). Cached; {} if absent."""
    global _VOICEPRINTS_CACHE
    if _VOICEPRINTS_CACHE is None:
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / 'models' / 'voice' / 'voiceprints.json'
        try:
            _VOICEPRINTS_CACHE = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
        except Exception:
            _VOICEPRINTS_CACHE = {}
    return _VOICEPRINTS_CACHE


@router.post('/login')
async def voice_login(audio: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    """
    Voice sign-in (1:N): match a spoken sample to an enrolled staff member and
    return THAT user's own token + role — no username/password typed. Compares
    against the accurate resemblyzer voiceprints (voiceprints.json) when present
    AND every active DB enrolment whose embedding dimension matches. Unauthenticated
    by design (this IS the sign-in); every attempt is logged to the app log.
    """
    audio_bytes = await audio.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(400, 'Audio too short — record about 3-4 seconds.')
    try:
        emb, method = extract_embedding(audio_bytes)
    except Exception as e:
        raise HTTPException(422, f'Could not read the audio: {e}')
    dim = int(len(emb))

    best_score, best_user, best_thr = -1.0, None, 0.80

    # 1) resemblyzer voiceprints.json (accurate) — only when its dim matches ours
    vp = _load_voiceprints()
    if vp and int(vp.get('dim', 0)) == dim:
        thr = float(vp.get('threshold', 0.75))
        for uname, vec in (vp.get('voiceprints') or {}).items():
            s = cosine_similarity(emb, np.array(vec, dtype=np.float32))
            if s > best_score:
                u = db.query(User).filter(func.lower(User.username) == uname.lower(), User.is_active == True).first()
                if u:
                    best_score, best_user, best_thr = s, u, thr

    # 2) DB enrolments (active) whose stored embedding dimension matches ours
    for enr in db.query(VoiceEnrollment).filter(VoiceEnrollment.is_active == True).all():
        try:
            stored = json.loads(enr.embedding or '[]')
        except Exception:
            continue
        vecs = stored if (stored and isinstance(stored[0], list)) else [stored]
        vecs = [np.array(v, dtype=np.float32) for v in vecs if len(v) == dim]
        if not vecs:
            continue
        s = max(cosine_similarity(emb, v) for v in vecs)
        if s > best_score:
            u = db.query(User).filter(User.id == enr.user_id, User.is_active == True).first()
            if u:
                best_score = s
                best_user  = u
                best_thr   = enr.verification_threshold or recommended_threshold(method)

    if best_user is None or best_score < best_thr:
        sim = round(max(best_score, 0.0), 3)
        logger.warning('Voice LOGIN denied: best=%s sim=%.3f', best_user.username if best_user else '—', sim)
        raise HTTPException(401, f'Voice not recognised (best match {sim:.0%}). '
                            'Sign in with username + password instead.')

    token = create_access_token({'sub': str(best_user.id), 'role': best_user.role})
    logger.info('Voice LOGIN: user=%s sim=%.3f method=%s', best_user.username, best_score, method)
    return {
        'access_token': token, 'token_type': 'bearer',
        'user_id': best_user.id, 'username': best_user.username,
        'full_name': best_user.full_name, 'role': best_user.role,
        'similarity': round(best_score, 3), 'method': method, 'via': 'voice',
    }


# ── Admin endpoints ─────────────────────────────────────────────────────────

@router.get('/admin/enrollments')
def list_enrollments(
    status: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> list:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Admin access required')

    q = db.query(VoiceEnrollment)
    if status == 'pending':  q = q.filter(VoiceEnrollment.is_active == False)
    elif status == 'active': q = q.filter(VoiceEnrollment.is_active == True)

    enrollments = q.order_by(desc(VoiceEnrollment.created_at)).offset(skip).limit(limit).all()
    return [_serialize_enrollment(e) for e in enrollments]


@router.post('/admin/approve/{enrollment_id}')
def approve_enrollment(
    enrollment_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> dict:
    """Admin approves a pending voice enrollment."""
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Only lab managers can approve voice enrollments')

    enr = db.query(VoiceEnrollment).filter(VoiceEnrollment.id == enrollment_id).first()
    if not enr:
        raise HTTPException(404, 'Enrollment not found')

    enr.is_active      = True
    enr.approved_by_id = user.id
    enr.approved_at    = datetime.now(timezone.utc)
    db.commit()

    # Notify enrolled user — in their own language.
    try:
        from models.notifications import Notification
        target = db.query(User).filter(User.id == enr.user_id).first()
        lg = getattr(target, 'preferred_language', 'en') or 'en'
        n = Notification(
            recipient_id=enr.user_id, sender_id=user.id,
            notif_type='VOICE_ENROLLMENT',
            title=_vt('approved.title', lg),
            body=_vt('approved.body', lg, by=user.full_name),
            priority='NORMAL',
        )
        db.add(n); db.commit()
    except Exception:
        pass

    logger.info('Voice enrollment APPROVED: id=%d approved_by=%s', enrollment_id, user.username)
    return {'status': 'approved', 'enrollment_id': enrollment_id,
            'message': f'Voice enrollment approved for user {enr.user_id}'}


@router.post('/admin/reject/{enrollment_id}')
def reject_enrollment(
    enrollment_id: int,
    reason: str = Form('Rejected by administrator'),
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> dict:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Admin access required')
    enr = db.query(VoiceEnrollment).filter(VoiceEnrollment.id == enrollment_id).first()
    if not enr: raise HTTPException(404, 'Enrollment not found')
    db.delete(enr); db.commit()
    logger.info('Voice enrollment REJECTED: id=%d by=%s', enrollment_id, user.username)
    return {'status': 'rejected', 'message': reason}


@router.delete('/admin/revoke/{user_id}')
def revoke_voice_access(
    user_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> dict:
    """Revoke a staff member's voice access (e.g., they leave the lab)."""
    if user.role not in ADMIN_ROLES:
        raise HTTPException(403, 'Admin access required')
    enr = db.query(VoiceEnrollment).filter(VoiceEnrollment.user_id == user_id).first()
    if not enr: raise HTTPException(404, 'No enrollment found for this user')
    enr.is_active = False
    enr.embedding = None   # Destroy voiceprint
    db.commit()
    logger.warning('Voice access REVOKED: user_id=%d revoked_by=%s', user_id, user.username)
    return {'status': 'revoked', 'message': 'Voice access revoked and voiceprint deleted'}


@router.get('/logs')
def my_verification_logs(
    skip: int = 0, limit: int = 50,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
) -> list:
    logs = (db.query(VoiceVerificationLog)
            .filter(VoiceVerificationLog.user_id == user.id)
            .order_by(desc(VoiceVerificationLog.created_at))
            .offset(skip).limit(limit).all())
    return [
        {
            'passed':           l.passed,
            'similarity':       l.similarity_score,
            'threshold':        l.threshold,
            'failure_reason':   l.failure_reason,
            'command':          l.command_attempted,
            'duration_s':       l.audio_duration_s,
            'timestamp':        l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]


def _serialize_enrollment(enr: VoiceEnrollment) -> dict:
    return {
        'id':              enr.id,
        'user_id':         enr.user_id,
        'is_active':       enr.is_active,
        'samples':         enr.samples_count,
        'quality':         enr.enrollment_quality,
        'method':          enr.embedding_method,
        'enrolled_at':     enr.enrolled_at.isoformat() if enr.enrolled_at else None,
        'approved':        enr.approved_by_id is not None,
        'failed_attempts': enr.failed_attempts,
        'total_verifications':      enr.total_verifications,
        'successful_verifications': enr.successful_verifications,
    }
