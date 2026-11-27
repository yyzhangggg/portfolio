import logging
from datetime import timezone as dt_timezone

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.core import signing
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Album, HomepageSettings, PhotographerProfile, Photo, delete_public_keys
from .serializers import (
    AdminAlbumSerializer,
    AdminHomepageSerializer,
    AdminPhotoSerializer,
    AdminProfileSerializer,
    BulkPhotoSerializer,
    IdsSerializer,
    PhotoCreateSerializer,
    PublicAlbumDetailSerializer,
    PublicAlbumSerializer,
    PublicHomepageSerializer,
    PublicPhotographerSerializer,
    UploadRequestSerializer,
)
from .storage import DEV_UPLOAD_SALT, PRIVATE, LocalStorage, get_storage
from .uploads import check_uploaded, create_upload, process_image_upload

logger = logging.getLogger(__name__)

EXIF_MODEL_FIELDS = ("camera", "lens", "focal_length", "aperture", "shutter_speed", "iso", "taken_at")


class HealthView(APIView):
    """For the keep-alive pinger. No database access."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


# --- Public -----------------------------------------------------------------


def resolve_photographer(request) -> PhotographerProfile:
    slug = request.query_params.get("photographer") or settings.DEFAULT_PHOTOGRAPHER_SLUG
    if slug:
        return get_object_or_404(PhotographerProfile.objects.select_related("user"), slug=slug)
    profiles = list(PhotographerProfile.objects.select_related("user")[:2])
    if len(profiles) != 1:
        raise Http404("Specify ?photographer=<slug>.")
    return profiles[0]


def public_albums(owner):
    published = Photo.objects.filter(is_published=True)
    albums = (
        Album.objects.filter(owner=owner, is_published=True)
        .annotate(photo_count=Count("photos", filter=Q(photos__is_published=True)))
        .filter(photo_count__gt=0)
        .select_related("cover")
        .prefetch_related(Prefetch("photos", queryset=published, to_attr="public_photos"))
    )
    result = []
    for album in albums:
        cover = album.cover if (album.cover_id and album.cover.is_published) else None
        album.public_cover = cover or (album.public_photos[0] if album.public_photos else None)
        result.append(album)
    return result


class PublicSiteView(APIView):
    """Everything the home page needs in one request."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        profile = resolve_photographer(request)
        homepage, _ = HomepageSettings.objects.get_or_create(owner=profile.user)
        return Response(
            {
                "photographer": PublicPhotographerSerializer(profile).data,
                "homepage": PublicHomepageSerializer(homepage).data,
                "albums": PublicAlbumSerializer(public_albums(profile.user), many=True).data,
            }
        )


class PublicAlbumDetailView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        profile = resolve_photographer(request)
        for album in public_albums(profile.user):
            if album.slug == slug:
                return Response(PublicAlbumDetailSerializer(album).data)
        raise Http404


# --- Admin: auth ------------------------------------------------------------


def photographer_of(user):
    if not user.is_authenticated:
        return None
    try:
        return user.photographer
    except PhotographerProfile.DoesNotExist:
        return None


class IsPhotographer(permissions.BasePermission):
    message = "Log in with a photographer account."

    def has_permission(self, request, view):
        return photographer_of(request.user) is not None and request.user.is_active


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the csrftoken cookie. Call once before logging in."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"ok": True})


