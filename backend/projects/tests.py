from django.test import TestCase
from rest_framework.test import APIClient

from .models import Project, ProjectImage


class PublishedProjectApiTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.published = Project.objects.create(
			title="Published study",
			slug="published-study",
			description="A public sample project.",
			is_published=True,
		)
		Project.objects.create(
			title="Private draft",
			slug="private-draft",
			description="This should not be public.",
			is_published=False,
		)
		ProjectImage.objects.create(
			project=self.published,
			image_url="https://example.com/sample.jpg",
			caption="Sample image",
		)

	def test_list_only_returns_published_projects_and_their_images(self):
		response = self.client.get("/api/projects/")

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(response.data), 1)
		self.assertEqual(response.data[0]["slug"], "published-study")
		self.assertEqual(response.data[0]["images"][0]["caption"], "Sample image")
