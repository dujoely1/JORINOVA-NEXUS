from django.contrib import admin
from .models import (
    StorageUnit, StorageChamber, Donor, DonationEvent,
    BloodBag, CrossmatchRecord, HaemovigilanceReport,
    InterHospitalExchange, BloodRequest, TemperatureLog,
)


class StorageChamberInline(admin.TabularInline):
    model  = StorageChamber
    extra  = 2
    fields = ['chamber_number', 'label', 'total_slots', 'purpose', 'is_active']


@admin.register(StorageUnit)
class StorageUnitAdmin(admin.ModelAdmin):
    list_display   = ['unit_code', 'name', 'unit_type', 'location', 'current_temp', 'temp_status', 'total_chambers', 'is_active']
    list_filter    = ['unit_type', 'is_active', 'temp_alert_active']
    search_fields  = ['unit_code', 'name', 'serial_number']
    inlines        = [StorageChamberInline]


@admin.register(Donor)
class DonorAdmin(admin.ModelAdmin):
    list_display  = ['donor_id', 'full_name', 'blood_group', 'gender', 'phone', 'is_eligible', 'total_donations', 'last_donation']
    list_filter   = ['blood_group', 'gender', 'is_eligible']
    search_fields = ['donor_id', 'family_name', 'other_names', 'national_id', 'phone']


@admin.register(BloodBag)
class BloodBagAdmin(admin.ModelAdmin):
    list_display  = ['bag_number', 'blood_group', 'component', 'status', 'expiry_date', 'expiry_status', 'location_label', 'volume_ml']
    list_filter   = ['blood_group', 'component', 'status']
    search_fields = ['bag_number']
    date_hierarchy= 'collection_date'
    readonly_fields=['bag_number', 'created_at', 'updated_at']


@admin.register(HaemovigilanceReport)
class HVReportAdmin(admin.ModelAdmin):
    list_display  = ['report_id', 'patient', 'reaction_type', 'severity', 'onset_time', 'reported_by', 'is_notified_to_rbc']
    list_filter   = ['reaction_type', 'severity', 'is_notified_to_rbc']
    readonly_fields=['report_id', 'reported_at']


@admin.register(InterHospitalExchange)
class ExchangeAdmin(admin.ModelAdmin):
    list_display  = ['exchange_id', 'blood_group', 'component', 'quantity', 'partner', 'status', 'ai_urgency', 'created_at']
    list_filter   = ['partner', 'status', 'ai_urgency']
    readonly_fields=['exchange_id', 'approval_code', 'created_at']


@admin.register(BloodRequest)
class BloodRequestAdmin(admin.ModelAdmin):
    list_display  = ['request_id', 'patient', 'blood_group', 'component', 'units_requested', 'urgency', 'status', 'created_at']
    list_filter   = ['urgency', 'status', 'blood_group']
    readonly_fields=['request_id', 'created_at']


@admin.register(TemperatureLog)
class TempLogAdmin(admin.ModelAdmin):
    list_display  = ['storage_unit', 'temperature', 'is_alert', 'source', 'recorded_at']
    list_filter   = ['is_alert', 'source', 'storage_unit']
    date_hierarchy= 'recorded_at'
