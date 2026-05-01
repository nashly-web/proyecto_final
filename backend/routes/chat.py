"""
routes/chat.py - Chat LENS (asistente IA) + conversaciones en Odoo.

Incluye:
- Endpoints para enviar mensajes al asistente (Groq LLM).
- Transcripcion de audio (Whisper via Groq).
- Persistencia de conversaciones y mensajes en Odoo:
  - x.emergelens.chat
  - x.emergelens.message

ASCII only (sin emojis/tildes) para evitar simbolos raros en la UI.
"""

import os
import json

import requests
from flask import Blueprint, request, jsonify, session
from routes.notifications import push_notification

chat_bp = Blueprint("chat", __name__)

GROQ_API_KEY = os.getenv(
    "GROQ_API_KEY",
    "",
)
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_ODOO_PASS", "2408")

PROFILE_MODEL = "x.emergelens.profile"
CHAT_MODEL = "x.emergelens.chat"
MSG_MODEL = "x.emergelens.message"

SYSTEM_PROMPT = (
    "Eres LENS, el asistente inteligente de SOS EmergeLens. Responde siempre en espanol.\n"
    "Si el usuario esta claramente en peligro fisico real, al final de tu respuesta agrega [ALERTA_SOS].\n"
    "No uses emojis. Solo si el usuario te lo pide.\n"
    "Reglas de longitud: responde de forma concisa cuando la pregunta sea simple o conversacional. "
    "Si la respuesta requiere detalle (instrucciones, listas, explicaciones) extiendete lo necesario, "
    "pero SIEMPRE termina tus oraciones y pensamientos completos. Nunca cortes una respuesta a la mitad.\n"
    "Siempre, pero SIEMPRE tienes memoria de todo, de los anteriores chat, de los accidentes, de los problemas en su salud, el nombre, etc.\n"
    "De vez en cuando llama al usuario por su nombre.\n"
    "Si el usuario presenta que es femenino tratelo como mujer y si es masculino como hombre, de lo contrario se le trata de cualquiera de las dos formas.\n"
)


def odoo_session():
    s = requests.Session()
    s.post(
        f"{ODOO_URL}/web/session/authenticate",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        },
        timeout=10,
    )
    return s


def odoo_call(s, model, method, args, kwargs=None):
    if kwargs is None:
        kwargs = {}
    res = s.post(
        f"{ODOO_URL}/web/dataset/call_kw",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"model": model, "method": method, "args": args, "kwargs": kwargs},
        },
        timeout=20,
    )
    data = res.json()
    if data.get("error"):
        raise Exception(data["error"].get("data", {}).get("message", "Odoo error"))
    return data["result"]


def _get_profile_context(uid):
    try:
        s = odoo_session()
        results = odoo_call(
            s,
            PROFILE_MODEL,
            "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {
                "fields": [
                    "x_blood",
                    "x_allergies",
                    "x_conditions",
                    "x_health_issues",
                    "x_custom_instructions",
                ],
                "limit": 1,
            },
        )
        p = results[0] if results else {}
        if not p:
            return ""

        parts = []
        if p.get("x_blood"):
            parts.append(f"Sangre: {p.get('x_blood')}")
        if p.get("x_allergies"):
            parts.append(f"Alergias: {p.get('x_allergies')}")
        if p.get("x_conditions"):
            parts.append(f"Condiciones: {p.get('x_conditions')}")
        if p.get("x_custom_instructions"):
            parts.append(f"Instrucciones: {p.get('x_custom_instructions')}")

        if not parts:
            return ""

        return "\\n\\nContexto del usuario:\\n- " + "\\n- ".join(parts) + "\\n"
    except Exception:
        return ""


def call_groq(messages):
    res = requests.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        json={"model": GROQ_MODEL, "messages": messages, "max_tokens": 2000, "temperature": 0.7},
        timeout=20,
    )
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"].strip()


def transcribe_audio(audio_bytes):
    res = requests.post(
        GROQ_WHISPER_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
        files={"file": ("audio.webm", audio_bytes, "audio/webm")},
        data={"model": "whisper-large-v3-turbo", "language": "es"},
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    if "error" in data:
        raise Exception(data["error"].get("message", "Transcription error"))
    return (data.get("text") or "").strip()


def process_ai(text, history, uid):
    system = SYSTEM_PROMPT + _get_profile_context(uid)
    messages = [{"role": "system", "content": system}]

    for h in (history or [])[-10:]:
        role = h.get("role")
        content = h.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)})

    messages.append({"role": "user", "content": text})

    ai = call_groq(messages)
    is_emergency = False
    if "[ALERTA_SOS]" in ai:
        is_emergency = True
        ai = ai.replace("[ALERTA_SOS]", "").strip()
    return ai, is_emergency


