"""
routes/Emergency.py - Flujo de emergencias (SOS).

RF20: Asignacion automatica y manual de unidad.
RF-CONTACT: Notificacion en tiempo real a contactos registrados en la app.
ASCII only.
"""

import os
import time
import base64
from datetime import datetime

import requests
from flask import Blueprint, request, jsonify, session
from mailer import send_email as smtp_send_email

from routes.notifications import push_notification
from scheduler import notify_emergency_contacts
from routes.audit import log_audit

emergency_bp = Blueprint("emergency", __name__)

ADMIN_EMAIL        = os.getenv("ADMIN_EMAIL", os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com"))
ODOO_URL           = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB            = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_ODOO_EMAIL   = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_ODOO_PASS    = os.getenv("ADMIN_ODOO_PASS", "2408")
EMAIL_NOTIFICATIONS_ENABLED = (os.getenv("ENABLE_EMAIL_NOTIFICATIONS", "1") or "1").strip() == "1"

PROFILE_MODEL   = "x.emergelens.profile"
EMERGENCY_MODEL = "x.emergelens.emergency"
NOTIF_MODEL     = "x.emergelens.notification"

EMERGENCY_NAMES = {
    "medical":  "Emergencia Medica",
    "security": "Emergencia de Seguridad",
    "fire":     "Incendio",
    "accident": "Accidente",
}

UNIT_SUGGESTIONS = {
    "medical":  "ambulancia",
    "fire":     "bomberos",
    "security": "policia",
    "accident": "ambulancia",
}

UNIT_META = {
    "ambulancia": {"label": "Ambulancia", "color": "#E53935"},
    "policia":    {"label": "Policia",    "color": "#1565C0"},
    "bomberos":   {"label": "Bomberos",   "color": "#F97316"},
    "rescate":    {"label": "Rescate",    "color": "#7C3AED"},
    "multiple":   {"label": "Multiples",  "color": "#0D1B2A"},
}

ALL_UNITS = list(UNIT_META.keys())

# ── Odoo helpers ──────────────────────────────────────────────────────────────

def odoo_session():
    s = requests.Session()
    s.post(f"{ODOO_URL}/web/session/authenticate", json={
        "jsonrpc": "2.0", "method": "call",
        "params": {"db": ODOO_DB, "login": ADMIN_ODOO_EMAIL, "password": ADMIN_ODOO_PASS},
    }, timeout=10)
    return s


def odoo_call(s, model, method, args, kwargs=None):
    if kwargs is None:
        kwargs = {}
    res = s.post(f"{ODOO_URL}/web/dataset/call_kw", json={
        "jsonrpc": "2.0", "method": "call",
        "params": {"model": model, "method": method, "args": args, "kwargs": kwargs},
    }, timeout=20)
    data = res.json()
    if data.get("error"):
        raise Exception(data["error"].get("data", {}).get("message", "Odoo error"))
    return data["result"]


def get_profile(uid):
    s = odoo_session()
    profile = {}
    try:
        profs = odoo_call(s, PROFILE_MODEL, "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {"fields": [
                "x_phone", "x_address", "x_blood", "x_allergies", "x_conditions",
                "x_ec1_name", "x_ec1_email", "x_ec1_rel",
                "x_ec2_name", "x_ec2_email", "x_ec2_rel",
            ], "limit": 1})
        profile = profs[0] if profs else {}
    except Exception:
        profile = {}
    user_data = odoo_call(s, "res.users", "read", [[int(uid)]], {"fields": ["name", "email"]})
    name  = user_data[0].get("name")  if user_data else "Usuario"
    email = user_data[0].get("email") if user_data else ""
    return name, email, profile


def is_admin(uid):
    try:
        sess_email = (session.get("email") or "").strip()
        if sess_email and sess_email == ADMIN_EMAIL:
            return True
        s = odoo_session()
        user_data = odoo_call(s, "res.users", "read", [[int(uid)]], {"fields": ["email", "login"]})
        if not user_data:
            return False
        od_email = (user_data[0].get("email") or "").strip()
        od_login = (user_data[0].get("login") or "").strip()
        return (od_email == ADMIN_EMAIL) or (od_login == ADMIN_EMAIL)
    except Exception:
        return False


def _active_alert_id(s, uid):
    # Treat "monitoring" as still-active so the user can keep sharing location/battery
    # and can still cancel the emergency with PIN.
    ids = odoo_call(
        s,
        EMERGENCY_MODEL,
        "search",
        [[["x_user_id", "=", int(uid)], ["x_status", "in", ["active", "monitoring"]]]],
        {"limit": 1},
    )
    return ids[0] if ids else None


