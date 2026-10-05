from rest_framework import viewsets

from .models import Project
from .serializers import ProjectSerializer


class PublishedProjectViewSet(viewsets.ReadOnlyModelViewSet):
	serializer_class = ProjectSerializer
	lookup_field = "slug"

	def get_queryset(self):
		return Project.objects.filter(is_published=True).prefetch_related("images")
