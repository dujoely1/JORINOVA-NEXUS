"""Laboratory core models — Requests, Samples, Results, TAT"""
import random
import string
from django.db import models
from django.utils import timezone
from django.contrib.postgres.fields import ArrayField


def generate_barcode():
    """7-digit permanent barcode / lab ID."""
    while True:
        bc = ''.join(random.choices(string.digits, k=7))
        if not LabRequest.objects.filter(lab_id=bc).exists():
            return bc


class SampleStatus(models.TextChoices):
    PENDING = 'pending', 'Pending Collection'
    COLLECTED = 'collected', 'Collected'
    IN_TRANSIT = 'in_transit', 'In Transit'
    RECEIVED = 'received', 'Received in Lab'
    PROCESSING = 'processing', 'Processing'
    COMPLETED = 'completed', 'Completed'
    REJECTED = 'rejected', 'Rejected'
    STORED = 'stored', 'Stored'


class EmergencyLevel(models.TextChoices):
    NORMAL = 'normal', 'Normal'
    ROUTINE = 'routine', 'Routine'
    URGENT = 'urgent', 'Urgent'
    EMERGENCY = 'emergency', 'Emergency / STAT'


class LabRequest(models.Model):
    """A doctor's test request for a patient."""
    lab_id = models.CharField(max_length=7, unique=True, default=generate_barcode, editable=False)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='lab_requests')
    hospital = models.ForeignKey('core_config.Hospital', on_delete=models.CASCADE)
    request_date = models.DateTimeField(default=timezone.now)
    requested_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True,
        related_name='requests_made'
    )
    doctor_name = models.CharField(max_length=200, blank=True)
    ward = models.CharField(max_length=50, blank=True)
    bed = models.CharField(max_length=10, blank=True)
    clinical_info = models.TextField(blank=True)
    provisional_diagnosis = models.TextField(blank=True)
    emergency_level = models.CharField(max_length=15, choices=EmergencyLevel.choices, default=EmergencyLevel.ROUTINE)
    tests = models.ManyToManyField('core_config.TestCatalog', through='RequestedTest')
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'), ('submitted', 'Submitted'), ('received', 'Received'),
            ('processing', 'Processing'), ('completed', 'Completed'), ('validated', 'Validated'),
            ('cancelled', 'Cancelled')
        ],
        default='submitted'
    )
    is_high_risk = models.BooleanField(default=False)
    biosafety_warning = models.CharField(max_length=50, blank=True)
    received_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='requests_received'
    )
    received_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lab_requests'
        ordering = ['-request_date']
        indexes = [
            models.Index(fields=['lab_id']),
            models.Index(fields=['patient', 'request_date']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"REQ-{self.lab_id} | {self.patient.full_name}"


class RequestedTest(models.Model):
    """Ordered test within a lab request."""
    request = models.ForeignKey(LabRequest, on_delete=models.CASCADE, related_name='requested_tests')
    test = models.ForeignKey('core_config.TestCatalog', on_delete=models.CASCADE)
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending'), ('started', 'Started'), ('completed', 'Completed'),
            ('validated', 'Validated'), ('cancelled', 'Cancelled')
        ],
        default='pending'
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    validated_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='validated_tests'
    )
    automation_order = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'requested_tests'
        unique_together = ['request', 'test']


