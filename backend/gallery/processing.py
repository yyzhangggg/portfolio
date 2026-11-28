"""
Image processing for uploads. Pure Pillow, no Django imports, so it can be
tested on its own.

- Only JPEG is accepted (decided 2026-11-27).
- The original is kept untouched in private storage.
- Public variants are re-encoded as WebP after applying the EXIF orientation;
  they carry no EXIF at all, so GPS and other metadata never leave the
  private original.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime
from fractions import Fraction

from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

# name -> longest edge in pixels. Never upscaled.
VARIANT_SIZES = {
    "thumb": 480,
    "medium": 1200,
    "large": 2400,
}
WEBP_QUALITY = 82

_EXIF_IFD = ExifTags.IFD.Exif
_TAG = {name: tag for tag, name in ExifTags.TAGS.items()}


class InvalidImage(ValueError):
    """The upload is not an acceptable image."""


@dataclass
class Variant:
    name: str
    data: bytes
    width: int
    height: int
    content_type: str = "image/webp"


@dataclass
class ProcessedImage:
    width: int
    height: int
    variants: list[Variant]
    exif: dict = field(default_factory=dict)


def open_jpeg(data: bytes, max_pixels: int) -> Image.Image:
    """Open and validate a JPEG, rejecting anything else."""
    Image.MAX_IMAGE_PIXELS = max_pixels
    try:
        img = Image.open(io.BytesIO(data))
        img_format = img.format
        img.load()
    except Image.DecompressionBombError as exc:
        raise InvalidImage("Image is too large.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImage("File is not a readable image.") from exc
    if img_format != "JPEG":
        raise InvalidImage("Only JPEG images are accepted.")
    if img.width * img.height > max_pixels:
        raise InvalidImage("Image is too large.")
    return img


def _ratio_to_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _clean_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode("utf-8", "ignore")
    return str(value).replace("\x00", "").strip()[:120]


def format_shutter(seconds: float | None) -> str:
    if not seconds or seconds <= 0:
        return ""
    if seconds >= 1:
        return f"{seconds:g}s"
    frac = Fraction(seconds).limit_denominator(16000)
    if frac.numerator == 1:
        return f"1/{frac.denominator}s"
    return f"1/{round(1 / seconds)}s"


def extract_exif(img: Image.Image) -> dict:
    """Read the camera fields we display. GPS is deliberately ignored."""
    exif = img.getexif()
    if not exif:
        return {}
    sub = exif.get_ifd(_EXIF_IFD)

    def get(name):
        tag = _TAG.get(name)
        if tag is None:
            return None
        return sub.get(tag, exif.get(tag))

    make = _clean_text(get("Make"))
    model = _clean_text(get("Model"))
    camera = model if (not make or model.lower().startswith(make.lower().split()[0])) else f"{make} {model}"

    focal = _ratio_to_float(get("FocalLength"))
    aperture = _ratio_to_float(get("FNumber"))
    exposure = _ratio_to_float(get("ExposureTime"))
    iso = get("ISOSpeedRatings") or get("PhotographicSensitivity")
    if isinstance(iso, (tuple, list)):
        iso = iso[0] if iso else None

    taken_at = None
    raw_date = _clean_text(get("DateTimeOriginal") or get("DateTime"))
    if raw_date:
        try:
            taken_at = datetime.strptime(raw_date, "%Y:%m:%d %H:%M:%S")
        except ValueError:
            taken_at = None

    result = {
        "camera": camera.strip(),
        "lens": _clean_text(get("LensModel")),
        "focal_length": f"{focal:g}mm" if focal else "",
        "aperture": f"f/{aperture:g}" if aperture else "",
        "shutter_speed": format_shutter(exposure),
        "iso": int(iso) if isinstance(iso, (int, float)) and iso > 0 else None,
        "taken_at": taken_at,
    }
    return {k: v for k, v in result.items() if v not in ("", None)}


def make_variants(img: Image.Image, sizes: dict[str, int] | None = None) -> tuple[int, int, list[Variant]]:
    """Return the oriented width/height and WebP variants of the image."""
    sizes = sizes or VARIANT_SIZES
    oriented = ImageOps.exif_transpose(img)
    icc_profile = img.info.get("icc_profile")
    if oriented.mode not in ("RGB", "L"):
        oriented = oriented.convert("RGB")
    width, height = oriented.size

    variants = []
    for name, longest in sizes.items():
        copy = oriented.copy()
        if max(width, height) > longest:
            copy.thumbnail((longest, longest), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        save_kwargs = {"format": "WEBP", "quality": WEBP_QUALITY, "method": 5}
        if icc_profile:
            save_kwargs["icc_profile"] = icc_profile
        copy.save(buf, **save_kwargs)
        variants.append(Variant(name=name, data=buf.getvalue(), width=copy.width, height=copy.height))
    return width, height, variants


def process_jpeg(data: bytes, max_pixels: int, sizes: dict[str, int] | None = None) -> ProcessedImage:
    img = open_jpeg(data, max_pixels)
    exif = extract_exif(img)
    width, height, variants = make_variants(img, sizes)
    return ProcessedImage(width=width, height=height, variants=variants, exif=exif)
