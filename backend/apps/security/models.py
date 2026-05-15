"""Security Module Models — Post-Quantum RBAC + Biometric + Behavioral"""
from django.db import models
from django.conf import settings
from django.utils import timezone
import uuid, json


# ─── RBAC ─────────────────────────────────────────────────────────────────────

class Permission(models.Model):
    codename    = models.CharField(max_length=100, unique=True)
    name        = models.CharField(max_length=200)
    module      = models.CharField(max_length=60)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ['module', 'codename']

    def __str__(self): return self.codename


class RBACRole(models.Model):
    """Extends the built-in role system with fine-grained permissions."""
    ROLE_CHOICES = [
        ('super_admin',       '⚡ Super Administrator'),
        ('it_admin',          '💻 IT Administrator'),
        ('lab_manager',       '🥼 Lab Manager'),
        ('quality_manager',   '📊 Quality Manager'),
        ('pathologist',       '🔬 Pathologist'),
        ('head_hematology',   '🔴 Head — Hematology'),
        ('head_chemistry',    '🧫 Head — Chemistry'),
        ('head_microbiology', '🦠 Head — Microbiology'),
        ('head_serology',     '🔬 Head — Serology'),
        ('head_blood_bank',   '🩸 Head — Blood Bank'),
        ('lab_officer',       '⚗️ Lab Officer'),
        ('lab_technician',    '🧪 Lab Technician'),
        ('receptionist',      '📡 Receptionist'),
        ('phlebotomist',      '💉 Phlebotomist'),
        ('nurse',             '👩‍⚕️ Nurse'),
        ('doctor',            '🩺 Doctor'),
        ('finance',           '💰 Finance Officer'),
        ('viewer',            '👁️ Viewer'),
    ]
    name        = models.CharField(max_length=60, choices=ROLE_CHOICES, unique=True)
    display     = models.CharField(max_length=100)
    permissions = models.ManyToManyField(Permission, blank=True)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self): return self.display


class UserSecurityProfile(models.Model):
    """Extended security profile per user."""
    BIOMETRIC_METHODS = [
        ('none',        '🚫 None'),
        ('fingerprint', '👆 Fingerprint'),
        ('face',        '👤 Face Recognition'),
        ('palm',        '🖐️ Palm Vein'),
        ('multi',       '🔐 Multi-Factor Biometric'),
    ]
    MFA_METHODS = [
        ('none',        'None'),
        ('totp',        '📱 TOTP (Authenticator App)'),
        ('sms',         '📲 SMS OTP'),
        ('email',       '📧 Email OTP'),
        ('biometric',   '👆 Biometric + PIN'),
        ('pq_token',    '🔐 Post-Quantum Token'),
    ]

    user              = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='security_profile')
    rbac_role         = models.ForeignKey(RBACRole, null=True, blank=True, on_delete=models.SET_NULL)
    biometric_method  = models.CharField(max_length=20, choices=BIOMETRIC_METHODS, default='none')
    biometric_enrolled= models.BooleanField(default=False)
    biometric_template= models.BinaryField(blank=True, null=True)     # encrypted template
    mfa_method        = models.CharField(max_length=20, choices=MFA_METHODS, default='none')
    mfa_enabled       = models.BooleanField(default=False)
    pq_public_key     = models.TextField(blank=True)   # post-quantum public key (Kyber)
    pq_key_algorithm  = models.CharField(max_length=30, default='CRYSTALS-Kyber-1024')
    security_clearance= models.IntegerField(default=1)  # 1–5
    last_biometric_auth = models.DateTimeField(null=True, blank=True)
    failed_biometric_attempts = models.IntegerField(default=0)
    biometric_locked  = models.BooleanField(default=False)
    risk_score        = models.FloatField(default=0.0)   # 0.0–1.0
    behavioral_baseline = models.JSONField(default=dict)
    trusted_ips       = models.JSONField(default=list)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    def __str__(self): return f'SecurityProfile({self.user})'


# ─── BIOMETRIC ENROLLMENT ─────────────────────────────────────────────────────

class BiometricEnrollment(models.Model):
    TYPE_CHOICES = [
        ('fingerprint', '👆 Fingerprint'),
        ('face',        '👤 Face'),
        ('palm',        '🖐️ Palm'),
        ('webauthn',    '🔑 WebAuthn/FIDO2'),
    ]
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='biometrics')
    bio_type    = models.CharField(max_length=20, choices=TYPE_CHOICES)
    template    = models.BinaryField()         # AES-256-GCM encrypted template
    credential_id = models.TextField(blank=True)   # WebAuthn credential ID
    quality_score = models.FloatField(default=0.0)  # 0.0–1.0
    is_primary  = models.BooleanField(default=False)
    is_active   = models.BooleanField(default=True)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    enrolled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='enrolled_biometrics')
    device_info = models.JSONField(default=dict)
    last_used   = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-enrolled_at']


# ─── POST-QUANTUM CRYPTO ──────────────────────────────────────────────────────

