from django.conf import settings
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # Django's built-in admin, for maintenance only; the photographer uses the
    # dashboard in admin/. The path is configurable via DJANGO_ADMIN_PATH.
    path(settings.DJANGO_ADMIN_PATH, admin.site.urls),
    path("api/", include("gallery.urls")),
]

if settings.DEBUG:
    from django.conf.urls.static import static

    # Serves local-disk "public" files in development. The private originals
    # folder is deliberately not served.
    urlpatterns += static(f"{settings.MEDIA_URL}public/", document_root=settings.MEDIA_ROOT / "public")
