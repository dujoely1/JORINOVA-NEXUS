"""Inventory API views"""
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import InventoryItem, StockMovement, StockStatus, Supplier
from .serializers import (
    InventoryItemListSerializer, StockMovementSerializer,
    StockMovementCreateSerializer, SupplierSerializer,
)


class InventoryItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'category', 'cold_chain']
    search_fields      = ['code', 'name', 'brand', 'batch_number']
    ordering_fields    = ['name', 'current_stock', 'expiry_date', 'updated_at']
    ordering           = ['category', 'name']
    serializer_class   = InventoryItemListSerializer

    def get_queryset(self):
        qs = InventoryItem.objects.filter(is_active=True).select_related('department', 'supplier')
        hospital = getattr(self.request.user, 'hospital', None)
        if hospital:
            qs = qs.filter(hospital=hospital)
        dept = self.request.query_params.get('department')
        if dept:
            qs = qs.filter(department_id=dept)
        return qs

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        qs = self.get_queryset().filter(
            status__in=[StockStatus.LOW_STOCK, StockStatus.OUT_OF_STOCK, StockStatus.EXPIRING_SOON, StockStatus.EXPIRED]
        )
        return Response(InventoryItemListSerializer(qs, many=True).data)


class StockMovementViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields   = ['movement_type', 'item']
    ordering           = ['-performed_at']

    def get_queryset(self):
        return StockMovement.objects.select_related('item', 'performed_by', 'supplier')

    def get_serializer_class(self):
        if self.action == 'create':
            return StockMovementCreateSerializer
        return StockMovementSerializer


class SupplierViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = SupplierSerializer
    queryset           = Supplier.objects.filter(is_active=True).order_by('name')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_summary(request):
    hospital = getattr(request.user, 'hospital', None)
    qs = InventoryItem.objects.filter(is_active=True)
    if hospital:
        qs = qs.filter(hospital=hospital)
    agg = qs.aggregate(
        total       = Count('id'),
        low_stock   = Count('id', filter=Q(status=StockStatus.LOW_STOCK)),
        out_of_stock= Count('id', filter=Q(status=StockStatus.OUT_OF_STOCK)),
        expiring    = Count('id', filter=Q(status=StockStatus.EXPIRING_SOON)),
        expired     = Count('id', filter=Q(status=StockStatus.EXPIRED)),
    )
    today = timezone.now().date()
    cold_chain_at_risk = qs.filter(cold_chain=True, status__in=[StockStatus.OUT_OF_STOCK, StockStatus.EXPIRED]).count()
    return Response({**agg, 'cold_chain_at_risk': cold_chain_at_risk, 'date': today.isoformat()})
