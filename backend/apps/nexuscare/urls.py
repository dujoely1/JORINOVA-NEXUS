from django.urls import path
from . import views

app_name = 'nexuscare'

urlpatterns = [
    path('', views.index, name='index'),
]
