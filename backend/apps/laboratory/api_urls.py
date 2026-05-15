from rest_framework.routers import DefaultRouter
from .views import LabRequestViewSet, SampleViewSet, LabResultViewSet, TestCatalogViewSet, DepartmentViewSet

router = DefaultRouter()
router.register('requests',    LabRequestViewSet,  basename='lab-request')
router.register('samples',     SampleViewSet,      basename='sample')
router.register('results',     LabResultViewSet,   basename='lab-result')
router.register('tests',       TestCatalogViewSet, basename='test-catalog')
router.register('departments', DepartmentViewSet,  basename='lab-department')

urlpatterns = router.urls
