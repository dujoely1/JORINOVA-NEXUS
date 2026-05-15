from django.urls import path
from . import views

app_name = 'staffhub'

urlpatterns = [
    path('', views.index, name='index'),
]
