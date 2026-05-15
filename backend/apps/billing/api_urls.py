from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import api_views

router = DefaultRouter()
router.register('invoices',  api_views.InvoiceViewSet,          basename='invoice')
router.register('providers', api_views.InsuranceProviderViewSet, basename='insurance-provider')

urlpatterns = [
    path('', include(router.urls)),
    path('summary/', api_views.billing_summary, name='billing-summary'),
]
