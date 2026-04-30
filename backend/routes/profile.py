"""
routes/profile.py - Perfil medico y contactos de emergencia.

Modelo Odoo: x.emergelens.profile

Endpoints:
- GET  /        : devuelve el perfil del usuario autenticado
- POST /        : crea/actualiza el perfil del usuario autenticado
- GET  /instructions : devuelve instrucciones personalizadas para el chat
- POST /instructions: guarda instrucciones personalizadas para el chat
- GET  /by-emergelens-id/<eid> : busca usuario por ID EmergeLens (para contactos)

ASCII only (sin tildes/emojis) para evitar simbolos raros en la UI.
"""

import os
import random
import string

import requests
from flask import Blueprint, request, jsonify, session
from routes.notifications import push_notification

profile_bp = Blueprint("profile", __name__)

ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_ODOO_PASS", "2408")

PROFILE_MODEL = "x.emergelens.profile"

# ----------------------------------------------------------------------------
# Helpers Odoo (JSON-RPC)
# - El backend usa el usuario admin de Odoo para leer/escribir modelos custom.
# - La identidad del usuario real viene desde la session Flask (uid).
# ----------------------------------------------------------------------------

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
        timeout=15,
    )
    data = res.json()
    if data.get("error"):
        raise Exception(data["error"].get("data", {}).get("message", "Odoo error"))
    return data["result"]


def generate_emergelens_id(s):
    """
    Genera un ID unico con formato EL-XXXX (4 digitos numericos).
    Reintenta si el ID ya existe.
    """
    for _ in range(20):  # max 20 intentos
        number = str(random.randint(1000, 9999))
        eid = f"EL-{number}"
        # Verificar que no exista ya
        existing = odoo_call(
            s, PROFILE_MODEL, "search",
            [[["x_emergelens_id", "=", eid]]], {"limit": 1}
        )
        if not existing:
            return eid
    # Fallback: usar 6 digitos si hay colision
    return "EL-" + "".join(random.choices(string.digits, k=6))


# ----------------------------------------------------------------------------
# Endpoints de perfil
# - GET/POST del perfil medico (x.emergelens.profile).
# - /instructions se usa para personalizar el comportamiento del chat/IA.
# - /by-emergelens-id permite buscar contactos por un ID corto (EL-XXXX).
# ----------------------------------------------------------------------------

