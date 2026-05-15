from django.urls import path
from . import views

app_name = 'iot_analyzers'
urlpatterns = [path('', views.index, name='index')]
