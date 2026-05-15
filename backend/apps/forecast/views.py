from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
import json

from .engine import run_forecast, ensemble_forecast, _build_demo_history
from .models import ForecastDomain, ForecastPrediction, ForecastAlert


@login_required
def index(request):
    return render(request, 'forecast.html', {
        'page_title': '🔮 Forecast Intelligence — ALIS-X',
        'today':      timezone.now().date(),
        'domains':    ForecastDomain.choices,
    })


@login_required
@require_http_methods(['GET', 'POST'])
def api_forecast(request):
    """API: run a forecast for a given domain and return predictions as JSON."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            data = {}
    else:
        data = request.GET

    domain       = data.get('domain', 'lab_workload')
    horizon_days = int(data.get('horizon_days', 7))
    algorithm    = data.get('algorithm', 'ensemble')
    historical   = data.get('historical', None)

    if isinstance(historical, list) and len(historical) >= 5:
        hist_data = [float(v) for v in historical]
    else:
        hist_data = None

    try:
        if algorithm == 'ensemble':
            result = ensemble_forecast(domain, horizon_days, hist_data)
        else:
            result = run_forecast(domain, horizon_days, hist_data, algorithm)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse(result)


@login_required
@require_http_methods(['GET'])
def api_all_forecasts(request):
    """Return a quick summary forecast for all 14 domains — for dashboard tiles."""
    horizon_days = int(request.GET.get('horizon_days', 7))
    results = {}
    for domain, label in ForecastDomain.choices:
        try:
            r = ensemble_forecast(domain, horizon_days)
            results[domain] = {
                'label':          label,
                'trend':          r['trend_direction'],
                'trend_emoji':    {'up':'📈','down':'📉','stable':'➡️','spike':'⚡','drop':'⬇️'}.get(r['trend_direction'],'➡️'),
                'confidence_pct': r['confidence_pct'],
                'alert_level':    r['alert_level'],
                'alert_triggered':r['alert_triggered'],
                'peak_value':     r['peak_value'],
                'pct_change':     r['pct_change_recent'],
                'explanation':    r['explanation'],
                'next_7_days':    [p['value'] for p in r['predicted_values'][:7]],
            }
        except Exception as e:
            results[domain] = {'label': label, 'error': str(e), 'alert_level': 'info'}
    return JsonResponse({'forecasts': results, 'generated_at': timezone.now().isoformat()})


@login_required
@require_http_methods(['GET'])
def api_alerts(request):
    """Return active (unacknowledged) forecast alerts."""
    alerts = ForecastAlert.objects.filter(is_acknowledged=False).order_by('-created_at')[:50]
    data = [{
        'id':         a.id,
        'domain':     a.domain,
        'severity':   a.severity,
        'title':      a.title,
        'message':    a.message,
        'recommendation': a.recommendation,
        'confidence': a.confidence_pct,
        'created_at': a.created_at.isoformat(),
    } for a in alerts]
    return JsonResponse({'alerts': data, 'count': len(data)})
