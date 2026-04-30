"""
backend/security.py - Auth helpers (session) + simple RBAC.

This project uses Flask sessions (cookie-based). We derive roles server-side and
never trust client-supplied identity fields like requester_email.
"""

from __future__ import annotations

import os
from functools import wraps
from typing import Callable, Iterable

from flask import jsonify, request, session


# ----------------------------------------------------------------------------
# Admin "fijo" por email
# - Para este proyecto, ser admin es tener el mismo email que ADMIN_EMAIL.
# - Esto simplifica el RBAC: el rol se deriva del servidor (no del cliente).
# ----------------------------------------------------------------------------
ADMIN_EMAIL = (
    os.getenv("ADMIN_EMAIL", os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com"))
    or ""
).strip()


def current_user():
    # Lee al usuario autenticado desde la session.
    # Si roles no existe, se calcula (admin/user) y se guarda en session.
    uid = session.get("uid")
    email = (session.get("email") or "").strip()
    name = (session.get("name") or "").strip()

    roles = session.get("roles")
    if not isinstance(roles, list) or not roles:
        roles = ["admin"] if email and ADMIN_EMAIL and email == ADMIN_EMAIL else ["user"]
        session["roles"] = roles

    return {"uid": uid, "email": email, "name": name, "roles": roles}


def is_admin(email: str | None = None) -> bool:
    em = (email if email is not None else (session.get("email") or "")).strip()
    return bool(em and ADMIN_EMAIL and em == ADMIN_EMAIL)


def set_session_user(*, uid: int, name: str, email: str):
    # Punto central para "loguear" al usuario en session.
    # Esta funcion se usa en routes/auth.py luego de autenticar contra Odoo.
    session["uid"] = int(uid)
    session["name"] = (name or "").strip() or email
    session["email"] = (email or "").strip()
    session["roles"] = ["admin"] if is_admin(email) else ["user"]


def _client_identity_mismatch() -> tuple[dict, int]:
    return {"error": "Identidad del request no coincide con la sesion"}, 403


def enforce_requester_email_match(value: str | None) -> tuple[dict, int] | None:
    """
    Compatibility helper: some frontend calls still send requester_email.
    If provided, it must match the authenticated session email.
    """
    # NOTA: el backend no confia en requester_email para autorizar.
    # Solo se usa para detectar mismatches de llamadas antiguas del frontend.
    if value is None:
        return None
    sent = (value or "").strip()
    sess = (session.get("email") or "").strip()
    if not sent or not sess:
        return _client_identity_mismatch()
    if sent.lower() != sess.lower():
        return _client_identity_mismatch()
    return None


def login_required(fn: Callable):
    # Decorator: bloquea endpoints si no hay uid en session.
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"error": "No autenticado"}), 401
        return fn(*args, **kwargs)

    return wrapper


def require_roles(*required_roles: str):
    # Decorator: permite el endpoint solo si el usuario tiene uno de los roles.
    # Ej: require_admin = require_roles("admin")
    required = {r.strip().lower() for r in required_roles if (r or "").strip()}

    def deco(fn: Callable):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not session.get("uid"):
                return jsonify({"error": "No autenticado"}), 401

            roles = current_user().get("roles") or []
            roles = {str(r).strip().lower() for r in roles}
            if required and roles.isdisjoint(required):
                return jsonify({"error": "No autorizado"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return deco


require_admin = require_roles("admin")


def requester_email_from_request() -> str | None:
    """
    Reads requester_email from either args or JSON body (best effort).
    Used only for backwards compatibility + matching against session.
    """
    # Best-effort para soportar clientes que mandan requester_email en query o body.
    val = request.args.get("requester_email")
    if val:
        return val
    try:
        data = request.get_json(silent=True) or {}
        return data.get("requester_email")
    except Exception:
        return None
