"""
Voice Biometric Models
======================
Speaker verification using d-vector embeddings.
Each enrolled user has a stored voice fingerprint — a 256-dim embedding vector
computed from 3+ voice samples during enrollment.

Security architecture:
  - Voiceprint stored as JSON blob (float32 array)
  - Never stored as raw audio — privacy-preserving
  - Verification is 1:1 comparison (user claims identity first via JWT)
  - Cosine similarity threshold: 0.75 (tunable per department)
  - Failed attempts logged + lockout after 5 failures in 10 min
"""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, DateTime, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from .base import TimestampMixin


# ── Roles that ARE allowed to use voice commands ──────────────────────────────
# Interns, visitors, students, guests — BLOCKED by design
VOICE_ALLOWED_ROLES = frozenset({
    'super_admin', 'it_admin', 'lab_manager', 'pathologist',
    'lab_technician', 'biochemist', 'microbiologist',
    'receptionist', 'phlebotomist', 'doctor', 'nurse',
    'blood_bank_officer', 'quality_officer', 'biomedical_eng',
    'finance', 'radiographer', 'security_officer',
})

VOICE_BLOCKED_ROLES = frozenset({
    'intern', 'visitor', 'student', 'guest', 'observer', 'viewer',
})


class VoiceEnrollment(Base, TimestampMixin):
    """
    Stores the voice biometric fingerprint for an enrolled staff member.

    The embedding is a 256-dimensional d-vector (from resemblyzer / MFCC fallback)
    that encodes the speaker's unique vocal characteristics — pitch, timbre, resonance.

    Privacy: raw audio is NEVER stored. Only the mathematical embedding.
    """
    __tablename__ = 'voice_enrollments'

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:      Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'), unique=True)

    # Embedding vector (JSON array of floats — 256 dims for resemblyzer, 39 for MFCC)
    embedding:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON: [[0.12, -0.05, …], […], …]  — list of per-sample embeddings, averaged on verify

    embedding_method: Mapped[str]       = mapped_column(String(30), default='mfcc')
    # 'resemblyzer' | 'mfcc' | 'combined'

    # Enrollment quality
    samples_count:Mapped[int]           = mapped_column(Integer, default=0)
    # Number of voice samples recorded (minimum 3 required)
    enrollment_quality: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # 0–1.0, computed as mean intra-user similarity during enrollment

    # Status
    is_active:    Mapped[bool]          = mapped_column(Boolean, default=False)
    # Only True after admin approves enrollment

    enrolled_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_id: Mapped[Optional[int]]    = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    approved_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Security
    verification_threshold: Mapped[float] = mapped_column(Float, default=0.75)
    # Similarity score required to pass (0.75 = 75% similarity — tuneable)
    failed_attempts:  Mapped[int]          = mapped_column(Integer, default=0)
    locked_until:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Phrases used during enrollment (for re-training reference)
    enrollment_phrases: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON list of phrases spoken

    # Stats
    total_verifications:  Mapped[int]    = mapped_column(Integer, default=0)
    successful_verifications: Mapped[int]= mapped_column(Integer, default=0)

    user         = relationship('User', foreign_keys=[user_id], backref='voice_enrollment')
    approved_by  = relationship('User', foreign_keys=[approved_by_id])
    attempts     = relationship('VoiceVerificationLog', back_populates='enrollment',
                                cascade='all, delete-orphan')


class VoiceVerificationLog(Base, TimestampMixin):
    """
    Audit log of every voice verification attempt.
    Immutable after creation — required for security compliance.
    """
    __tablename__ = 'voice_verification_logs'

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    enrollment_id: Mapped[int]           = mapped_column(Integer, ForeignKey('voice_enrollments.id'))
    user_id:       Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'))

    # Result
    similarity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Cosine similarity 0–1 (≥ threshold = PASS)
    threshold:        Mapped[float]           = mapped_column(Float)
    passed:           Mapped[bool]            = mapped_column(Boolean)
    failure_reason:   Mapped[Optional[str]]   = mapped_column(String(80), nullable=True)
    # BELOW_THRESHOLD | BLOCKED_ROLE | NOT_ENROLLED | LOCKED | AUDIO_ERROR

    # Context
    command_attempted:Mapped[Optional[str]]   = mapped_column(String(200), nullable=True)
    ip_address:       Mapped[Optional[str]]   = mapped_column(String(45), nullable=True)
    device_info:      Mapped[Optional[str]]   = mapped_column(String(200), nullable=True)
    audio_duration_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    enrollment = relationship('VoiceEnrollment', back_populates='attempts')
    user       = relationship('User', foreign_keys=[user_id])


class VoiceTrainingSession(Base, TimestampMixin):
    """
    Tracks a multi-step enrollment session where a user records multiple samples.
    Temporary — deleted once enrollment is confirmed.
    """
    __tablename__ = 'voice_training_sessions'

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:     Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'))
    session_token: Mapped[str]         = mapped_column(String(64), unique=True, index=True)

    # Collected samples (JSON list of base64-encoded embeddings)
    collected_embeddings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    samples_needed: Mapped[int]        = mapped_column(Integer, default=5)
    samples_done:   Mapped[int]        = mapped_column(Integer, default=0)

    # Phrases assigned for this session
    phrases:      Mapped[Optional[str]]= mapped_column(Text, nullable=True)
    # JSON list of phrases

    status:       Mapped[str]          = mapped_column(String(15), default='IN_PROGRESS')
    # IN_PROGRESS | COMPLETE | EXPIRED | FAILED

    expires_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship('User', foreign_keys=[user_id])
