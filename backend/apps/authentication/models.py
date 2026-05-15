"""Authentication models — NexusCore User management"""
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class Department(models.TextChoices):
    RECEPTION = 'reception', 'Reception'
    HEMATOLOGY = 'hematology', 'Hematology'
    BIOCHEMISTRY = 'biochemistry', 'Biochemistry'
    MICROBIOLOGY = 'microbiology', 'Microbiology'
    IMMUNOLOGY = 'immunology', 'Immunology / Serology'
    MOLECULAR = 'molecular', 'Molecular Biology'
    BLOOD_BANK = 'blood_bank', 'Blood Bank'
    HISTOPATHOLOGY = 'histopathology', 'Histopathology'
    URINALYSIS = 'urinalysis', 'Urinalysis & Parasitology'
    ADMINISTRATION = 'administration', 'Administration'
    MANAGEMENT = 'management', 'Lab Management'
    IT = 'it', 'IT / System'
    CLINIC = 'clinic', 'Clinic'
    RADIOLOGY = 'radiology', 'Radiology'
    PHARMACY = 'pharmacy', 'Pharmacy'


class UserRole(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Administrator'
    LAB_MANAGER = 'lab_manager', 'Laboratory Manager'
    LAB_TECHNICIAN = 'lab_technician', 'Laboratory Technician'
    PATHOLOGIST = 'pathologist', 'Pathologist'
    RECEPTIONIST = 'receptionist', 'Receptionist'
    DOCTOR = 'doctor', 'Doctor'
    NURSE = 'nurse', 'Nurse'
    PHLEBOTOMIST = 'phlebotomist', 'Phlebotomist'
    PHARMACIST = 'pharmacist', 'Pharmacist'
    FINANCE = 'finance', 'Finance Officer'
    RADIOGRAPHER = 'radiographer', 'Radiographer'
    IT_ADMIN = 'it_admin', 'IT Administrator'
    VIEWER = 'viewer', 'Read-Only Viewer'


class NexusUser(AbstractUser):
    """Extended user model with biometric and role support."""
    employee_id = models.CharField(max_length=20, unique=True, blank=True, null=True)
    role = models.CharField(max_length=30, choices=UserRole.choices, default=UserRole.LAB_TECHNICIAN)
    department = models.CharField(max_length=30, choices=Department.choices, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    profile_photo = models.ImageField(upload_to='staff_photos/', blank=True, null=True)
    face_encoding = models.TextField(blank=True)
    fingerprint_hash = models.CharField(max_length=512, blank=True)
    preferred_language = models.CharField(
        max_length=5, choices=[('en', 'English'), ('fr', 'Français'), ('rw', 'Kinyarwanda')],
        default='en'
    )
    hospital = models.ForeignKey(
        'core_config.Hospital', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='staff'
    )
    digital_signature = models.ImageField(upload_to='signatures/', blank=True, null=True)
    is_active = models.BooleanField(default=True)
    last_activity = models.DateTimeField(null=True, blank=True)
    login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    totp_secret = models.CharField(max_length=32, blank=True)
    two_factor_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    voice_code = models.CharField(max_length=20, blank=True, help_text="Abbreviated name code for voice recognition")

    class Meta:
        db_table = 'nexus_users'
        verbose_name = 'Staff User'
        verbose_name_plural = 'Staff Users'

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"

    @property
    def is_locked(self):
        if self.locked_until and self.locked_until > timezone.now():
            return True
        return False

    def record_activity(self):
        self.last_activity = timezone.now()
        self.save(update_fields=['last_activity'])


class LoginLog(models.Model):
    user = models.ForeignKey(NexusUser, on_delete=models.CASCADE, related_name='login_logs')
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True)
    success = models.BooleanField(default=False)
    method = models.CharField(
        max_length=20,
        choices=[('password', 'Password'), ('face', 'Face Recognition'), ('fingerprint', 'Fingerprint'), ('otp', 'OTP')],
        default='password'
    )

    class Meta:
        db_table = 'login_logs'
        ordering = ['-timestamp']
