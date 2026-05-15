import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
import apps.notifications.routing as notifications_routing
import apps.laboratory.routing as lab_routing
import apps.telediagnostic.routing as telediag_routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nexus_core.settings.development')

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(
                notifications_routing.websocket_urlpatterns +
                lab_routing.websocket_urlpatterns +
                telediag_routing.websocket_urlpatterns
            )
        )
    ),
})
