from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'core_config.html', {
        'page_title': '⚙️ Core Configuration — ALIS-X',
        'today': timezone.now().date(),
    })
