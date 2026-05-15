"""Patient Hub views — template + REST API"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Patient, Guardian, InsuranceProfile, District
from .serializers import (
    PatientListSerializer, PatientDetailSerializer, PatientCreateSerializer,
    GuardianSerializer, InsuranceProfileSerializer,
)


@login_required
def patient_hub(request):
    hospital = getattr(request.user, 'hospital', None)
    from apps.core_config.models import Hospital
    hospitals = Hospital.objects.filter(is_active=True) if not hospital else []
    return render(request, 'patient_hub.html', {
        'page_title': 'Patient Hub — ALIS-X',
        'active_module': 'patients',
        'hospitals': hospitals,
        'districts': District.choices,
    })


class PatientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = Patient.objects.select_related('hospital', 'registered_by').prefetch_related(
            'guardians', 'insurances'
        )
        hospital = getattr(self.request.user, 'hospital', None)
        if hospital:
            qs = qs.filter(hospital=hospital)
        return qs.order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'create':
            return PatientCreateSerializer
        if self.action in ['retrieve', 'update', 'partial_update']:
            return PatientDetailSerializer
        return PatientListSerializer

    @action(detail=False, methods=['get'])
    def search(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response([])
        qs = self.get_queryset().filter(
            Q(pid__icontains=q) |
            Q(unique_lab_id__icontains=q) |
            Q(family_name__icontains=q) |
            Q(other_names__icontains=q) |
            Q(person_id__icontains=q) |
            Q(phone__icontains=q) |
            Q(record_number__icontains=q)
        )[:20]
        return Response(
            PatientListSerializer(qs, many=True, context={'request': request}).data
        )

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        patient = self.get_object()
        try:
            from apps.laboratory.models import LabRequest
            recent = LabRequest.objects.filter(patient=patient).prefetch_related(
                'requested_tests__test'
            ).order_by('-request_date')[:5]
            recent_labs = [
                {
                    'id': lr.id,
                    'lab_id': lr.lab_id,
                    'date': lr.request_date.strftime('%d %b %Y %H:%M'),
                    'status': lr.status,
                    'emergency_level': lr.emergency_level,
                    'tests': [rt.test.name for rt in lr.requested_tests.all()],
                }
                for lr in recent
            ]
        except Exception:
            recent_labs = []

        active_ins = patient.insurances.filter(is_active=True).first()
        primary_g = patient.guardians.filter(is_primary=True).first()

        data = PatientDetailSerializer(patient, context={'request': request}).data
        data['recent_lab_requests'] = recent_labs
        data['active_insurance'] = InsuranceProfileSerializer(active_ins).data if active_ins else None
        data['primary_guardian'] = GuardianSerializer(primary_g).data if primary_g else None
        return Response(data)

    @action(detail=True, methods=['get', 'post'])
    def guardians(self, request, pk=None):
        patient = self.get_object()
        if request.method == 'POST':
            ser = GuardianSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            ser.save(patient=patient)
            return Response(ser.data, status=status.HTTP_201_CREATED)
        return Response(GuardianSerializer(patient.guardians.all(), many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def insurance(self, request, pk=None):
        patient = self.get_object()
        if request.method == 'POST':
            ser = InsuranceProfileSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            ser.save(patient=patient)
            return Response(ser.data, status=status.HTTP_201_CREATED)
        return Response(InsuranceProfileSerializer(patient.insurances.all(), many=True).data)
