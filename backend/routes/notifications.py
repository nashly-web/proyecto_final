"""
backend/routes/notifications.py - Helper centralizado de notificaciones.

Este archivo NO define un Blueprint. Es un helper usado por otros routes para:
- crear notificaciones en Odoo (push_notification)
- listar notificaciones (admin o por usuario)
- marcar notificaciones como leidas

Modelo Odoo: x.emergelens.notification

ASCII only (sin emojis) para evitar textos raros en la app.
"""

import os
import time

import requests

ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_ODOO_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_ODOO_PASS = os.getenv("ADMIN_ODOO_PASS", "2408")

NOTIF_TITLES = {
    "new_user": "Nuevo usuario",
    "user_login": "Inicio de sesion",
    "emergency": "Emergencia activa",
    "user_sick": "Reporte de salud",
    "danger_detected": "Posible peligro detectado",
    "geofence_warning": "Fuera de zona segura",
    "danger_confirm": "Confirmar peligro",
    "contact_alert": "Alerta a contacto",
    "med_reminder": "Recordatorio medicamento",
    "daily_tip": "Consejo del dia",
    "operator_msg": "Mensaje",
    "info": "Informacion",
}


def _fix_text(s):
    # Best-effort cleanup for old records that may contain mojibake text.
    if not s:
        return ""
    s = str(s)
    if any(x in s for x in ("\u00c3", "\u00c2", "\u00e2")):
        try:
            s = s.encode("latin1", errors="ignore").decode("utf-8", errors="ignore")
        except Exception:
            pass
    # Force ASCII (removes accents/emojis/symbols).
    try:
        import unicodedata

        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    except Exception:
        pass
    return s


def _odoo_session():
    s = requests.Session()
    s.post(
        f"{ODOO_URL}/web/session/authenticate",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"db": ODOO_DB, "login": ADMIN_ODOO_EMAIL, "password": ADMIN_ODOO_PASS},
        },
        timeout=10,
    )
    return s


def _odoo_call(s, model, method, args, kwargs=None):
    if kwargs is None:
        kwargs = {}
    res = s.post(
        f"{ODOO_URL}/web/dataset/call_kw",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"model": model, "method": method, "args": args, "kwargs": kwargs},
        },
        timeout=15,
    )
    data = res.json()
    if data.get("error"):
        raise Exception(data["error"].get("data", {}).get("message", "Odoo error"))
    return data["result"]


def _serialize(r):
    raw_uid = r.get("x_user_id")
    uid_val = raw_uid[0] if isinstance(raw_uid, (list, tuple)) and raw_uid else None
    uid_name = raw_uid[1] if isinstance(raw_uid, (list, tuple)) and len(raw_uid) > 1 else ""

    raw_target = r.get("x_target_uid")
    target_val = raw_target[0] if isinstance(raw_target, (list, tuple)) and raw_target else None

    name = _fix_text(r.get("x_name") or r.get("x_title") or "")

    return {
        "id": r["id"],
        "name": name,
        "type": r.get("x_type", "info"),
        "message": _fix_text(r.get("x_message", "")),
        "uid": uid_val,
        "uid_name": uid_name,
        "target_uid": target_val,
        "read": bool(r.get("x_read", False)),
        "ts": r.get("x_ts", 0),
    }


def push_notification(notif_type, message, uid=None, name=None, target_uid=None):
    try:
        s = _odoo_session()

        # Throttle daily tips so the notification tray doesn't get flooded.
        # This is an extra safety net in case multiple clients hit /daily-tip often,
        # or DAILY_TIP_COOLDOWN_HOURS is configured too low.
        if notif_type == "daily_tip" and target_uid is not None:
            min_s = float(os.getenv("DAILY_TIP_MIN_SECONDS", "180") or "180")
            if min_s > 0:
                recent = _odoo_call(
                    s,
                    "x.emergelens.notification",
                    "search",
                    [[
                        ["x_target_uid", "=", int(target_uid)],
                        ["x_type", "=", "daily_tip"],
                        ["x_ts", ">=", time.time() - min_s],
                    ]],
                    {"limit": 1},
                )
                if recent:
                    return

        vals = {
            "x_name": name or NOTIF_TITLES.get(notif_type, "Notificacion"),
            "x_type": notif_type,
            "x_message": message,
            "x_read": False,
            "x_ts": time.time(),
        }
        if uid is not None:
            vals["x_user_id"] = int(uid)
        if target_uid is not None:
            vals["x_target_uid"] = int(target_uid)

        _odoo_call(s, "x.emergelens.notification", "create", [vals])
        return True
    except Exception as e:
        print(f"[notifications] push_notification error: {e}")
        return False