def _require_uid():
    uid = session.get("uid")
    if not uid:
        return None, (jsonify({"error": "No autenticado"}), 401)
    return uid, None


def _require_groq():
    if not GROQ_API_KEY:
        # Some endpoints can degrade gracefully without Groq.
        return False, (jsonify({"ok": False, "error": "Chat IA no configurado (GROQ_API_KEY vacio)."}), 200)
    return True, None


def _fallback_reply(user_text):
    t = (user_text or "").lower()
    emergency_words = [
        "ayuda",
        "emergencia",
        "me desmayo",
        "me desmay",
        "no respiro",
        "no puedo respirar",
        "infarto",
        "sangre",
        "hemorrag",
        "accidente",
        "fuego",
        "incendio",
        "arma",
        "disparo",
        "violencia",
        "secuestro",
        "me atac",
        "suicid",
    ]
    is_emergency = any(w in t for w in emergency_words)
    if is_emergency:
        msg = (
            "Si estas en peligro inmediato, llama a emergencias ahora mismo. "
            "Si puedes, activa SOS en la app para compartir tu ubicacion. "
            "Describe que paso y si estas solo/a."
        )
    else:
        msg = (
            "Ahora mismo el asistente no esta disponible. Intenta de nuevo en unos minutos. "
            "Si esto continua, contacta soporte desde la app."
        )
    return msg, is_emergency


def _friendly_failure():
    # Keep user-facing output simple; avoid leaking internal stack/infra details.
    return "Lo siento, ahora mismo no puedo responder. Intenta de nuevo en unos minutos.", False