class Sample(models.Model):
    """A physical specimen/sample with barcode and tracking."""
    TUBE_COLORS = {
        'purple_edta': '#9B59B6',
        'red_plain': '#E74C3C',
        'yellow_sst': '#F39C12',
        'blue_citrate': '#2980B9',
        'green_heparin': '#27AE60',
        'grey_fluoride': '#95A5A6',
        'urine_container': '#F1C40F',
        'stool_container': '#784212',
        'swab': '#EB984E',
        'other': '#BDC3C7',
    }

    lab_request = models.ForeignKey(LabRequest, on_delete=models.CASCADE, related_name='samples')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='samples')
    department = models.ForeignKey('core_config.LaboratoryDepartment', on_delete=models.CASCADE)
    sid = models.CharField(max_length=20, help_text="Sample ID: DEPT-NNN")
    barcode = models.CharField(max_length=20, unique=True)
    tube_type = models.CharField(max_length=30)
    specimen_type = models.CharField(max_length=100)
    label_color = models.CharField(max_length=7, default='#E74C3C')
    is_high_risk = models.BooleanField(default=False)
    biosafety_emoji = models.CharField(max_length=10, blank=True)
    collection_time = models.DateTimeField(null=True, blank=True)
    received_time = models.DateTimeField(null=True, blank=True)
    tat_start = models.DateTimeField(null=True, blank=True)
    tat_deadline = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=SampleStatus.choices, default=SampleStatus.PENDING)
    collected_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='collected_samples'
    )
    received_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='received_samples'
    )
    rejection_reason = models.CharField(max_length=200, blank=True)
    rejection_notified = models.BooleanField(default=False)
    volume_ml = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'samples'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['barcode']), models.Index(fields=['sid'])]

    def __str__(self):
        return f"{self.sid} | {self.patient.full_name}"

    @property
    def tat_elapsed_minutes(self):
        if self.tat_start:
            return int((timezone.now() - self.tat_start).total_seconds() / 60)
        return 0

    @property
    def tat_percentage(self):
        if self.tat_start and self.tat_deadline:
            total = (self.tat_deadline - self.tat_start).total_seconds()
            elapsed = (timezone.now() - self.tat_start).total_seconds()
            return min(100, int((elapsed / total) * 100))
        return 0

    @property
    def tat_status(self):
        pct = self.tat_percentage
        if pct < 60:
            return 'green'
        elif pct < 80:
            return 'yellow'
        elif pct < 100:
            return 'orange'
        return 'red'


class LabResult(models.Model):
    """Individual test result entry."""
    requested_test = models.OneToOneField(RequestedTest, on_delete=models.CASCADE, related_name='result')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='results')
    value = models.TextField(blank=True)
    numeric_value = models.FloatField(null=True, blank=True)
    unit = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=100, blank=True)
    flag = models.CharField(
        max_length=10,
        choices=[('H', 'High'), ('L', 'Low'), ('HH', 'Critical High'), ('LL', 'Critical Low'), ('N', 'Normal'), ('A', 'Abnormal')],
        default='N'
    )
    is_critical = models.BooleanField(default=False)
    is_abnormal = models.BooleanField(default=False)
    ai_interpretation = models.TextField(blank=True)
    technician_comment = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True,
        related_name='results_entered'
    )
    entered_at = models.DateTimeField(auto_now_add=True)
    validated_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='results_validated'
    )
    validated_at = models.DateTimeField(null=True, blank=True)
    is_validated = models.BooleanField(default=False)
    is_printed = models.BooleanField(default=False)
    print_count = models.PositiveSmallIntegerField(default=0)
    sms_sent = models.BooleanField(default=False)
    email_sent = models.BooleanField(default=False)
    corrected = models.BooleanField(default=False)
    correction_note = models.TextField(blank=True)

    class Meta:
        db_table = 'lab_results'
        ordering = ['-entered_at']

    def __str__(self):
        return f"Result: {self.requested_test.test.name} | {self.patient.full_name}"


# ═══════════════════════════════════════════════════════════════
# CHAIN OF CUSTODY — Full sample journey audit trail
# ═══════════════════════════════════════════════════════════════

