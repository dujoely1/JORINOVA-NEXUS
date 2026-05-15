from django.contrib import admin
from .models import Patient, Guardian, InsuranceProfile


class GuardianInline(admin.TabularInline):
    model = Guardian
    extra = 0
    fields = ['full_name', 'relationship', 'phone', 'national_id', 'is_primary']


class InsuranceInline(admin.TabularInline):
    model = InsuranceProfile
    extra = 0
    fields = ['payment_type', 'insurance_name', 'insurance_id', 'coverage_percentage', 'is_active']


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ['pid', 'full_name', 'gender', 'date_of_birth', 'phone', 'district', 'created_at']
    list_filter = ['gender', 'district', 'is_inpatient', 'blood_group']
    search_fields = ['pid', 'unique_lab_id', 'family_name', 'other_names', 'phone', 'person_id']
    readonly_fields = ['pid', 'unique_lab_id', 'created_at', 'updated_at']
    inlines = [GuardianInline, InsuranceInline]
    fieldsets = (
        ('Identity', {'fields': ('pid', 'unique_lab_id', 'family_name', 'other_names', 'date_of_birth', 'gender', 'person_id', 'photo')}),
        ('Contact', {'fields': ('phone', 'email', 'address', 'district', 'province', 'nationality')}),
        ('Medical', {'fields': ('blood_group', 'allergies', 'chronic_conditions', 'hiv_status')}),
        ('Admission', {'fields': ('is_inpatient', 'ward', 'bed_number')}),
        ('System', {'fields': ('hospital', 'registered_by', 'record_number', 'archive_code', 'created_at', 'updated_at')}),
    )
