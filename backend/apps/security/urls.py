from django.urls import path
from . import views

app_name = 'security'

urlpatterns = [
    path('',                       views.dashboard,            name='index'),
    path('rbac/',                  views.rbac_view,            name='rbac'),
    # API
    path('api/stats/',             views.api_security_stats,   name='api_stats'),
    path('api/audit-log/',         views.api_audit_log,        name='api_audit'),
    path('api/rbac-matrix/',       views.api_rbac_matrix,      name='api_rbac'),
    path('api/biometric/enroll/',  views.api_biometric_enroll, name='api_bio_enroll'),
    path('api/biometric/verify/',  views.api_biometric_verify, name='api_bio_verify'),
    path('api/behavioral/',        views.api_behavioral_event, name='api_behavioral'),
    path('api/threats/',           views.api_threat_feed,      name='api_threats'),
    path('api/pq-status/',         views.api_pq_status,        name='api_pq'),
]
