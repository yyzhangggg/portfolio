"""
File storage with two buckets:

- "private": originals. Never served publicly.
- "public":  WebP variants and the hero video, served to visitors.

R2Storage talks to Cloudflare R2 through its S3-compatible API.
LocalStorage writes under MEDIA_ROOT for development, and imitates the
presigned-upload flow with a signed URL to a dev-only endpoint.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

PRIVATE = "private"
PUBLIC = "public"
BUCKET_KINDS = (PRIVATE, PUBLIC)

DEV_UPLOAD_SALT = "gallery.dev-upload"


class StorageError(RuntimeError):
    pass


class BaseStorage:
    def presigned_put(self, kind: str, key: str, content_type: str, size: int) -> dict:
        """Return {"url", "method", "headers"} the browser uses to upload."""
        raise NotImplementedError

    def size(self, kind: str, key: str) -> int | None:
        """Size in bytes, or None if the object does not exist."""
        raise NotImplementedError

    def read(self, kind: str, key: str) -> bytes:
        raise NotImplementedError

    def write(self, kind: str, key: str, data: bytes, content_type: str) -> None:
        raise NotImplementedError

    def delete(self, kind: str, key: str) -> None:
        raise NotImplementedError

    def public_url(self, key: str) -> str:
        raise NotImplementedError

    def delete_quietly(self, kind: str, key: str) -> None:
        if not key:
            return
        try:
            self.delete(kind, key)
        except Exception:  # noqa: BLE001 - cleanup must never break a request
            logger.exception("Could not delete %s object %s", kind, key)


class R2Storage(BaseStorage):
    def __init__(self):
        import boto3
        from botocore.config import Config

        missing = [
            name
            for name in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET", "R2_PUBLIC_BUCKET", "R2_PUBLIC_BASE_URL")
            if not getattr(settings, name)
        ]
        if missing:
            raise ImproperlyConfigured(f"R2 is enabled but these settings are empty: {', '.join(missing)}")

        self.buckets = {PRIVATE: settings.R2_PRIVATE_BUCKET, PUBLIC: settings.R2_PUBLIC_BUCKET}
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )

    def presigned_put(self, kind, key, content_type, size):
        # ContentLength is signed, so the browser cannot upload a different size
        # than the one we validated.
        url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.buckets[kind],
                "Key": key,
                "ContentType": content_type,
                "ContentLength": size,
            },
            ExpiresIn=settings.PRESIGNED_URL_EXPIRY_SECONDS,
        )
        return {"url": url, "method": "PUT", "headers": {"Content-Type": content_type}}

    def size(self, kind, key):
        from botocore.exceptions import ClientError

        try:
            head = self.client.head_object(Bucket=self.buckets[kind], Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise StorageError(str(exc)) from exc
        return int(head["ContentLength"])

    def read(self, kind, key):
        obj = self.client.get_object(Bucket=self.buckets[kind], Key=key)
        return obj["Body"].read()

    def write(self, kind, key, data, content_type):
        self.client.put_object(
            Bucket=self.buckets[kind],
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable" if kind == PUBLIC else "private, no-store",
        )

    def delete(self, kind, key):
        self.client.delete_object(Bucket=self.buckets[kind], Key=key)

    def public_url(self, key):
        return f"{settings.R2_PUBLIC_BASE_URL}/{quote(key)}"


class LocalStorage(BaseStorage):
    """Development storage under MEDIA_ROOT/{private,public}/."""

    def __init__(self, root: Path | None = None):
        self.root = Path(root or settings.MEDIA_ROOT)

    def _path(self, kind, key) -> Path:
        if kind not in BUCKET_KINDS:
            raise StorageError(f"Unknown bucket {kind!r}")
        base = (self.root / kind).resolve()
        path = (base / key).resolve()
        if base not in path.parents:
            raise StorageError("Invalid key")
        return path

    def presigned_put(self, kind, key, content_type, size):
        token = signing.dumps({"kind": kind, "key": key, "size": size, "type": content_type}, salt=DEV_UPLOAD_SALT)
        return {
            "url": f"/api/admin/dev-upload/?token={quote(token)}",
            "method": "PUT",
            "headers": {"Content-Type": content_type},
        }

    def size(self, kind, key):
        path = self._path(kind, key)
        return path.stat().st_size if path.is_file() else None

    def read(self, kind, key):
        return self._path(kind, key).read_bytes()

    def write(self, kind, key, data, content_type):
        path = self._path(kind, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, kind, key):
        path = self._path(kind, key)
        if path.is_file():
            path.unlink()

    def public_url(self, key):
        return f"{settings.MEDIA_URL}public/{quote(key)}"


@lru_cache(maxsize=1)
def get_storage() -> BaseStorage:
    if settings.R2_ACCOUNT_ID:
        return R2Storage()
    if not settings.DEBUG:
        logger.warning("R2 is not configured; using local disk storage. Files will be lost on Render restarts.")
    return LocalStorage()
