from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils import timezone


@login_required
def index(request):
    return render(request, 'billing.html', {
        'page_title': '💠 Billing — ALIS-X',
        'today': timezone.now().date(),
    })