def get_notifications(limit=50, unread_only=False):
    # Admin feed: target_uid=False
    try:
        s = _odoo_session()
        domain = [["x_target_uid", "=", False]]
        if unread_only:
            domain.append(["x_read", "=", False])
        results = _odoo_call(
            s,
            "x.emergelens.notification",
            "search_read",
            [domain],
            {
                "fields": ["x_name", "x_title", "x_type", "x_message", "x_user_id", "x_target_uid", "x_read", "x_ts"],
                "order": "x_ts desc",
                "limit": limit,
            },
        )
        return [_serialize(r) for r in results]
    except Exception as e:
        print(f"[notifications] get_notifications error: {e}")
        return []


def get_user_notifications(uid, limit=50, unread_only=False):
    try:
        s = _odoo_session()
        domain = [["x_target_uid", "=", int(uid)]]
        if unread_only:
            domain.append(["x_read", "=", False])
        results = _odoo_call(
            s,
            "x.emergelens.notification",
            "search_read",
            [domain],
            {
                "fields": ["x_name", "x_title", "x_type", "x_message", "x_user_id", "x_target_uid", "x_read", "x_ts"],
                "order": "x_ts desc",
                "limit": limit,
            },
        )
        return [_serialize(r) for r in results]
    except Exception as e:
        print(f"[notifications] get_user_notifications error: {e}")
        return []


def mark_read(notif_ids):
    try:
        s = _odoo_session()
        _odoo_call(s, "x.emergelens.notification", "write", [notif_ids, {"x_read": True}])
        return True
    except Exception as e:
        print(f"[notifications] mark_read error: {e}")
        return False


def mark_all_read():
    try:
        s = _odoo_session()
        unread = _odoo_call(
            s,
            "x.emergelens.notification",
            "search",
            [[["x_read", "=", False], ["x_target_uid", "=", False]]],
        )
        if unread:
            _odoo_call(s, "x.emergelens.notification", "write", [unread, {"x_read": True}])
        return True
    except Exception as e:
        print(f"[notifications] mark_all_read error: {e}")
        return False


def mark_all_read_for_user(uid):
    try:
        s = _odoo_session()
        unread = _odoo_call(
            s,
            "x.emergelens.notification",
            "search",
            [[["x_read", "=", False], ["x_target_uid", "=", int(uid)]]],
        )
        if unread:
            _odoo_call(s, "x.emergelens.notification", "write", [unread, {"x_read": True}])
        return True
    except Exception as e:
        print(f"[notifications] mark_all_read_for_user error: {e}")
        return False


def delete_for_user(uid):
    """Borra TODAS las notificaciones dirigidas al usuario (target_uid=uid)."""
    try:
        s = _odoo_session()
        ids = _odoo_call(
            s,
            "x.emergelens.notification",
            "search",
            [[["x_target_uid", "=", int(uid)]]],
        )
        if ids:
            _odoo_call(s, "x.emergelens.notification", "unlink", [ids])
        return True
    except Exception as e:
        print(f"[notifications] delete_for_user error: {e}")
        return False


def delete_admin_feed():
    """Borra TODAS las notificaciones del feed admin (target_uid=False)."""
    try:
        s = _odoo_session()
        ids = _odoo_call(
            s,
            "x.emergelens.notification",
            "search",
            [[["x_target_uid", "=", False]]],
        )
        if ids:
            _odoo_call(s, "x.emergelens.notification", "unlink", [ids])
        return True
    except Exception as e:
        print(f"[notifications] delete_admin_feed error: {e}")
        return False
