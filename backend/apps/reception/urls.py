from django.urls import path
from . import views

app_name = 'reception'

urlpatterns = [
    path('',             views.index,       name='index'),
    path('phlebotomy/',  views.phlebotomy,  name='phlebotomy'),
]