class SampleCustodyEvent(models.Model):
    """Every state change for a sample is logged here — full chain of custody."""

    class EventType(models.TextChoices):
        ORDERED       = 'ordered',       '📋 Test Ordered'
        COLLECTED     = 'collected',     '🩸 Sample Collected'
        LABELED       = 'labeled',       '🏷️ Label Printed'
        DISPATCHED    = 'dispatched',    '🚗 Dispatched to Lab'
        RECEIVED      = 'received',      '📦 Received in Lab'
        SORTED        = 'sorted',        '🔀 Sorted to Department'
        PROCESSING    = 'processing',    '⚗️ Processing Started'
        STORED        = 'stored',        '🗄️ Stored'
        REJECTED      = 'rejected',      '❌ Rejected'
        ALIQUOTED     = 'aliquoted',     '🧪 Aliquoted'
        TRANSFERRED   = 'transferred',   '↗️ Transferred'
        DISPOSED      = 'disposed',      '🗑️ Disposed'

    sample        = models.ForeignKey(Sample, on_delete=models.CASCADE, related_name='custody_events')
    event_type    = models.CharField(max_length=20, choices=EventType.choices)
    location      = models.CharField(max_length=150, blank=True, help_text='Physical location / department')
    performed_by  = models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True, related_name='custody_events')
    shift         = models.CharField(max_length=20, blank=True, help_text='Shift name at time of event')
    device_id     = models.CharField(max_length=50, blank=True, help_text='Barcode scanner / device ID')
    notes         = models.TextField(blank=True)
    temperature_c = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text='Sample temp if cold-chain relevant')
    timestamp     = models.DateTimeField(default=timezone.now)
    # Geolocation (for field collection)
    latitude      = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude     = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = 'sample_custody_events'
        ordering = ['sample', 'timestamp']
        indexes  = [models.Index(fields=['sample', 'timestamp'])]

    def __str__(self):
        return f"{self.sample.sid} → {self.event_type} @ {self.timestamp:%Y-%m-%d %H:%M}"


class SampleRejection(models.Model):
    """Detailed rejection record with smart acceptance/rejection logic."""

    class RejectionReason(models.TextChoices):
        HAEMOLYSED     = 'haemolysed',      '🔴 Haemolysed'
        CLOTTED        = 'clotted',         '🩸 Clotted'
        INSUFFICIENT   = 'insufficient',    '📉 Insufficient Volume'
        WRONG_TUBE     = 'wrong_tube',      '🧪 Wrong Tube Type'
        UNLABELED      = 'unlabeled',       '🏷️ Unlabeled / Mislabeled'
        CONTAMINATED   = 'contaminated',    '☣️ Contaminated'
        EXPIRED        = 'expired',         '⏰ Expired / Delayed'
        LIPEMIC        = 'lipemic',         '🍥 Lipemic'
        TEMP_DEVIATION = 'temp_deviation',  '🌡️ Temperature Deviation'
        WRONG_PATIENT  = 'wrong_patient',   '⚠️ Patient ID Mismatch'
        LEAKING        = 'leaking',         '💧 Leaking Container'
        OTHER          = 'other',           'Other'

    sample          = models.OneToOneField(Sample, on_delete=models.CASCADE, related_name='rejection_detail')
    reason          = models.CharField(max_length=25, choices=RejectionReason.choices)
    reason_detail   = models.TextField(blank=True)
    rejected_by     = models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True, related_name='rejections_made')
    rejected_at     = models.DateTimeField(default=timezone.now)
    ai_suggested    = models.BooleanField(default=False, help_text='True if AI system flagged this before human review')
    ai_confidence   = models.SmallIntegerField(default=0)
    recollect_required = models.BooleanField(default=True)
    notification_sent  = models.BooleanField(default=False)
    notified_at        = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'sample_rejections'

    def __str__(self):
        return f"REJECTED: {self.sample.sid} — {self.reason}"


# ═══════════════════════════════════════════════════════════════
# RESULT CORRECTION — Secure validated-result amendment
# ═══════════════════════════════════════════════════════════════

