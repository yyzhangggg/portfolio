from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import HomepageSettings, PhotographerProfile, Photo, delete_public_keys
from .storage import PRIVATE, get_storage


@receiver(post_delete, sender=Photo)
def delete_photo_files(sender, instance, **kwargs):
    get_storage().delete_quietly(PRIVATE, instance.original_key)
    delete_public_keys(instance.public_keys())


@receiver(post_delete, sender=HomepageSettings)
def delete_homepage_files(sender, instance, **kwargs):
    get_storage().delete_quietly(PRIVATE, instance.poster_original_key)
    delete_public_keys([v["key"] for v in (instance.poster_variants or {}).values()])
    delete_public_keys([instance.hero_video_key] if instance.hero_video_key else [])


@receiver(post_delete, sender=PhotographerProfile)
def delete_portrait_files(sender, instance, **kwargs):
    get_storage().delete_quietly(PRIVATE, instance.portrait_original_key)
    delete_public_keys([v["key"] for v in (instance.portrait_variants or {}).values()])
