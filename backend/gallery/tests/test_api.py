"""API tests. Run with `python manage.py test gallery` from backend/."""

import io
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from gallery.models import Album, HomepageSettings, PhotographerProfile, Photo
from gallery.storage import PRIVATE, PUBLIC, get_storage

TMP_MEDIA = tempfile.mkdtemp()


def jpeg_bytes(size=(1600, 1000)):
    buf = io.BytesIO()
    Image.new("RGB", size, (90, 80, 70)).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (50, 50)).save(buf, format="PNG")
    return buf.getvalue()


@override_settings(MEDIA_ROOT=TMP_MEDIA, R2_ACCOUNT_ID="", DEFAULT_PHOTOGRAPHER_SLUG="")
class GalleryApiTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    def setUp(self):
        get_storage.cache_clear()
        cache.clear()
        User = get_user_model()
        self.user = User.objects.create_user("yanying", password="a-long-test-password")
        self.profile = PhotographerProfile.objects.create(user=self.user, slug="yanying", display_name="Yanying Zhang")
        HomepageSettings.objects.create(owner=self.user)
        self.other = User.objects.create_user("friend", password="another-long-password")
        PhotographerProfile.objects.create(user=self.other, slug="friend", display_name="Friend")
        self.client = APIClient()

    def login(self, user=None):
        self.client.force_authenticate(user or self.user)

    def upload_photo(self, data=None, album=None, alt_text=""):
        data = data if data is not None else jpeg_bytes()
        res = self.client.post(
            "/api/admin/uploads/",
            {"kind": "photo", "content_type": "image/jpeg", "size": len(data)},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        key = res.json()["key"]
        put = self.client.put(res.json()["upload"]["url"], data, content_type="image/jpeg")
        self.assertEqual(put.status_code, 204, put.content)
        body = {"key": key, "original_filename": "IMG_0001.jpg", "alt_text": alt_text}
        if album:
            body["album"] = album.pk
        return self.client.post("/api/admin/photos/", body, format="json")

    # --- auth ---------------------------------------------------------------

    def test_health_is_public(self):
        self.assertEqual(self.client.get("/api/health/").json(), {"status": "ok"})

    def test_admin_requires_login(self):
        self.assertEqual(self.client.get("/api/admin/photos/").status_code, 403)

    def test_login_and_me(self):
        res = self.client.post("/api/admin/auth/login/", {"username": "yanying", "password": "a-long-test-password"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["authenticated"])
        self.assertEqual(self.client.get("/api/admin/auth/me/").json()["photographer"]["slug"], "yanying")

    def test_login_rejects_bad_password(self):
        res = self.client.post("/api/admin/auth/login/", {"username": "yanying", "password": "nope"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_login_is_rate_limited(self):
        for _ in range(5):
            self.client.post("/api/admin/auth/login/", {"username": "yanying", "password": "nope"}, format="json")
        res = self.client.post("/api/admin/auth/login/", {"username": "yanying", "password": "nope"}, format="json")
        self.assertEqual(res.status_code, 429)

    def test_user_without_profile_cannot_log_in(self):
        get_user_model().objects.create_user("stranger", password="a-long-test-password")
        res = self.client.post("/api/admin/auth/login/", {"username": "stranger", "password": "a-long-test-password"}, format="json")
        self.assertEqual(res.status_code, 400)

    # --- uploads ------------------------------------------------------------

    def test_upload_rejects_non_jpeg_types(self):
        self.login()
        res = self.client.post("/api/admin/uploads/", {"kind": "photo", "content_type": "image/heic", "size": 100}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_upload_rejects_oversized(self):
        self.login()
        res = self.client.post("/api/admin/uploads/", {"kind": "photo", "content_type": "image/jpeg", "size": 10**10}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_full_photo_upload_keeps_original_and_writes_variants(self):
        self.login()
        res = self.upload_photo()
        self.assertEqual(res.status_code, 201, res.content)
        photo = Photo.objects.get(pk=res.json()["id"])
        storage = get_storage()
        self.assertIsNotNone(storage.size(PRIVATE, photo.original_key))
        self.assertEqual(set(photo.variants), {"thumb", "medium", "large"})
        for v in photo.variants.values():
            self.assertIsNotNone(storage.size(PUBLIC, v["key"]))
        self.assertEqual((photo.width, photo.height), (1600, 1000))
        self.assertEqual(photo.title, "IMG_0001")
        self.assertFalse(photo.is_published)

    def test_png_disguised_as_jpeg_is_rejected_and_removed(self):
        self.login()
        res = self.upload_photo(data=png_bytes())
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Photo.objects.count(), 0)

    def test_cannot_confirm_someone_elses_key(self):
        self.login(self.other)
        data = jpeg_bytes()
        key = self.client.post(
            "/api/admin/uploads/", {"kind": "photo", "content_type": "image/jpeg", "size": len(data)}, format="json"
        ).json()["key"]
        self.login(self.user)
        res = self.client.post("/api/admin/photos/", {"key": key}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_delete_photo_removes_files(self):
        self.login()
        photo = Photo.objects.get(pk=self.upload_photo().json()["id"])
        keys = [(PRIVATE, photo.original_key)] + [(PUBLIC, k) for k in photo.public_keys()]
        self.assertEqual(self.client.delete(f"/api/admin/photos/{photo.pk}/").status_code, 204)
        for kind, key in keys:
            self.assertIsNone(get_storage().size(kind, key))

    # --- editing and permissions -------------------------------------------

    def test_publish_requires_alt_text(self):
        self.login()
        pk = self.upload_photo().json()["id"]
        res = self.client.patch(f"/api/admin/photos/{pk}/", {"is_published": True}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.client.patch(f"/api/admin/photos/{pk}/", {"is_published": True, "alt_text": "A pier at dusk"}, format="json")
        self.assertEqual(res.status_code, 200)

    def test_owner_scoping(self):
        self.login()
        pk = self.upload_photo().json()["id"]
        self.login(self.other)
        self.assertEqual(self.client.get(f"/api/admin/photos/{pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/admin/photos/").json(), [])

    def test_album_slug_generated_and_unique(self):
        self.login()
        a = self.client.post("/api/admin/albums/", {"title": "Winter Light"}, format="json").json()
        b = self.client.post("/api/admin/albums/", {"title": "Winter Light"}, format="json").json()
        self.assertEqual(a["slug"], "winter-light")
        self.assertEqual(b["slug"], "winter-light-2")

    def test_reorder_albums(self):
        self.login()
        ids = [self.client.post("/api/admin/albums/", {"title": t}, format="json").json()["id"] for t in "ABC"]
        res = self.client.post("/api/admin/albums/reorder/", {"ids": list(reversed(ids))}, format="json")
        self.assertEqual(res.status_code, 204)
        self.assertEqual(list(Album.objects.order_by("display_order").values_list("title", flat=True)), ["C", "B", "A"])

    def test_bulk_publish_skips_missing_alt_text(self):
        self.login()
        with_alt = self.upload_photo(alt_text="Fog over the river").json()["id"]
        without = self.upload_photo().json()["id"]
        res = self.client.post("/api/admin/photos/bulk/", {"ids": [with_alt, without], "action": "publish"}, format="json")
        self.assertEqual(res.json(), {"updated": 1, "skipped_missing_alt_text": [without]})

    # --- public -------------------------------------------------------------

    def test_public_site_shows_only_published(self):
        self.login()
        album = Album.objects.create(owner=self.user, title="Harbour", slug="harbour", is_published=True)
        draft_album = Album.objects.create(owner=self.user, title="Draft", slug="draft", is_published=False)
        pub = self.upload_photo(album=album, alt_text="Boats").json()["id"]
        self.client.patch(f"/api/admin/photos/{pub}/", {"is_published": True}, format="json")
        self.upload_photo(album=album)  # draft photo
        self.upload_photo(album=draft_album, alt_text="x")
        self.client.force_authenticate(None)

        site = self.client.get("/api/public/site/?photographer=yanying").json()
        self.assertEqual([a["slug"] for a in site["albums"]], ["harbour"])
        self.assertEqual(site["albums"][0]["photo_count"], 1)
        self.assertIn("thumb", site["albums"][0]["cover"]["src"])
        detail = self.client.get("/api/public/albums/harbour/?photographer=yanying").json()
        self.assertEqual(len(detail["photos"]), 1)
        self.assertNotIn("original_key", str(detail))
        self.assertEqual(self.client.get("/api/public/albums/draft/?photographer=yanying").status_code, 404)

    def test_public_site_needs_photographer_when_several(self):
        self.assertEqual(self.client.get("/api/public/site/").status_code, 404)
        with override_settings(DEFAULT_PHOTOGRAPHER_SLUG="yanying"):
            self.assertEqual(self.client.get("/api/public/site/").status_code, 200)

    def test_hero_video_and_poster(self):
        self.login()
        video = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 1000
        up = self.client.post("/api/admin/uploads/", {"kind": "hero_video", "content_type": "video/mp4", "size": len(video)}, format="json").json()
        self.client.put(up["upload"]["url"], video, content_type="video/mp4")
        poster = jpeg_bytes()
        pu = self.client.post("/api/admin/uploads/", {"kind": "poster", "content_type": "image/jpeg", "size": len(poster)}, format="json").json()
        self.client.put(pu["upload"]["url"], poster, content_type="image/jpeg")

        res = self.client.patch("/api/admin/homepage/", {"hero_video_key": up["key"], "poster_key": pu["key"], "headline": "Hello"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertTrue(body["hero_video"]["url"].endswith(".mp4"))
        self.assertIn("large", body["poster"])
        self.assertEqual(body["headline"], "Hello")
