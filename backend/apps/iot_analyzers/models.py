"""IoT / Analyzer Connectivity models — Devices, Calibration, Maintenance"""
from django.db import models
from django.utils import timezone


class AnalyzerDevice(models.Model):
    """Physical analyzer or IoT device registered in the system."""

    class DeviceType(models.TextChoices):
        HEMATOLOGY     = 'hematology',    'Hematology Analyzer'
        CHEMISTRY      = 'chemistry',     'Chemistry Analyzer'
        IMMUNOASSAY    = 'immunoassay',   'Immunoassay Analyzer'
        COAGULATION    = 'coagulation',   'Coagulation Analyzer'
        MOLECULAR      = 'molecular',     'Molecular / PCR'
        BLOOD_CULTURE  = 'blood_culture', 'Blood Culture System'
        BLOOD_GAS      = 'blood_gas',     'Blood Gas Analyzer'
        URINALYSIS     = 'urinalysis',    'Urinalysis Analyzer'
        REFRIGERATOR   = 'refrigerator',  'Blood Bank Refrigerator'
        FREEZER        = 'freezer',       'Plasma Freezer'
        CENTRIFUGE     = 'centrifuge',    'Centrifuge'
        BSC            = 'bsc',           'Biosafety Cabinet'
        PHLEBOTOMY     = 'phlebotomy',    'Smart Phlebotomy Device'
        BARCODE_SCANNER= 'barcode',       'Barcode / QR Scanner'
        ROBOTIC        = 'robotic',       'Robotic Sample Handler'
        OTHER          = 'other',         'Other'

    class ConnStatus(models.TextChoices):
        ONLINE   = 'online',   '🟢 Online'
        OFFLINE  = 'offline',  '🔴 Offline'
        WARNING  = 'warning',  '🟡 Warning'
        STANDBY  = 'standby',  '⚪ Standby'
        ERROR    = 'error',    '🔴 Error'

    device_code    = models.CharField(max_length=30, unique=True)
    name           = models.CharField(max_length=150)
    manufacturer   = models.CharField(max_length=100, blank=True)
    model          = models.CharField(max_length=100, blank=True)
    serial_number  = models.CharField(max_length=80, blank=True, unique=True)
    device_type    = models.CharField(max_length=20, choices=DeviceType.choices)
    department     = models.ForeignKey('core_config.LaboratoryDepartment', on_delete=models.SET_NULL, null=True, blank=True)
    hospital       = models.ForeignKey('core_config.Hospital', on_delete=models.SET_NULL, null=True, blank=True)
    location       = models.CharField(max_length=100, blank=True)

    # Connectivity
    interface_protocol = models.CharField(max_length=30, default='ASTM',
                                           choices=[('ASTM','ASTM LIS2-A2'),('HL7','HL7 v2.5'),('FHIR','FHIR R4'),('Serial','Serial RS-232'),('USB','USB'),('TCP','TCP/IP'),('None','No Interface')])
    ip_address     = models.GenericIPAddressField(null=True, blank=True)
    port           = models.PositiveSmallIntegerField(null=True, blank=True)
    is_bidirectional = models.BooleanField(default=False)

    # Status
    conn_status    = models.CharField(max_length=15, choices=ConnStatus.choices, default=ConnStatus.OFFLINE)
    current_state  = models.CharField(max_length=50, blank=True, help_text='e.g. Ready, Running, Error')
    error_code     = models.CharField(max_length=30, blank=True)
    current_temp   = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    tests_today    = models.PositiveIntegerField(default=0)

    # Maintenance
    installation_date = models.DateField(null=True, blank=True)
    warranty_expiry   = models.DateField(null=True, blank=True)
    service_contract  = models.CharField(max_length=100, blank=True)
    next_service_date = models.DateField(null=True, blank=True)

    is_active      = models.BooleanField(default=True)
    notes          = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['device_type', 'name']

    def __str__(self):
        return f"{self.device_code} — {self.name} ({self.get_device_type_display()})"


class CalibrationRecord(models.Model):
    """Calibration event for an analyzer."""

    class CalStatus(models.TextChoices):
        PASS      = 'pass',     '✅ Pass'
        FAIL      = 'fail',     '❌ Fail'
        PARTIAL   = 'partial',  '⚠️ Partial'
        DUE       = 'due',      '⏰ Due'
        OVERDUE   = 'overdue',  '🔴 Overdue'

    device         = models.ForeignKey(AnalyzerDevice, on_delete=models.CASCADE, related_name='calibrations')
    calibrator_name= models.CharField(max_length=150)
    calibrator_lot  = models.CharField(max_length=60, blank=True)
    calibrator_expiry = models.DateField(null=True, blank=True)
    status         = models.CharField(max_length=15, choices=CalStatus.choices)
    performed_by   = models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True)
    performed_at   = models.DateTimeField(default=timezone.now)
    next_cal_date  = models.DateField(null=True, blank=True)
    results_data   = models.JSONField(default=dict, blank=True)
    notes          = models.TextField(blank=True)

    class Meta:
        ordering = ['-performed_at']

    def __str__(self):
        return f"{self.device.name} Cal — {self.status} @ {self.performed_at:%Y-%m-%d}"


class MaintenanceLog(models.Model):
    """Preventive or corrective maintenance log."""

    class MaintType(models.TextChoices):
        DAILY    = 'daily',    'Daily PM'
        WEEKLY   = 'weekly',   'Weekly PM'
        MONTHLY  = 'monthly',  'Monthly PM'
        REPAIR   = 'repair',   'Repair'
        EMERGENCY= 'emergency','Emergency'

    device         = models.ForeignKey(AnalyzerDevice, on_delete=models.CASCADE, related_name='maintenance_logs')
    maint_type     = models.CharField(max_length=15, choices=MaintType.choices)
    task_description = models.TextField()
    parts_replaced = models.TextField(blank=True)
    performed_by   = models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True)
    performed_at   = models.DateTimeField(default=timezone.now)
    next_due       = models.DateField(null=True, blank=True)
    outcome        = models.CharField(max_length=20, choices=[('ok','Completed OK'),('pending','Pending'),('escalated','Escalated')], default='ok')
    notes          = models.TextField(blank=True)

    class Meta:
        ordering = ['-performed_at']