@chat_bp.route("/conversations", methods=["GET"])
def get_conversations():
    """
    GET /api/chat/conversations
    Lista conversaciones del usuario autenticado (x.emergelens.chat).
    """
    uid, err = _require_uid()
    if err:
        return err

    try:
        s = odoo_session()
        result = odoo_call(
            s,
            CHAT_MODEL,
            "search_read",
            [[["x_user_id", "=", int(uid or 0)]]],
            {"fields": ["id", "x_title", "x_status", "create_date"], "order": "create_date desc"},
        )
        return jsonify({"ok": True, "conversations": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations", methods=["POST"])
def create_conversation():
    """
    POST /api/chat/conversations
    Crea una conversacion nueva para el usuario autenticado.
    Body: { title }
    """
    uid, err = _require_uid()
    if err:
        return err

    data = request.get_json() or {}
    title = (data.get("title") or "Nueva conversacion").strip() or "Nueva conversacion"

    try:
        s = odoo_session()
        conv_id = odoo_call(
            s,
            CHAT_MODEL,
            "create",
            [{"x_title": title, "x_status": "active", "x_user_id": int(uid or 0)}],
        )
        return jsonify({"ok": True, "id": conv_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _ensure_owned_chat(s, conv_id, uid):
    owned = odoo_call(
        s,
        CHAT_MODEL,
        "search",
        [[["id", "=", int(conv_id)], ["x_user_id", "=", int(uid)]]],
        {"limit": 1},
    )
    return bool(owned)


@chat_bp.route("/conversations/<int:conv_id>", methods=["DELETE"])
def delete_conversation(conv_id):
    """
    DELETE /api/chat/conversations/<id>
    Borra una conversacion del usuario (solo si es dueno).
    """
    uid, err = _require_uid()
    if err:
        return err

    try:
        s = odoo_session()
        if not _ensure_owned_chat(s, conv_id, uid):
            return jsonify({"ok": False, "error": "No encontrado"}), 404
        odoo_call(s, CHAT_MODEL, "unlink", [[int(conv_id)]])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations/empty-trash", methods=["POST"])
def empty_trash():
    """
    POST /api/chat/conversations/empty-trash
    Elimina permanentemente todas las conversaciones del usuario con status=trashed.
    """
    uid, err = _require_uid()
    if err:
        return err

    try:
        s = odoo_session()
        conv_ids = odoo_call(
            s,
            CHAT_MODEL,
            "search",
            [[["x_user_id", "=", int(uid)], ["x_status", "=", "trashed"]]],
        )
        conv_ids = [int(x) for x in (conv_ids or [])]
        if not conv_ids:
            return jsonify({"ok": True, "deleted": 0})

        # Clean up messages first to avoid orphaned records if Odoo doesn't cascade deletes.
        msg_ids = odoo_call(
            s,
            MSG_MODEL,
            "search",
            [[["x_chat_id", "in", conv_ids]]],
        )
        msg_ids = [int(x) for x in (msg_ids or [])]
        if msg_ids:
            odoo_call(s, MSG_MODEL, "unlink", [msg_ids])

        odoo_call(s, CHAT_MODEL, "unlink", [conv_ids])
        return jsonify({"ok": True, "deleted": len(conv_ids)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations/<int:conv_id>/messages", methods=["GET"])
def get_messages(conv_id):
    """
    GET /api/chat/conversations/<id>/messages
    Lista mensajes guardados en Odoo para esa conversacion.
    """
    uid, err = _require_uid()
    if err:
        return err

    try:
        s = odoo_session()
        if not _ensure_owned_chat(s, conv_id, uid):
            return jsonify({"ok": False, "error": "No encontrado"}), 404

        msgs = odoo_call(
            s,
            MSG_MODEL,
            "search_read",
            [[["x_chat_id", "=", int(conv_id)]]],
            {"fields": ["id", "x_role", "x_content", "x_audio_url", "create_date"], "order": "create_date asc"},
        )
        return jsonify({"ok": True, "messages": msgs})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _save_message(s, conv_id, role, content, audio_url=""):
    return odoo_call(
        s,
        MSG_MODEL,
        "create",
        [{"x_chat_id": int(conv_id), "x_role": role, "x_content": content, "x_audio_url": audio_url}],
    )


@chat_bp.route("/conversations/<int:conv_id>/rename", methods=["PATCH"])
def rename_conversation(conv_id):
    """
    PATCH /api/chat/conversations/<id>/rename
    Cambia el titulo de una conversacion.
    Body: { title }
    """
    uid, err = _require_uid()
    if err:
        return err

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Titulo vacio"}), 400

    try:
        s = odoo_session()
        if not _ensure_owned_chat(s, conv_id, uid):
            return jsonify({"ok": False, "error": "No encontrado"}), 404
        odoo_call(s, CHAT_MODEL, "write", [[int(conv_id)], {"x_title": title}])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _set_status(conv_id, uid, status):
    s = odoo_session()
    if not _ensure_owned_chat(s, conv_id, uid):
        return False
    odoo_call(s, CHAT_MODEL, "write", [[int(conv_id)], {"x_status": status}])
    return True


@chat_bp.route("/conversations/<int:conv_id>/archive", methods=["PATCH"])
def archive_conversation(conv_id):
    """
    PATCH /api/chat/conversations/<id>/archive
    Marca conversacion como archived (no se borra).
    """
    uid, err = _require_uid()
    if err:
        return err
    try:
        if not _set_status(conv_id, uid, "archived"):
            return jsonify({"ok": False, "error": "No encontrado"}), 404
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations/<int:conv_id>/trash", methods=["PATCH"])
def trash_conversation(conv_id):
    """
    PATCH /api/chat/conversations/<id>/trash
    Mueve conversacion a papelera (status=trashed).
    """
    uid, err = _require_uid()
    if err:
        return err
    try:
        if not _set_status(conv_id, uid, "trashed"):
            return jsonify({"ok": False, "error": "No encontrado"}), 404
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/conversations/<int:conv_id>/restore", methods=["PATCH"])
def restore_conversation(conv_id):
    """
    PATCH /api/chat/conversations/<id>/restore
    Restaura conversacion a status=active.
    """
    uid, err = _require_uid()
    if err:
        return err
    try:
        if not _set_status(conv_id, uid, "active"):
            return jsonify({"ok": False, "error": "No encontrado"}), 404
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chat_bp.route("/message", methods=["POST"])
def send_message():
    """
    POST /api/chat/message
    Envia un mensaje al asistente (Groq) y retorna la respuesta.

    Opcional:
    - conv_id: si viene, persiste user+assistant en Odoo.
    - location: si el asistente detecta peligro y hay lat/lng, retorna emergency_data.
    """
    uid, err = _require_uid()
    if err:
        return err

    data = request.get_json() or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []
    location = data.get("location")
    conv_id = data.get("conv_id")

    if not message:
        return jsonify({"error": "Mensaje vacio"}), 400

    try:
        if not GROQ_API_KEY:
            ai_response, is_emergency = _fallback_reply(message)
        else:
            ai_response, is_emergency = process_ai(message, history, uid=uid)

        # Persistence is best-effort; chat response should not fail if Odoo is down.
        if conv_id:
            try:
                s = odoo_session()
                _save_message(s, conv_id, "user", message)
                _save_message(s, conv_id, "assistant", ai_response)
            except Exception:
                pass

        response = {"ok": True, "message": ai_response, "is_emergency": is_emergency}

        # Admin notification if the assistant detects possible real danger.
        # Keep it short to avoid leaking sensitive content into the admin feed.
        if is_emergency:
            user_name = (session.get("name") or "Usuario").strip() or "Usuario"
            user_email = (session.get("email") or "").strip()
            base = f"Posible peligro detectado via chat: {user_name}"
            if user_email:
                base += f" ({user_email})"
            push_notification("danger_detected", base, uid=uid, name="Alerta LENS")

        if is_emergency and isinstance(location, dict) and location.get("lat") and location.get("lng"):
            response["emergency_data"] = {
                "location": location,
                "user_message": message,
                "maps_url": f"https://maps.google.com/?q={location['lat']},{location['lng']}",
            }

        return jsonify(response)
    except Exception:
        msg, is_emergency = _friendly_failure()
        return jsonify({"ok": True, "message": msg, "is_emergency": is_emergency})


@chat_bp.route("/transcribe", methods=["POST"])
def transcribe():
    """
    POST /api/chat/transcribe (multipart/form-data)
    - audio: archivo de audio (webm)
    - history: JSON string (opcional)
    - location: JSON string (opcional)
    - conv_id: id de conversacion (opcional)

    Flujo:
    1) Transcribe audio (Whisper via Groq)
    2) Pasa el texto al asistente y retorna respuesta
    3) Si conv_id existe, guarda mensajes en Odoo
    """
    uid, err = _require_uid()
    if err:
        return err
    # Transcription needs Groq; return a friendly message if not configured.
    if not GROQ_API_KEY:
        msg, is_emergency = _friendly_failure()
        return jsonify({"ok": True, "transcript": "", "message": msg, "is_emergency": is_emergency})

    if "audio" not in request.files:
        return jsonify({"error": "No se recibio audio"}), 400

    audio_file = request.files["audio"]
    location_str = request.form.get("location")
    history_str = request.form.get("history", "[]")
    conv_id = request.form.get("conv_id")

    try:
        history = json.loads(history_str) if history_str else []
    except Exception:
        history = []

    try:
        text = transcribe_audio(audio_file.read())
        if not text:
            return jsonify({"error": "No se pudo transcribir"}), 400

        ai_response, is_emergency = process_ai(text, history, uid=uid)

        if conv_id:
            try:
                s = odoo_session()
                _save_message(s, conv_id, "user", text)
                _save_message(s, conv_id, "assistant", ai_response)
            except Exception:
                pass

        response = {"ok": True, "transcript": text, "message": ai_response, "is_emergency": is_emergency}

        if is_emergency:
            user_name = (session.get("name") or "Usuario").strip() or "Usuario"
            user_email = (session.get("email") or "").strip()
            base = f"Posible peligro detectado via audio: {user_name}"
            if user_email:
                base += f" ({user_email})"
            push_notification("danger_detected", base, uid=uid, name="Alerta LENS")

        if is_emergency and location_str:
            try:
                loc = json.loads(location_str)
                if isinstance(loc, dict) and loc.get("lat") and loc.get("lng"):
                    response["emergency_data"] = {
                        "location": loc,
                        "user_message": text,
                        "maps_url": f"https://maps.google.com/?q={loc['lat']},{loc['lng']}",
                    }
            except Exception:
                pass

        return jsonify(response)
    except Exception:
        msg, is_emergency = _friendly_failure()
        return jsonify({"ok": True, "transcript": "", "message": msg, "is_emergency": is_emergency})
