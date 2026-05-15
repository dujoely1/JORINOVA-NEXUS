from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display   = ['title', 'notification_type', 'priority', 'channel', 'recipient', 'is_read', 'is_sent', 'created_at']
    list_filter    = ['notification_type', 'priority', 'channel', 'is_read', 'is_sent', 'created_at']
    search_fields  = ['title', 'message', 'recipient__username']
    readonly_fields= ['created_at', 'read_at', 'sent_at']
    date_hierarchy = 'created_at'
