"""Session timeout middleware."""
from django.utils import timezone
from django.conf import settings
from django.shortcuts import redirect
from django.contrib.auth import logout


class SessionTimeoutMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            last = request.session.get('last_activity')
            timeout = getattr(settings, 'SESSION_COOKIE_AGE', 3600)
            if last:
                from datetime import datetime
                last_dt = datetime.fromisoformat(last)
                elapsed = (timezone.now().replace(tzinfo=None) - last_dt).total_seconds()
                if elapsed > timeout:
                    logout(request)
                    return redirect(f"{settings.LOGIN_URL}?timeout=1")
            request.session['last_activity'] = timezone.now().replace(tzinfo=None).isoformat()
        return self.get_response(request)