class ResultCorrection(models.Model):
    """
    Secure audit trail for every correction to a validated result.
    ISO 15189 — corrections require authorization and documented reason.
    """

    class CorrectionReason(models.TextChoices):
        TRANSCRIPTION  = 'transcription', 'Transcription Error'
        RECALCULATION  = 'recalculation', 'Recalculation / Dilution'
        QC_FAILURE     = 'qc_failure',    'QC Failure — Repeat Required'
        INSTRUMENT_ERROR = 'instrument',  'Instrument / Analyzer Error'
        WRONG_UNIT     = 'wrong_unit',    'Wrong Unit Reported'
        DELTA_CHECK    = 'delta_check',   'Delta Check Failure'
        CLINICAL_REQUEST = 'clinical',    'Clinician-Requested Review'
        OTHER          = 'other',         'Other (specify)'

    result          = models.ForeignKey(LabResult, on_delete=models.CASCADE, related_name='corrections')
    original_value  = models.TextField()
    original_flag   = models.CharField(max_length=10, blank=True)
    corrected_value = models.TextField()
    corrected_flag  = models.CharField(max_length=10, blank=True)
    reason          = models.CharField(max_length=25, choices=CorrectionReason.choices)
    reason_detail   = models.TextField()
    authorized_by   = models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True, related_name='corrections_authorized')
    corrected_by    = models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True, related_name='corrections_made')
    correction_number = models.PositiveSmallIntegerField(default=1, help_text='Sequential correction count for this result')
    corrected_at    = models.DateTimeField(default=timezone.now)
    doctor_notified = models.BooleanField(default=False)
    patient_sms_sent= models.BooleanField(default=False)
    pqc_signature   = models.CharField(max_length=100, blank=True, help_text='Post-quantum signature of this correction')

    class Meta:
        db_table = 'result_corrections'
        ordering = ['-corrected_at']

    def __str__(self):
        return f"Correction #{self.correction_number} — {self.result} — {self.reason}"


# ═══════════════════════════════════════════════════════════════
# ANALYZER RESULT IMPORT — Direct analyzer connectivity
# ═══════════════════════════════════════════════════════════════

class AnalyzerImport(models.Model):
    """Raw result received from analyzer via ASTM/HL7 interface."""

    class ImportStatus(models.TextChoices):
        RAW       = 'raw',      'Raw — Awaiting Mapping'
        MAPPED    = 'mapped',   'Mapped to Patient'
        VALIDATED = 'validated','Validated and Saved'
        REJECTED  = 'rejected', 'Rejected — Error'

    analyzer      = models.ForeignKey('iot_analyzers.AnalyzerDevice', on_delete=models.SET_NULL, null=True, blank=True)
    raw_message   = models.TextField(help_text='Raw ASTM/HL7 message from analyzer')
    protocol      = models.CharField(max_length=20, default='ASTM', choices=[('ASTM','ASTM LIS2-A2'),('HL7','HL7 v2.5'),('FHIR','FHIR R4'),('CSV','CSV Upload')])
    result        = models.ForeignKey(LabResult, on_delete=models.SET_NULL, null=True, blank=True, related_name='analyzer_imports')
    status        = models.CharField(max_length=15, choices=ImportStatus.choices, default=ImportStatus.RAW)
    parsed_data   = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    received_at   = models.DateTimeField(default=timezone.now)
    processed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'analyzer_imports'
        ordering = ['-received_at']


# ═══════════════════════════════════════════════════════════════
# RESULT NOTIFICATION — SMS + email delivery tracking
# ═══════════════════════════════════════════════════════════════

