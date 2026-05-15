from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'notifications.html', {
        'page_title': '🔔 Notifications — ALIS-X',
        'today': timezone.now().date(),
    })
