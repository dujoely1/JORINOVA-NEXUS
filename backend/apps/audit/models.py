"""
JORINOVA NEXUS ALIS-X — Stealth Audit Logger
Tamper-resistant · Encrypted sensitive fields · Hash-chained batches
ISO 15189 · Medico-legal traceability · GDPR-style access control
"""
import hashlib
import json
from django.db import models
from django.utils import timezone


class AuditEventCategory(models.TextChoices):
    AUTH        = 'auth',        '🔐 Authentication'
    PATIENT     = 'patient',     '🧬 Patient Data'
    RESULT      = 'result',      '📋 Lab Result'
    VALIDATION  = 'validation',  '✅ Validation'
    CORRECTION  = 'correction',  '✏️ Result Correction'
    DELETION    = 'deletion',    '🗑️ Record Deletion'
    BLOOD_BANK  = 'blood_bank',  '🩸 Blood Bank'
    INVENTORY   = 'inventory',   '📦 Inventory'
    CONFIG      = 'config',      '⚙️ Configuration'
    SECURITY    = 'security',    '🔒 Security'
    AI_DECISION = 'ai_decision', '🤖 AI Decision'
    DEVICE      = 'device',      '🔧 Device/IoT'
    PRINT       = 'print',       '🖨️ Print/Label'
    VOICE       = 'voice',       '🎙️ Voice Command'
    API         = 'api',         '🌐 API Activity'
    INTEROP     = 'interop',     '🔗 Interoperability'
    REPORT      = 'report',      '📊 Report'
    FORECAST    = 'forecast',    '🔮 Forecast'
    SURVEILLANCE= 'surveillance','🦠 Surveillance'
    SYSTEM      = 'system',      '💻 System'


class AuditRiskLevel(models.TextChoices):
    LOW      = 'low',      'Low'
    MEDIUM   = 'medium',   'Medium'
    HIGH     = 'high',     'High'
    CRITICAL = 'critical', 'Critical'


class AuditEvent(models.Model):
    """
    Core audit event record.
    Written by async background worker — zero impact on main thread.
    Restricted to security admin roles only via model-level access control.
    """
    # Event identity
    event_id      = models.CharField(max_length=32, unique=True, editable=False)
    category      = models.CharField(max_length=20, choices=AuditEventCategory.choices)
    action        = models.CharField(max_length=100, help_text='Specific action e.g. result.validate, patient.delete')
    description   = models.CharField(max_length=500)

    # Actor
    user_id       = models.PositiveIntegerField(null=True, blank=True)
    username      = models.CharField(max_length=150, blank=True)
    user_role     = models.CharField(max_length=50, blank=True)
    ip_address    = models.GenericIPAddressField(null=True, blank=True)
    session_id    = models.CharField(max_length=64, blank=True)
    user_agent    = models.CharField(max_length=300, blank=True)

    # Target object
    object_type   = models.CharField(max_length=100, blank=True, help_text='Django model name e.g. LabResult')
    object_id     = models.CharField(max_length=50, blank=True)
    object_repr   = models.CharField(max_length=200, blank=True)

    # Change tracking
    before_state  = models.TextField(blank=True, help_text='JSON snapshot before change — encrypted for sensitive data')
    after_state   = models.TextField(blank=True, help_text='JSON snapshot after change')
    changes       = models.JSONField(default=dict, blank=True, help_text='Field-level diff {field: [old, new]}')

    # Context
    module        = models.CharField(max_length=50, blank=True, help_text='NEXUS module slug')
    request_path  = models.CharField(max_length=300, blank=True)
    request_method= models.CharField(max_length=10, blank=True)
    http_status   = models.SmallIntegerField(null=True, blank=True)
    duration_ms   = models.IntegerField(null=True, blank=True)
    shift         = models.CharField(max_length=30, blank=True)
    hospital_id   = models.PositiveIntegerField(null=True, blank=True)

    # Risk assessment
    risk_level    = models.CharField(max_length=15, choices=AuditRiskLevel.choices, default=AuditRiskLevel.LOW)
    anomaly_score = models.FloatField(default=0.0, help_text='0-100 from anomaly detector')
    is_suspicious = models.BooleanField(default=False)
    is_violation  = models.BooleanField(default=False)

    # Tamper resistance
    event_hash    = models.CharField(max_length=64, editable=False, help_text='SHA-256 of event content')
    chain_hash    = models.CharField(max_length=64, editable=False, blank=True, help_text='SHA-256(prev_hash + event_hash)')
    batch_id      = models.CharField(max_length=32, blank=True, db_index=True)
    sequence_no   = models.PositiveBigIntegerField(default=0)

    timestamp     = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'nexus_audit_events'
        ordering = ['-timestamp']
        indexes  = [
            models.Index(fields=['category', 'timestamp']),
            models.Index(fields=['user_id', 'timestamp']),
            models.Index(fields=['is_suspicious', 'risk_level']),
            models.Index(fields=['object_type', 'object_id']),
            models.Index(fields=['action', 'timestamp']),
            models.Index(fields=['hospital_id', 'timestamp']),
        ]
        permissions = [
            ('view_audit_trail',    'Can view audit trail'),
            ('export_audit_report', 'Can export audit reports'),
            ('view_suspicious',     'Can view suspicious events'),
        ]

    def __str__(self):
        return f"[{self.category}] {self.action} — {self.username} @ {self.timestamp:%Y-%m-%d %H:%M:%S}"

    def compute_hash(self) -> str:
        content = '|'.join([
            str(self.event_id), str(self.user_id or ''), self.action,
            self.object_type, self.object_id, self.timestamp.isoformat(),
        ])
        return hashlib.sha256(content.encode()).hexdigest()

    def save(self, *args, **kwargs):
        if not self.event_hash:
            self.event_hash = self.compute_hash()
        super().save(*args, **kwargs)


