from django.urls import path
from . import views

app_name = 'toxicology'
urlpatterns = [path('', views.index, name='index')]
