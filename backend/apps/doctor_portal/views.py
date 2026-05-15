from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'doctor_portal.html', {
        'page_title': '🩺 Doctor Portal — ALIS-X',
        'today': timezone.now().date(),
    })
