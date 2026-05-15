"""Audit trail views — security admin access only."""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator
from .logger import get_stats


AUDIT_ROLES = {'super_admin', 'it_admin', 'security_officer'}


def _require_audit_role(view_func):
    """Decorator: only security admins can access audit views."""
    from functools import wraps
    from django.http import HttpResponseForbidden
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            from django.contrib.auth.views import redirect_to_login
            return redirect_to_login(request.path)
        role = getattr(request.user, 'role', '')
        if role not in AUDIT_ROLES and not request.user.is_superuser:
            return HttpResponseForbidden('🔒 Audit trail access restricted to security administrators.')
        return view_func(request, *args, **kwargs)
    return wrapper


@login_required
@_require_audit_role
def index(request):
    from .logger import get_stats
    return render(request, 'audit.html', {
        'page_title':   '🕵️ Audit Trail — NEXUS ALIS-X',
        'today':        timezone.now().date(),
        'logger_stats': get_stats(),
    })


@login_required
@_require_audit_role
@require_http_methods(['GET'])
def api_events(request):
    """Paginated audit event query."""
    from .models import AuditEvent
    qs = AuditEvent.objects.all()

    # Filters
    category   = request.GET.get('category')
    risk       = request.GET.get('risk_level')
    suspicious = request.GET.get('suspicious')
    user_id    = request.GET.get('user_id')
    date_from  = request.GET.get('date_from')
    date_to    = request.GET.get('date_to')
    search     = request.GET.get('q')

    if category:
        qs = qs.filter(category=category)
    if risk:
        qs = qs.filter(risk_level=risk)
    if suspicious == '1':
        qs = qs.filter(is_suspicious=True)
    if user_id:
        qs = qs.filter(user_id=user_id)
    if date_from:
        qs = qs.filter(timestamp__date__gte=date_from)
    if date_to:
        qs = qs.filter(timestamp__date__lte=date_to)
    if search:
        qs = qs.filter(description__icontains=search) | qs.filter(username__icontains=search) | qs.filter(action__icontains=search)

    page_size = min(int(request.GET.get('page_size', 50)), 200)
    paginator = Paginator(qs, page_size)
    page      = paginator.get_page(request.GET.get('page', 1))

    events = [{
        'id':          e.id,
        'event_id':    e.event_id,
        'category':    e.category,
        'action':      e.action,
        'description': e.description,
        'username':    e.username,
        'user_role':   e.user_role,
        'ip_address':  str(e.ip_address) if e.ip_address else None,
        'object_type': e.object_type,
        'object_id':   e.object_id,
        'risk_level':  e.risk_level,
        'anomaly_score': e.anomaly_score,
        'is_suspicious': e.is_suspicious,
        'is_violation':  e.is_violation,
        'event_hash':  e.event_hash,
        'timestamp':   e.timestamp.isoformat(),
        'module':      e.module,
    } for e in page]

    return JsonResponse({
        'events':     events,
        'total':      paginator.count,
        'pages':      paginator.num_pages,
        'page':       page.number,
    })


@login_required
@_require_audit_role
@require_http_methods(['GET'])
def api_incidents(request):
    """Security incidents from anomaly detector."""
    from .models import SecurityIncident
    qs = SecurityIncident.objects.all()[:100]
    data = [{
        'id':             i.id,
        'incident_id':    i.incident_id,
        'incident_type':  i.incident_type,
        'status':         i.status,
        'threat_level':   i.threat_level,
        'risk_score':     i.risk_score,
        'confidence_pct': i.confidence_pct,
        'title':          i.title,
        'description':    i.description,
        'ai_reasoning':   i.ai_reasoning,
        'affected_username': i.affected_username,
        'detected_at':    i.detected_at.isoformat(),
    } for i in qs]
    return JsonResponse({'incidents': data, 'count': len(data)})


@login_required
@_require_audit_role
@require_http_methods(['GET'])
def api_stats(request):
    """Audit system stats — buffer, write counts, integrity check."""
    from .models import AuditEvent, AuditBatch
    total    = AuditEvent.objects.count()
    batches  = AuditBatch.objects.count()
    suspicious = AuditEvent.objects.filter(is_suspicious=True).count()
    violations = AuditEvent.objects.filter(is_violation=True).count()
    return JsonResponse({
        'total_events':     total,
        'total_batches':    batches,
        'suspicious_count': suspicious,
        'violation_count':  violations,
        'buffer_stats':     get_stats(),
        'generated_at':     timezone.now().isoformat(),
    })
