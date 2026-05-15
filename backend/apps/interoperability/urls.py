from django.urls import path
from . import views

app_name = 'interoperability'
urlpatterns = [path('', views.index, name='index')]
