from django.urls import path
from . import views

app_name = 'doctor_portal'
urlpatterns = [path('', views.index, name='index')]