def me_payload(user):
    profile = photographer_of(user)
    if profile is None:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "username": user.get_username(),
        "photographer": {"slug": profile.slug, "display_name": profile.display_name},
    }


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        user = authenticate(request, username=username, password=password)
        if user is None or photographer_of(user) is None:
            return Response({"detail": "Incorrect username or password."}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        return Response(me_payload(user))


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(me_payload(request.user))


# --- Admin: uploads ---------------------------------------------------------


class UploadView(APIView):
    permission_classes = [IsPhotographer]

    def post(self, request):
        data = UploadRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        result = create_upload(request.user, data.validated_data["kind"], data.validated_data["content_type"], data.validated_data["size"])
        return Response(result, status=status.HTTP_201_CREATED)


class DevUploadView(APIView):
    """Stands in for a presigned R2 PUT when using local storage (development)."""

    permission_classes = [IsPhotographer]

    def put(self, request):
        storage = get_storage()
        if not isinstance(storage, LocalStorage):
            raise Http404
        try:
            info = signing.loads(request.query_params.get("token", ""), salt=DEV_UPLOAD_SALT, max_age=settings.PRESIGNED_URL_EXPIRY_SECONDS)
        except signing.BadSignature as exc:
            raise ValidationError({"token": "Invalid or expired upload URL."}) from exc
        if not info["key"].split("/")[1] == str(request.user.pk):
            raise ValidationError({"token": "Invalid upload URL."})
        # Read the raw stream: request.body is capped by DATA_UPLOAD_MAX_MEMORY_SIZE.
        body = request._request.read(info["size"] + 1)
        if len(body) != info["size"]:
            raise ValidationError({"size": "Upload size does not match."})
        storage.write(info["kind"], info["key"], body, info["type"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Admin: albums and photos -----------------------------------------------


def reorder(queryset, ids):
    objects = {obj.pk: obj for obj in queryset.filter(pk__in=ids)}
    if len(objects) != len(set(ids)):
        raise ValidationError({"ids": "Unknown id in list."})
    with transaction.atomic():
        for index, pk in enumerate(ids):
            obj = objects[pk]
            if obj.display_order != index:
                obj.display_order = index
                obj.save(update_fields=["display_order", "updated_at"])


class AdminAlbumViewSet(viewsets.ModelViewSet):
    serializer_class = AdminAlbumSerializer
    permission_classes = [IsPhotographer]

    def get_queryset(self):
        return (
            Album.objects.filter(owner=self.request.user)
            .select_related("cover")
            .annotate(photo_count=Count("photos"))
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        data = IdsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reorder(Album.objects.filter(owner=request.user), data.validated_data["ids"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminPhotoViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPhotographer]

    def get_serializer_class(self):
        return PhotoCreateSerializer if self.action == "create" else AdminPhotoSerializer

    def get_queryset(self):
        qs = Photo.objects.filter(owner=self.request.user)
        params = self.request.query_params
        album = params.get("album")
        if album == "none":
            qs = qs.filter(album__isnull=True)
        elif album:
            qs = qs.filter(album_id=album)
        state = params.get("status")
        if state == "published":
            qs = qs.filter(is_published=True)
        elif state == "draft":
            qs = qs.filter(is_published=False)
        return qs

    def create(self, request, *args, **kwargs):
        data = PhotoCreateSerializer(data=request.data, context={"request": request})
        data.is_valid(raise_exception=True)
        v = data.validated_data
        result = process_image_upload(request.user, "photo", v["key"], public_prefix="photos")
        album = v.get("album")
        filename = v.get("original_filename", "")
        exif = {k: result["exif"][k] for k in EXIF_MODEL_FIELDS if k in result["exif"]}
        if exif.get("taken_at") and timezone.is_naive(exif["taken_at"]):
            # EXIF has no time zone; store the camera's clock time as UTC.
            exif["taken_at"] = timezone.make_aware(exif["taken_at"], dt_timezone.utc)
        try:
            photo = Photo.objects.create(
                owner=request.user,
                album=album,
                original_key=v["key"],
                variants=result["variants"],
                width=result["width"],
                height=result["height"],
                file_size=result["size"],
                original_filename=filename,
                title=v.get("title") or filename.rsplit(".", 1)[0][:200],
                alt_text=v.get("alt_text", ""),
                display_order=(album.photos.count() if album else 0),
                **exif,
            )
        except Exception:
            get_storage().delete_quietly(PRIVATE, v["key"])
            delete_public_keys([x["key"] for x in result["variants"].values()])
            raise
        return Response(AdminPhotoSerializer(photo, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        data = IdsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reorder(Photo.objects.filter(owner=request.user), data.validated_data["ids"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"])
    def bulk(self, request):
        data = BulkPhotoSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        photos = Photo.objects.filter(owner=request.user, pk__in=v["ids"])
        skipped = []
        if v["action"] == "delete":
            count = len(photos)
            for photo in photos:
                photo.delete()
            return Response({"deleted": count})
        if v["action"] == "unpublish":
            updated = photos.update(is_published=False)
        elif v["action"] == "publish":
            skipped = list(photos.filter(alt_text="").values_list("pk", flat=True))
            updated = photos.exclude(alt_text="").update(is_published=True)
        else:  # move
            album_id = v.get("album")
            if album_id is not None and not Album.objects.filter(owner=request.user, pk=album_id).exists():
                raise ValidationError({"album": "Unknown series."})
            updated = photos.update(album_id=album_id)
        return Response({"updated": updated, "skipped_missing_alt_text": skipped})


# --- Admin: homepage and profile --------------------------------------------


def replace_image(user, instance, key, original_field, variants_field, public_prefix):
    """Process a newly uploaded image and swap it in, deleting the old files."""
    kind = {"poster_original_key": "poster", "portrait_original_key": "portrait"}[original_field]
    result = process_image_upload(user, kind, key, public_prefix=public_prefix)
    old_original = getattr(instance, original_field)
    old_variants = getattr(instance, variants_field) or {}
    setattr(instance, original_field, key)
    setattr(instance, variants_field, result["variants"])
    return lambda: (
        get_storage().delete_quietly(PRIVATE, old_original),
        delete_public_keys([x["key"] for x in old_variants.values()]),
    )


class AdminHomepageView(APIView):
    permission_classes = [IsPhotographer]

    def get_object(self):
        homepage, _ = HomepageSettings.objects.get_or_create(owner=self.request.user)
        return homepage

    def get(self, request):
        return Response(AdminHomepageSerializer(self.get_object()).data)

    def patch(self, request):
        homepage = self.get_object()
        data = AdminHomepageSerializer(homepage, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        cleanups = []

        if "hero_video_key" in v:
            key = v.pop("hero_video_key")
            old = homepage.hero_video_key
            if key:
                size = check_uploaded(request.user, "hero_video", key)
                homepage.hero_video_key = key
                homepage.hero_video_size = size
                homepage.hero_video_type = "video/webm" if key.endswith(".webm") else "video/mp4"
            else:
                homepage.hero_video_key = homepage.hero_video_type = ""
                homepage.hero_video_size = 0
            if old and old != key:
                cleanups.append(lambda old=old: delete_public_keys([old]))

        if "poster_key" in v:
            key = v.pop("poster_key")
            if key:
                cleanups.append(replace_image(request.user, homepage, key, "poster_original_key", "poster_variants", "assets"))

        for field, value in v.items():
            setattr(homepage, field, value)
        homepage.save()
        for cleanup in cleanups:
            cleanup()
        return Response(AdminHomepageSerializer(homepage).data)


class AdminProfileView(APIView):
    permission_classes = [IsPhotographer]

    def get(self, request):
        return Response(AdminProfileSerializer(request.user.photographer).data)

    def patch(self, request):
        profile = request.user.photographer
        data = AdminProfileSerializer(profile, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        cleanups = []
        key = v.pop("portrait_key", "")
        if key:
            cleanups.append(replace_image(request.user, profile, key, "portrait_original_key", "portrait_variants", "assets"))
        for field, value in v.items():
            setattr(profile, field, value)
        profile.save()
        for cleanup in cleanups:
            cleanup()
        return Response(AdminProfileSerializer(profile).data)

