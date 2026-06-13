"""Per-user voice and accessibility settings."""
from typing import Optional
from sqlalchemy import String, Float, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base
from .base import TimestampMixin


class VoiceSettings(Base, TimestampMixin):
    __tablename__ = 'voice_settings'

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:     Mapped[int]           = mapped_column(Integer, ForeignKey('users.id'), unique=True)

    # Language
    language:    Mapped[str]           = mapped_column(String(10), default='en')
    stt_language:Mapped[str]           = mapped_column(String(10), default='en')   # speech recognition lang
    tts_language:Mapped[str]           = mapped_column(String(10), default='en')   # TTS output lang
    report_language: Mapped[str]       = mapped_column(String(10), default='en')

    # Speech mode: normal | slow | accessibility | fast
    speech_mode: Mapped[str]           = mapped_column(String(20), default='normal')

    # TTS parameters
    speech_rate: Mapped[float]         = mapped_column(Float, default=0.88)
    speech_pitch:Mapped[float]         = mapped_column(Float, default=1.0)
    speech_volume:Mapped[float]        = mapped_column(Float, default=0.95)

    # Accessibility
    accessibility_mode: Mapped[bool]   = mapped_column(Boolean, default=False)
    repeat_enabled:     Mapped[bool]   = mapped_column(Boolean, default=True)
    confirmation_prompts:Mapped[bool]  = mapped_column(Boolean, default=True)
    pause_between_ms:   Mapped[int]    = mapped_column(Integer, default=350)

    # Voice engine
    preferred_voice:    Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    wake_phrase:        Mapped[str]    = mapped_column(String(50), default='hello jorinova')

    # Notifications
    critical_audio_alert: Mapped[bool] = mapped_column(Boolean, default=True)
