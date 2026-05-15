"""Reception views — New lab request + queue + phlebotomy collection"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    """Reception desk — create requests and manage today's queue."""
    from apps.core_config.models import LaboratoryDepartment
    departments = LaboratoryDepartment.objects.filter(is_active=True).order_by('order')
    return render(request, 'reception.html', {
        'page_title':  'Reception — ALIS-X',
        'departments': departments,
        'today':       timezone.now().date(),
    })


@login_required
def phlebotomy(request):
    """Phlebotomy collection queue — sample collection and labeling."""
    from apps.core_config.models import LaboratoryDepartment
    departments = LaboratoryDepartment.objects.filter(is_active=True).order_by('order')
    return render(request, 'phlebotomy.html', {
        'page_title':  'Phlebotomy — ALIS-X',
        'departments': departments,
        'today':       timezone.now().date(),
    })
