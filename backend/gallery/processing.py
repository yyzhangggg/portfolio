"""
Image processing for uploads. Pure Pillow, no Django imports, so it can be
tested on its own.

- Only JPEG is accepted (decided 2026-11-27).
- The original is kept untouched in private storage.
- Public variants are re-encoded as WebP after applying the EXIF orientation;
  they carry no EXIF at all, so GPS and other metadata never leave the
  private original.
- JPEGs are decoded at reduced scale when the full resolution is not needed
  ("draft" mode), which keeps memory and CPU low on small servers.
- An optional crop box (chosen in the dashboard) produces a separate set of
  "grid" variants; the full, uncropped variants are always kept as well.
"""

from __future__ import annotations

import io
import math
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
# Cropped versions are only used in grids and covers, so smaller sizes suffice.
GRID_VARIANT_SIZES = {
    "thumb": 480,
    "medium": 1200,
}
WEBP_QUALITY = 82
WEBP_METHOD = 4  # 0 (fast) .. 6 (small); 4 is a good trade-off on a weak CPU.

# Allowed crop ratios (width:height), also used for series grid cells.
RATIOS = {
    "3:4": 3 / 4,
    "4:3": 4 / 3,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
}
RATIO_TOLERANCE = 0.02

_EXIF_IFD = ExifTags.IFD.Exif
_ORIENTATION = 0x0112
_TAG = {name: tag for tag, name in ExifTags.TAGS.items()}


class InvalidImage(ValueError):
    """The upload is not an acceptable image."""


class InvalidCrop(ValueError):
    """The crop box is malformed."""


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


@dataclass(frozen=True)
class CropBox:
    """A crop in fractions (0–1) of the displayed (orientation-corrected) image."""

    x: float
    y: float
    width: float
    height: float

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


# --- Decoding ----------------------------------------------------------------


def _open(data: bytes, max_pixels: int) -> Image.Image:
    """Open (without decoding) and validate a JPEG."""
    Image.MAX_IMAGE_PIXELS = max_pixels
    try:
        img = Image.open(io.BytesIO(data))
    except Image.DecompressionBombError as exc:
        raise InvalidImage("Image is too large.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImage("File is not a readable image.") from exc
    if img.format != "JPEG":
        raise InvalidImage("Only JPEG images are accepted.")
    if img.width * img.height > max_pixels:
        raise InvalidImage("Image is too large.")
    return img


def _orientation(img: Image.Image) -> int:
    try:
        return int(img.getexif().get(_ORIENTATION, 1))
    except Exception:  # noqa: BLE001 - malformed EXIF must not block an upload
        return 1


def _oriented_size(img: Image.Image) -> tuple[int, int]:
    w, h = img.size
    return (h, w) if _orientation(img) in (5, 6, 7, 8) else (w, h)


def _decode(img: Image.Image, needed_longest: int, region: tuple[float, float] = (1.0, 1.0)) -> Image.Image:
    """Decode at the smallest JPEG scale that still covers `needed_longest`
    pixels across the region (fractions of width, height), then orient."""
    ow, oh = _oriented_size(img)
    region_longest = max(ow * region[0], oh * region[1])
    scale = min(1.0, needed_longest / region_longest) if region_longest else 1.0
    if scale < 1.0:
        w, h = img.size
        img.draft(None, (max(1, math.ceil(w * scale)), max(1, math.ceil(h * scale))))
    try:
        img.load()
    except (OSError, ValueError) as exc:
        raise InvalidImage("File is not a readable image.") from exc
    oriented = ImageOps.exif_transpose(img)
    if oriented.mode not in ("RGB", "L"):
        oriented = oriented.convert("RGB")
    return oriented


# --- EXIF --------------------------------------------------------------------


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
    try:
        exif = img.getexif()
    except Exception:  # noqa: BLE001
        return {}
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


# --- Variants ----------------------------------------------------------------


def _encode_variants(img: Image.Image, sizes: dict[str, int], icc_profile) -> list[Variant]:
    width, height = img.size
    variants = []
    for name, longest in sizes.items():
        copy = img.copy()
        if max(width, height) > longest:
            copy.thumbnail((longest, longest), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        kwargs = {"format": "WEBP", "quality": WEBP_QUALITY, "method": WEBP_METHOD}
        if icc_profile:
            kwargs["icc_profile"] = icc_profile
        copy.save(buf, **kwargs)
        variants.append(Variant(name=name, data=buf.getvalue(), width=copy.width, height=copy.height))
    return variants


def process_jpeg(data: bytes, max_pixels: int, sizes: dict[str, int] | None = None) -> ProcessedImage:
    """Validate a JPEG and build its full (uncropped) variants.

    width/height are the original's dimensions after orientation, not the
    variants', so layouts can reserve the right shape."""
    sizes = sizes or VARIANT_SIZES
    img = _open(data, max_pixels)
    exif = extract_exif(img)
    width, height = _oriented_size(img)
    icc = img.info.get("icc_profile")
    oriented = _decode(img, max(sizes.values()))
    return ProcessedImage(width=width, height=height, variants=_encode_variants(oriented, sizes, icc), exif=exif)


def parse_crop(raw, ratio: str, image_size: tuple[int, int]) -> CropBox:
    """Validate a crop box from the dashboard against the chosen ratio."""
    if ratio not in RATIOS:
        raise InvalidCrop(f"Ratio must be one of: {', '.join(RATIOS)}.")
    try:
        box = CropBox(*(float(raw[k]) for k in ("x", "y", "width", "height")))
    except (TypeError, KeyError, ValueError) as exc:
        raise InvalidCrop("Crop box needs x, y, width and height.") from exc
    if not all(math.isfinite(v) for v in box.to_dict().values()):
        raise InvalidCrop("Crop box values must be numbers.")
    eps = 1e-3
    if box.x < -eps or box.y < -eps or box.width < 0.02 or box.height < 0.02:
        raise InvalidCrop("Crop box is outside the image or too small.")
    if box.x + box.width > 1 + eps or box.y + box.height > 1 + eps:
        raise InvalidCrop("Crop box is outside the image.")
    w, h = image_size
    actual = (box.width * w) / (box.height * h)
    if abs(actual / RATIOS[ratio] - 1) > RATIO_TOLERANCE:
        raise InvalidCrop(f"Crop box does not match the {ratio} ratio.")
    # Clamp tiny rounding overshoot.
    x, y = max(0.0, box.x), max(0.0, box.y)
    return CropBox(x, y, min(box.width, 1 - x), min(box.height, 1 - y))


def crop_variants(data: bytes, max_pixels: int, box: CropBox, sizes: dict[str, int] | None = None) -> list[Variant]:
    """Build the cropped "grid" variants from the original."""
    sizes = sizes or GRID_VARIANT_SIZES
    img = _open(data, max_pixels)
    icc = img.info.get("icc_profile")
    oriented = _decode(img, max(sizes.values()), region=(box.width, box.height))
    w, h = oriented.size
    left = round(box.x * w)
    top = round(box.y * h)
    right = min(w, round((box.x + box.width) * w))
    bottom = min(h, round((box.y + box.height) * h))
    cropped = oriented.crop((left, top, right, bottom))
    return _encode_variants(cropped, sizes, icc)
