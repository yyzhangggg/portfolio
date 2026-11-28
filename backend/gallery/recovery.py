"""
Password recovery without email: one-time recovery codes.

Ten codes are generated per photographer and shown once. Only their hashes
are stored (with Django's password hasher), so a database leak does not
reveal them. Each code works once; generating a new set replaces the old one.
"""

from __future__ import annotations

import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from .models import RecoveryCode

CODE_COUNT = 10
# No 0/O, 1/I/L: easy to read back from paper or a screenshot.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
GROUPS, GROUP_LEN = 3, 4  # XXXX-XXXX-XXXX, about 59 bits each


def normalize(code: str) -> str:
    return "".join(ch for ch in (code or "").upper() if ch.isalnum())


def _new_code() -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(GROUPS * GROUP_LEN))
    return "-".join(raw[i : i + GROUP_LEN] for i in range(0, len(raw), GROUP_LEN))


@transaction.atomic
def generate_codes(user) -> list[str]:
    """Replace the user's recovery codes and return the new plain codes."""
    RecoveryCode.objects.filter(user=user).delete()
    codes = [_new_code() for _ in range(CODE_COUNT)]
    RecoveryCode.objects.bulk_create(RecoveryCode(user=user, code_hash=make_password(normalize(c))) for c in codes)
    return codes


def remaining(user) -> int:
    return RecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


def find_unused(user, code: str) -> RecoveryCode | None:
    """The matching unused code, or None. Does not use it up."""
    plain = normalize(code)
    if len(plain) != GROUPS * GROUP_LEN:
        return None
    for candidate in RecoveryCode.objects.filter(user=user, used_at__isnull=True):
        if check_password(plain, candidate.code_hash):
            return candidate
    return None


def use(code: RecoveryCode) -> bool:
    """Mark a code used. False if another request used it first."""
    updated = RecoveryCode.objects.filter(pk=code.pk, used_at__isnull=True).update(used_at=timezone.now())
    return updated == 1
