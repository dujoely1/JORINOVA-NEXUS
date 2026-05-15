from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import NexusUser, LoginLog


@admin.register(NexusUser)
class NexusUserAdmin(UserAdmin):
    list_display = ['username', 'get_full_name', 'role', 'department', 'hospital', 'is_active', 'last_activity']
    list_filter = ['role', 'department', 'is_active', 'hospital']
    search_fields = ['username', 'first_name', 'last_name', 'email', 'employee_id']
    fieldsets = UserAdmin.fieldsets + (
        ('ALIS-X Profile', {
            'fields': ('employee_id', 'role', 'department', 'hospital', 'phone',
                       'profile_photo', 'preferred_language', 'voice_code',
                       'two_factor_enabled', 'digital_signature')
        }),
    )


@admin.register(LoginLog)
class LoginLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'timestamp', 'success', 'method', 'ip_address']
    list_filter = ['success', 'method']
    readonly_fields = ['user', 'timestamp', 'ip_address', 'user_agent', 'success', 'method']