def upsert_alert_odoo(uid, name, email, e_type, lat, lng, battery=None, charging=False):
    now = time.time()
    try:
        s = odoo_session()
        active_id = _active_alert_id(s, uid)
        vals = {
            "x_user_id": int(uid),
            "x_name":    name  or "Usuario",
            "x_email":   email or "",
            "x_type":    e_type or "medical",
            "x_ts":      now,
        }
        if lat is not None and lng is not None:
            vals["x_lat"] = float(lat)
            vals["x_lng"] = float(lng)
        if battery is not None:
            vals["x_battery"]  = float(battery)
            vals["x_charging"] = bool(charging)

        if active_id:
            # Do not overwrite x_status here. Admin may have set it to "monitoring".
            odoo_call(s, EMERGENCY_MODEL, "write", [[int(active_id)], vals])
            return int(active_id)

        vals["x_status"] = "active"
        vals["x_started_at"] = now
        vals["x_unit"] = UNIT_SUGGESTIONS.get(e_type, "ambulancia")
        if "x_lat" not in vals:
            vals["x_lat"] = False
            vals["x_lng"] = False
        return odoo_call(s, EMERGENCY_MODEL, "create", [vals])
    except Exception as e:
        print(f"[emergency] upsert_alert_odoo error: {e}")
        return None


