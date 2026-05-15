"""Laboratory serializers — Requests, Samples, Results"""
from rest_framework import serializers
from django.utils import timezone
from .models import LabRequest, RequestedTest, Sample, LabResult
from apps.core_config.models import TestCatalog, LaboratoryDepartment


class TestCatalogBriefSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_color = serializers.CharField(source='department.color_hex', read_only=True)
    tube_label_color = serializers.SerializerMethodField()

    class Meta:
        model = TestCatalog
        fields = [
            'id', 'code', 'name', 'short_name', 'department_name', 'department_color',
            'tube_type', 'tube_label_color', 'tat_hours', 'unit', 'reference_range',
        ]

    def get_tube_label_color(self, obj):
        colors = {
            'purple_edta':    '#9B59B6',
            'red_plain':      '#E74C3C',
            'yellow_sst':     '#F39C12',
            'blue_citrate':   '#2980B9',
            'green_heparin':  '#27AE60',
            'grey_fluoride':  '#95A5A6',
            'urine_container':'#F1C40F',
            'stool_container':'#784212',
            'swab':           '#EB984E',
        }
        return colors.get(obj.tube_type, '#BDC3C7')


class LabResultSerializer(serializers.ModelSerializer):
    test_name   = serializers.CharField(source='requested_test.test.name', read_only=True)
    test_unit   = serializers.CharField(source='requested_test.test.unit', read_only=True)
    ref_range   = serializers.CharField(source='requested_test.test.reference_range', read_only=True)
    entered_by_name   = serializers.CharField(source='entered_by.get_full_name', read_only=True)
    validated_by_name = serializers.CharField(source='validated_by.get_full_name', read_only=True, default=None)

    class Meta:
        model = LabResult
        fields = [
            'id', 'value', 'numeric_value', 'unit', 'reference_range',
            'flag', 'is_critical', 'is_abnormal',
            'ai_interpretation', 'technician_comment',
            'test_name', 'test_unit', 'ref_range',
            'entered_by_name', 'entered_at',
            'validated_by_name', 'validated_at', 'is_validated',
            'is_printed', 'sms_sent', 'email_sent',
        ]
        read_only_fields = [
            'id', 'flag', 'is_critical', 'is_abnormal',
            'test_name', 'test_unit', 'ref_range',
            'entered_by_name', 'entered_at', 'validated_by_name', 'validated_at',
            'is_validated', 'is_printed', 'sms_sent', 'email_sent',
        ]


class RequestedTestSerializer(serializers.ModelSerializer):
    test         = TestCatalogBriefSerializer(read_only=True)
    test_id      = serializers.PrimaryKeyRelatedField(
        queryset=TestCatalog.objects.filter(is_active=True), source='test', write_only=True
    )
    result       = LabResultSerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model  = RequestedTest
        fields = [
            'id', 'test', 'test_id', 'status', 'status_display',
            'started_at', 'completed_at', 'validated_at',
            'notes', 'result',
        ]
        read_only_fields = ['id', 'test', 'status_display', 'started_at', 'completed_at', 'validated_at', 'result']


class SampleSerializer(serializers.ModelSerializer):
    status_display  = serializers.CharField(source='get_status_display', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_abbr = serializers.CharField(source='department.abbreviation', read_only=True)
    department_color= serializers.CharField(source='department.color_hex', read_only=True)
    tat_elapsed     = serializers.IntegerField(source='tat_elapsed_minutes', read_only=True)
    tat_pct         = serializers.IntegerField(source='tat_percentage', read_only=True)
    tat_status      = serializers.CharField(read_only=True)
    collected_by_name = serializers.CharField(source='collected_by.get_full_name', read_only=True, default=None)

    class Meta:
        model  = Sample
        fields = [
            'id', 'sid', 'barcode', 'tube_type', 'specimen_type',
            'label_color', 'is_high_risk', 'biosafety_emoji',
            'status', 'status_display',
            'collection_time', 'received_time', 'tat_start', 'tat_deadline',
            'tat_elapsed', 'tat_pct', 'tat_status',
            'department_name', 'department_abbr', 'department_color',
            'collected_by_name', 'volume_ml', 'notes',
            'rejection_reason', 'created_at',
        ]
        read_only_fields = [
            'id', 'sid', 'barcode', 'label_color', 'status_display',
            'tat_elapsed', 'tat_pct', 'tat_status',
            'department_name', 'department_abbr', 'department_color',
            'collected_by_name', 'created_at',
        ]


class LabRequestListSerializer(serializers.ModelSerializer):
    patient_name    = serializers.CharField(source='patient.full_name', read_only=True)
    patient_pid     = serializers.CharField(source='patient.pid', read_only=True)
    patient_lab_id  = serializers.CharField(source='patient.unique_lab_id', read_only=True)
    patient_age     = serializers.CharField(source='patient.age', read_only=True)
    patient_gender  = serializers.CharField(source='patient.gender', read_only=True)
    patient_photo   = serializers.SerializerMethodField()
    test_names      = serializers.SerializerMethodField()
    test_count      = serializers.SerializerMethodField()
    status_display  = serializers.CharField(source='get_status_display', read_only=True)
    emergency_display = serializers.CharField(source='get_emergency_level_display', read_only=True)
    samples         = SampleSerializer(many=True, read_only=True)

    class Meta:
        model  = LabRequest
        fields = [
            'id', 'lab_id', 'status', 'status_display',
            'emergency_level', 'emergency_display',
            'patient_name', 'patient_pid', 'patient_lab_id',
            'patient_age', 'patient_gender', 'patient_photo',
            'doctor_name', 'ward', 'bed', 'clinical_info',
            'is_high_risk', 'biosafety_warning',
            'test_names', 'test_count', 'samples',
            'request_date', 'received_at', 'created_at',
        ]

    def get_patient_photo(self, obj):
        if obj.patient.photo:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.patient.photo.url) if request else obj.patient.photo.url
        return None

    def get_test_names(self, obj):
        return list(obj.requested_tests.select_related('test').values_list('test__short_name', flat=True))

    def get_test_count(self, obj):
        return obj.requested_tests.count()


