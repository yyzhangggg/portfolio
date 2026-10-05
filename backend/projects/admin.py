from django.contrib import admin

from .models import Project, ProjectImage


class ProjectImageInline(admin.TabularInline):
	model = ProjectImage
	extra = 1


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
	list_display = ("title", "category", "is_published", "display_order")
	list_filter = ("is_published", "category")
	search_fields = ("title", "description")
	prepopulated_fields = {"slug": ("title",)}
	inlines = (ProjectImageInline,)
