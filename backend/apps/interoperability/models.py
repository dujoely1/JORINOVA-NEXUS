"""HL7/FHIR Interoperability models — External system connections and message exchange"""
from django.db import models
from django.utils import timezone


class ExternalSystem(models.Model):
    """Registered external system (hospital, clinic, MOH, CDC, WHO, RBC)."""

    class SystemType(models.TextChoices):
        HOSPITAL     = 'hospital',    '🏥 Hospital HIS'
        CLINIC       = 'clinic',      '🏥 Clinic EMR'
        RBC          = 'rbc',         '🩸 Rwanda Biomedical Centre'
        MOH          = 'moh',         '🏛️ Ministry of Health'
        CDC          = 'cdc',         '🌍 CDC'
        WHO          = 'who',         '🌍 WHO'
        INSURANCE    = 'insurance',   '🛡️ Insurance Provider'
        ZIPLINE      = 'zipline',     '🚁 Zipline Rwanda'
        LAB_NETWORK  = 'lab_network', '🔬 Lab Network'
        RESEARCH     = 'research',    '🧬 Research Institute'
        OTHER        = 'other',       'Other'

    class Protocol(models.TextChoices):
        HL7_V2   = 'hl7_v2',   'HL7 v2.x (MLLP/TCP)'
        HL7_V3   = 'hl7_v3',   'HL7 v3.0'
        FHIR_R4  = 'fhir_r4',  'FHIR R4 (REST)'
        FHIR_R5  = 'fhir_r5',  'FHIR R5'
        REST_JSON= 'rest_json','REST/JSON (Custom)'
        CSV_SFTP = 'csv_sftp', 'CSV via SFTP'
        SOAP     = 'soap',     'SOAP/XML'

    name           = models.CharField(max_length=200)
    system_type    = models.CharField(max_length=20, choices=SystemType.choices)
    protocol       = models.CharField(max_length=15, choices=Protocol.choices, default=Protocol.FHIR_R4)
    base_url       = models.URLField(blank=True)
    fhir_endpoint  = models.CharField(max_length=200, blank=True)
    api_key        = models.CharField(max_length=200, blank=True)
    client_id      = models.CharField(max_length=100, blank=True)
    client_secret  = models.CharField(max_length=200, blank=True)
    is_active      = models.BooleanField(default=True)
    send_results   = models.BooleanField(default=False, help_text='Push results to this system')
    receive_orders = models.BooleanField(default=False, help_text='Receive orders from this system')
    last_sync      = models.DateTimeField(null=True, blank=True)
    sync_status    = models.CharField(max_length=20, default='unknown',
                                       choices=[('healthy','🟢 Healthy'),('degraded','🟡 Degraded'),('down','🔴 Down'),('unknown','⚪ Unknown')])
    hospital       = models.ForeignKey('core_config.Hospital', on_delete=models.SET_NULL, null=True, blank=True)
    notes          = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['system_type', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_protocol_display()})"


class HL7Message(models.Model):
    """HL7 / FHIR message log — inbound and outbound."""

    class Direction(models.TextChoices):
        INBOUND  = 'in',  '📥 Inbound'
        OUTBOUND = 'out', '📤 Outbound'

    class MsgType(models.TextChoices):
        ORM  = 'ORM', 'ORM — Order Message'
        ORU  = 'ORU', 'ORU — Result Message'
        ADT  = 'ADT', 'ADT — Admit/Discharge/Transfer'
        MDM  = 'MDM', 'MDM — Document Notification'
        ACK  = 'ACK', 'ACK — Acknowledgment'
        FHIR_BUNDLE = 'FHIR_Bundle', 'FHIR Bundle'
        FHIR_OBS    = 'FHIR_Obs',   'FHIR Observation'
        FHIR_DIAG   = 'FHIR_Diag',  'FHIR DiagnosticReport'
        CUSTOM      = 'custom',     'Custom'

    class Status(models.TextChoices):
        QUEUED     = 'queued',    'Queued'
        SENT       = 'sent',      'Sent'
        RECEIVED   = 'received',  'Received'
        PROCESSED  = 'processed', 'Processed'
        FAILED     = 'failed',    'Failed'
        REJECTED   = 'rejected',  'Rejected'

    system         = models.ForeignKey(ExternalSystem, on_delete=models.CASCADE, related_name='messages')
    direction      = models.CharField(max_length=5, choices=Direction.choices)
    message_type   = models.CharField(max_length=20, choices=MsgType.choices)
    message_id     = models.CharField(max_length=80, blank=True, unique=True)
    patient_pid    = models.CharField(max_length=50, blank=True)
    patient_lid    = models.CharField(max_length=25, blank=True)
    lab_request_id = models.CharField(max_length=30, blank=True)
    raw_message    = models.TextField()
    parsed_data    = models.JSONField(default=dict, blank=True)
    status         = models.CharField(max_length=15, choices=Status.choices, default=Status.QUEUED)
    error_detail   = models.TextField(blank=True)
    processing_ms  = models.IntegerField(null=True, blank=True)
    created_at     = models.DateTimeField(default=timezone.now)
    processed_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering  = ['-created_at']
        indexes   = [
            models.Index(fields=['direction', 'status']),
            models.Index(fields=['patient_pid']),
            models.Index(fields=['message_type', 'created_at']),
        ]

    def __str__(self):
        return f"[{self.direction}] {self.message_type} — {self.system.name} — {self.status}"


class FHIRMapping(models.Model):
    """FHIR resource mapping configuration for each external system."""
    system         = models.ForeignKey(ExternalSystem, on_delete=models.CASCADE, related_name='fhir_mappings')
    resource_type  = models.CharField(max_length=50, help_text='FHIR resource type e.g. Patient, Observation, DiagnosticReport')
    local_model    = models.CharField(max_length=50, help_text='Django model name')
    field_map      = models.JSONField(default=dict, help_text='FHIR field → local field mapping')
    is_active      = models.BooleanField(default=True)
    version        = models.CharField(max_length=10, default='R4')
    notes          = models.TextField(blank=True)

    def __str__(self):
        return f"{self.system.name} — {self.resource_type} → {self.local_model}"
