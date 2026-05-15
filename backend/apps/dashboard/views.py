"""Main dashboard views — operational statistics and widgets"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
from django.db.models import Count, Q
import json
from datetime import timedelta


@login_required
def index(request):
    from apps.patients.models import Patient
    from apps.laboratory.models import LabRequest, Sample
    from apps.laboratory.models import SampleStatus

    today = timezone.now().date()
    user = request.user

    context = {
        'page_title': 'Operational Dashboard — ALIS-X',
        'user': user,
        'today': today,
        'today_patients': Patient.objects.filter(created_at__date=today).count(),
        'pending_tests': LabRequest.objects.filter(
            status__in=['submitted', 'received', 'processing']
        ).count(),
        'completed_today': LabRequest.objects.filter(
            status='validated', updated_at__date=today
        ).count(),
        'active_samples': Sample.objects.filter(
            status__in=[SampleStatus.RECEIVED, SampleStatus.PROCESSING]
        ).count(),
        'critical_alerts': LabRequest.objects.filter(
            requested_tests__result__is_critical=True,
            requested_tests__result__sms_sent=False
        ).distinct().count(),
    }
    return render(request, 'index.html', context)


@login_required
def api_dashboard_stats(request):
    """Real-time stats API for dashboard charts."""
    from apps.patients.models import Patient
    from apps.laboratory.models import LabRequest, Sample
    from apps.core_config.models import LaboratoryDepartment

    today = timezone.now().date()
    week_ago = today - timedelta(days=7)

    dept_stats = []
    for dept in LaboratoryDepartment.objects.filter(is_active=True):
        count = LabRequest.objects.filter(
            requested_tests__test__department=dept,
            request_date__date=today
        ).distinct().count()
        dept_stats.append({'name': dept.name, 'count': count, 'color': dept.color_hex})

    daily_counts = []
    for i in range(7):
        day = today - timedelta(days=6 - i)
        count = LabRequest.objects.filter(request_date__date=day).count()
        daily_counts.append({'date': day.strftime('%a'), 'count': count})

    return JsonResponse({
        'department_pie': dept_stats,
        'daily_bar': daily_counts,
        'today_total': Patient.objects.filter(created_at__date=today).count(),
        'pending': LabRequest.objects.filter(status__in=['submitted', 'received', 'processing']).count(),
        'completed': LabRequest.objects.filter(status='validated', updated_at__date=today).count(),
        'timestamp': timezone.now().isoformat(),
    })


@login_required
def api_active_tats(request):
    """Active TAT timers for dashboard widget."""
    from apps.laboratory.models import Sample, SampleStatus
    samples = Sample.objects.filter(
        status__in=[SampleStatus.RECEIVED, SampleStatus.PROCESSING],
        tat_start__isnull=False
    ).select_related('patient', 'department')[:20]

    data = []
    for s in samples:
        data.append({
            'sid': s.sid,
            'patient': s.patient.full_name,
            'department': s.department.name,
            'elapsed': s.tat_elapsed_minutes,
            'percentage': s.tat_percentage,
            'status': s.tat_status,
            'deadline': s.tat_deadline.isoformat() if s.tat_deadline else None,
        })
    return JsonResponse({'tats': data})
