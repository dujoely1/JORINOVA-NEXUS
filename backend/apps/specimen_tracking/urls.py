from django.urls import path
from . import views

app_name = 'specimen_tracking'
urlpatterns = [path('', views.index, name='index')]