class AuditBatch(models.Model):
    """
    Buffered write batch — groups events for efficient bulk insertion.
    The background worker collects events in memory and flushes in batches.
    """
    batch_id      = models.CharField(max_length=32, unique=True)
    event_count   = models.PositiveIntegerField(default=0)
    first_seq     = models.PositiveBigIntegerField(default=0)
    last_seq      = models.PositiveBigIntegerField(default=0)
    batch_hash    = models.CharField(max_length=64, help_text='SHA-256 of all event hashes in batch')
    prev_batch_hash = models.CharField(max_length=64, blank=True, help_text='Hash chain: links to previous batch')
    is_sealed     = models.BooleanField(default=False)
    created_at    = models.DateTimeField(auto_now_add=True)
    sealed_at     = models.DateTimeField(null=True, blank=True)
    archive_ref   = models.CharField(max_length=200, blank=True, help_text='S3/storage path if archived')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Batch {self.batch_id} — {self.event_count} events"

    def seal(self, event_hashes: list):
        combined = ''.join(event_hashes)
        self.batch_hash = hashlib.sha256(combined.encode()).hexdigest()
        self.is_sealed  = True
        self.sealed_at  = timezone.now()
        self.save(update_fields=['batch_hash', 'is_sealed', 'sealed_at'])


class AnomalyDetectionProfile(models.Model):
    """Per-user / per-role baseline for anomaly detection."""
    user_id           = models.PositiveIntegerField(unique=True)
    username          = models.CharField(max_length=150)
    role              = models.CharField(max_length=50)
    avg_daily_actions = models.FloatField(default=0.0)
    common_hours      = models.JSONField(default=list)   # [0-23] hours where user is typically active
    common_ips        = models.JSONField(default=list)   # known IP addresses
    common_modules    = models.JSONField(default=list)   # modules this user typically uses
    last_updated      = models.DateTimeField(auto_now=True)
    baseline_days     = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['username']

    def __str__(self):
        return f"Profile: {self.username} ({self.role})"


class SecurityIncident(models.Model):
    """Security incident raised by anomaly detector — requires investigation."""

    class IncidentType(models.TextChoices):
        BRUTE_FORCE     = 'brute_force',    '🔓 Brute Force / Failed Logins'
        MASS_DELETION   = 'mass_deletion',  '🗑️ Mass Record Deletion'
        MASS_MODIFICATION='mass_mod',       '✏️ Mass Modification'
        UNUSUAL_ACCESS  = 'unusual_access', '🕵️ Unusual Access Pattern'
        OFF_HOURS       = 'off_hours',      '🌙 Off-Hours Activity'
        UNKNOWN_IP      = 'unknown_ip',     '🌐 Unknown IP Address'
        PRIVILEGE_ESCALATION='priv_esc',    '⬆️ Privilege Escalation Attempt'
        DATA_EXFILTRATION='data_exfil',     '📤 Data Exfiltration Pattern'
        CRITICAL_OVERRIDE='crit_override',  '⚠️ Critical Result Override'
        BIOSECURITY     = 'biosecurity',    '☣️ Biosecurity Incident'
        INSIDER_THREAT  = 'insider',        '🔍 Insider Threat Indicator'

    class IncidentStatus(models.TextChoices):
        OPEN       = 'open',       'Open'
        INVESTIGATING = 'invest',  'Under Investigation'
        CONTAINED  = 'contained',  'Contained'
        RESOLVED   = 'resolved',   'Resolved — No threat'
        ESCALATED  = 'escalated',  'Escalated to Authority'

    incident_id    = models.CharField(max_length=20, unique=True, editable=False)
    incident_type  = models.CharField(max_length=25, choices=IncidentType.choices)
    status         = models.CharField(max_length=15, choices=IncidentStatus.choices, default=IncidentStatus.OPEN)
    threat_level   = models.CharField(max_length=15,
                                       choices=[('low','Low'),('medium','Medium'),('high','High'),('critical','Critical')])
    risk_score     = models.FloatField(default=0.0, help_text='0-100 composite risk score')
    confidence_pct = models.SmallIntegerField(default=0)
    title          = models.CharField(max_length=200)
    description    = models.TextField()
    ai_reasoning   = models.TextField(blank=True)
    evidence_event_ids = models.JSONField(default=list, help_text='AuditEvent IDs that triggered this incident')
    affected_user_id   = models.PositiveIntegerField(null=True, blank=True)
    affected_username  = models.CharField(max_length=150, blank=True)
    detected_at    = models.DateTimeField(default=timezone.now)
    assigned_to    = models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_incidents')
    resolved_at    = models.DateTimeField(null=True, blank=True)
    resolution_note= models.TextField(blank=True)
    pqc_signature  = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['-detected_at']

    def __str__(self):
        return f"INC-{self.incident_id} [{self.threat_level.upper()}] {self.title}"

    def save(self, *args, **kwargs):
        if not self.incident_id:
            from django.utils import timezone as tz
            last = SecurityIncident.objects.filter(detected_at__date=tz.now().date()).count() + 1
            self.incident_id = f"INC-{tz.now().strftime('%Y%m%d')}-{str(last).zfill(3)}"
        super().save(*args, **kwargs)
