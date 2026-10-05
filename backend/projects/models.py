from django.db import models


class Project(models.Model):
	title = models.CharField(max_length=200)
	slug = models.SlugField(unique=True)
	description = models.TextField()
	category = models.CharField(max_length=80, blank=True)
	is_published = models.BooleanField(default=False)
	display_order = models.PositiveIntegerField(default=0)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["display_order", "title"]

	def __str__(self):
		return self.title


class ProjectImage(models.Model):
	project = models.ForeignKey(
		Project,
		related_name="images",
		on_delete=models.CASCADE,
	)
	image_url = models.URLField()
	caption = models.CharField(max_length=200, blank=True)
	display_order = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["display_order", "id"]

	def __str__(self):
		return f"Image for {self.project.title}"
