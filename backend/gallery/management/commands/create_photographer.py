from getpass import getpass

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from gallery.models import HomepageSettings, PhotographerProfile


class Command(BaseCommand):
    help = "Create a photographer account that can log into the dashboard."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--display-name", required=True)
        parser.add_argument("--slug", help="Public URL slug; defaults to the display name.")
        parser.add_argument("--email", default="")
        parser.add_argument("--staff", action="store_true", help="Also allow the Django maintenance admin.")

    @transaction.atomic
    def handle(self, *args, **opts):
        User = get_user_model()
        username = opts["username"]
        if User.objects.filter(username=username).exists():
            raise CommandError(f"User {username!r} already exists.")
        slug = opts["slug"] or slugify(opts["display_name"])
        if PhotographerProfile.objects.filter(slug=slug).exists():
            raise CommandError(f"Slug {slug!r} is taken.")

        password = getpass("Password: ")
        if password != getpass("Password (again): "):
            raise CommandError("Passwords do not match.")
        if len(password) < 10:
            raise CommandError("Use at least 10 characters.")

        user = User.objects.create_user(
            username=username,
            email=opts["email"],
            password=password,
            is_staff=opts["staff"],
            is_superuser=opts["staff"],
        )
        PhotographerProfile.objects.create(
            user=user,
            slug=slug,
            display_name=opts["display_name"],
            contact_email=opts["email"],
        )
        HomepageSettings.objects.create(owner=user)
        self.stdout.write(self.style.SUCCESS(f"Created photographer {opts['display_name']} ({slug})."))
