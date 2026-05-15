from django.urls import path
from . import views

app_name = 'audit'

urlpatterns = [
    path('',                 views.index,         name='index'),
    path('api/events/',      views.api_events,    name='api_events'),
    path('api/incidents/',   views.api_incidents, name='api_incidents'),
    path('api/stats/',       views.api_stats,     name='api_stats'),
]
