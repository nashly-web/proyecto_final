"""
routes/notif_routes.py - Endpoints HTTP de notificaciones.

Expone 2 vistas:
- Admin: lista y marca notificaciones del sistema (requiere email admin).
- Usuario: lista y marca notificaciones dirigidas al usuario (target_uid).

Estos endpoints delegan la logica de Odoo en routes/notifications.py
"""

import time

from flask import Blueprint, jsonify, request, session

from security import login_required, require_admin
from routes.notifications import (
get_notifications, get_user_notifications,
mark_read, mark_all_read, mark_all_read_for_user
)
from routes.notifications import push_notification
from routes.notifications import delete_for_user, delete_admin_feed
from scheduler import generate_daily_tip

notif_bp = Blueprint("notif", __name__)


# --- Admin -----------------------------------------------------------------
# Notificaciones del "sistema" (target_uid=False). Solo el admin puede verlas.

@notif_bp.route("/", methods=["GET"])
@require_admin
def get_notifs():
    """Admin: lista notificaciones del sistema."""
    unread_only = request.args.get("unread") == "1"
    notifs = get_notifications(limit=100, unread_only=unread_only)
    return jsonify({"ok": True, "notifications": notifs, "unread": sum(1 for n in notifs if not n["read"])})


@notif_bp.route("/read", methods=["POST"])
@require_admin
def read_notifs():
    """Admin: marca notificaciones como leidas (ids o todas)."""
    data = request.get_json() or {}
    ids  = data.get("ids", [])
    mark_read(ids) if ids else mark_all_read()
    return jsonify({"ok": True})


@notif_bp.route("/delete-all", methods=["POST"])
@require_admin
def delete_all_notifs():
    """Admin: borra TODAS las notificaciones del feed admin."""
    ok = delete_admin_feed()
    return jsonify({"ok": bool(ok)})


@notif_bp.route("/unread-count", methods=["GET"])
@require_admin
def unread_count():
    """Admin: contador de no leidas."""
    notifs = get_notifications(unread_only=True)
    return jsonify({"count": len(notifs)})


# --- Usuario ---------------------------------------------------------------
# Notificaciones dirigidas al usuario autenticado (target_uid=uid).

@notif_bp.route("/mine", methods=["GET"])
@login_required
def get_my_notifs():
    """Usuario: lista notificaciones dirigidas al usuario autenticado."""
    uid = session.get("uid")
    notifs = get_user_notifications(uid, limit=50)
    return jsonify({"ok": True, "notifications": notifs, "unread": sum(1 for n in notifs if not n["read"])})


@notif_bp.route("/mine/read", methods=["POST"])
@login_required
def read_my_notifs():
    """Usuario: marca notificaciones como leidas (ids o todas)."""
    uid = session.get("uid")
    data = request.get_json() or {}
    ids  = data.get("ids", [])
    mark_read(ids) if ids else mark_all_read_for_user(uid)
    return jsonify({"ok": True})


@notif_bp.route("/mine/delete-all", methods=["POST"])
@login_required
def delete_my_notifs():
    """Usuario: borra TODAS sus notificaciones."""
    uid = session.get("uid")
    ok = delete_for_user(uid)
    return jsonify({"ok": bool(ok)})


@notif_bp.route("/mine/unread-count", methods=["GET"])
@login_required
def my_unread_count():
    """Usuario: contador de no leidas."""
    uid = session.get("uid")
    notifs = get_user_notifications(uid, unread_only=True, limit=100)
    return jsonify({"count": len(notifs)})

@notif_bp.route("/mine/push", methods=["POST"])
@login_required
def push_my_notif():
    """
    Usuario: crea una notificacion dirigida a si mismo.
    Uso principal: med_reminder generado por el frontend para reflejarlo en la campana.
    """
    uid = session.get("uid")

    data = request.get_json() or {}
    notif_type = (data.get("type") or "").strip()
    if notif_type != "med_reminder":
        return jsonify({"error": "Tipo no permitido"}), 400

    name = str(data.get("name") or "Recordatorio medicamento").strip()[:140]
    message = str(data.get("message") or "").strip()[:240]
    if not message:
        return jsonify({"error": "Mensaje requerido"}), 400

    # Dedup simple: si ya existe una igual en los ultimos ~2 min, no crear otra.
    try:
        recent = get_user_notifications(uid, limit=5) or []
        for n in recent:
            if n.get("type") != "med_reminder":
                continue
            if (n.get("name") or "") != name:
                continue
            if (n.get("message") or "") != message:
                continue
            ts = float(n.get("ts") or 0)
            if ts and (time.time() - ts) < 120:
                return jsonify({"ok": True, "skipped": True})
    except Exception:
        pass

    push_notification("med_reminder", message, uid=uid, name=name, target_uid=uid)
    return jsonify({"ok": True})


@notif_bp.route("/daily-tip", methods=["POST"])
@login_required
def daily_tip():
    """Genera (si aplica) el tip diario para el usuario autenticado."""
    uid = session.get("uid")
    res = generate_daily_tip(uid) or {}
    return jsonify({"ok": True, "tip": res.get("tip"), "new": bool(res.get("new"))})


# --- Debug -----------------------------------------------------------------
# Endpoints de ayuda para diagnosticar por que no aparecen notificaciones.

@notif_bp.route("/debug/push", methods=["POST"])
@login_required
def debug_push():
    """
    POST /api/notifications/debug/push
    Body:
      { "to": "user"|"admin", "type": "info", "title": "...", "message": "..." }
    """
    uid = int(session.get("uid"))
    data = request.get_json(silent=True) or {}
    to = (data.get("to") or "user").strip().lower()
    notif_type = (data.get("type") or "info").strip()
    title = (data.get("title") or "Debug").strip()[:140]
    message = (data.get("message") or "Notificacion de prueba").strip()[:240]

    if to not in ("user", "admin"):
        return jsonify({"error": "to debe ser user o admin"}), 400

    ok = push_notification(
        notif_type,
        message,
        uid=uid,
        name=title,
        target_uid=(uid if to == "user" else None),
    )
    if not ok:
        return jsonify({"ok": False, "error": "No se pudo crear la notificacion en Odoo"}), 500
    return jsonify({"ok": True})


@notif_bp.route("/debug/status", methods=["GET"])
@require_admin
def debug_status():
    """
    GET /api/notifications/debug/status
    Verifica acceso a Odoo y lectura de notificaciones.
    """
    uid = session.get("uid")
    try:
        admin_feed = get_notifications(limit=1) or []
        user_feed = get_user_notifications(uid, limit=1) or []
        return jsonify({
            "ok": True,
            "admin_sample": admin_feed[0] if admin_feed else None,
            "user_sample": user_feed[0] if user_feed else None,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
