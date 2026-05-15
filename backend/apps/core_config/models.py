"""Core configuration models — Hospital, Department, Test Catalog"""
from django.db import models


class Hospital(models.Model):
    name = models.CharField(max_length=200)
    short_name = models.CharField(max_length=50, blank=True)
    logo = models.ImageField(upload_to='hospitals/', blank=True, null=True)
    address = models.TextField()
    district = models.CharField(max_length=100)
    province = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    hospital_type = models.CharField(
        max_length=20,
        choices=[('public', 'Public'), ('private', 'Private'), ('mission', 'Mission'), ('clinic', 'Clinic')],
        default='public'
    )
    has_lab = models.BooleanField(default=True)
    has_clinic = models.BooleanField(default=True)
    has_radiology = models.BooleanField(default=False)
    has_pharmacy = models.BooleanField(default=False)
    rbc_code = models.CharField(max_length=20, blank=True, help_text="Rwanda Biomedical Centre facility code")
    minisante_code = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'hospitals'

    def __str__(self):
        return self.name


class LaboratoryDepartment(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    abbreviation = models.CharField(max_length=10)
    color_hex = models.CharField(max_length=7, default='#0099FF')
    tube_color = models.CharField(max_length=20, blank=True)
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='departments')
    head = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='headed_departments'
    )
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'lab_departments'
        ordering = ['order', 'name']

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"


class TestCatalog(models.Model):
    """Master list of all laboratory tests."""
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)
    short_name = models.CharField(max_length=50)
    department = models.ForeignKey(LaboratoryDepartment, on_delete=models.CASCADE, related_name='tests')
    specimen_type = models.CharField(max_length=100)
    tube_type = models.CharField(
        max_length=30,
        choices=[
            ('purple_edta', 'Purple / EDTA'),
            ('red_plain', 'Red / Plain'),
            ('yellow_sst', 'Yellow / SST'),
            ('blue_citrate', 'Blue / Citrate'),
            ('green_heparin', 'Green / Heparin'),
            ('grey_fluoride', 'Grey / Fluoride'),
            ('urine_container', 'Urine Container'),
            ('stool_container', 'Stool Container'),
            ('swab', 'Swab'),
            ('other', 'Other'),
        ],
        default='red_plain'
    )
    tat_hours = models.DecimalField(max_digits=5, decimal_places=1, default=2.0)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    reference_range = models.TextField(blank=True)
    unit = models.CharField(max_length=50, blank=True)
    method = models.CharField(max_length=200, blank=True)
    requires_phlebotomy = models.BooleanField(default=True)
    is_panel = models.BooleanField(default=False)
    panel_tests = models.ManyToManyField('self', blank=True, symmetrical=False)
    loinc_code = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    order_in_department = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'test_catalog'
        ordering = ['department__order', 'order_in_department', 'name']

    def __str__(self):
        return f"{self.name} [{self.code}]"


class SystemSetting(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField()
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        'authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        db_table = 'system_settings'

    def __str__(self):
        return self.key

    @classmethod
    def get(cls, key, default=''):
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default
