"""Records Module Models — Lab Books with Specimen Color + Shift Intelligence"""
from django.db import models
from django.conf import settings
from django.utils import timezone


# ─── Book definition ──────────────────────────────────────────────────────────

class LabBook(models.Model):
    """Represents a laboratory record book (one per department/test type)."""

    BOOK_TYPES = [
        # Purple (EDTA) tubes
        ('hematology',   '🔴 Hematology'),
        ('blood_group',  '🩸 Blood Group'),
        ('crossmatch',   '🧪 Crossmatch'),
        # Red/Yellow (SST) tubes
        ('chemistry',    '🧫 Chemistry'),
        ('serology',     '🔬 Serology'),
        # Blue (Citrate) tubes
        ('coagulation',  '💙 Coagulation'),
        # Green/Fluoride tubes
        ('glucose',      '💚 Glucose'),
        ('metabolic',    '🌿 Metabolic'),
        # Other
        ('urinalysis',   '🟡 Urinalysis'),
        ('microbiology', '🦠 Microbiology'),
        ('blood_bank',   '🩸 Blood Bank'),
        ('parasitology', '🔵 Parasitology'),
    ]

    # Specimen color → header gradient mapping
    COLOR_MAP = {
        'hematology':  {'tube': 'purple', 'gradient': 'linear-gradient(135deg,#1A0035 0%,#4A0E82 45%,#7B2FBE 100%)', 'accent': '#9B59B6'},
        'blood_group': {'tube': 'purple', 'gradient': 'linear-gradient(135deg,#1A0035 0%,#4A0E82 45%,#7B2FBE 100%)', 'accent': '#9B59B6'},
        'crossmatch':  {'tube': 'purple', 'gradient': 'linear-gradient(135deg,#1A0035 0%,#4A0E82 45%,#7B2FBE 100%)', 'accent': '#9B59B6'},
        'chemistry':   {'tube': 'red_yellow', 'gradient': 'linear-gradient(135deg,#5A0000 0%,#A01A00 45%,#CC5500 75%,#E8960A 100%)', 'accent': '#F39C12'},
        'serology':    {'tube': 'red_yellow', 'gradient': 'linear-gradient(135deg,#5A0000 0%,#A01A00 45%,#CC5500 75%,#E8960A 100%)', 'accent': '#F39C12'},
        'coagulation': {'tube': 'blue',       'gradient': 'linear-gradient(135deg,#001233 0%,#0A2A6A 45%,#1A5096 100%)',            'accent': '#2980B9'},
        'glucose':     {'tube': 'fluoride',   'gradient': 'linear-gradient(135deg,#002210 0%,#0A5025 45%,#1A8A40 100%)',            'accent': '#27AE60'},
        'metabolic':   {'tube': 'fluoride',   'gradient': 'linear-gradient(135deg,#002210 0%,#0A5025 45%,#1A8A40 100%)',            'accent': '#27AE60'},
        'urinalysis':  {'tube': 'yellow',     'gradient': 'linear-gradient(135deg,#332200 0%,#664400 45%,#CC8800 100%)',            'accent': '#F1C40F'},
        'microbiology':{'tube': 'teal',       'gradient': 'linear-gradient(135deg,#001A20 0%,#004455 45%,#006680 100%)',            'accent': '#00BCD4'},
        'blood_bank':  {'tube': 'red',        'gradient': 'linear-gradient(135deg,#3A0000 0%,#8B0000 50%,#CC0000 100%)',            'accent': '#E74C3C'},
        'parasitology':{'tube': 'blue',       'gradient': 'linear-gradient(135deg,#001233 0%,#0A2A6A 45%,#1A5096 100%)',            'accent': '#3498DB'},
    }

    book_type    = models.CharField(max_length=30, choices=BOOK_TYPES, unique=True)
    name         = models.CharField(max_length=100)
    department   = models.CharField(max_length=100, blank=True)
    is_active    = models.BooleanField(default=True)
    tube_color   = models.CharField(max_length=20, blank=True)
    header_gradient = models.TextField(blank=True)
    accent_color = models.CharField(max_length=10, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        colors = self.COLOR_MAP.get(self.book_type, {})
        self.tube_color       = colors.get('tube', '')
        self.header_gradient  = colors.get('gradient', '')
        self.accent_color     = colors.get('accent', '#00AAFF')
        super().save(*args, **kwargs)

    def __str__(self): return self.name

    class Meta:
        ordering = ['book_type']


# ─── Lab Record Entry ─────────────────────────────────────────────────────────

class LabRecord(models.Model):
    SHIFT_CHOICES = [
        ('morning',   '☀️ Morning'),
        ('afternoon', '🌤️ Afternoon'),
        ('night',     '🌙 Night'),
    ]
    STATUS_CHOICES = [
        ('draft',     '📝 Draft'),
        ('pending',   '⏳ Pending Validation'),
        ('validated', '✅ Validated'),
        ('amended',   '✏️ Amended'),
        ('cancelled', '❌ Cancelled'),
    ]

    lab_book    = models.ForeignKey(LabBook, on_delete=models.PROTECT, related_name='records')
    patient     = models.ForeignKey('patients.Patient', on_delete=models.PROTECT, related_name='lab_records')
    lab_request = models.ForeignKey('laboratory.LabRequest', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='book_records')
    record_id   = models.CharField(max_length=30, unique=True)

    # Shift Intelligence
    shift       = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    shift_icon  = models.CharField(max_length=5, default='☀️')
    shift_start = models.TimeField(null=True, blank=True)
    shift_end   = models.TimeField(null=True, blank=True)

    # Entry data
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    results     = models.JSONField(default=dict)   # { test_name: { value, unit, ref_range, flag } }
    notes       = models.TextField(blank=True)
    qc_status   = models.CharField(max_length=20, blank=True)

    # Personnel
    entered_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                     related_name='entered_records')
    validated_by= models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='validated_records')
    validated_at= models.DateTimeField(null=True, blank=True)
    amended_by  = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='amended_records')

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes  = [models.Index(fields=['lab_book', 'shift', 'created_at']),
                    models.Index(fields=['patient', 'created_at'])]

    def __str__(self): return f'{self.record_id} — {self.lab_book} — {self.shift}'

    def save(self, *args, **kwargs):
        if not self.record_id:
            import random, string
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            self.record_id = f'REC-{timezone.now().strftime("%Y%m%d")}-{code}'
        super().save(*args, **kwargs)
