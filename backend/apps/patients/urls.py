from django.urls import path
from . import views

app_name = 'patients'

urlpatterns = [
    path('hub/', views.patient_hub, name='hub'),
]
