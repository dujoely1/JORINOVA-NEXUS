from django.urls import path
from . import views

app_name = 'bloodbank'

urlpatterns = [
    path('',                views.index,          name='index'),
    path('haemovigilance/', views.haemovigilance, name='haemovigilance'),
]
