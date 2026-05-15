"""Blood Bank views — Template + REST API"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    from .models import BloodBag, BagStatus, StorageUnit
    hospital = getattr(request.user, 'hospital', None)
    qs = BloodBag.objects.all()
    if hospital:
        qs = qs.filter(hospital=hospital)
    stats = {
        'total_available': qs.filter(status=BagStatus.AVAILABLE).count(),
        'expiring_3days':  qs.filter(status=BagStatus.AVAILABLE,
                                     expiry_date__lte=timezone.now().date() + timezone.timedelta(days=3)).count(),
        'in_quarantine':   qs.filter(status=BagStatus.QUARANTINE).count(),
        'in_transit':      qs.filter(status=BagStatus.IN_TRANSIT).count(),
    }
    storage_units = StorageUnit.objects.filter(is_active=True)
    if hospital:
        storage_units = storage_units.filter(hospital=hospital)

    from .models import BloodGroup
    group_stock = {}
    for bg in BloodGroup.values:
        group_stock[bg] = qs.filter(blood_group=bg, status=BagStatus.AVAILABLE).count()

    return render(request, 'bloodbank.html', {
        'page_title':    '🩸 Blood Bank — ALIS-X',
        'today':         timezone.now().date(),
        'stats':         stats,
        'storage_units': storage_units,
        'group_stock':   group_stock,
    })


@login_required
def haemovigilance(request):
    return render(request, 'haemovigilance.html', {
        'page_title': '🛡️ Haemovigilance — ALIS-X',
        'today':      timezone.now().date(),
    })
