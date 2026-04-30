"""
backend/validation.py - Small input validation / sanitization helpers.

Goal: reduce accidental injections and invalid payloads without adding heavy deps.
"""

from __future__ import annotations

import re
from typing import Any


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def clean_str(value: Any, *, max_len: int = 500, allow_newlines: bool = False) -> str:
    s = "" if value is None else str(value)
    s = s.replace("\u0000", "")
    if not allow_newlines:
        s = s.replace("\r", " ").replace("\n", " ")
    s = " ".join(s.split()) if not allow_newlines else s.strip()
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s


def require_email(value: Any, *, max_len: int = 254) -> str:
    s = clean_str(value, max_len=max_len)
    if not s or not _EMAIL_RE.match(s):
        raise ValueError("Email invalido")
    return s


def as_int(value: Any, *, min_val: int | None = None, max_val: int | None = None) -> int:
    try:
        n = int(value)
    except Exception as e:
        raise ValueError("Numero invalido") from e
    if min_val is not None and n < min_val:
        raise ValueError("Numero fuera de rango")
    if max_val is not None and n > max_val:
        raise ValueError("Numero fuera de rango")
    return n


def as_float(value: Any, *, min_val: float | None = None, max_val: float | None = None) -> float:
    try:
        n = float(value)
    except Exception as e:
        raise ValueError("Numero invalido") from e
    if min_val is not None and n < min_val:
        raise ValueError("Numero fuera de rango")
    if max_val is not None and n > max_val:
        raise ValueError("Numero fuera de rango")
    return n

