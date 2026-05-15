"""
JORINOVA NEXUS ALIS-X — Stealth Audit Middleware
Silently captures every HTTP request/response — adds < 0.1ms overhead.
Uses the ring buffer — NEVER synchronous DB writes.
"""
import time
from .logger import record


class NexusStealthMiddleware:
    """
    Lightweight middleware that auto-records:
    - Authentication events (login/logout)
    - API calls
    - Security violations (403/401)
    - Critical data access (result release, patient data, blood bank)
    - Configuration changes
    """

    # Paths to IGNORE completely (static, health checks, noise)
    IGNORE_PREFIXES = (
        '/static/', '/media/', '/favicon', '/health',
        '/admin/jsi18n/', '/__debug__/',
    )

    # Paths that always trigger audit regardless of method
    ALWAYS_AUDIT_PATHS = (
        '/api/v1/lab/requests/', '/api/v1/patients/', '/api/v1/billing/',
        '/blood-bank/', '/auth/', '/security/', '/audit/',
    )

    CATEGORY_MAP = {
        '/auth/login':       'auth',
        '/auth/logout':      'auth',
        '/api/v1/patients':  'patient',
        '/api/v1/lab/':      'result',
        '/blood-bank/':      'blood_bank',
        '/security/':        'security',
        '/api/v1/billing/':  'billing',
        '/inventory/':       'inventory',
        '/core-config/':     'config',
        '/audit/':           'security',
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Check ignore list
        path = request.path
        if any(path.startswith(p) for p in self.IGNORE_PREFIXES):
            return self.get_response(request)

        t0 = time.monotonic()
        response = self.get_response(request)
        duration_ms = int((time.monotonic() - t0) * 1000)

        # Only audit interesting paths and methods
        if self._should_audit(request, response):
            self._record_request(request, response, duration_ms)

        return response

    def _should_audit(self, request, response) -> bool:
        path   = request.path
        method = request.method
        status = response.status_code

        # Always audit security events
        if status in (401, 403, 429):
            return True
        # Always audit auth paths
        if '/auth/' in path:
            return True
        # Always audit write operations
        if method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return True
        # Audit certain always-audit paths on GET too
        if any(path.startswith(p) for p in self.ALWAYS_AUDIT_PATHS):
            return True
        return False

    def _record_request(self, request, response, duration_ms: int):
        path   = request.path
        status = response.status_code
        method = request.method

        # Determine category
        category = 'api'
        for prefix, cat in self.CATEGORY_MAP.items():
            if path.startswith(prefix):
                category = cat
                break

        # Risk assessment
        risk = 'low'
        if status in (401, 403):
            risk = 'high'
        elif status >= 500:
            risk = 'medium'
        elif method == 'DELETE':
            risk = 'high'
        elif '/blood-bank/' in path or '/security/' in path:
            risk = 'medium'

        action = f"{method.lower()}.{category}"
        desc   = f"{method} {path} → HTTP {status} ({duration_ms}ms)"

        record(
            category    = category,
            action      = action,
            description = desc,
            request     = request,
            risk_level  = risk,
            module      = category,
            extra       = {
                'http_status': status,
                'duration_ms': duration_ms,
                'request_path': path,
                'request_method': method,
                'is_violation': status in (401, 403),
            },
            dedup_key = f"{category}:{method}:{path}:{getattr(request, 'user', None) and request.user.pk}",
        )


class SilentAuditMiddleware(NexusStealthMiddleware):
    """Alias used in settings.py — same as NexusStealthMiddleware."""
    pass
