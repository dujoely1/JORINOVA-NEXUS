"""Billing serializers"""
from rest_framework import serializers
from django.utils import timezone
from .models import Invoice, InvoiceLineItem, Payment, InsuranceProvider


class InsuranceProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model  = InsuranceProvider
        fields = ['id', 'name', 'code', 'coverage_pct', 'is_active']


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = InvoiceLineItem
        fields = ['id', 'description', 'test', 'quantity', 'unit_price', 'discount_pct', 'line_total']
        read_only_fields = ['id', 'line_total']


class PaymentSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source='received_by.get_full_name', read_only=True, default='')

    class Meta:
        model  = Payment
        fields = ['id', 'amount', 'method', 'reference_no', 'received_by', 'received_by_name', 'received_at', 'notes']
        read_only_fields = ['id', 'received_by', 'received_by_name', 'received_at']


class InvoiceListSerializer(serializers.ModelSerializer):
    patient_name   = serializers.CharField(source='patient.full_name', read_only=True)
    patient_pid    = serializers.CharField(source='patient.pid', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    lab_id         = serializers.CharField(source='lab_request.lab_id', read_only=True, default='')
    insurance_name = serializers.CharField(source='insurance_provider.name', read_only=True, default='')

    class Meta:
        model  = Invoice
        fields = [
            'id', 'invoice_number', 'patient_name', 'patient_pid',
            'status', 'status_display', 'lab_id',
            'subtotal', 'discount_amount', 'tax_amount', 'total_amount',
            'amount_paid', 'amount_due', 'insurance_coverage', 'insurance_name',
            'created_at', 'due_date',
        ]


class InvoiceDetailSerializer(InvoiceListSerializer):
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    payments   = PaymentSerializer(many=True, read_only=True)

    class Meta(InvoiceListSerializer.Meta):
        fields = InvoiceListSerializer.Meta.fields + ['line_items', 'payments', 'notes', 'insurance_claim_no']


class RecordPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Payment
        fields = ['amount', 'method', 'reference_no', 'notes']

    def validate_amount(self, v):
        if v <= 0:
            raise serializers.ValidationError('Amount must be positive.')
        return v

    def create(self, validated_data):
        invoice  = self.context['invoice']
        request  = self.context['request']
        payment  = Payment.objects.create(
            invoice     = invoice,
            received_by = request.user,
            received_at = timezone.now(),
            **validated_data,
        )
        return payment
