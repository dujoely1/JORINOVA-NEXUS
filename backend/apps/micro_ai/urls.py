from django.urls import path
from . import views

app_name = 'micro_ai'

urlpatterns = [
    path('',                      views.dashboard,             name='index'),
    path('api/microscopy/',       views.api_microscopy_interpret, name='api_microscopy'),
    path('api/ast/',              views.api_ast_analysis,      name='api_ast'),
    path('api/triage/',           views.api_sample_triage,     name='api_triage'),
    path('api/reflex/',           views.api_reflex_engine,     name='api_reflex'),
    path('api/gram-trigger/',     views.api_gram_stain_trigger, name='api_gram'),
]
