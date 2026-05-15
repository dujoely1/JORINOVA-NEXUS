from django.urls import path
from . import views

app_name = 'ai_nexus'

urlpatterns = [
    path('', views.index, name='index'),
]