class ResultNotification(models.Model):
    """SMS / email notification record for each result release."""

    class Channel(models.TextChoices):
        SMS    = 'sms',   'SMS'
        EMAIL  = 'email', 'Email'
        PORTAL = 'portal','Doctor Portal'
        PRINT  = 'print', 'Printed'
        WHATSAPP = 'whatsapp', 'WhatsApp'

    class Status(models.TextChoices):
        QUEUED    = 'queued',    'Queued'
        SENT      = 'sent',      'Sent'
        DELIVERED = 'delivered', 'Delivered'
        FAILED    = 'failed',    'Failed'
        READ      = 'read',      'Read'

    result         = models.ForeignKey(LabResult, on_delete=models.CASCADE, related_name='notifications')
    patient        = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='result_notifications')
    channel        = models.CharField(max_length=15, choices=Channel.choices)
    recipient      = models.CharField(max_length=100, help_text='Phone number or email address')
    message        = models.TextField()
    status         = models.CharField(max_length=15, choices=Status.choices, default=Status.QUEUED)
    provider_ref   = models.CharField(max_length=100, blank=True, help_text='SMS provider message ID')
    sent_at        = models.DateTimeField(null=True, blank=True)
    delivered_at   = models.DateTimeField(null=True, blank=True)
    read_at        = models.DateTimeField(null=True, blank=True)
    error          = models.TextField(blank=True)
    pqc_signature  = models.CharField(max_length=100, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'result_notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.channel.upper()} → {self.recipient} | {self.status}"


# ═══════════════════════════════════════════════════════════════
# AUTO RECORD BOOK — Department/specimen-based documentation
# ═══════════════════════════════════════════════════════════════

class LabRecordBookEntry(models.Model):
    """
    Auto-generated record book entry when a result is validated.
    Maps to physical lab department record books (Hematology Book, Chemistry Book, etc.)
    """

    class BookType(models.TextChoices):
        HEMATOLOGY   = 'hematology',   '🔴 Hematology'
        CHEMISTRY    = 'chemistry',    '🧫 Chemistry'
        MICROBIOLOGY = 'microbiology', '🦠 Microbiology'
        SEROLOGY     = 'serology',     '🔬 Serology'
        BLOOD_GROUP  = 'blood_group',  '🩸 Blood Group'
        CROSSMATCH   = 'crossmatch',   '💉 Crossmatch'
        COAGULATION  = 'coagulation',  '💙 Coagulation'
        PARASITOLOGY = 'parasitology', '🔬 Parasitology'
        URINALYSIS   = 'urinalysis',   '🟡 Urinalysis'
        IMMUNOLOGY   = 'immunology',   '🧬 Immunology'
        MOLECULAR    = 'molecular',    '🔬 Molecular'
        CYTOLOGY     = 'cytology',     '🩺 Cytology'

    result        = models.ForeignKey(LabResult, on_delete=models.CASCADE, related_name='book_entries')
    book_type     = models.CharField(max_length=20, choices=BookType.choices)
    entry_number  = models.CharField(max_length=20, help_text='Sequential book entry number e.g. HEM-2024-001423')
    page_number   = models.PositiveIntegerField(null=True, blank=True)
    patient_name  = models.CharField(max_length=200)
    patient_pid   = models.CharField(max_length=30)
    patient_lid   = models.CharField(max_length=25, blank=True)
    test_name     = models.CharField(max_length=200)
    result_value  = models.TextField()
    reference_range = models.CharField(max_length=100, blank=True)
    flag          = models.CharField(max_length=10, blank=True)
    is_critical   = models.BooleanField(default=False)
    department    = models.ForeignKey('core_config.LaboratoryDepartment', on_delete=models.SET_NULL, null=True, blank=True)
    validated_by  = models.CharField(max_length=200, blank=True)
    shift         = models.CharField(max_length=20, blank=True)
    recorded_at   = models.DateTimeField(default=timezone.now)
    ai_interpretation_summary = models.TextField(blank=True)
    pqc_hash      = models.CharField(max_length=64, blank=True, help_text='SHA-256 of entry for tamper detection')

    class Meta:
        db_table = 'lab_record_book_entries'
        ordering = ['-recorded_at']
        indexes  = [
            models.Index(fields=['book_type', 'recorded_at']),
            models.Index(fields=['patient_pid']),
            models.Index(fields=['entry_number']),
        ]

    def __str__(self):
        return f"[{self.book_type}] {self.entry_number} — {self.patient_name}"

    def save(self, *args, **kwargs):
        if not self.pqc_hash:
            import hashlib
            content = f"{self.entry_number}|{self.patient_pid}|{self.test_name}|{self.result_value}|{self.recorded_at}"
            self.pqc_hash = hashlib.sha256(content.encode()).hexdigest()
        super().save(*args, **kwargs)
