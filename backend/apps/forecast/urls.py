from django.urls import path
from . import views

app_name = 'forecast'

urlpatterns = [
    path('',                views.index,            name='index'),
    path('api/run/',        views.api_forecast,     name='api_run'),
    path('api/all/',        views.api_all_forecasts,name='api_all'),
    path('api/alerts/',     views.api_alerts,       name='api_alerts'),
]
