from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/telediag/(?P<session_code>[A-Z0-9]+)/$', consumers.TeleDiagConsumer.as_asgi()),
]
