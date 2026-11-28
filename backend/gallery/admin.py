from django.contrib import admin

from .models import Album, HomepageSettings, PhotographerProfile, Photo


@admin.register(PhotographerProfile)
class PhotographerProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "slug", "user", "location")
    search_fields = ("display_name", "slug", "user__username")
    readonly_fields = ("portrait_original_key", "portrait_variants")


class PhotoInline(admin.TabularInline):
    model = Photo
    fields = ("title", "alt_text", "is_published", "display_order")
    extra = 0
    show_change_link = True


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "year", "is_published", "display_order")
    list_filter = ("is_published", "owner")
    search_fields = ("title", "description")
    prepopulated_fields = {"slug": ("title",)}
    inlines = (PhotoInline,)


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ("__str__", "owner", "album", "is_published", "created_at")
    list_filter = ("is_published", "owner", "album")
    search_fields = ("title", "caption", "alt_text", "original_filename")
    readonly_fields = ("original_key", "variants", "width", "height", "file_size", "original_filename")


@admin.register(HomepageSettings)
class HomepageSettingsAdmin(admin.ModelAdmin):
    list_display = ("owner", "headline", "updated_at")
    readonly_fields = ("hero_video_key", "hero_video_type", "hero_video_size", "poster_original_key", "poster_variants")
