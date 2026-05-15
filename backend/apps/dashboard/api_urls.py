from django.urls import path
from . import views

urlpatterns = [
    path('stats/', views.api_dashboard_stats, name='dashboard_stats'),
    path('active-tats/', views.api_active_tats, name='dashboard_tats'),
]