class LabRequestDetailSerializer(LabRequestListSerializer):
    requested_tests = RequestedTestSerializer(many=True, read_only=True)

    class Meta(LabRequestListSerializer.Meta):
        fields = LabRequestListSerializer.Meta.fields + ['requested_tests', 'provisional_diagnosis']


class LabRequestCreateSerializer(serializers.ModelSerializer):
    test_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=TestCatalog.objects.filter(is_active=True),
        write_only=True, source='test_catalog_ids'
    )

    class Meta:
        model  = LabRequest
        fields = [
            'patient', 'hospital', 'doctor_name', 'ward', 'bed',
            'clinical_info', 'provisional_diagnosis', 'emergency_level',
            'is_high_risk', 'biosafety_warning', 'test_ids',
        ]

    def create(self, validated_data):
        import random, string
        from datetime import timedelta

        test_ids = validated_data.pop('test_catalog_ids', [])
        validated_data['requested_by'] = self.context['request'].user
        req = LabRequest.objects.create(**validated_data)

        for test in test_ids:
            RequestedTest.objects.create(request=req, test=test)

        # Auto-create samples grouped by (department, tube_type)
        TUBE_COLORS = {
            'purple_edta':    '#9B59B6', 'red_plain':      '#E74C3C',
            'yellow_sst':     '#F39C12', 'blue_citrate':   '#2980B9',
            'green_heparin':  '#27AE60', 'grey_fluoride':  '#95A5A6',
            'urine_container':'#F1C40F', 'stool_container':'#784212',
            'swab':           '#EB984E', 'other':          '#BDC3C7',
        }
        groups = {}
        for test in test_ids:
            key = (test.department_id, test.tube_type)
            if key not in groups:
                groups[key] = {
                    'dept':     test.department,
                    'tube_type': test.tube_type,
                    'specimen': test.specimen_type,
                    'max_tat':  0,
                    'tests':    [],
                }
            groups[key]['tests'].append(test)
            groups[key]['max_tat'] = max(groups[key]['max_tat'], float(test.tat_hours))

        now = timezone.now()
        today = now.date()
        for group in groups.values():
            dept = group['dept']
            seq = Sample.objects.filter(
                department=dept, created_at__date=today
            ).count() + 1
            sid = f"{dept.abbreviation}-{today.strftime('%m%d')}-{str(seq).zfill(3)}"

            while True:
                barcode = ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
                if not Sample.objects.filter(barcode=barcode).exists():
                    break

            Sample.objects.create(
                lab_request   = req,
                patient       = req.patient,
                department    = dept,
                sid           = sid,
                barcode       = barcode,
                tube_type     = group['tube_type'],
                specimen_type = group['specimen'],
                label_color   = TUBE_COLORS.get(group['tube_type'], '#BDC3C7'),
                is_high_risk  = req.is_high_risk,
                biosafety_emoji='☣️' if req.is_high_risk else '',
                status        = SampleStatus.PENDING,
                tat_start     = None,
                tat_deadline  = now + timedelta(hours=group['max_tat']),
            )

        return req


class ResultEntrySerializer(serializers.ModelSerializer):
    """Used by lab tech to enter a result for a specific requested test."""
    class Meta:
        model  = LabResult
        fields = ['value', 'numeric_value', 'unit', 'reference_range', 'technician_comment']

    def create(self, validated_data):
        rt  = self.context['requested_test']
        req = self.context['request']
        result, _ = LabResult.objects.update_or_create(
            requested_test=rt,
            defaults={
                **validated_data,
                'patient':    rt.request.patient,
                'entered_by': req.user,
                'entered_at': timezone.now(),
            },
        )
        self._auto_flag(result)
        rt.status     = 'completed'
        rt.completed_at = timezone.now()
        rt.save(update_fields=['status', 'completed_at'])
        return result

    def _auto_flag(self, result):
        if not result.numeric_value or not result.reference_range:
            return
        try:
            parts = result.reference_range.replace(' ', '').split('-')
            if len(parts) == 2:
                lo, hi = float(parts[0]), float(parts[1])
                v = result.numeric_value
                if   v > hi * 1.5 or v < lo * 0.5: result.flag = 'HH' if v > hi else 'LL'; result.is_critical = True; result.is_abnormal = True
                elif v > hi:                         result.flag = 'H';  result.is_abnormal = True
                elif v < lo:                         result.flag = 'L';  result.is_abnormal = True
                else:                                result.flag = 'N'
                result.save(update_fields=['flag', 'is_critical', 'is_abnormal'])
        except (ValueError, TypeError):
            pass
