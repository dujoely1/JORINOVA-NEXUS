from django.urls import path
from . import views

app_name = 'pathology'
urlpatterns = [path('', views.index, name='index')]
