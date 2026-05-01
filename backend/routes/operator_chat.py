"""
routes/operator_chat.py - Chat operador (admin) <-> usuario + mensajes programados.

Modelos Odoo (addon emergelens):
- x.emergelens.operator.chat
- x.emergelens.scheduled.msg

Rutas principales (bajo /api/operator_chat):
- GET  /operator-chat/<user_id>?requester_email=...
- POST /operator-chat/send
- GET  /operator-chat/unread/<user_id>
- GET  /operator-chat/users?admin_email=...

Incluye endpoints de schedule para AdminOperatorPanel:
- GET/POST /schedule
- POST     /schedule/generate-ai
- PATCH    /schedule/<id>/toggle
- DELETE   /schedule/<id>

ASCII only (sin emojis/tildes) para evitar simbolos raros en la UI.
"""

import os
import json
import threading
import time
from datetime import datetime, timezone, timedelta

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

import requests
from flask import Blueprint, jsonify, request, session

from security import enforce_requester_email_match, is_admin as sess_is_admin, login_required, require_admin
from validation import as_int, clean_str
from mailer import send_html_email

from routes.audit import log_audit
from routes.notifications import push_notification

operator_chat_bp = Blueprint("operator_chat", __name__)

ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ODOO_USER = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ODOO_PASS = os.getenv("ADMIN_ODOO_PASS", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "sosemergelens@gmail.com")

# Keep the same default behavior as /api/chat (Groq) so admin AI generation works out-of-the-box.
GROQ_API_KEY = os.getenv(
    "GROQ_API_KEY",
    "",
)
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

CHAT_MODEL = "x.emergelens.operator.chat"
SCHEDULE_MODEL = "x.emergelens.scheduled.msg"

_uid_cache = None
_bg_started = False
_bg_lock = threading.Lock()


def _rpc(payload):
    r = requests.post(f"{ODOO_URL}/jsonrpc", json=payload, timeout=15)
    data = r.json()
    if "error" in data:
        msg = data["error"].get("data", {}).get("message") or data["error"].get("message", "Odoo error")
        raise Exception(msg)
    return data.get("result")


def _get_uid():
    global _uid_cache
    if _uid_cache is not None:
        return _uid_cache
    if not ODOO_PASS:
        raise Exception("Falta ADMIN_ODOO_PASS en variables de entorno")
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {"service": "common", "method": "authenticate", "args": [ODOO_DB, ODOO_USER, ODOO_PASS, {}]},
    }
    _uid_cache = _rpc(payload)
    return _uid_cache


def odoo_call(model, method, args=None, kwargs=None):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [ODOO_DB, _get_uid(), ODOO_PASS, model, method, args or [], kwargs or {}],
        },
    }
    return _rpc(payload)


def _is_admin(email):
    return (email or "") == ADMIN_EMAIL


def _user_id_from_email(email):
    email = (email or "").strip()
    if not email:
        return None
    rows = odoo_call("res.users", "search_read", [[["login", "=", email]]], {"fields": ["id"], "limit": 1})
    return rows[0]["id"] if rows else None


def _user_name_from_id(user_id: int):
    try:
        rows = odoo_call("res.users", "search_read", [[["id", "=", int(user_id)]]], {"fields": ["name"], "limit": 1})
        name = (rows[0].get("name") or "").strip() if rows else ""
        return name or f"Usuario {int(user_id)}"
    except Exception:
        return f"Usuario {int(user_id)}"


def _now_utc_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _email_operator_notification(user_id: int, content: str) -> None:
    if (os.getenv("OPERATOR_EMAIL_NOTIFS") or "0").strip() != "1":
        return
    try:
        rows = odoo_call("res.users", "read", [[int(user_id)], ["login", "name"]])
        if not rows:
            return
        to_email = (rows[0].get("login") or "").strip()
        if not to_email or "@" not in to_email:
            return
        name = (rows[0].get("name") or "Usuario").strip()
        safe = (
            (content or "").strip().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        )
        html = f"""<!doctype html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#0D1B2A;margin:0;padding:0">
  <div style="max-width:640px;margin:0 auto;padding:20px">
    <div style="background:#1E3A5F;border-radius:12px 12px 0 0;padding:18px 20px">
      <h2 style="color:#fff;margin:0;font-size:18px">Nuevo mensaje del operador</h2>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:13px">EmergeLens</p>
    </div>
    <div style="background:#152238;border:1px solid rgba(255,255,255,.08);border-top:none;border-radius:0 0 12px 12px;padding:18px 20px;color:#fff">
      <p style="margin:0 0 10px">Hola {name}, tienes un nuevo mensaje:</p>
      <div style="background:#0D1B2A;border-radius:10px;padding:14px;white-space:pre-wrap">{safe}</div>
      <p style="margin:12px 0 0;font-size:12px;opacity:.75">Abre la app para responder.</p>
    </div>
  </div>
</body></html>"""
        send_html_email(to_email=to_email, subject="Nuevo mensaje - EmergeLens", html=html)
    except Exception as e:
        print(f"[operator_chat] email notif error: {e}")


