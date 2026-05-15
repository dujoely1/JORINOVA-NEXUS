from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'finaops.html', {
        'page_title': '💰 FinaOps — ALIS-X',
        'today': timezone.now().date(),
    })
