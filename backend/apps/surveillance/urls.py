from django.urls import path
from . import views

app_name = 'surveillance'

urlpatterns = [
    path('', views.index, name='index'),
]
