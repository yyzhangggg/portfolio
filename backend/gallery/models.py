from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .storage import PUBLIC, get_storage

GRID_RATIO_CHOICES = [
    ("3:4", "3:4 portrait"),
    ("4:3", "4:3 landscape"),
    ("16:9", "16:9 wide"),
    ("9:16", "9:16 tall"),
]


def variant_urls(variants: dict) -> dict:
    """{"thumb": {"key", "width", "height"}} -> {"thumb": {"url", "width", "height"}}."""
    if not variants:
        return {}
    storage = get_storage()
    return {
        name: {"url": storage.public_url(v["key"]), "width": v["width"], "height": v["height"]}
        for name, v in variants.items()
    }


class PhotographerProfile(models.Model):
    """One per photographer. Anyone with a profile can log into the dashboard."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="photographer")
    slug = models.SlugField(unique=True)
    display_name = models.CharField(max_length=120)
    tagline = models.CharField(max_length=200, blank=True)
    bio = models.TextField(blank=True, help_text="Separate paragraphs with a blank line.")
    location = models.CharField(max_length=120, blank=True)
    contact_email = models.EmailField(blank=True)
    instagram_url = models.URLField(blank=True)
    website_url = models.URLField(blank=True)
    # Portrait for the About section: private original + public variants.
    portrait_original_key = models.CharField(max_length=300, blank=True)
    portrait_variants = models.JSONField(default=dict, blank=True)
    portrait_alt = models.CharField(max_length=300, blank=True)

    def __str__(self):
        return self.display_name


class Album(models.Model):
    """A series: for architecture, usually one building or project.
    Published series are shown on the home page in display_order."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="albums")
    title = models.CharField(max_length=200)
    slug = models.SlugField()
    description = models.TextField(blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    architect = models.CharField(max_length=200, blank=True, help_text="Architect or practice.")
    location = models.CharField(max_length=200, blank=True)
    grid_ratio = models.CharField(
        max_length=5,
        choices=GRID_RATIO_CHOICES,
        default="4:3",
        help_text="Shape of the cells on the series page. Photos are never cropped to fit.",
    )
    cover = models.ForeignKey(
        "Photo",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="Defaults to the first published photo when empty.",
    )
    is_published = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "-created_at"]
        constraints = [models.UniqueConstraint(fields=["owner", "slug"], name="unique_album_slug_per_owner")]

    def __str__(self):
        return self.title

    def clean(self):
        if self.cover_id and self.cover.album_id != self.pk:
            raise ValidationError({"cover": "The cover must be a photo in this album."})


class Photo(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="photos")
    album = models.ForeignKey(Album, null=True, blank=True, on_delete=models.SET_NULL, related_name="photos")

    original_key = models.CharField(max_length=300, help_text="Key in the private bucket.")
    variants = models.JSONField(default=dict, help_text="name -> {key, width, height} in the public bucket.")
    # Optional crop chosen in the dashboard: {"ratio": "4:3", "box": {x, y, width, height}} in
    # fractions of the oriented image. Only grid thumbnails and covers use it; the
    # lightbox always shows the whole photo.
    crop = models.JSONField(null=True, blank=True)
    grid_variants = models.JSONField(default=dict, blank=True, help_text="Cropped variants, when cropped.")
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    file_size = models.PositiveBigIntegerField(default=0)
    original_filename = models.CharField(max_length=255, blank=True)

    title = models.CharField(max_length=200, blank=True)
    caption = models.TextField(blank=True)
    alt_text = models.CharField(max_length=500, blank=True, help_text="Required before publishing.")
    taken_at = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)

    camera = models.CharField(max_length=120, blank=True)
    lens = models.CharField(max_length=120, blank=True)
    focal_length = models.CharField(max_length=20, blank=True)
    aperture = models.CharField(max_length=20, blank=True)
    shutter_speed = models.CharField(max_length=20, blank=True)
    iso = models.PositiveIntegerField(null=True, blank=True)

    is_published = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "created_at"]
        indexes = [models.Index(fields=["owner", "album", "is_published"], name="photo_owner_album_pub_idx")]

    def __str__(self):
        return self.title or self.original_filename or f"Photo {self.pk}"

    def clean(self):
        if self.is_published and not self.alt_text.strip():
            raise ValidationError({"alt_text": "Add alt text before publishing."})
        if self.album_id and self.album.owner_id != self.owner_id:
            raise ValidationError({"album": "Album belongs to another photographer."})

    def public_keys(self) -> list[str]:
        keys = [v["key"] for v in (self.variants or {}).values()]
        return keys + [v["key"] for v in (self.grid_variants or {}).values()]


class HomepageSettings(models.Model):
    """The hero section of a photographer's home page."""

    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="homepage")
    headline = models.CharField(max_length=200, default="Architecture photography")
    subheadline = models.CharField(max_length=300, blank=True)

    hero_video_key = models.CharField(max_length=300, blank=True, help_text="Key in the public bucket.")
    hero_video_type = models.CharField(max_length=40, blank=True)
    hero_video_size = models.PositiveBigIntegerField(default=0)

    poster_original_key = models.CharField(max_length=300, blank=True)
    poster_variants = models.JSONField(default=dict, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "homepage settings"

    def __str__(self):
        return f"Homepage for {self.owner}"

    @property
    def hero_video_url(self) -> str:
        return get_storage().public_url(self.hero_video_key) if self.hero_video_key else ""


def delete_public_keys(keys):
    storage = get_storage()
    for key in keys:
        storage.delete_quietly(PUBLIC, key)


class RecoveryCode(models.Model):
    """A one-time code for resetting a forgotten password. Only the hash is stored."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recovery_codes")
    code_hash = models.CharField(max_length=256)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Recovery code for {self.user} ({'used' if self.used_at else 'unused'})"
