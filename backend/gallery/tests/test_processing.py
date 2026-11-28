"""Tests for gallery.processing. Pure Pillow: run with `pytest gallery/tests/test_processing.py`."""

import io
import os
import sys

import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from gallery.processing import (  # noqa: E402
    InvalidImage,
    format_shutter,
    process_jpeg,
)

MAX_PIXELS = 80_000_000


def make_jpeg(size=(3000, 2000), exif=None, color=(120, 90, 60)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    kwargs = {"format": "JPEG", "quality": 90}
    if exif is not None:
        kwargs["exif"] = exif
    img.save(buf, **kwargs)
    return buf.getvalue()


def make_exif(orientation=None, with_gps=False):
    exif = Image.Exif()
    exif[0x010F] = "FUJIFILM"  # Make
    exif[0x0110] = "X-T5"  # Model
    if orientation:
        exif[0x0112] = orientation
    sub = exif.get_ifd(0x8769)
    sub[0x829A] = 1 / 250  # ExposureTime
    sub[0x829D] = 2.8  # FNumber
    sub[0x8827] = 400  # ISO
    sub[0x920A] = 35.0  # FocalLength
    sub[0x9003] = "2026:10:03 17:42:10"  # DateTimeOriginal
    sub[0xA434] = "XF35mmF1.4 R"  # LensModel
    if with_gps:
        gps = exif.get_ifd(0x8825)
        gps[1] = "N"
        gps[2] = (45.0, 30.0, 0.0)
    return exif


def test_variants_are_webp_and_never_upscaled():
    result = process_jpeg(make_jpeg((1000, 800)), MAX_PIXELS)
    sizes = {v.name: (v.width, v.height) for v in result.variants}
    assert sizes["thumb"] == (480, 384)
    assert sizes["medium"] == (1000, 800)
    assert sizes["large"] == (1000, 800)
    for v in result.variants:
        assert Image.open(io.BytesIO(v.data)).format == "WEBP"


def test_exif_fields_extracted():
    result = process_jpeg(make_jpeg(exif=make_exif()), MAX_PIXELS)
    assert result.exif["camera"] == "FUJIFILM X-T5"
    assert result.exif["lens"] == "XF35mmF1.4 R"
    assert result.exif["aperture"] == "f/2.8"
    assert result.exif["shutter_speed"] == "1/250s"
    assert result.exif["iso"] == 400
    assert result.exif["focal_length"] == "35mm"
    assert result.exif["taken_at"].year == 2026


def test_variants_carry_no_exif_or_gps():
    result = process_jpeg(make_jpeg(exif=make_exif(with_gps=True)), MAX_PIXELS)
    assert "gps" not in result.exif
    for v in result.variants:
        out = Image.open(io.BytesIO(v.data))
        exif = out.getexif()
        assert not exif.get_ifd(0x8825)
        assert 0x8825 not in exif


def test_orientation_is_applied():
    # Orientation 6 = rotate 90° CW: a 3000x2000 sensor image displays portrait.
    result = process_jpeg(make_jpeg((3000, 2000), exif=make_exif(orientation=6)), MAX_PIXELS)
    assert (result.width, result.height) == (2000, 3000)
    large = next(v for v in result.variants if v.name == "large")
    assert large.height > large.width


def test_png_rejected():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, format="PNG")
    with pytest.raises(InvalidImage, match="Only JPEG"):
        process_jpeg(buf.getvalue(), MAX_PIXELS)


def test_garbage_rejected():
    with pytest.raises(InvalidImage):
        process_jpeg(b"not an image", MAX_PIXELS)


def test_too_many_pixels_rejected():
    with pytest.raises(InvalidImage, match="too large"):
        process_jpeg(make_jpeg((2000, 2000)), max_pixels=1_000_000)


@pytest.mark.parametrize(
    "seconds,expected",
    [(1 / 250, "1/250s"), (1 / 8000, "1/8000s"), (0.5, "1/2s"), (2, "2s"), (None, ""), (0.3, "1/3s")],
)
def test_format_shutter(seconds, expected):
    assert format_shutter(seconds) == expected


# --- reduced-scale decoding and cropping ------------------------------------

from gallery.processing import CropBox, InvalidCrop, crop_variants, parse_crop  # noqa: E402


def test_large_image_reports_full_size_but_decodes_small():
    result = process_jpeg(make_jpeg((6000, 4000)), MAX_PIXELS)
    assert (result.width, result.height) == (6000, 4000)
    large = next(v for v in result.variants if v.name == "large")
    assert (large.width, large.height) == (2400, 1600)


def test_parse_crop_accepts_matching_ratio():
    box = parse_crop({"x": 0.1, "y": 0, "width": 0.5, "height": 1}, "3:4", (3000, 2000))
    assert isinstance(box, CropBox)


@pytest.mark.parametrize(
    "raw,ratio",
    [
        ({"x": 0, "y": 0, "width": 1, "height": 1}, "16:9"),  # wrong shape for a 3:2 image
        ({"x": 0.8, "y": 0, "width": 0.5, "height": 0.5}, "4:3"),  # outside
        ({"x": 0, "y": 0, "width": 0.01, "height": 0.01}, "4:3"),  # too small
        ({"x": 0, "y": 0}, "4:3"),  # missing keys
        ({"x": 0, "y": 0, "width": 1, "height": 1}, "1:1"),  # unknown ratio
    ],
)
def test_parse_crop_rejects(raw, ratio):
    with pytest.raises(InvalidCrop):
        parse_crop(raw, ratio, (3000, 2000))


def test_crop_variants_have_the_crop_ratio():
    # 3000x2000 image; a 9:16 crop: height full (2000px), width 1125px -> 0.375 of width.
    box = parse_crop({"x": 0.3, "y": 0, "width": 0.375, "height": 1}, "9:16", (3000, 2000))
    variants = crop_variants(make_jpeg((3000, 2000)), MAX_PIXELS, box)
    assert [v.name for v in variants] == ["thumb", "medium"]
    medium = variants[1]
    assert medium.height == 1200
    assert abs(medium.width / medium.height - 9 / 16) < 0.01


def test_crop_respects_orientation():
    # Sensor 3000x2000 rotated to portrait 2000x3000; a 3:4 crop of the full width.
    exif = make_exif(orientation=6)
    box = parse_crop({"x": 0, "y": 0.1, "width": 1, "height": (2000 * 4 / 3) / 3000}, "3:4", (2000, 3000))
    variants = crop_variants(make_jpeg((3000, 2000), exif=exif), MAX_PIXELS, box)
    thumb = variants[0]
    assert abs(thumb.width / thumb.height - 3 / 4) < 0.01
