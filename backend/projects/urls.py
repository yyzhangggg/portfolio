from rest_framework.routers import DefaultRouter

from .views import PublishedProjectViewSet

router = DefaultRouter()
router.register("projects", PublishedProjectViewSet, basename="project")

urlpatterns = router.urls