@profile_bp.route("/", methods=["GET"])
def get_profile():
    """GET /api/profile/ - Devuelve el perfil del usuario autenticado."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        s = odoo_session()
        results = odoo_call(
            s,
            PROFILE_MODEL,
            "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {
                "fields": [
                    "id",
                    "x_age",
                    "x_sex",
                    "x_address",
                    "x_phone",
                    "x_blood",
                    "x_allergies",
                    "x_conditions",
                    "x_health_issues",
                    "x_ec1_name",
                    "x_ec1_phone",
                    "x_ec1_email",
                    "x_ec1_rel",
                    "x_ec2_name",
                    "x_ec2_phone",
                    "x_ec2_email",
                    "x_ec2_rel",
                    "x_custom_instructions",
                    "x_photo",
                    "x_emergelens_id",
                ],
                "limit": 1,
            },
        )
        profile = results[0] if results else {}
        return jsonify({"ok": True, "profile": profile})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/", methods=["POST"])
def save_profile():
    """
    POST /api/profile/
    Crea o actualiza el perfil del usuario autenticado (x.emergelens.profile).
    """
    # Este endpoint es el "form principal" del usuario:
    # datos medicos + contactos + foto + instrucciones personalizadas.
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data = request.get_json() or {}
    photo_data_url = data.get("photo", "") or ""

    prev_health_issues = ""
    prev_conditions = ""

    vals = {
        "x_name": data.get("name", "Perfil"),
        "x_user_id": int(uid),
        "x_age": str(data.get("age", "")),
        "x_sex": data.get("sex", ""),
        "x_address": data.get("address", ""),
        "x_phone": data.get("phone", ""),
        "x_blood": data.get("blood", ""),
        "x_allergies": data.get("allergies", ""),
        "x_conditions": data.get("conditions", ""),
        "x_health_issues": data.get("healthIssues", ""),
        "x_ec1_name": data.get("ec1Name", ""),
        "x_ec1_phone": data.get("ec1Phone", ""),
        "x_ec1_email": data.get("ec1Email", ""),
        "x_ec1_rel": data.get("ec1Rel", ""),
        "x_ec2_name": data.get("ec2Name", ""),
        "x_ec2_phone": data.get("ec2Phone", ""),
        "x_ec2_email": data.get("ec2Email", ""),
        "x_ec2_rel": data.get("ec2Rel", ""),
        "x_photo": data.get("photo", ""),
    }

    try:
        s = odoo_session()

        existing_row = odoo_call(
            s,
            PROFILE_MODEL,
            "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {"fields": ["id", "x_health_issues", "x_conditions", "x_emergelens_id"], "limit": 1},
        )
        if existing_row:
            prev_health_issues = (existing_row[0].get("x_health_issues") or "").strip()
            prev_conditions = (existing_row[0].get("x_conditions") or "").strip()

        existing = odoo_call(
            s, PROFILE_MODEL, "search", [[["x_user_id", "=", int(uid)]]], {"limit": 1}
        )
        if existing:
            odoo_call(s, PROFILE_MODEL, "write", [[existing[0]], vals])
            profile_id = existing[0]
            # Recuperar el ID existente
            emergelens_id = existing_row[0].get("x_emergelens_id") if existing_row else None
        else:
            # Generar ID unico al crear el perfil
            emergelens_id = generate_emergelens_id(s)
            vals["x_emergelens_id"] = emergelens_id
            profile_id = odoo_call(s, PROFILE_MODEL, "create", [vals])

        # Sync photo to Odoo Users (res.users.image_1920) so it appears in Odoo UI.
        # Best-effort only: do not block profile save.
        try:
            b64 = ""
            if isinstance(photo_data_url, str) and photo_data_url.startswith("data:") and "," in photo_data_url:
                b64 = photo_data_url.split(",", 1)[1].strip()
            if b64:
                odoo_call(s, "res.users", "write", [[int(uid)], {"image_1920": b64}])
            else:
                # Clear only if user removed the photo (empty string).
                if not photo_data_url:
                    odoo_call(s, "res.users", "write", [[int(uid)], {"image_1920": False}])
        except Exception:
            pass

        # Admin notification cuando el usuario reporta/actualiza informacion de salud
        new_health_issues = (vals.get("x_health_issues") or "").strip()
        new_conditions = (vals.get("x_conditions") or "").strip()
        has_health = bool(new_health_issues or new_conditions)
        changed = (new_health_issues != prev_health_issues) or (new_conditions != prev_conditions)

        if has_health and changed:
            user_name = (session.get("name") or data.get("name") or "Usuario").strip() or "Usuario"
            user_email = (session.get("email") or "").strip()
            msg = f"{user_name} actualizo su informacion de salud"
            if user_email:
                msg += f" ({user_email})"
            push_notification("user_sick", msg, uid=uid, name=f"Salud: {user_name}")

        # Sync a res.partner
        partner_ids = odoo_call(s, "res.users", "read", [[int(uid)]], {"fields": ["partner_id"]})
        if partner_ids and partner_ids[0].get("partner_id"):
            partner_id = partner_ids[0]["partner_id"][0]
            odoo_call(
                s,
                "res.partner",
                "write",
                [[partner_id], {"phone": data.get("phone", ""), "street": data.get("address", "")}],
            )

        return jsonify({"ok": True, "id": profile_id, "emergelens_id": emergelens_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/by-emergelens-id/<eid>", methods=["GET"])
def get_by_emergelens_id(eid):
    """
    GET /api/profile/by-emergelens-id/<eid>
    Busca un usuario por su ID EmergeLens (ej: EL-0042).
    Devuelve nombre y email para pre-rellenar el formulario de contactos.
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    eid = eid.strip().upper()
    if not eid.startswith("EL-"):
        return jsonify({"error": "Formato de ID invalido. Debe ser EL-XXXX"}), 400

    try:
        s = odoo_session()
        results = odoo_call(
            s,
            PROFILE_MODEL,
            "search_read",
            [[["x_emergelens_id", "=", eid]]],
            {"fields": ["x_name", "x_phone", "x_user_id", "x_emergelens_id"], "limit": 1},
        )
        if not results:
            return jsonify({"error": "Usuario no encontrado con ese ID"}), 404

        r = results[0]
        raw_uid = r.get("x_user_id")
        found_uid = raw_uid[0] if isinstance(raw_uid, (list, tuple)) and raw_uid else None

        # Obtener email desde res.users
        email = ""
        if found_uid:
            user_data = odoo_call(s, "res.users", "read", [[int(found_uid)]], {"fields": ["email"]})
            email = user_data[0].get("email", "") if user_data else ""

        return jsonify({
            "ok": True,
            "name": r.get("x_name", ""),
            "email": email,
            "phone": r.get("x_phone", ""),
            "emergelens_id": r.get("x_emergelens_id", ""),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/instructions", methods=["GET"])
def get_instructions():
    """GET /api/profile/instructions - Devuelve instrucciones personalizadas para el chat."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        s = odoo_session()
        results = odoo_call(
            s,
            PROFILE_MODEL,
            "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {"fields": ["x_custom_instructions"], "limit": 1},
        )
        instructions = results[0].get("x_custom_instructions", "") if results else ""
        return jsonify({"ok": True, "instructions": instructions or ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/instructions", methods=["POST"])
def save_instructions():
    """POST /api/profile/instructions - Guarda instrucciones personalizadas para el chat."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data = request.get_json() or {}
    instructions = (data.get("instructions") or "").strip()

    try:
        s = odoo_session()
        existing = odoo_call(
            s, PROFILE_MODEL, "search", [[["x_user_id", "=", int(uid)]]], {"limit": 1}
        )
        if existing:
            odoo_call(
                s,
                PROFILE_MODEL,
                "write",
                [[existing[0]], {"x_custom_instructions": instructions}],
            )
        else:
            odoo_call(
                s,
                PROFILE_MODEL,
                "create",
                [{"x_name": "Perfil", "x_user_id": int(uid), "x_custom_instructions": instructions}],
            )

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
