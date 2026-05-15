"""Patient serializers — PatientHub API layer"""
from rest_framework import serializers
from .models import Patient, Guardian, InsuranceProfile


class GuardianSerializer(serializers.ModelSerializer):
    relationship_display = serializers.CharField(
        source='get_relationship_display', read_only=True
    )

    class Meta:
        model = Guardian
        fields = [
            'id', 'full_name', 'relationship', 'relationship_display',
            'phone', 'national_id', 'district', 'is_primary',
        ]
        read_only_fields = ['id', 'relationship_display']


class InsuranceProfileSerializer(serializers.ModelSerializer):
    payment_type_display = serializers.CharField(
        source='get_payment_type_display', read_only=True
    )

    class Meta:
        model = InsuranceProfile
        fields = [
            'id', 'payment_type', 'payment_type_display', 'insurance_name',
            'insurance_id', 'policy_number', 'coverage_percentage',
            'valid_from', 'valid_to', 'is_active',
        ]
        read_only_fields = ['id', 'payment_type_display']


class PatientListSerializer(serializers.ModelSerializer):
    age = serializers.CharField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id', 'pid', 'unique_lab_id', 'family_name', 'other_names',
            'full_name', 'date_of_birth', 'age', 'gender', 'phone',
            'district', 'photo_url', 'created_at',
        ]

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.photo.url) if request else obj.photo.url
        return None


class PatientDetailSerializer(serializers.ModelSerializer):
    age = serializers.CharField(read_only=True)
    age_years = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    guardians = GuardianSerializer(many=True, read_only=True)
    insurances = InsuranceProfileSerializer(many=True, read_only=True)
    photo_url = serializers.SerializerMethodField()
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    hiv_status_display = serializers.CharField(source='get_hiv_status_display', read_only=True)
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    lab_requests_count = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id', 'pid', 'unique_lab_id', 'record_number', 'archive_code',
            'family_name', 'other_names', 'full_name', 'date_of_birth', 'age', 'age_years',
            'gender', 'gender_display', 'person_id', 'phone', 'email',
            'address', 'district', 'province', 'nationality',
            'photo_url', 'blood_group', 'blood_group_display',
            'allergies', 'chronic_conditions', 'hiv_status', 'hiv_status_display',
            'is_inpatient', 'ward', 'bed_number',
            'guardians', 'insurances', 'lab_requests_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'pid', 'unique_lab_id', 'full_name', 'age', 'age_years',
            'photo_url', 'gender_display', 'hiv_status_display', 'blood_group_display',
            'guardians', 'insurances', 'lab_requests_count', 'created_at', 'updated_at',
        ]

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.photo.url) if request else obj.photo.url
        return None

    def get_lab_requests_count(self, obj):
        return obj.lab_requests.count()


class PatientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            'family_name', 'other_names', 'date_of_birth', 'gender',
            'person_id', 'phone', 'email', 'address', 'district', 'province',
            'nationality', 'photo', 'blood_group', 'allergies', 'chronic_conditions',
            'hiv_status', 'record_number', 'archive_code', 'hospital',
            'is_inpatient', 'ward', 'bed_number',
        ]

    def create(self, validated_data):
        validated_data['registered_by'] = self.context['request'].user
        return Patient.objects.create(**validated_data)
