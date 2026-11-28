# Hand-written initial migration for the gallery app.
# If `python manage.py makemigrations --check` reports differences on your
# machine, regenerate it: delete this file and run `makemigrations gallery`.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PhotographerProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(unique=True)),
                ("display_name", models.CharField(max_length=120)),
                ("tagline", models.CharField(blank=True, max_length=200)),
                ("bio", models.TextField(blank=True, help_text="Separate paragraphs with a blank line.")),
                ("location", models.CharField(blank=True, max_length=120)),
                ("contact_email", models.EmailField(blank=True, max_length=254)),
                ("instagram_url", models.URLField(blank=True)),
                ("website_url", models.URLField(blank=True)),
                ("portrait_original_key", models.CharField(blank=True, max_length=300)),
                ("portrait_variants", models.JSONField(blank=True, default=dict)),
                ("portrait_alt", models.CharField(blank=True, max_length=300)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="photographer",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="Album",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("slug", models.SlugField()),
                ("description", models.TextField(blank=True)),
                ("year", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("is_published", models.BooleanField(default=False)),
                ("display_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="albums",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["display_order", "-created_at"]},
        ),
        migrations.CreateModel(
            name="Photo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("original_key", models.CharField(help_text="Key in the private bucket.", max_length=300)),
                (
                    "variants",
                    models.JSONField(default=dict, help_text="name -> {key, width, height} in the public bucket."),
                ),
                ("width", models.PositiveIntegerField()),
                ("height", models.PositiveIntegerField()),
                ("file_size", models.PositiveBigIntegerField(default=0)),
                ("original_filename", models.CharField(blank=True, max_length=255)),
                ("title", models.CharField(blank=True, max_length=200)),
                ("caption", models.TextField(blank=True)),
                ("alt_text", models.CharField(blank=True, help_text="Required before publishing.", max_length=500)),
                ("taken_at", models.DateTimeField(blank=True, null=True)),
                ("location", models.CharField(blank=True, max_length=200)),
                ("camera", models.CharField(blank=True, max_length=120)),
                ("lens", models.CharField(blank=True, max_length=120)),
                ("focal_length", models.CharField(blank=True, max_length=20)),
                ("aperture", models.CharField(blank=True, max_length=20)),
                ("shutter_speed", models.CharField(blank=True, max_length=20)),
                ("iso", models.PositiveIntegerField(blank=True, null=True)),
                ("is_published", models.BooleanField(default=False)),
                ("display_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "album",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="photos",
                        to="gallery.album",
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="photos",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["display_order", "created_at"]},
        ),
        migrations.AddField(
            model_name="album",
            name="cover",
            field=models.ForeignKey(
                blank=True,
                help_text="Defaults to the first published photo when empty.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="gallery.photo",
            ),
        ),
        migrations.AddConstraint(
            model_name="album",
            constraint=models.UniqueConstraint(fields=("owner", "slug"), name="unique_album_slug_per_owner"),
        ),
        migrations.AddIndex(
            model_name="photo",
            index=models.Index(fields=["owner", "album", "is_published"], name="photo_owner_album_pub_idx"),
        ),
        migrations.CreateModel(
            name="HomepageSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "headline",
                    models.CharField(default="Light, places, and the quiet in between.", max_length=200),
                ),
                ("subheadline", models.CharField(blank=True, max_length=300)),
                ("hero_video_key", models.CharField(blank=True, help_text="Key in the public bucket.", max_length=300)),
                ("hero_video_type", models.CharField(blank=True, max_length=40)),
                ("hero_video_size", models.PositiveBigIntegerField(default=0)),
                ("poster_original_key", models.CharField(blank=True, max_length=300)),
                ("poster_variants", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "owner",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="homepage",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"verbose_name_plural": "homepage settings"},
        ),
    ]
