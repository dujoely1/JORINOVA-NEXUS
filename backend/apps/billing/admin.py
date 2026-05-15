from django.contrib import admin
from .models import Invoice, InvoiceLineItem, Payment, InsuranceProvider


class InvoiceLineItemInline(admin.TabularInline):
    model  = InvoiceLineItem
    extra  = 0
    fields = ['description', 'test', 'quantity', 'unit_price', 'discount_pct', 'line_total']
    readonly_fields = ['line_total']


class PaymentInline(admin.TabularInline):
    model  = Payment
    extra  = 0
    fields = ['amount', 'method', 'reference_no', 'received_by', 'received_at']
    readonly_fields = ['received_at']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display   = ['invoice_number', 'patient', 'status', 'total_amount', 'amount_paid', 'amount_due', 'created_at']
    list_filter    = ['status', 'created_at']
    search_fields  = ['invoice_number', 'patient__family_name', 'patient__other_names', 'patient__pid']
    readonly_fields= ['invoice_number', 'amount_due', 'created_at', 'updated_at']
    inlines        = [InvoiceLineItemInline, PaymentInline]
    date_hierarchy = 'created_at'


@admin.register(InsuranceProvider)
class InsuranceProviderAdmin(admin.ModelAdmin):
    list_display  = ['name', 'code', 'coverage_pct', 'is_active']
    list_filter   = ['is_active']
    search_fields = ['name', 'code']


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display  = ['invoice', 'amount', 'method', 'reference_no', 'received_by', 'received_at']
    list_filter   = ['method', 'received_at']
    date_hierarchy= 'received_at'
