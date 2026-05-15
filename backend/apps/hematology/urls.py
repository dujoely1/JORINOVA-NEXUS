from django.urls import path
from . import views

app_name = 'hematology'
urlpatterns = [path('', views.index, name='index')]
