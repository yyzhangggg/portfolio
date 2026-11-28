from django.utils.text import slugify
from rest_framework import serializers

from .models import Album, HomepageSettings, PhotographerProfile, Photo, variant_urls

EXIF_FIELDS = ("camera", "lens", "focal_length", "aperture", "shutter_speed", "iso")


# --- Public (read-only, published content only) ----------------------------


class PublicPhotoSerializer(serializers.ModelSerializer):
    src = serializers.SerializerMethodField()
    exif = serializers.SerializerMethodField()

    class Meta:
        model = Photo
        fields = ["id", "title", "caption", "alt_text", "width", "height", "src", "taken_at", "location", "exif"]

    def get_src(self, photo):
        return variant_urls(photo.variants)

    def get_exif(self, photo):
        return {f: getattr(photo, f) for f in EXIF_FIELDS if getattr(photo, f) not in ("", None)}


class PublicCoverSerializer(serializers.ModelSerializer):
    src = serializers.SerializerMethodField()

    class Meta:
        model = Photo
        fields = ["alt_text", "width", "height", "src"]

    def get_src(self, photo):
        return variant_urls(photo.variants)


class PublicAlbumSerializer(serializers.ModelSerializer):
    photo_count = serializers.IntegerField(read_only=True)
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Album
        fields = ["slug", "title", "year", "description", "photo_count", "cover"]

    def get_cover(self, album):
        cover = getattr(album, "public_cover", None)
        return PublicCoverSerializer(cover).data if cover else None


class PublicAlbumDetailSerializer(PublicAlbumSerializer):
    photos = serializers.SerializerMethodField()

    class Meta(PublicAlbumSerializer.Meta):
        fields = PublicAlbumSerializer.Meta.fields + ["photos"]

    def get_photos(self, album):
        return PublicPhotoSerializer(album.public_photos, many=True).data


class PublicPhotographerSerializer(serializers.ModelSerializer):
    bio_paragraphs = serializers.SerializerMethodField()
    portrait = serializers.SerializerMethodField()

    class Meta:
        model = PhotographerProfile
        fields = [
            "slug",
            "display_name",
            "tagline",
            "bio_paragraphs",
            "location",
            "contact_email",
            "instagram_url",
            "website_url",
            "portrait",
        ]

    def get_bio_paragraphs(self, profile):
        return [p.strip() for p in profile.bio.replace("\r\n", "\n").split("\n\n") if p.strip()]

    def get_portrait(self, profile):
        if not profile.portrait_variants:
            return None
        return {"alt_text": profile.portrait_alt, "src": variant_urls(profile.portrait_variants)}


class PublicHomepageSerializer(serializers.ModelSerializer):
    hero_video = serializers.SerializerMethodField()
    poster = serializers.SerializerMethodField()

    class Meta:
        model = HomepageSettings
        fields = ["headline", "subheadline", "hero_video", "poster"]

    def get_hero_video(self, homepage):
        if not homepage.hero_video_key:
            return None
        return {"url": homepage.hero_video_url, "type": homepage.hero_video_type}

    def get_poster(self, homepage):
        return variant_urls(homepage.poster_variants) or None


# --- Admin ------------------------------------------------------------------


class UploadRequestSerializer(serializers.Serializer):
    kind = serializers.CharField()
    content_type = serializers.CharField()
    size = serializers.IntegerField()
    filename = serializers.CharField(required=False, allow_blank=True, max_length=255)


def _unique_album_slug(owner, base, exclude_pk=None):
    base = slugify(base)[:45] or "series"
    slug, n = base, 2
    qs = Album.objects.filter(owner=owner)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    while qs.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


class AdminAlbumSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    photo_count = serializers.IntegerField(read_only=True)
    cover_src = serializers.SerializerMethodField()

    class Meta:
        model = Album
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "year",
            "cover",
            "cover_src",
            "is_published",
            "display_order",
            "photo_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_cover_src(self, album):
        return variant_urls(album.cover.variants) if album.cover_id else None

    def validate_cover(self, cover):
        if cover is None:
            return None
        if cover.owner_id != self.context["request"].user.pk:
            raise serializers.ValidationError("Unknown photo.")
        if self.instance is None or cover.album_id != self.instance.pk:
            raise serializers.ValidationError("The cover must be a photo in this series.")
        return cover

    def validate(self, attrs):
        owner = self.context["request"].user
        exclude = self.instance.pk if self.instance else None
        slug = attrs.get("slug")
        if slug:
            if Album.objects.filter(owner=owner, slug=slug).exclude(pk=exclude).exists():
                raise serializers.ValidationError({"slug": "You already have a series with this slug."})
        elif self.instance is None or "slug" in attrs:
            title = attrs.get("title") or (self.instance.title if self.instance else "")
            attrs["slug"] = _unique_album_slug(owner, title, exclude)
        return attrs


class AdminPhotoSerializer(serializers.ModelSerializer):
    src = serializers.SerializerMethodField()
    album = serializers.PrimaryKeyRelatedField(queryset=Album.objects.none(), allow_null=True, required=False)

    class Meta:
        model = Photo
        fields = [
            "id",
            "album",
            "title",
            "caption",
            "alt_text",
            "taken_at",
            "location",
            *EXIF_FIELDS,
            "is_published",
            "display_order",
            "src",
            "width",
            "height",
            "file_size",
            "original_filename",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "src", "width", "height", "file_size", "original_filename", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["album"].queryset = Album.objects.filter(owner=request.user)

    def get_src(self, photo):
        return variant_urls(photo.variants)

    def validate(self, attrs):
        published = attrs.get("is_published", self.instance.is_published if self.instance else False)
        alt = attrs.get("alt_text", self.instance.alt_text if self.instance else "")
        if published and not (alt or "").strip():
            raise serializers.ValidationError({"alt_text": "Add alt text before publishing."})
        return attrs


class PhotoCreateSerializer(serializers.Serializer):
    """Confirms an uploaded original and creates the Photo."""

    key = serializers.CharField()
    album = serializers.PrimaryKeyRelatedField(queryset=Album.objects.none(), allow_null=True, required=False)
    title = serializers.CharField(required=False, allow_blank=True, max_length=200)
    alt_text = serializers.CharField(required=False, allow_blank=True, max_length=500)
    original_filename = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["album"].queryset = Album.objects.filter(owner=request.user)


class IdsSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False, max_length=1000)


class BulkPhotoSerializer(IdsSerializer):
    action = serializers.ChoiceField(choices=["publish", "unpublish", "delete", "move"])
    album = serializers.IntegerField(required=False, allow_null=True)


class AdminHomepageSerializer(serializers.ModelSerializer):
    hero_video = serializers.SerializerMethodField()
    poster = serializers.SerializerMethodField()
    hero_video_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    poster_key = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = HomepageSettings
        fields = ["headline", "subheadline", "hero_video", "poster", "hero_video_key", "poster_key", "updated_at"]
        read_only_fields = ["updated_at"]

    get_hero_video = PublicHomepageSerializer.get_hero_video
    get_poster = PublicHomepageSerializer.get_poster


class AdminProfileSerializer(serializers.ModelSerializer):
    portrait = serializers.SerializerMethodField()
    portrait_key = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = PhotographerProfile
        fields = [
            "slug",
            "display_name",
            "tagline",
            "bio",
            "location",
            "contact_email",
            "instagram_url",
            "website_url",
            "portrait",
            "portrait_alt",
            "portrait_key",
        ]
        read_only_fields = ["slug"]

    def get_portrait(self, profile):
        return variant_urls(profile.portrait_variants) or None
