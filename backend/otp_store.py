"""
backend/otp_store.py - Simple in-memory OTP store for email verification.

Nota: es in-memory (no persiste entre reinicios / multi-workers).
Para producción, mover a Redis/DB.
"""

from __future__ import annotations

import hashlib
import secrets
import threading
import time
from dataclasses import dataclass


OTP_LEN = 6
OTP_TTL_SECONDS = 300  # 5 minutos
MAX_ATTEMPTS = 8
RESEND_COOLDOWN_SECONDS = 20
MAX_SENDS_PER_15MIN = 5
SEND_WINDOW_SECONDS = 15 * 60


def _now() -> int:
    return int(time.time())


def _hash_code(code: str, salt: str) -> str:
    h = hashlib.sha256()
    h.update((salt + ":" + code).encode("utf-8"))
    return h.hexdigest()


def _mask_email(email: str) -> str:
    email = (email or "").strip()
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        local_mask = local[:1] + "*"
    else:
        local_mask = local[:2] + "*" * max(1, len(local) - 2)
    return f"{local_mask}@{domain}"


@dataclass
class OTPEntry:
    email: str
    salt: str
    code_hash: str
    expires_at: int
    attempts: int
    last_sent_at: int
    send_timestamps: list[int]


_lock = threading.Lock()
_store: dict[str, OTPEntry] = {}


def _cleanup_locked(now: int) -> None:
    dead = [k for k, v in _store.items() if v.expires_at <= now or v.attempts >= MAX_ATTEMPTS]
    for k in dead:
        _store.pop(k, None)


def request_email_otp(email: str) -> tuple[str, dict]:
    """
    Returns (code, meta) where code is the plain OTP to email.
    meta: expires_at, expires_in, masked_email
    """
    key = (email or "").strip().lower()
    now = _now()
    with _lock:
        _cleanup_locked(now)
        existing = _store.get(key)
        if existing:
            # rate limit send frequency
            if now - existing.last_sent_at < RESEND_COOLDOWN_SECONDS:
                raise ValueError("Espera un momento antes de reenviar el código.")
            # rate limit window
            existing.send_timestamps = [t for t in existing.send_timestamps if now - t <= SEND_WINDOW_SECONDS]
            if len(existing.send_timestamps) >= MAX_SENDS_PER_15MIN:
                raise ValueError("Demasiados envíos. Intenta de nuevo más tarde.")

        code = "".join(str(secrets.randbelow(10)) for _ in range(OTP_LEN))
        salt = secrets.token_hex(16)
        entry = OTPEntry(
            email=key,
            salt=salt,
            code_hash=_hash_code(code, salt),
            expires_at=now + OTP_TTL_SECONDS,
            attempts=0,
            last_sent_at=now,
            send_timestamps=(existing.send_timestamps if existing else []) + [now],
        )
        _store[key] = entry

    return code, {
        "expires_at": entry.expires_at,
        "expires_in": OTP_TTL_SECONDS,
        "masked_email": _mask_email(email),
    }


def verify_email_otp(email: str, code: str) -> dict:
    key = (email or "").strip().lower()
    code = (code or "").strip()
    now = _now()
    with _lock:
        _cleanup_locked(now)
        entry = _store.get(key)
        if not entry:
            raise ValueError("Código expirado o no solicitado. Reenvía el código.")
        if entry.expires_at <= now:
            _store.pop(key, None)
            raise ValueError("Código expirado. Reenvía el código.")
        entry.attempts += 1
        if entry.attempts > MAX_ATTEMPTS:
            _store.pop(key, None)
            raise ValueError("Demasiados intentos. Reenvía el código.")
        if _hash_code(code, entry.salt) != entry.code_hash:
            raise ValueError("Código incorrecto.")

        # success: consume
        _store.pop(key, None)

    return {"ok": True}

