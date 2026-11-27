from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from gallery.models import PhotographerProfile
from gallery.recovery import generate_codes

from .create_photographer import print_codes


class Command(BaseCommand):
    help = "Replace a photographer's recovery codes and print the new ones."

    def add_arguments(self, parser):
        parser.add_argument("username")

    def handle(self, *args, **opts):
        user = get_user_model().objects.filter(username=opts["username"]).first()
        if user is None or not PhotographerProfile.objects.filter(user=user).exists():
            raise CommandError(f"No photographer with username {opts['username']!r}.")
        print_codes(self.stdout, generate_codes(user))
