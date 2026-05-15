from django.contrib import admin
from .models import InventoryItem, StockMovement, Supplier, PurchaseOrder


class StockMovementInline(admin.TabularInline):
    model   = StockMovement
    extra   = 0
    fields  = ['movement_type', 'quantity', 'balance_after', 'batch_number', 'expiry_date', 'performed_by', 'performed_at']
    readonly_fields = ['balance_after', 'performed_at']
    max_num = 10


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display   = ['code', 'name', 'category', 'current_stock', 'unit', 'status', 'expiry_date', 'department']
    list_filter    = ['category', 'status', 'cold_chain', 'department']
    search_fields  = ['code', 'name', 'brand', 'batch_number', 'catalog_no']
    readonly_fields= ['status', 'created_at', 'updated_at']
    inlines        = [StockMovementInline]


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display  = ['name', 'contact_name', 'phone', 'email', 'is_active']
    list_filter   = ['is_active']
    search_fields = ['name', 'contact_name']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display   = ['item', 'movement_type', 'quantity', 'balance_after', 'performed_by', 'performed_at']
    list_filter    = ['movement_type', 'performed_at']
    date_hierarchy = 'performed_at'


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display  = ['po_number', 'supplier', 'status', 'total_amount', 'requested_by', 'created_at']
    list_filter   = ['status', 'created_at']
    search_fields = ['po_number', 'supplier__name']