def _mark_read_for_requester(msgs, requester_email, user_id):
    # If requester is user: mark admin messages as read.
    # If requester is admin: mark user messages as read.
    role_to_mark = "admin" if not _is_admin(requester_email) else "user"
    unread_ids = [m["id"] for m in msgs if (not m.get("x_read")) and m.get("x_sender_role") == role_to_mark]
    if unread_ids:
        odoo_call(CHAT_MODEL, "write", [unread_ids, {"x_read": True}])


@operator_chat_bp.route("/operator-chat/<int:user_id>", methods=["GET"])
@login_required
def get_chat(user_id):
    """
    GET /api/operator_chat/operator-chat/<user_id>?requester_email=...

    Devuelve el chat operador<->usuario.
    Seguridad:
    - Si requester_email es admin: puede leer cualquier chat.
    - Si requester_email es usuario: solo puede leer su propio chat (user_id = su id).
    Side-effect:
    - Marca como leidos los mensajes del "otro lado" (segun quien consulta).
    """
    requester_email = request.args.get("requester_email", "")
    mismatch = enforce_requester_email_match(requester_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    requester_uid = int(session.get("uid"))
    sess_email = (session.get("email") or "").strip()
    if not sess_is_admin(sess_email) and requester_uid != int(user_id):
        return jsonify({"error": "Sin permiso"}), 403

    msgs = odoo_call(
        CHAT_MODEL,
        "search_read",
        [[["x_user_id", "=", int(user_id)]]],
        {"fields": ["id", "x_user_id", "x_sender_role", "x_content", "x_timestamp", "x_read"], "order": "x_timestamp asc"},
    )

    _mark_read_for_requester(msgs, sess_email, user_id)
    return jsonify({"messages": msgs})


# Alias para compatibilidad si el frontend pide /api/operator_chat/<id>
@operator_chat_bp.route("/<int:user_id>", methods=["GET"])
def get_chat_alias(user_id):
    return get_chat(user_id)


@operator_chat_bp.route("/operator-chat/unread/<int:user_id>", methods=["GET"])
@login_required
def get_unread(user_id):
    """
    GET /api/operator_chat/operator-chat/unread/<user_id>
    Cuenta mensajes del admin no leidos por el usuario (badge en UI del usuario).
    """
    sess_email = (session.get("email") or "").strip()
    sess_uid = int(session.get("uid"))
    if not sess_is_admin(sess_email) and sess_uid != int(user_id):
        return jsonify({"error": "Sin permiso"}), 403

    # unread for user: count admin messages not read
    unread = odoo_call(
        CHAT_MODEL,
        "search_count",
        [[["x_user_id", "=", int(user_id)], ["x_sender_role", "=", "admin"], ["x_read", "=", False]]],
    )
    return jsonify({"ok": True, "unread": int(unread or 0)})


@operator_chat_bp.route("/unread/<int:user_id>", methods=["GET"])
def get_unread_alias(user_id):
    return get_unread(user_id)


@operator_chat_bp.route("/operator-chat/send", methods=["POST"])
@login_required
def send_message():
    """
    POST /api/operator_chat/operator-chat/send
    Body: { sender_email, user_id, content }

    Crea un mensaje en Odoo (x.emergelens.operator.chat).
    - Admin puede enviar a cualquier user_id.
    - Usuario solo puede enviar a su propio user_id.
    """
    data = request.json or {}
    mismatch = enforce_requester_email_match(data.get("sender_email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    sender_email = (session.get("email") or "").strip()
    try:
        user_id = as_int(data.get("user_id"), min_val=1)
    except ValueError:
        return jsonify({"error": "user_id invalido"}), 400
    content = clean_str(data.get("content"), max_len=1200, allow_newlines=True)

    if not sender_email or not user_id or not content:
        return jsonify({"error": "Faltan campos"}), 400

    sender_uid = int(session.get("uid"))

    if sess_is_admin(sender_email):
        role = "admin"
    elif int(sender_uid) == int(user_id):
        role = "user"
    else:
        return jsonify({"error": "Sin permiso"}), 403

    msg_id = odoo_call(
        CHAT_MODEL,
        "create",
        [[
            {
                "x_user_id": int(user_id),
                "x_sender_role": role,
                "x_content": content,
                "x_timestamp": _now_utc_str(),
                "x_read": False,
            }
        ]],
    )
    try:
        # Persist a notification so the receiver can see it even if not in the chat view.
        if role == "admin":
            push_notification(
                "operator_msg",
                content[:500],
                uid=int(sender_uid),
                name="Mensaje del operador",
                target_uid=int(user_id),
            )
            _email_operator_notification(int(user_id), content)
        else:
            # Notify the admin feed (target_uid=False) about a new user message.
            user_name = _user_name_from_id(int(user_id))
            push_notification(
                "operator_msg",
                f"{user_name}: {content[:300]}",
                uid=int(sender_uid),
                name="Mensaje de usuario",
                target_uid=None,
            )
    except Exception:
        pass
    try:
        ip = request.remote_addr or ""
        detail = f"to {int(user_id)}: {content[:160]}".strip()
        log_audit(int(sender_uid), "message_sent", role, detail, ip)
    except Exception:
        pass
    return jsonify({"ok": True, "message_id": msg_id}), 201


@operator_chat_bp.route("/send", methods=["POST"])
def send_message_alias():
    return send_message()


@operator_chat_bp.route("/operator-chat/users", methods=["GET"])
@require_admin
def get_users():
    """
    GET /api/operator_chat/operator-chat/users?admin_email=...

    Devuelve lista de usuarios "registrados" para el panel del admin.
    Importante:
    - Incluye usuarios aunque nunca hayan escrito un mensaje.
    - Agrega unread_count (mensajes del usuario no leidos por el admin).
    """
    admin_email = request.args.get("admin_email", "")
    mismatch = enforce_requester_email_match(admin_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    # Include all registered users even if they never wrote a message.
    # Do not filter by "share" because portal users can have share=True.
    users = odoo_call(
        "res.users",
        "search_read",
        [[
            ["id", "!=", 1],
            ["active", "=", True],
            ["login", "!=", False],
            ["login", "!=", ADMIN_EMAIL],
        ]],
        {"fields": ["id", "name", "login", "image_128"], "order": "name asc"},
    )

    # unread_count per user (grouped) to avoid N calls.
    user_ids = [int(u["id"]) for u in users if u.get("id") is not None]
    unread_map = {}
    last_ts_map = {}
    if user_ids:
        try:
            unread_groups = odoo_call(
                CHAT_MODEL,
                "read_group",
                [[["x_user_id", "in", user_ids], ["x_sender_role", "=", "user"], ["x_read", "=", False]]],
                ["x_user_id"],
                ["x_user_id"],
                {"lazy": False},
            )
            for g in unread_groups or []:
                key = g.get("x_user_id")
                uid = int(key[0]) if isinstance(key, (list, tuple)) and key else None
                if uid is not None:
                    unread_map[uid] = int(g.get("__count") or 0)
        except Exception:
            unread_map = {}

        # last message timestamp per user (grouped) so chats can be ordered like Instagram.
        try:
            last_groups = odoo_call(
                CHAT_MODEL,
                "read_group",
                [[["x_user_id", "in", user_ids]]],
                ["x_user_id", "x_timestamp:max"],
                ["x_user_id"],
                {"lazy": False},
            )
            for g in last_groups or []:
                key = g.get("x_user_id")
                uid = int(key[0]) if isinstance(key, (list, tuple)) and key else None
                # Odoo typically returns "<field>_max" for max aggregates.
                last_ts = (g.get("x_timestamp_max") or g.get("x_timestamp") or "").strip()
                if uid is not None and last_ts:
                    last_ts_map[uid] = last_ts
        except Exception:
            last_ts_map = {}

    for u in users:
        uid = int(u["id"])
        u["unread_count"] = int(unread_map.get(uid, 0))
        # Keep as string for easy lexicographic sorting (YYYY-MM-DD HH:MM:SS).
        u["last_message_at"] = last_ts_map.get(uid)

    # Order like Instagram: newest conversation first.
    # Stable sort: name asc (tie-breaker), then last_message_at desc (primary).
    users.sort(key=lambda u: (u.get("name") or "").lower())
    users.sort(key=lambda u: (u.get("last_message_at") or ""), reverse=True)

    return jsonify({"users": users})


@operator_chat_bp.route("/users", methods=["GET"])
def get_users_alias():
    return get_users()


def _parse_targets(value):
    if not value:
        return []
    try:
        arr = json.loads(value) if isinstance(value, str) else value
        if isinstance(arr, list):
            return [int(x) for x in arr if str(x).isdigit()]
    except Exception:
        pass
    return []


@operator_chat_bp.route("/schedule", methods=["GET"])
@require_admin
def list_schedule():
    """Admin: lista mensajes programados guardados en Odoo."""
    admin_email = request.args.get("admin_email", "")
    mismatch = enforce_requester_email_match(admin_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]
    rows = odoo_call(
        SCHEDULE_MODEL,
        "search_read",
        [[]],
        {"fields": ["id", "x_content", "x_send_time", "x_active", "x_ai_generated", "x_target_user_ids", "x_last_sent"], "order": "id desc"},
    )
    # normalize targets to list for frontend
    for r in rows:
        r["targets"] = _parse_targets(r.get("x_target_user_ids"))
    return jsonify({"ok": True, "items": rows})


@operator_chat_bp.route("/schedule", methods=["POST"])
@require_admin
def create_schedule():
    """Admin: crea un mensaje programado para uno o varios usuarios."""
    data = request.json or {}
    mismatch = enforce_requester_email_match(data.get("admin_email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    content = clean_str(data.get("content"), max_len=500, allow_newlines=True)
    send_time = clean_str(data.get("send_time"), max_len=5)  # HH:MM
    targets = data.get("target_user_ids") or []
    ai_generated = bool(data.get("ai_generated") or False)
    targets_json = json.dumps([int(x) for x in targets if str(x).isdigit()])

    if not content or not send_time:
        return jsonify({"error": "Faltan campos"}), 400

    sid = odoo_call(
        SCHEDULE_MODEL,
        "create",
        [[{"x_content": content, "x_send_time": send_time, "x_active": True, "x_ai_generated": ai_generated, "x_target_user_ids": targets_json}]],
    )
    try:
        ip = request.remote_addr or ""
        admin_uid = int(session.get("uid"))
        log_audit(int(admin_uid), "schedule_created", "admin", f"schedule {sid} {send_time}", ip)
    except Exception:
        pass
    return jsonify({"ok": True, "id": sid})


@operator_chat_bp.route("/schedule/<int:sid>/toggle", methods=["PATCH"])
@require_admin
def toggle_schedule(sid):
    """Admin: activa/desactiva (toggle) un mensaje programado."""
    admin_email = request.args.get("admin_email", "")
    mismatch = enforce_requester_email_match(admin_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    rows = odoo_call(SCHEDULE_MODEL, "read", [[int(sid)], ["x_active"]])
    if not rows:
        return jsonify({"error": "No encontrado"}), 404
    active = bool(rows[0].get("x_active", True))
    odoo_call(SCHEDULE_MODEL, "write", [[int(sid)], {"x_active": (not active)}])
    try:
        ip = request.remote_addr or ""
        admin_uid = int(session.get("uid"))
        log_audit(int(admin_uid), "status_changed", "admin", f"schedule {sid} -> {'active' if (not active) else 'inactive'}", ip)
    except Exception:
        pass
    return jsonify({"ok": True, "active": (not active)})


@operator_chat_bp.route("/schedule/<int:sid>", methods=["DELETE"])
@require_admin
def delete_schedule(sid):
    """Admin: elimina un mensaje programado."""
    admin_email = request.args.get("admin_email", "")
    mismatch = enforce_requester_email_match(admin_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]
    odoo_call(SCHEDULE_MODEL, "unlink", [[int(sid)]])
    try:
        ip = request.remote_addr or ""
        admin_uid = int(session.get("uid"))
        log_audit(int(admin_uid), "schedule_deleted", "admin", f"schedule {sid}", ip)
    except Exception:
        pass
    return jsonify({"ok": True})


@operator_chat_bp.route("/schedule/generate-ai", methods=["POST"])
@require_admin
def generate_ai_message():
    """Admin: genera un texto corto via Groq (opcional) para usar en schedule."""
    data = request.json or {}
    admin_email = (data.get("admin_email") or "").strip()
    mismatch = enforce_requester_email_match(admin_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    topic = clean_str(data.get("topic") or "mensaje corto", max_len=240, allow_newlines=True)

    def _fallback(topic_str: str) -> str:
        # Deterministic-ish variation to avoid "transcribing" the same input.
        base = (topic_str or "").strip()
        if not base:
            base = "un recordatorio importante"
        templates = [
            "Hola. Te comparto esto: {topic}. Si necesitas ayuda, escribe por el chat.",
            "Recordatorio: {topic}. Toma un minuto hoy para hacerlo con calma.",
            "Aviso importante: {topic}. Si tienes dudas, responde a este mensaje.",
            "Mensaje del equipo: {topic}. Estamos aqui para ayudarte si lo necesitas.",
        ]
        idx = int(time.time()) % len(templates)
        return templates[idx].format(topic=base)

    if not GROQ_API_KEY:
        return jsonify({"ok": True, "content": _fallback(topic)})

    try:
        system = (
            "Eres un redactor profesional para una app de emergencias y salud. "
            "Escribes en espanol, sin emojis, tono humano y claro. "
            "No repitas literalmente el texto del tema; reescribelo y agregale valor. "
            "Maximo 2 oraciones."
        )
        prompt = f"Tema/instruccion del admin: {topic}"
        res = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                "max_tokens": 120,
                "temperature": 0.7,
            },
            timeout=15,
        )
        res.raise_for_status()
        content = res.json()["choices"][0]["message"]["content"].strip()
        return jsonify({"ok": True, "content": content})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def _schedule_loop():
    tz_name = (os.getenv("SCHEDULE_TZ") or os.getenv("TZ") or "America/Santo_Domingo").strip()
    tz = ZoneInfo(tz_name) if (ZoneInfo and tz_name) else None
    while True:
        try:
            now = datetime.now(tz) if tz else datetime.now()
            today = now.date()

            # Build a small "catch-up" window in case the loop drifts or the process
            # was briefly paused. This still preserves "exact time" semantics because
            # we only send once per day per schedule time.
            times = []
            for mins in (0, 1):
                t = now - timedelta(minutes=mins)
                times.append(t.strftime("%H:%M"))
            times = list(dict.fromkeys(times))  # unique, keep order
            rows = odoo_call(
                SCHEDULE_MODEL,
                "search_read",
                [[["x_active", "=", True], ["x_send_time", "in", times]]],
                {"fields": ["id", "x_content", "x_target_user_ids", "x_last_sent", "x_send_time"]},
            )
            for r in rows:
                send_time = (r.get("x_send_time") or "").strip()
                if not send_time:
                    continue

                # Idempotency: do not send the same schedule more than once per day.
                last_sent_raw = (r.get("x_last_sent") or "").strip()
                if last_sent_raw:
                    try:
                        last_dt_utc = datetime.strptime(last_sent_raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                        last_local = last_dt_utc.astimezone(tz) if tz else last_dt_utc.astimezone()
                        if last_local.date() == today and last_local.strftime("%H:%M") == send_time:
                            continue
                    except Exception:
                        pass

                targets = _parse_targets(r.get("x_target_user_ids"))
                content = (r.get("x_content") or "").strip()
                if not content or not targets:
                    continue
                for uid in targets:
                    odoo_call(
                        CHAT_MODEL,
                        "create",
                        [[{"x_user_id": int(uid), "x_sender_role": "admin", "x_content": content, "x_timestamp": _now_utc_str(), "x_read": False}]],
                    )
                    try:
                        push_notification(
                            "operator_msg",
                            content[:500],
                            uid=None,
                            name="Mensaje programado",
                            target_uid=int(uid),
                        )
                    except Exception:
                        pass
                # mark sent time
                odoo_call(SCHEDULE_MODEL, "write", [[int(r["id"])], {"x_last_sent": _now_utc_str()}])
        except Exception as e:
            print(f"[operator_chat] schedule loop error: {e}")

        time.sleep(10)


def start_scheduler():
    global _bg_started
    with _bg_lock:
        if _bg_started:
            return
        t = threading.Thread(target=_schedule_loop, daemon=True)
        t.start()
        _bg_started = True
