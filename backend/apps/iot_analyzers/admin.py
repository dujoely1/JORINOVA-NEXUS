from django.contrib import admin
from .models import AnalyzerDevice, CalibrationRecord, MaintenanceLog


@admin.register(AnalyzerDevice)
class AnalyzerDeviceAdmin(admin.ModelAdmin):
    list_display  = ['device_code', 'name', 'device_type', 'conn_status', 'current_state', 'tests_today', 'is_active']
    list_filter   = ['device_type', 'conn_status', 'is_active']
    search_fields = ['device_code', 'name', 'serial_number']


@admin.register(CalibrationRecord)
class CalibrationAdmin(admin.ModelAdmin):
    list_display  = ['device', 'calibrator_name', 'status', 'performed_by', 'performed_at', 'next_cal_date']
    list_filter   = ['status']
    date_hierarchy= 'performed_at'


@admin.register(MaintenanceLog)
class MaintenanceAdmin(admin.ModelAdmin):
    list_display  = ['device', 'maint_type', 'performed_by', 'performed_at', 'next_due', 'outcome']
    list_filter   = ['maint_type', 'outcome']
    date_hierarchy= 'performed_at'