def notify_registered_contacts(uid, user_name, e_type, alert_id, lat, lng):
    """
    Crea notificaciones en Odoo para los contactos de emergencia
    que esten registrados en la app (tienen cuenta en res.users).
    Estas notificaciones aparecen en SOSAlert.jsx y en el panel de notificaciones.
    """
    try:
        s = odoo_session()

        # Obtener emails de contactos del usuario en peligro
        profs = odoo_call(s, PROFILE_MODEL, "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {"fields": ["x_ec1_email", "x_ec2_email", "x_address"], "limit": 1})
        if not profs:
            return

        profile   = profs[0]
        address   = profile.get("x_address", "")
        ec_emails = [
            (profile.get("x_ec1_email") or "").strip().lower(),
            (profile.get("x_ec2_email") or "").strip().lower(),
        ]
        ec_emails = [e for e in ec_emails if e]
        if not ec_emails:
            return

        e_name = EMERGENCY_NAMES.get(e_type, "Emergencia")
        now    = time.time()

        for ec_email in ec_emails:
            # Buscar si ese contacto tiene cuenta en la app
            users = odoo_call(s, "res.users", "search_read",
                [[["login", "=", ec_email]]],
                {"fields": ["id"], "limit": 1})
            if not users:
                continue

            contact_uid = users[0]["id"]

            # Crear notificacion para ese usuario
            odoo_call(s, NOTIF_MODEL, "create", [{
                "x_target_uid": contact_uid,
                "x_user_id":    contact_uid,
                "x_type":       "contact_alert",
                "x_name":       f"{user_name} necesita ayuda",
                "x_message":    f"{e_name} - {address}" if address else e_name,
                "x_ts":         now,
                "x_read":       False,
                "x_for_admin":  False,
                "x_alert_id":   int(alert_id) if alert_id else 0,
                "x_lat":        float(lat)  if lat  is not None else 0.0,
                "x_lng":        float(lng)  if lng  is not None else 0.0,
            }])
            print(f"[notify_registered_contacts] Notificacion creada para uid={contact_uid} ({ec_email})")

    except Exception as e:
        print(f"[notify_registered_contacts] Error: {e}")


def assign_unit_odoo(alert_id, unit):
    try:
        s = odoo_session()
        odoo_call(s, EMERGENCY_MODEL, "write", [[int(alert_id)], {"x_unit": unit}])
        return True
    except Exception as e:
        print(f"[emergency] assign_unit_odoo error: {e}")
        return False


def get_active_unit(uid):
    try:
        s = odoo_session()
        rows = odoo_call(s, EMERGENCY_MODEL, "search_read",
            [[["x_user_id", "=", int(uid)], ["x_status", "=", "active"]]],
            {"fields": ["x_unit", "x_type"], "limit": 1})
        if not rows:
            return None
        unit = rows[0].get("x_unit") or UNIT_SUGGESTIONS.get(rows[0].get("x_type", "medical"), "ambulancia")
        return unit
    except Exception as e:
        print(f"[emergency] get_active_unit error: {e}")
        return None


def save_evidence_odoo(uid, photo_b64=None, audio_b64=None):
    try:
        s = odoo_session()
        alert_id = _active_alert_id(s, uid)
        if not alert_id:
            return False
        vals = {}
        if photo_b64: vals["x_photo_evidence"] = photo_b64
        if audio_b64: vals["x_audio_evidence"] = audio_b64
        if vals:
            odoo_call(s, EMERGENCY_MODEL, "write", [[alert_id], vals])
        return True
    except Exception as e:
        print(f"[emergency] save_evidence_odoo error: {e}")
        return False


def get_evidence_odoo(uid):
    try:
        s = odoo_session()
        alert_id = _active_alert_id(s, uid)
        if not alert_id:
            return None, None
        rows = odoo_call(s, EMERGENCY_MODEL, "read",
            [[int(alert_id)], ["x_photo_evidence", "x_audio_evidence"]])
        if not rows:
            return None, None
        r = rows[0]
        return r.get("x_photo_evidence"), r.get("x_audio_evidence")
    except Exception as e:
        print(f"[emergency] get_evidence_odoo error: {e}")
        return None, None


def stop_alert_odoo(uid, new_status="cancelled"):
    try:
        s = odoo_session()
        alert_id = _active_alert_id(s, uid)
        if not alert_id:
            return
        status = new_status if new_status in ("cancelled", "false_alarm", "resolved") else "cancelled"
        odoo_call(s, EMERGENCY_MODEL, "write",
            [[int(alert_id)], {"x_status": status, "x_ended_at": time.time()}])
        return int(alert_id)
    except Exception as e:
        print(f"[emergency] stop_alert_odoo error: {e}")


def get_alerts_odoo():
    try:
        s = odoo_session()
        cutoff = time.time() - (15 * 60)
        rows = odoo_call(s, EMERGENCY_MODEL, "search_read",
            [[["x_status", "in", ["active", "monitoring"]], ["x_ts", ">", cutoff]]],
            {"fields": [
                "x_user_id", "x_name", "x_email", "x_type", "x_status",
                "x_lat", "x_lng", "x_ts",
                "x_photo_evidence", "x_audio_evidence",
                "x_battery", "x_charging", "x_unit",
            ], "order": "x_ts desc", "limit": 200})
        out = []
        for r in rows:
            raw_uid = r.get("x_user_id")
            uid_val = raw_uid[0] if isinstance(raw_uid, (list, tuple)) and raw_uid else raw_uid
            batt    = r.get("x_battery")
            if batt == 0.0 and not r.get("x_charging"):
                batt = None
            e_type  = r.get("x_type", "medical")
            unit    = r.get("x_unit") or UNIT_SUGGESTIONS.get(e_type, "ambulancia")
            lat_val = r.get("x_lat", None)
            lng_val = r.get("x_lng", None)
            if (lat_val in (None, False, 0, 0.0)) and (lng_val in (None, False, 0, 0.0)):
                lat_val = None
                lng_val = None
            out.append({
                "id":        r.get("id"),
                "uid":       uid_val,
                "name":      r.get("x_name", ""),
                "email":     r.get("x_email", ""),
                "type":      e_type,
                "status":    r.get("x_status", "active"),
                "lat":       lat_val,
                "lng":       lng_val,
                "ts":        r.get("x_ts", 0),
                "has_photo": bool(r.get("x_photo_evidence")),
                "has_audio": bool(r.get("x_audio_evidence")),
                "battery":   round(batt) if batt is not None else None,
                "charging":  bool(r.get("x_charging", False)),
                "unit":      unit,
            })
        return out
    except Exception as e:
        print(f"[emergency] get_alerts_odoo error: {e}")
        return []


# ── Email helpers ─────────────────────────────────────────────────────────────

def build_attachments_from_evidence(photo_b64, audio_b64):
    atts = []

    def _decode(d):
        if not d:
            return None, None
        header, data = (d.split(",", 1) if "," in d else ("", d))
        mime = "application/octet-stream"
        if header.startswith("data:") and ";" in header:
            try: mime = header.split(":", 1)[1].split(";", 1)[0]
            except Exception: pass
        return mime, base64.b64decode(data)

    if photo_b64:
        try:
            mime, blob = _decode(photo_b64)
            atts.append({"data": blob, "filename": "foto_evidencia.jpg", "mimetype": mime or "image/jpeg"})
        except Exception as e:
            print(f"[emergency] decode photo error: {e}")
    if audio_b64:
        try:
            mime, blob = _decode(audio_b64)
            ext = "ogg" if mime and "ogg" in mime else "webm"
            atts.append({"data": blob, "filename": f"audio_evidencia.{ext}", "mimetype": mime or "audio/webm"})
        except Exception as e:
            print(f"[emergency] decode audio error: {e}")
    return atts


def _smtp_configured() -> bool:
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = os.getenv("SMTP_PASS")
    return bool(host and user and password)


def send_email(to_email, subject, html_body, attachments=None):
    try:
        if not EMAIL_NOTIFICATIONS_ENABLED:
            return False, "EMAIL_NOTIFICATIONS_DISABLED"
        if not _smtp_configured():
            return False, "SMTP_NOT_CONFIGURED"
        smtp_send_email(to_emails=to_email, subject=subject, html=html_body, attachments=attachments or None)
        return True, None
    except Exception as e:
        err = str(e) or e.__class__.__name__
        print(f"[emergency] send_email error to {to_email}: {err}")
        return False, err


def _battery_html(battery, charging):
    if battery is None: return ""
    label = f"{battery}%" + (" (cargando)" if charging else "")
    return f"""<div style="background:#f9f9f9;border-left:4px solid #26d0b2;padding:10px 16px;border-radius:6px;margin:12px 0;font-size:13px;color:#555">
    <strong>Bateria:</strong> <span style="font-weight:700">{label}</span></div>"""


def _unit_html(unit):
    if not unit: return ""
    meta = UNIT_META.get(unit, {"label": unit, "color": "#333"})
    return f"""<div style="background:#e8f5e9;border-left:4px solid {meta['color']};padding:10px 16px;border-radius:6px;margin:12px 0;font-size:13px;color:#555">
    <strong>Unidad asignada:</strong> <span style="color:{meta['color']};font-weight:700">{meta['label']}</span></div>"""


def build_contact_email(user_name, e_type, lat, lng, profile,
                        battery=None, charging=False,
                        has_photo=False, has_audio=False, unit=None):
    maps_url   = f"https://maps.google.com/?q={lat},{lng}" if lat is not None and lng is not None else ""
    e_name     = EMERGENCY_NAMES.get(e_type, "Emergencia")
    now        = datetime.now().strftime("%d/%m/%Y %H:%M")
    blood      = profile.get("x_blood",      "No registrado")
    allergies  = profile.get("x_allergies",  "Ninguna")
    conditions = profile.get("x_conditions", "Ninguna")
    address    = profile.get("x_address",    "No registrada")
    items = []
    if has_photo: items.append("Foto")
    if has_audio: items.append("Audio")
    evidence_note = f"""<div style="background:#fff8e1;border-left:4px solid #FFA000;padding:12px;border-radius:6px;margin:16px 0">
        <strong>Evidencia adjunta:</strong> {' - '.join(items)}</div>""" if items else ""

    return f"""<!doctype html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#E53935;padding:22px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">ALERTA DE EMERGENCIA</h1>
      <p style="color:rgba(255,255,255,.85);margin:8px 0 0">{e_name}</p>
    </div>
    <div style="padding:22px">
      <p style="font-size:16px;color:#333"><strong>{user_name}</strong> activo una alerta de emergencia.</p>
      <div style="background:#fff3f3;border-left:4px solid #E53935;padding:14px;border-radius:8px;margin:16px 0">
        <strong>Hora:</strong> {now}<br><strong>Tipo:</strong> {e_name}<br>
        <strong>Ubicacion:</strong> <a href="{maps_url}" style="color:#E53935">Ver en Google Maps</a><br>
        <strong>Direccion:</strong> {address}
      </div>
      {_unit_html(unit)}{_battery_html(battery, charging)}
      <div style="background:#f9f9f9;border-radius:8px;padding:14px;margin:16px 0">
        <h3 style="margin:0 0 10px;color:#333">Informacion medica</h3>
        <p style="margin:6px 0"><strong>Sangre:</strong> {blood}</p>
        <p style="margin:6px 0"><strong>Alergias:</strong> {allergies}</p>
        <p style="margin:6px 0"><strong>Condiciones:</strong> {conditions}</p>
      </div>
      {evidence_note}
    </div>
  </div>
</body></html>"""


def build_admin_email(user_name, user_email, e_type, lat, lng, contacts_notified,
                      battery=None, charging=False,
                      has_photo=False, has_audio=False, unit=None):
    maps_url      = f"https://maps.google.com/?q={lat},{lng}" if lat is not None and lng is not None else ""
    e_name        = EMERGENCY_NAMES.get(e_type, "Emergencia")
    now           = datetime.now().strftime("%d/%m/%Y %H:%M")
    contacts_html = "".join([f"<li>{c['name']} ({c.get('rel','')}) - {c['email']}</li>" for c in contacts_notified])
    evidence = []
    if has_photo: evidence.append("Foto")
    if has_audio: evidence.append("Audio")
    evidence_note = f"""<div style="background:#e8f5e9;border-left:4px solid #43A047;padding:12px;border-radius:6px;margin:16px 0">
        <strong>Evidencia adjunta:</strong> {' - '.join(evidence)}</div>""" if evidence else ""

    return f"""<!doctype html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#0D1B2A;padding:22px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:20px">Reporte de Emergencia</h1>
      <p style="color:rgba(255,255,255,.7);margin:8px 0 0">Panel Admin - SOS EmergeLens</p>
    </div>
    <div style="padding:22px">
      <div style="background:#fff3f3;border-left:4px solid #E53935;padding:14px;border-radius:8px;margin-bottom:16px">
        <strong>Usuario:</strong> {user_name} ({user_email})<br>
        <strong>Hora:</strong> {now}<br><strong>Tipo:</strong> {e_name}<br>
        <strong>Ubicacion:</strong> <a href="{maps_url}" style="color:#E53935">Ver en Google Maps</a>
      </div>
      {_unit_html(unit)}{_battery_html(battery, charging)}{evidence_note}
      <h3 style="color:#333;margin:0 0 10px">Contactos notificados:</h3>
      <ul style="padding-left:20px;color:#555">{contacts_html}</ul>
    </div>
  </div>
</body></html>"""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@emergency_bp.route("/email", methods=["POST"])
def send_emergency_email():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data      = request.get_json() or {}
    e_type    = data.get("type", "medical")
    lat       = data.get("lat")
    lng       = data.get("lng")
    photo_b64 = data.get("photo")
    audio_b64 = data.get("audio")
    battery   = data.get("battery")
    charging  = bool(data.get("charging", False))

    try:
        user_name, user_email, profile = get_profile(uid)
        alert_id = upsert_alert_odoo(uid, user_name, user_email, e_type, lat, lng, battery, charging)

        if photo_b64 or audio_b64:
            save_evidence_odoo(uid, photo_b64, audio_b64)

        unit = UNIT_SUGGESTIONS.get(e_type, "ambulancia")

        log_audit(uid, "sos_activated", "emergency", e_type)

        push_notification(
            "emergency",
            f"{user_name} esta en peligro. Tipo: {EMERGENCY_NAMES.get(e_type, 'emergencia')}",
            uid=uid, name=f"ALERTA SOS: {user_name} en peligro", target_uid=uid,
        )
        notify_emergency_contacts(uid, user_name, e_type, lat=lat, lng=lng)

        # ── Notificar a contactos registrados en la app (SOSAlert + notif panel) ──
        notify_registered_contacts(uid, user_name, e_type, alert_id, lat, lng)

        has_photo   = bool(photo_b64)
        has_audio   = bool(audio_b64)
        attachments = build_attachments_from_evidence(photo_b64, audio_b64)

        html_body = build_contact_email(
            user_name, e_type, lat, lng, profile,
            battery=battery, charging=charging,
            has_photo=has_photo, has_audio=has_audio, unit=unit
        )
        subject = f"ALERTA: {user_name} activo una emergencia"

        contacts_notified = []
        email_errors = []
        for email_key, name_key, rel_key in [
            ("x_ec1_email", "x_ec1_name", "x_ec1_rel"),
            ("x_ec2_email", "x_ec2_name", "x_ec2_rel"),
        ]:
            ec_email = (profile.get(email_key) or "").strip()
            if not ec_email:
                continue
            ec_name = (profile.get(name_key) or "Contacto").strip() or "Contacto"
            ec_rel  = (profile.get(rel_key)  or "").strip()
            ok, err = send_email(ec_email, subject, html_body, attachments or None)
            if ok:
                contacts_notified.append({"name": ec_name, "rel": ec_rel, "email": ec_email})
            else:
                email_errors.append({"to": ec_email, "error": err or "UNKNOWN"})

        admin_html = build_admin_email(
            user_name, user_email, e_type, lat, lng, contacts_notified,
            battery=battery, charging=charging,
            has_photo=has_photo, has_audio=has_audio, unit=unit
        )
        admin_ok, admin_err = send_email(
            ADMIN_EMAIL,
            f"Reporte SOS: {user_name} - {EMERGENCY_NAMES.get(e_type,'Emergencia')}",
            admin_html,
            attachments or None,
        )
        if not admin_ok:
            email_errors.append({"to": ADMIN_EMAIL, "error": admin_err or "UNKNOWN"})

        return jsonify({
            "ok": True,
            "notified": len(contacts_notified),
            "contacts": contacts_notified,
            "unit": unit,
            "email": {
                "enabled": EMAIL_NOTIFICATIONS_ENABLED,
                "smtp_configured": _smtp_configured(),
                "errors": email_errors,
            },
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@emergency_bp.route("/contact-alerts", methods=["GET"])
def get_contact_alerts():
    """
    GET /api/emergency/contact-alerts
    Devuelve emergencias activas donde el usuario autenticado
    es contacto de emergencia del usuario en peligro.
    Usado por SOSAlert.jsx para el polling en tiempo real.
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        s = odoo_session()

        user_data = odoo_call(s, "res.users", "read",
            [[int(uid)]], {"fields": ["email", "name"]})
        if not user_data:
            return jsonify({"alerts": []})

        user_email = user_data[0].get("email", "").lower().strip()
        if not user_email:
            return jsonify({"alerts": []})

        # Perfiles donde este usuario es contacto de emergencia
        profiles = odoo_call(s, PROFILE_MODEL, "search_read",
            [["|",
              ["x_ec1_email", "=", user_email],
              ["x_ec2_email", "=", user_email]]],
            {"fields": ["x_user_id", "x_address"], "limit": 50})

        if not profiles:
            return jsonify({"alerts": []})

        at_risk_uids = []
        address_map  = {}
        for p in profiles:
            raw = p.get("x_user_id")
            if isinstance(raw, list) and raw:
                at_risk_uids.append(raw[0])
                address_map[raw[0]] = p.get("x_address", "")
            elif isinstance(raw, int):
                at_risk_uids.append(raw)
                address_map[raw] = p.get("x_address", "")

        if not at_risk_uids:
            return jsonify({"alerts": []})

        # Emergencias activas de esos usuarios
        cutoff = time.time() - (15 * 60)
        emergencies = odoo_call(s, EMERGENCY_MODEL, "search_read",
            [[["x_user_id", "in", at_risk_uids],
              ["x_status", "=", "active"],
              ["x_ts", ">", cutoff]]],
            {"fields": ["id", "x_user_id", "x_type", "x_lat", "x_lng",
                        "x_address", "x_battery", "x_charging", "x_ts"],
             "order": "x_ts desc", "limit": 10})

        alerts = []
        for e in emergencies:
            raw_user  = e.get("x_user_id")
            user_uname = raw_user[1] if isinstance(raw_user, list) else "Usuario"
            user_uid   = raw_user[0] if isinstance(raw_user, list) else raw_user
            lat_val = e.get("x_lat")
            lng_val = e.get("x_lng")
            if lat_val in (None, False, 0, 0.0): lat_val = None
            if lng_val in (None, False, 0, 0.0): lng_val = None

            # Dirección: preferir la del perfil si la de la alerta está vacía
            addr = e.get("x_address") or address_map.get(user_uid, "")

            alerts.append({
                "id":        e["id"],
                "user_name": user_uname,
                "user_id":   user_uid,
                "type":      e.get("x_type", "medical"),
                "lat":       lat_val,
                "lng":       lng_val,
                "address":   addr,
                "battery":   e.get("x_battery"),
                "charging":  e.get("x_charging", False),
                "timestamp": e.get("x_ts"),
            })

        return jsonify({"alerts": alerts})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@emergency_bp.route("/unit/<int:alert_id>", methods=["PATCH"])
def assign_unit(alert_id):
    uid   = session.get("uid")
    email = session.get("email")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    if email != ADMIN_EMAIL and not is_admin(uid):
        return jsonify({"error": "Solo el admin puede asignar unidades"}), 403
    data = request.get_json() or {}
    unit = data.get("unit")
    if unit not in ALL_UNITS:
        return jsonify({"error": f"Unidad invalida: {unit}. Validas: {ALL_UNITS}"}), 400
    ok = assign_unit_odoo(alert_id, unit)
    if not ok:
        return jsonify({"error": "No se pudo asignar unidad"}), 500
    log_audit(uid, "unit_assigned", "emergency", f"{alert_id} -> {unit}")
    return jsonify({"ok": True, "unit": unit, "meta": UNIT_META[unit]})


@emergency_bp.route("/my-unit", methods=["GET"])
def get_my_unit():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    unit = get_active_unit(uid)
    return jsonify({"ok": True, "unit": unit, "meta": UNIT_META.get(unit, {}) if unit else {}})


@emergency_bp.route("/battery", methods=["POST"])
def update_battery():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    data     = request.get_json() or {}
    battery  = data.get("battery")
    charging = bool(data.get("charging", False))
    if battery is None:
        return jsonify({"error": "battery requerido"}), 400
    try:
        s = odoo_session()
        alert_id = _active_alert_id(s, uid)
        if alert_id:
            odoo_call(s, EMERGENCY_MODEL, "write",
                [[int(alert_id)], {"x_battery": float(battery), "x_charging": charging}])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@emergency_bp.route("/location", methods=["POST"])
def update_location():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    data     = request.get_json() or {}
    e_type   = data.get("type", "medical")
    lat      = data.get("lat")
    lng      = data.get("lng")
    battery  = data.get("battery")
    charging = bool(data.get("charging", False))
    try:
        lat_val = float(lat) if lat is not None else None
        lng_val = float(lng) if lng is not None else None
    except Exception:
        return jsonify({"error": "Lat/Lng invalidos"}), 400
    try:
        user_name, user_email, _ = get_profile(uid)
    except Exception:
        user_name, user_email = "Usuario", ""
    upsert_alert_odoo(uid, user_name, user_email, e_type, lat_val, lng_val, battery, charging)
    return jsonify({"ok": True})


@emergency_bp.route("/evidence", methods=["POST"])
def upload_evidence():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    data      = request.get_json() or {}
    photo_b64 = data.get("photo")
    audio_b64 = data.get("audio")
    resend    = bool(data.get("resend_email", False))
    if not photo_b64 and not audio_b64:
        return jsonify({"error": "Sin evidencia"}), 400
    try:
        ok = save_evidence_odoo(uid, photo_b64, audio_b64)
        if not ok:
            return jsonify({"error": "No hay alerta activa"}), 404
        if resend:
            try:
                user_name, user_email, profile = get_profile(uid)
                s = odoo_session()
                alert_rows = odoo_call(s, EMERGENCY_MODEL, "search_read",
                    [[["x_user_id", "=", int(uid)], ["x_status", "=", "active"]]],
                    {"fields": ["x_type", "x_lat", "x_lng", "x_battery", "x_charging", "x_unit"], "limit": 1})
                if alert_rows:
                    a        = alert_rows[0]
                    e_type   = a.get("x_type", "medical")
                    lat      = a.get("x_lat")
                    lng      = a.get("x_lng")
                    battery  = a.get("x_battery")
                    charging = bool(a.get("x_charging", False))
                    unit     = a.get("x_unit") or UNIT_SUGGESTIONS.get(e_type, "ambulancia")
                    atts     = build_attachments_from_evidence(photo_b64, audio_b64)
                    html     = build_contact_email(
                        user_name, e_type, lat, lng, profile,
                        battery=battery, charging=charging,
                        has_photo=bool(photo_b64), has_audio=bool(audio_b64), unit=unit)
                    subject = f"Evidencia adjunta - Emergencia de {user_name}"
                    for key in ("x_ec1_email", "x_ec2_email"):
                        ec = (profile.get(key) or "").strip()
                        if ec:
                            send_email(ec, subject, html, atts)
            except Exception as e:
                print(f"[emergency] resend evidence error: {e}")
        return jsonify({"ok": True, "photo": bool(photo_b64), "audio": bool(audio_b64)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@emergency_bp.route("/evidence", methods=["GET"])
def get_evidence():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    photo, audio = get_evidence_odoo(uid)
    return jsonify({"ok": True, "photo": photo, "audio": audio})


@emergency_bp.route("/alerts", methods=["GET"])
def get_alerts():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    if not is_admin(uid):
        return jsonify({"error": "No autorizado"}), 403
    return jsonify({"ok": True, "alerts": get_alerts_odoo()})


@emergency_bp.route("/stop", methods=["POST"])
def stop_emergency():
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    data = request.get_json(silent=True) or {}
    status   = (data.get("status") or "cancelled").strip()
    alert_id = stop_alert_odoo(uid, status)
    log_audit(uid, "sos_cancelled", "emergency", status or "cancelled")
    return jsonify({"ok": True, "status": status or "cancelled", "alert_id": alert_id})


@emergency_bp.route("/status/<int:alert_id>", methods=["PATCH"])
def update_status(alert_id):
    uid   = session.get("uid")
    email = session.get("email")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    data       = request.get_json() or {}
    new_status = data.get("status")
    valid_admin = {"monitoring", "resolved"}
    valid_user  = {"false_alarm", "cancelled"}
    if email == ADMIN_EMAIL:
        if new_status not in valid_admin:
            return jsonify({"error": f"Estado invalido para admin: {new_status}"}), 400
    else:
        if new_status not in valid_user:
            return jsonify({"error": f"Estado invalido para usuario: {new_status}"}), 400
    try:
        s = odoo_session()
        rows = odoo_call(
            s,
            EMERGENCY_MODEL,
            "read",
            [[int(alert_id)]],
            {"fields": ["id", "x_user_id", "x_name", "x_status"]},
        )
        if not rows:
            return jsonify({"error": "Incidente no encontrado"}), 404
        vals = {"x_status": new_status}
        if new_status in ("resolved", "false_alarm", "cancelled"):
            vals["x_ended_at"] = time.time()
        odoo_call(s, EMERGENCY_MODEL, "write", [[int(alert_id)], vals])

        # Notify the affected user when admin changes the status.
        try:
            if email == ADMIN_EMAIL and new_status in ("monitoring", "resolved"):
                raw_user = rows[0].get("x_user_id")
                target_uid = raw_user[0] if isinstance(raw_user, (list, tuple)) and raw_user else raw_user
                if target_uid:
                    if new_status == "monitoring":
                        msg = "Tu emergencia esta en seguimiento. Mantente atento y sigue las instrucciones."
                        title = "Emergencia en seguimiento"
                    else:
                        msg = "Tu emergencia fue marcada como resuelta."
                        title = "Emergencia resuelta"
                    push_notification("info", msg, uid=int(target_uid), name=title, target_uid=int(target_uid))
        except Exception as e:
            print(f"[emergency] update_status notify error: {e}")

        log_audit(uid, "status_changed", "emergency", f"{alert_id} -> {new_status}")
        return jsonify({"ok": True, "status": new_status})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@emergency_bp.route("/my-alert", methods=["GET"])
def get_my_alert():
    """
    GET /api/emergency/my-alert
    Returns the latest emergency for the authenticated user, so the client can
    react to admin status changes (monitoring/resolved).
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        s = odoo_session()
        rows = odoo_call(
            s,
            EMERGENCY_MODEL,
            "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {"fields": ["id", "x_status", "x_ts", "x_unit"], "order": "x_ts desc", "limit": 1},
        )
        if not rows:
            return jsonify({"ok": True, "has_alert": False})

        r = rows[0]
        ts = r.get("x_ts") or 0
        # Ignore very old records.
        if ts and float(ts) < (time.time() - 6 * 3600):
            return jsonify({"ok": True, "has_alert": False})

        return jsonify({
            "ok": True,
            "has_alert": True,
            "id": r.get("id"),
            "status": (r.get("x_status") or "active").strip(),
            "ts": ts,
            "unit": r.get("x_unit") or None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@emergency_bp.route("/debug/alert", methods=["GET"])
def debug_alert():
    try:
        s = odoo_session()
        rows = odoo_call(s, EMERGENCY_MODEL, "search_read",
            [[]], {"limit": 5, "fields": [
                "x_user_id", "x_name", "x_status",
                "x_lat", "x_lng", "x_ts", "x_battery", "x_unit"]})
        return jsonify({"ok": True, "count": len(rows), "records": rows})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@emergency_bp.route("/debug/smtp", methods=["POST"])
def debug_smtp():
    """
    POST /api/emergency/debug/smtp
    Envia un correo de prueba al email del usuario autenticado.
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    to_email = (session.get("email") or "").strip()
    if not to_email or "@" not in to_email:
        return jsonify({"error": "Email de sesion invalido"}), 400

    ok, err = send_email(
        to_email,
        "SMTP test - SOS EmergeLens",
        "<p>Correo de prueba (SMTP) enviado desde SOS EmergeLens.</p>",
        None,
    )
    return jsonify({
        "ok": bool(ok),
        "error": err,
        "email_enabled": EMAIL_NOTIFICATIONS_ENABLED,
        "smtp_configured": _smtp_configured(),
        "to": to_email,
    })
