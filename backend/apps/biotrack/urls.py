from django.urls import path
from . import views

app_name = 'biotrack'

urlpatterns = [
    path('',                   views.dashboard,             name='index'),
    path('api/geotrack/',      views.api_geotrack,          name='api_geotrack'),
    path('api/drone/',         views.api_drone_assessment,  name='api_drone'),
    path('api/robot/',         views.api_robot_routing,     name='api_robot'),
    path('api/field/',         views.api_field_surveillance,name='api_field'),
    path('api/integrated/',    views.api_integrated_score,  name='api_integrated'),
]
