from django.urls import path
from . import views

app_name = 'genomics'

urlpatterns = [
    path('', views.index, name='index'),
]
