"""
routes/Email.py - Envio de correos SOS (flujo alternativo).

Este blueprint no es el flujo principal (eso vive en routes/Emergency.py).
Se mantiene para compatibilidad, pero debe compilar y funcionar si alguien lo usa.

ASCII only (sin emojis/tildes) para evitar simbolos raros.
"""

import os
import time

import requests
from flask import Blueprint, jsonify, request, session

from mailer import send_html_email

email_bp = Blueprint("email", __name__)

ADMIN_COPY_EMAIL = (os.getenv("ADMIN_COPY_EMAIL") or os.getenv("MAIL_FROM") or os.getenv("SMTP_USER") or "").strip()

ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_ODOO_PASS", "")

PROFILE_MODEL = "x.emergelens.profile"
EMERGENCY_MODEL = "x.emergelens.emergency"

VALID_TYPES = {"medical", "security", "fire", "accident"}


def odoo_session():
    if not ADMIN_PASSWORD:
        raise Exception("Falta ADMIN_ODOO_PASS en variables de entorno")
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


def _active_alert_id(s, uid: int):
    ids = odoo_call(
        s,
        EMERGENCY_MODEL,
        "search",
        [[["x_user_id", "=", int(uid)], ["x_status", "=", "active"]]],
        {"limit": 1},
    )
    return int(ids[0]) if ids else None


def upsert_alert_odoo(uid: int, user_name: str, user_email: str, e_type: str, lat, lng):
    """
    Registro minimo del incidente en Odoo para el flujo legacy.
    Retorna el id de la alerta (existente o nueva) o None en error.
    """
    now = time.time()
    e_type = (e_type or "medical").strip().lower()
    if e_type not in VALID_TYPES:
        e_type = "medical"
    try:
        lat_val = float(lat) if lat not in (None, "", "N/A") else None
        lng_val = float(lng) if lng not in (None, "", "N/A") else None
    except Exception:
        lat_val = None
        lng_val = None

    try:
        s = odoo_session()
        active_id = _active_alert_id(s, uid)
        vals = {
            "x_user_id": int(uid),
            "x_name": user_name or "Usuario",
            "x_email": user_email or "",
            "x_type": e_type,
            "x_status": "active",
            "x_ts": now,
        }
        if lat_val is not None and lng_val is not None:
            vals["x_lat"] = lat_val
            vals["x_lng"] = lng_val
        if active_id:
            odoo_call(s, EMERGENCY_MODEL, "write", [[int(active_id)], vals])
            return int(active_id)

        vals["x_started_at"] = now
        if "x_lat" not in vals:
            vals["x_lat"] = False
            vals["x_lng"] = False
        return int(odoo_call(s, EMERGENCY_MODEL, "create", [vals]))
    except Exception:
        return None


def _build_email_html(user_name, emergency_type, lat, lng, profile):
    maps_link = f"https://www.google.com/maps?q={lat},{lng}"
    blood = profile.get("x_blood", "No especificado")
    allergies = profile.get("x_allergies", "Ninguna")
    conditions = profile.get("x_conditions", "Ninguna")
    phone = profile.get("x_phone", "No especificado")
    address = profile.get("x_address", "No especificado")

    return f"""<!doctype html>
<html><head><meta charset=\"UTF-8\"></head>
<body style=\"font-family:Arial,sans-serif;background:#0D1B2A;margin:0;padding:0\">
  <div style=\"max-width:600px;margin:0 auto;padding:20px\">
    <div style=\"background:#E53935;border-radius:12px 12px 0 0;padding:22px;text-align:center\">
      <h1 style=\"color:#fff;margin:0;font-size:24px;\">ALERTA DE EMERGENCIA</h1>
      <p style=\"color:#fff;opacity:.9;margin:8px 0 0;\">SOS EmergeLens</p>
    </div>
    <div style=\"background:#1E3A5F;padding:20px;border-radius:0 0 12px 12px;color:#fff\">
      <p style=\"margin:0 0 14px;\">{user_name} activo una alerta de emergencia.</p>
      <p style=\"margin:0 0 14px;\"><strong>Tipo:</strong> {emergency_type}</p>
      <p style=\"margin:0 0 14px;\"><strong>Ubicacion:</strong> <a style=\"color:#64b5f6\" href=\"{maps_link}\">Ver en Google Maps</a></p>
      <div style=\"background:#0D1B2A;border-radius:10px;padding:14px;margin-top:16px\">
        <h3 style=\"margin:0 0 10px;color:#64b5f6;\">Datos medicos</h3>
        <p style=\"margin:4px 0;\"><strong>Sangre:</strong> {blood}</p>
        <p style=\"margin:4px 0;\"><strong>Alergias:</strong> {allergies}</p>
        <p style=\"margin:4px 0;\"><strong>Condiciones:</strong> {conditions}</p>
        <p style=\"margin:4px 0;\"><strong>Telefono:</strong> {phone}</p>
        <p style=\"margin:4px 0;\"><strong>Direccion:</strong> {address}</p>
      </div>
      <p style=\"margin:16px 0 0;font-size:12px;opacity:.7\">Mensaje automatico. Si es un error, ignora este correo.</p>
    </div>
  </div>
</body></html>"""


def _send_email(to_email, subject, html):
    send_html_email(to_email=to_email, subject=subject, html=html)


@email_bp.route("/send-sos", methods=["POST"])
def send_sos_emails():
    """
    POST /api/email/send-sos
    Envia correos a contactos de emergencia (flujo alternativo/legacy).
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data = request.get_json() or {}
    emergency_type = data.get("type", "Emergencia")
    lat = data.get("lat", "N/A")
    lng = data.get("lng", "N/A")

    try:
        s = odoo_session()
        user_data = odoo_call(s, "res.users", "read", [[int(uid)]], {"fields": ["name", "email"]})
        user_name = user_data[0].get("name") if user_data else "Usuario"
        user_email = user_data[0].get("email") if user_data else ""

        # Registrar/actualizar incidente en Odoo (x.emergelens.emergency)
        # para que el historial lo muestre aunque se use este flujo legacy.
        alert_id = upsert_alert_odoo(int(uid), user_name or "Usuario", user_email or "", emergency_type, lat, lng)

        profiles = odoo_call(
            s,
            PROFILE_MODEL,
            "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {
                "fields": [
                    "x_blood",
                    "x_allergies",
                    "x_conditions",
                    "x_phone",
                    "x_address",
                    "x_ec1_email",
                    "x_ec2_email",
                ],
                "limit": 1,
            },
        )
        profile = profiles[0] if profiles else {}

        html = _build_email_html(user_name, emergency_type, lat, lng, profile)
        subject = f"EMERGENCIA: {user_name} necesita ayuda"

        sent = []
        for key in ("x_ec1_email", "x_ec2_email"):
            ec_email = (profile.get(key) or "").strip()
            if ec_email and "@" in ec_email:
                _send_email(ec_email, subject, html)
                sent.append(ec_email)

        # Always send a copy to admin/operator (best effort).
        if ADMIN_COPY_EMAIL and "@" in ADMIN_COPY_EMAIL:
            _send_email(ADMIN_COPY_EMAIL, subject, html)

        return jsonify({"ok": True, "sent": sent, "alert_id": alert_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
