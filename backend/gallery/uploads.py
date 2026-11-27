"""
Direct-to-storage upload flow:

1. POST /api/admin/uploads/  -> we validate type and size, pick a key under
   the user's own prefix, and return a presigned PUT URL.
2. The browser PUTs the file straight to storage.
3. The client "confirms" the key (creating a Photo, or setting the hero
   video/poster/portrait). We check the key is the caller's, that the object
   exists within the size limit, and for images, process it.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from django.conf import settings
from rest_framework.exceptions import ValidationError

from .processing import InvalidImage, process_jpeg
from .storage import PRIVATE, PUBLIC, get_storage

JPEG_TYPES = {"image/jpeg": "jpg", "image/jpg": "jpg"}
VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm"}


@dataclass(frozen=True)
class UploadKind:
    name: str
    content_types: dict
    bucket: str
    prefix: str

    @property
    def max_bytes(self) -> int:
        return settings.MAX_VIDEO_UPLOAD_BYTES if self.bucket == PUBLIC else settings.MAX_PHOTO_UPLOAD_BYTES


UPLOAD_KINDS = {
    "photo": UploadKind("photo", JPEG_TYPES, PRIVATE, "originals"),
    "poster": UploadKind("poster", JPEG_TYPES, PRIVATE, "originals"),
    "portrait": UploadKind("portrait", JPEG_TYPES, PRIVATE, "originals"),
    "hero_video": UploadKind("hero_video", VIDEO_TYPES, PUBLIC, "hero"),
}

_KEY_RE = re.compile(r"^(?P<prefix>[a-z]+)/(?P<user>\d+)/(?P<stem>[0-9a-f]{32})\.(?P<ext>[a-z0-9]{2,5})$")


def create_upload(user, kind_name: str, content_type: str, size: int) -> dict:
    kind = UPLOAD_KINDS.get(kind_name)
    if kind is None:
        raise ValidationError({"kind": f"Must be one of: {', '.join(UPLOAD_KINDS)}."})
    content_type = (content_type or "").lower().strip()
    if content_type not in kind.content_types:
        allowed = "JPEG" if kind.content_types is JPEG_TYPES else "MP4 or WebM"
        raise ValidationError({"content_type": f"Only {allowed} files are accepted."})
    if size <= 0:
        raise ValidationError({"size": "File is empty."})
    if size > kind.max_bytes:
        raise ValidationError({"size": f"File is larger than {kind.max_bytes // (1024 * 1024)} MB."})

    ext = kind.content_types[content_type]
    key = f"{kind.prefix}/{user.pk}/{uuid.uuid4().hex}.{ext}"
    upload = get_storage().presigned_put(kind.bucket, key, "image/jpeg" if ext == "jpg" else content_type, size)
    return {"kind": kind.name, "key": key, "upload": upload, "max_bytes": kind.max_bytes}


def check_uploaded(user, kind_name: str, key: str) -> int:
    """Validate a key the client says it uploaded. Returns its size in bytes."""
    kind = UPLOAD_KINDS[kind_name]
    match = _KEY_RE.match(key or "")
    if not match or match["prefix"] != kind.prefix or int(match["user"]) != user.pk:
        raise ValidationError({"key": "Unknown upload."})
    if match["ext"] not in kind.content_types.values():
        raise ValidationError({"key": "Unknown upload."})
    storage = get_storage()
    size = storage.size(kind.bucket, key)
    if size is None:
        raise ValidationError({"key": "Upload not found. Upload the file before confirming."})
    if size > kind.max_bytes:
        storage.delete_quietly(kind.bucket, key)
        raise ValidationError({"key": "File is too large."})
    return size


def process_image_upload(user, kind_name: str, key: str, public_prefix: str) -> dict:
    """Validate, process and store variants for an uploaded JPEG.

    Returns {"size", "width", "height", "exif", "variants"} where variants is
    name -> {"key", "width", "height"} in the public bucket.
    """
    size = check_uploaded(user, kind_name, key)
    storage = get_storage()
    data = storage.read(PRIVATE, key)
    try:
        processed = process_jpeg(data, settings.MAX_PHOTO_PIXELS)
    except InvalidImage as exc:
        storage.delete_quietly(PRIVATE, key)
        raise ValidationError({"key": str(exc)}) from exc

    stem = _KEY_RE.match(key)["stem"]
    variants = {}
    written = []
    try:
        for v in processed.variants:
            vkey = f"{public_prefix}/{user.pk}/{stem}/{v.name}.webp"
            storage.write(PUBLIC, vkey, v.data, v.content_type)
            written.append(vkey)
            variants[v.name] = {"key": vkey, "width": v.width, "height": v.height}
    except Exception:
        for vkey in written:
            storage.delete_quietly(PUBLIC, vkey)
        raise
    return {
        "size": size,
        "width": processed.width,
        "height": processed.height,
        "exif": processed.exif,
        "variants": variants,
    }
