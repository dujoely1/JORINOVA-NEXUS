from django.urls import path
from . import views

app_name = 'telediagnostic'

urlpatterns = [
    path('',                          views.manager_dashboard, name='index'),
    path('field/<str:session_code>/', views.field_view,        name='field'),
    # API
    path('api/sessions/create/',                    views.api_create_session,  name='api_create'),
    path('api/sessions/',                           views.api_list_sessions,   name='api_list'),
    path('api/sessions/<str:session_code>/',        views.api_session_detail,  name='api_detail'),
    path('api/sessions/<str:session_code>/close/',  views.api_close_session,   name='api_close'),
    path('api/capture/',                            views.api_submit_capture,  name='api_capture'),
    path('api/trigger-camera/',                     views.api_trigger_camera,  name='api_trigger'),
]
