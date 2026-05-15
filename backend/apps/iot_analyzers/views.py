from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'iot_analyzers.html', {
        'page_title': '🔧 Analyzer & IoT Hub — ALIS-X',
        'today': timezone.now().date(),
    })