class PostQuantumKeystore(models.Model):
    ALGORITHM_CHOICES = [
        ('kyber_1024',    'CRYSTALS-Kyber-1024 (KEM)'),
        ('dilithium_3',   'CRYSTALS-Dilithium-3 (Sign)'),
        ('falcon_1024',   'FALCON-1024 (Sign)'),
        ('sphincs_256',   'SPHINCS+-SHA3-256 (Sign)'),
        ('ntru_hps_4096', 'NTRU-HPS-4096 (KEM)'),
    ]
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.CASCADE, related_name='pq_keys')
    purpose     = models.CharField(max_length=30)  # session|signing|kem|identity
    algorithm   = models.CharField(max_length=30, choices=ALGORITHM_CHOICES)
    public_key  = models.TextField()
    key_hash    = models.CharField(max_length=128)  # SHAKE-256 hash
    security_level = models.IntegerField(default=5)  # NIST security level 1–5
    created_at  = models.DateTimeField(auto_now_add=True)
    expires_at  = models.DateTimeField(null=True, blank=True)
    is_active   = models.BooleanField(default=True)
    rotations   = models.IntegerField(default=0)

    class Meta:
        ordering = ['-created_at']


# ─── AUDIT LOG ────────────────────────────────────────────────────────────────

class SecurityAuditLog(models.Model):
    SEVERITY = [('low','🟢 Low'),('medium','🟡 Medium'),('high','🟠 High'),('critical','🔴 Critical')]
    EVENT_TYPES = [
        ('login',              'User Login'),
        ('logout',             'User Logout'),
        ('login_failed',       'Login Failed'),
        ('biometric_auth',     'Biometric Auth'),
        ('biometric_failed',   'Biometric Failure'),
        ('permission_denied',  'Permission Denied'),
        ('privilege_escalation','Privilege Escalation'),
        ('data_access',        'Data Access'),
        ('data_export',        'Data Export'),
        ('config_change',      'Configuration Change'),
        ('user_created',       'User Created'),
        ('password_change',    'Password Changed'),
        ('mfa_bypass_attempt', 'MFA Bypass Attempt'),
        ('anomaly_detected',   'Behavioral Anomaly'),
        ('threat_detected',    'Threat Detected'),
        ('pq_key_rotation',    'PQ Key Rotation'),
        ('session_timeout',    'Session Timeout'),
        ('brute_force',        'Brute Force Attempt'),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='audit_logs')
    event_type  = models.CharField(max_length=30, choices=EVENT_TYPES)
    severity    = models.CharField(max_length=10, choices=SEVERITY, default='low')
    description = models.TextField()
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    user_agent  = models.TextField(blank=True)
    resource    = models.CharField(max_length=200, blank=True)
    outcome     = models.CharField(max_length=20, default='success')
    risk_score  = models.FloatField(default=0.0)
    metadata    = models.JSONField(default=dict)
    timestamp   = models.DateTimeField(default=timezone.now)
    session_id  = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ['-timestamp']
        indexes  = [models.Index(fields=['user','timestamp']),
                    models.Index(fields=['event_type','timestamp'])]


# ─── BEHAVIORAL ANALYSIS ──────────────────────────────────────────────────────

class BehavioralProfile(models.Model):
    user              = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                             related_name='behavioral_profile')
    avg_session_duration = models.FloatField(default=0)  # seconds
    typical_login_hours  = models.JSONField(default=list)  # [7, 8, 9 ...] hours
    typical_ips          = models.JSONField(default=list)
    typical_devices      = models.JSONField(default=list)
    avg_typing_speed     = models.FloatField(default=0)   # chars/min
    avg_mouse_velocity   = models.FloatField(default=0)
    module_usage_pattern = models.JSONField(default=dict)  # {module: frequency}
    anomaly_score        = models.FloatField(default=0.0)  # 0–1
    last_analyzed        = models.DateTimeField(null=True, blank=True)
    baseline_established = models.BooleanField(default=False)
    samples_count        = models.IntegerField(default=0)
    updated_at           = models.DateTimeField(auto_now=True)


# ─── THREAT EVENTS ────────────────────────────────────────────────────────────

class ThreatEvent(models.Model):
    THREAT_TYPES = [
        ('brute_force',        '🔨 Brute Force'),
        ('credential_stuffing','🎣 Credential Stuffing'),
        ('session_hijacking',  '🕵️ Session Hijacking'),
        ('anomalous_access',   '👁️ Anomalous Access'),
        ('privilege_abuse',    '⬆️ Privilege Abuse'),
        ('data_exfiltration',  '📤 Data Exfiltration'),
        ('insider_threat',     '😈 Insider Threat'),
        ('replay_attack',      '🔄 Replay Attack'),
        ('quantum_threat',     '⚛️ Quantum Threat Signal'),
    ]
    STATUS = [('open','🔴 Open'),('investigating','🟡 Investigating'),('resolved','🟢 Resolved')]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    threat_type = models.CharField(max_length=30, choices=THREAT_TYPES)
    severity    = models.CharField(max_length=10, choices=SecurityAuditLog.SEVERITY)
    status      = models.CharField(max_length=20, choices=STATUS, default='open')
    description = models.TextField()
    affected_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                      on_delete=models.SET_NULL)
    source_ip   = models.GenericIPAddressField(null=True, blank=True)
    evidence    = models.JSONField(default=dict)
    mitigations = models.JSONField(default=list)
    risk_score  = models.FloatField(default=0.0)
    detected_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='resolved_threats')

    class Meta:
        ordering = ['-detected_at']
