"""JORINOVA NEXUS ALIS-X — NexusCore URL Configuration"""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('nexuscore-admin/', admin.site.urls),
    path('auth/', include('apps.authentication.urls', namespace='auth')),
    path('dashboard/', include('apps.dashboard.urls', namespace='dashboard')),
    path('patients/', include('apps.patients.urls', namespace='patients')),
    path('reception/', include('apps.reception.urls', namespace='reception')),
    path('laboratory/', include('apps.laboratory.urls', namespace='laboratory')),
    path('billing/', include('apps.billing.urls', namespace='billing')),
    path('inventory/', include('apps.inventory.urls', namespace='inventory')),
    path('reports/', include('apps.reports.urls', namespace='reports')),
    path('notifications/', include('apps.notifications.urls', namespace='notifications')),
    # Extended Modules
    path('staffhub/',    include('apps.staffhub.urls',    namespace='staffhub')),
    path('genomics/',    include('apps.genomics.urls',    namespace='genomics')),
    path('surveillance/',include('apps.surveillance.urls',namespace='surveillance')),
    path('finaops/',     include('apps.finaops.urls',     namespace='finaops')),
    path('nexuscare/',   include('apps.nexuscare.urls',   namespace='nexuscare')),
    path('ai-nexus/',        include('apps.ai_nexus.urls',        namespace='ai_nexus')),
    path('telediagnostic/',  include('apps.telediagnostic.urls',  namespace='telediagnostic')),
    path('security/',        include('apps.security.urls',        namespace='security')),
    path('records/',         include('apps.records.urls',         namespace='records')),
    path('micro-ai/',        include('apps.micro_ai.urls',        namespace='micro_ai')),
    path('biotrack/',        include('apps.biotrack.urls',        namespace='biotrack')),
    path('blood-bank/',      include('apps.bloodbank.urls',       namespace='bloodbank')),
    # Clinical AI Modules
    path('hematology/',        include('apps.hematology.urls',        namespace='hematology')),
    path('quality/',           include('apps.quality.urls',           namespace='quality')),
    path('toxicology/',        include('apps.toxicology.urls',        namespace='toxicology')),
    path('iot-analyzers/',     include('apps.iot_analyzers.urls',     namespace='iot_analyzers')),
    path('pathology/',         include('apps.pathology.urls',         namespace='pathology')),
    path('interoperability/',  include('apps.interoperability.urls',  namespace='interoperability')),
    path('doctor-portal/',     include('apps.doctor_portal.urls',     namespace='doctor_portal')),
    path('core-config/',       include('apps.core_config.urls',       namespace='core_config')),
    path('specimen-tracking/', include('apps.specimen_tracking.urls', namespace='specimen_tracking')),
    path('forecast/',          include('apps.forecast.urls',          namespace='forecast')),
    path('audit-trail/',       include('apps.audit.urls',             namespace='audit')),
    # API
    path('api/v1/', include([
        path('auth/', include('apps.authentication.api_urls')),
        path('patients/', include('apps.patients.api_urls')),
        path('reception/', include('apps.reception.api_urls')),
        path('laboratory/', include('apps.laboratory.api_urls')),
        path('billing/', include('apps.billing.api_urls')),
        path('inventory/', include('apps.inventory.api_urls')),
        path('dashboard/', include('apps.dashboard.api_urls')),
        path('notifications/', include('apps.notifications.api_urls')),
    ])),
    # Root redirect
    path('', RedirectView.as_view(url='/auth/login/', permanent=False), name='root'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
