"""
Create the first photographer account from environment variables, for hosts
without a shell (e.g. Render's free plan). Runs on every deploy and does
nothing unless the variables are set, and nothing if the account exists.

    INITIAL_USERNAME       required to do anything
    INITIAL_PASSWORD       required to do anything
    INITIAL_DISPLAY_NAME   default: the username
    INITIAL_SLUG           default: slugified display name
    INITIAL_STAFF          "true" to also allow Django's maintenance admin

Remove INITIAL_PASSWORD from the host once the account exists. Recovery
codes are not printed here (build logs are not a safe place for them); the
photographer creates them in the dashboard under About you.
"""

import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from gallery.models import HomepageSettings, PhotographerProfile


class Command(BaseCommand):
    help = "Create the first photographer from INITIAL_* environment variables, if set and not yet created."

    def handle(self, *args, **opts):
        username = os.getenv("INITIAL_USERNAME", "").strip()
        password = os.getenv("INITIAL_PASSWORD", "")
        if not username or not password:
            self.stdout.write("ensure_initial_photographer: INITIAL_USERNAME/INITIAL_PASSWORD not set, skipping.")
            return

        User = get_user_model()
        if User.objects.filter(username=username).exists():
            self.stdout.write(
                f"ensure_initial_photographer: user {username!r} already exists, nothing to do. "
                "You can now remove INITIAL_PASSWORD from the environment."
            )
            return

        display_name = os.getenv("INITIAL_DISPLAY_NAME", "").strip() or username
        slug = os.getenv("INITIAL_SLUG", "").strip() or slugify(display_name) or slugify(username)
        staff = os.getenv("INITIAL_STAFF", "").strip().lower() in {"1", "true", "yes"}

        if PhotographerProfile.objects.filter(slug=slug).exists():
            raise CommandError(f"Slug {slug!r} is already used by another photographer.")
        try:
            validate_password(password, User(username=username))
        except ValidationError as exc:
            raise CommandError("INITIAL_PASSWORD is too weak: " + " ".join(exc.messages)) from exc

        with transaction.atomic():
            user = User.objects.create_user(
                username=username, password=password, is_staff=staff, is_superuser=staff
            )
            PhotographerProfile.objects.create(user=user, slug=slug, display_name=display_name)
            HomepageSettings.objects.get_or_create(owner=user)

        self.stdout.write(
            self.style.SUCCESS(
                f"ensure_initial_photographer: created {display_name} ({username}, slug {slug}). "
                "Remove INITIAL_PASSWORD from the environment, then sign in and create recovery codes in About you."
            )
        )
