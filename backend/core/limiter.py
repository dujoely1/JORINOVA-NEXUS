"""Shared rate limiter (slowapi).

A single Limiter instance imported by both main.py (which registers the
exception handler + app.state) and the routers (which decorate hot endpoints
like /auth/token with `@limit("5/minute")`).

If slowapi is not installed, `limiter` is None and `limit()` is a no-op
decorator, so the app still runs (rate limiting simply disabled).
"""
from __future__ import annotations

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address, default_limits=['200/minute'])

    def limit(rule: str):
        """Per-route limit decorator backed by the shared Limiter."""
        return limiter.limit(rule)

except Exception:                                   # slowapi absent
    limiter = None                                  # type: ignore[assignment]

    def limit(rule: str):                           # type: ignore[misc]
        def _noop(fn):
            return fn
        return _noop
