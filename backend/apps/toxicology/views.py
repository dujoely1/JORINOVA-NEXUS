from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'toxicology.html', {
        'page_title': '☠️ Toxicology — ALIS-X',
        'today': timezone.now().date(),
    })
