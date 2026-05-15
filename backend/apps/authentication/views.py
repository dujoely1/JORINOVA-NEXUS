"""Authentication views — Login, Logout, Profile"""
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
from django.utils import timezone
from django.conf import settings
from django.contrib import messages
import json

from .models import NexusUser, LoginLog
from apps.core_config.models import Hospital


def get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0]
    return request.META.get('REMOTE_ADDR')


@require_http_methods(['GET', 'POST'])
def login_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard:index')

    hospital = Hospital.objects.filter(is_active=True).first()
    context = {
        'hospital': hospital,
        'hospital_name': hospital.name if hospital else settings.HOSPITAL_NAME,
        'hospital_logo': hospital.logo.url if (hospital and hospital.logo) else None,
        'page_title': 'Secure Login — ALIS-X',
        'system_version': settings.SYSTEM_VERSION,
        'session_timeout': request.GET.get('timeout') == '1',
    }

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '').strip()
        remember_me = request.POST.get('remember_me', False)

        try:
            user_obj = NexusUser.objects.get(username=username)
        except NexusUser.DoesNotExist:
            try:
                user_obj = NexusUser.objects.get(employee_id=username)
                username = user_obj.username
            except NexusUser.DoesNotExist:
                user_obj = None

        if user_obj and user_obj.is_locked:
            context['error'] = 'Account temporarily locked. Please contact administrator.'
            return render(request, 'login.html', context)

        user = authenticate(request, username=username, password=password)

        if user:
            user.login_attempts = 0
            user.locked_until = None
            user.save(update_fields=['login_attempts', 'locked_until'])

            login(request, user)
            user.record_activity()

            LoginLog.objects.create(
                user=user, ip_address=get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                success=True, method='password'
            )

            if not remember_me:
                request.session.set_expiry(0)
            else:
                request.session.set_expiry(settings.SESSION_COOKIE_AGE)

            next_url = request.GET.get('next', '/dashboard/')
            return redirect(next_url)
        else:
            if user_obj:
                user_obj.login_attempts += 1
                max_attempts = settings.MAX_LOGIN_ATTEMPTS
                if user_obj.login_attempts >= max_attempts:
                    from datetime import timedelta
                    user_obj.locked_until = timezone.now() + timedelta(minutes=30)
                user_obj.save(update_fields=['login_attempts', 'locked_until'])

                LoginLog.objects.create(
                    user=user_obj, ip_address=get_client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                    success=False, method='password'
                )

                remaining = settings.MAX_LOGIN_ATTEMPTS - user_obj.login_attempts
                if remaining <= 0:
                    context['error'] = 'Account locked for 30 minutes due to too many failed attempts.'
                else:
                    context['error'] = f'Invalid credentials. {remaining} attempt(s) remaining.'
            else:
                context['error'] = 'Invalid username or password.'

    return render(request, 'login.html', context)


@login_required
def logout_view(request):
    logout(request)
    inactivity = request.POST.get('inactivity') or request.GET.get('inactivity')
    if inactivity:
        return redirect('/auth/login/?timeout=1')
    return redirect('auth:login')


@login_required
def profile_view(request):
    return render(request, 'profile.html', {'page_title': 'My Profile'})


def api_check_voice_user(request):
    """Verify voice command speaker identity."""
    if request.method == 'POST':
        data = json.loads(request.body)
        voice_code = data.get('voice_code', '').lower()
        try:
            user = NexusUser.objects.get(voice_code__iexact=voice_code, is_active=True)
            return JsonResponse({'valid': True, 'user': user.get_full_name(), 'role': user.get_role_display()})
        except NexusUser.DoesNotExist:
            return JsonResponse({'valid': False, 'message': 'Voice identity not recognized'})
    return JsonResponse({'error': 'Method not allowed'}, status=405)
