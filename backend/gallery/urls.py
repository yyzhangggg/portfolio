from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("albums", views.AdminAlbumViewSet, basename="admin-album")
router.register("photos", views.AdminPhotoViewSet, basename="admin-photo")

admin_patterns = [
    path("auth/csrf/", views.CsrfView.as_view(), name="admin-csrf"),
    path("auth/login/", views.LoginView.as_view(), name="admin-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="admin-logout"),
    path("auth/me/", views.MeView.as_view(), name="admin-me"),
    path("auth/recover/", views.RecoverView.as_view(), name="admin-recover"),
    path("auth/password/", views.ChangePasswordView.as_view(), name="admin-change-password"),
    path("auth/recovery-codes/", views.RecoveryCodesView.as_view(), name="admin-recovery-codes"),
    path("uploads/", views.UploadView.as_view(), name="admin-upload"),
    path("dev-upload/", views.DevUploadView.as_view(), name="admin-dev-upload"),
    path("homepage/", views.AdminHomepageView.as_view(), name="admin-homepage"),
    path("profile/", views.AdminProfileView.as_view(), name="admin-profile"),
    path("", include(router.urls)),
]

public_patterns = [
    path("site/", views.PublicSiteView.as_view(), name="public-site"),
    path("albums/<slug:slug>/", views.PublicAlbumDetailView.as_view(), name="public-album"),
]

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("public/", include(public_patterns)),
    path("admin/", include(admin_patterns)),
]
