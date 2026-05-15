from django.urls import path
from . import views

app_name = 'records'

urlpatterns = [
    path('',                              views.records_index,     name='index'),
    path('<str:book_type>/',              views.book_view,         name='book'),
    path('api/current-shift/',            views.api_current_shift, name='api_shift'),
    path('api/<str:book_type>/records/',  views.api_book_records,  name='api_records'),
]
