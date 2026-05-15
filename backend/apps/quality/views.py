from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'quality.html', {
        'page_title': '📐 Quality Management — ALIS-X',
        'today': timezone.now().date(),
    })
