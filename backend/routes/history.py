"""
routes/history.py - Historial de incidentes.

Devuelve:
- Incidentes propios del usuario
- Incidentes de usuarios que tienen al usuario logueado como contacto de emergencia
  (marcados con as_contact=True para distinguirlos en la UI)
- El admin ve todos los incidentes
"""

from flask import Blueprint, request, jsonify, session
import requests
import os
import time

history_bp = Blueprint("history", __name__)

ODOO_URL         = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB          = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_ODOO_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_ODOO_PASS  = os.getenv("ADMIN_ODOO_PASS", "2408")
ADMIN_EMAIL      = os.getenv("ADMIN_EMAIL", "sosemergelens@gmail.com")

PROFILE_MODEL   = "x.emergelens.profile"
EMERGENCY_MODEL = "x.emergelens.emergency"
GEOFENCE_EVENT_MODEL = "x.emergelens.geofence.event"

ALERT_FIELDS = [
    "x_user_id", "x_name", "x_type", "x_status",
    "x_lat", "x_lng", "x_ts", "x_started_at", "x_ended_at",
    "x_photo_evidence", "x_audio_evidence", "x_unit",
]

GEOFENCE_EVENT_FIELDS = [
    "id",
    "x_user_id",
    "x_zone_name",
    "x_zone_type",
    "x_event_type",
    "x_lat",
    "x_lng",
    "x_timestamp",
]


VALID_TYPES = {"medical", "security", "fire", "accident"}
VALID_STATUS = {"active", "monitoring", "resolved", "false_alarm", "cancelled"}


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
    }, timeout=15)
    data = res.json()
    if data.get("error"):
        raise Exception(data["error"].get("data", {}).get("message", "Odoo error"))
    return data["result"]


def _is_admin():
    return (session.get("email") or "").strip() == ADMIN_EMAIL


def _safe_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def _get_owner_uid(raw_user_id):
    if isinstance(raw_user_id, (list, tuple)) and raw_user_id:
        return int(raw_user_id[0])
    if isinstance(raw_user_id, int):
        return int(raw_user_id)
    return None


def _fetch_incident(s, incident_id, fields=None):
    fields = fields or ALERT_FIELDS
    rows = odoo_call(s, EMERGENCY_MODEL, "search_read",
        [[["id", "=", int(incident_id)]]],
        {"fields": fields, "limit": 1})
    return rows[0] if rows else None


def serialize_incident(r, is_contact=False):
    raw_uid      = r.get("x_user_id")
    uid_val      = raw_uid[0] if isinstance(raw_uid, (list, tuple)) and raw_uid else None
    uid_name     = raw_uid[1] if isinstance(raw_uid, (list, tuple)) and len(raw_uid) > 1 else "Usuario"
    display_name = r.get("x_name") or uid_name or "Usuario"

    started  = r.get("x_started_at") or r.get("x_ts") or 0
    ended    = r.get("x_ended_at") or 0
    duration = int(ended - started) if ended and started and ended > started else None

    lat_val = r.get("x_lat")
    lng_val = r.get("x_lng")
    if lat_val in (None, False, 0, 0.0) and lng_val in (None, False, 0, 0.0):
        lat_val = None
        lng_val = None

    return {
        "id":         r["id"],
        "uid":        uid_val,
        "name":       display_name,
        "type":       r.get("x_type", "medical"),
        "status":     r.get("x_status", "resolved"),
        "lat":        lat_val,
        "lng":        lng_val,
        "started":    started,
        "ended":      ended,
        "duration":   duration,
        "has_photo":  bool(r.get("x_photo_evidence")),
        "has_audio":  bool(r.get("x_audio_evidence")),
        "unit":       r.get("x_unit"),
        "as_contact": is_contact,  # True si soy contacto de emergencia de este usuario
    }


@history_bp.route("/", methods=["GET"])
def get_history():
    uid   = session.get("uid")
    email = session.get("email")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        s = odoo_session()

        if email == ADMIN_EMAIL:
            results   = odoo_call(s, EMERGENCY_MODEL, "search_read",
                [[]],
                {"fields": ALERT_FIELDS, "order": "x_ts desc", "limit": 200})
            incidents = [serialize_incident(r) for r in results]
            geo_events = odoo_call(
                s,
                GEOFENCE_EVENT_MODEL,
                "search_read",
                [[]],
                {"fields": GEOFENCE_EVENT_FIELDS, "order": "x_timestamp desc", "limit": 200},
            )

        else:
            # Mis incidentes
            my_incidents = odoo_call(s, EMERGENCY_MODEL, "search_read",
                [[["x_user_id", "=", int(uid)]]],
                {"fields": ALERT_FIELDS, "order": "x_ts desc", "limit": 100})

            # Usuarios que me tienen como contacto de emergencia
            user_data = odoo_call(s, "res.users", "read",
                [[int(uid)]], {"fields": ["email"]})
            my_email = (user_data[0].get("email") or "").lower().strip() if user_data else ""

            contact_incidents = []
            if my_email:
                profiles = odoo_call(s, PROFILE_MODEL, "search_read",
                    [["|",
                      ["x_ec1_email", "=", my_email],
                      ["x_ec2_email", "=", my_email]]],
                    {"fields": ["x_user_id"], "limit": 50})

                contact_uids = []
                for p in profiles:
                    raw = p.get("x_user_id")
                    if isinstance(raw, list) and raw:
                        contact_uids.append(raw[0])
                    elif isinstance(raw, int):
                        contact_uids.append(raw)

                if contact_uids:
                    c_inc = odoo_call(s, EMERGENCY_MODEL, "search_read",
                        [[["x_user_id", "in", contact_uids]]],
                        {"fields": ALERT_FIELDS, "order": "x_ts desc", "limit": 100})
                    contact_incidents = c_inc

            # Combinar y deduplicar
            seen    = set()
            all_raw = []

            for r in my_incidents:
                if r["id"] not in seen:
                    seen.add(r["id"])
                    all_raw.append((r, False))

            for r in contact_incidents:
                if r["id"] not in seen:
                    seen.add(r["id"])
                    all_raw.append((r, True))

            all_raw.sort(key=lambda x: x[0].get("x_ts", 0), reverse=True)
            incidents = [serialize_incident(r, ic) for r, ic in all_raw]

            geo_events = odoo_call(
                s,
                GEOFENCE_EVENT_MODEL,
                "search_read",
                [[["x_user_id", "=", int(uid)]]],
                {"fields": GEOFENCE_EVENT_FIELDS, "order": "x_timestamp desc", "limit": 80},
            )

        return jsonify({"ok": True, "incidents": incidents, "geofence_events": geo_events})

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@history_bp.route("/evidence/<int:incident_id>", methods=["GET"])
def get_incident_evidence(incident_id):
    uid   = session.get("uid")
    email = session.get("email")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        s = odoo_session()

        if email == ADMIN_EMAIL:
            domain = [["id", "=", incident_id]]
        else:
            user_data = odoo_call(s, "res.users", "read",
                [[int(uid)]], {"fields": ["email"]})
            my_email = (user_data[0].get("email") or "").lower().strip() if user_data else ""

            allowed_uids = [int(uid)]
            if my_email:
                profiles = odoo_call(s, PROFILE_MODEL, "search_read",
                    [["|",
                      ["x_ec1_email", "=", my_email],
                      ["x_ec2_email", "=", my_email]]],
                    {"fields": ["x_user_id"], "limit": 50})
                for p in profiles:
                    raw = p.get("x_user_id")
                    if isinstance(raw, list) and raw:
                        allowed_uids.append(raw[0])
                    elif isinstance(raw, int):
                        allowed_uids.append(raw)

            domain = [["id", "=", incident_id], ["x_user_id", "in", allowed_uids]]

        results = odoo_call(s, EMERGENCY_MODEL, "search_read",
            [domain],
            {"fields": ["x_photo_evidence", "x_audio_evidence"], "limit": 1})

        if not results:
            return jsonify({"error": "No encontrado o sin acceso"}), 404

        r = results[0]
        return jsonify({
            "ok":    True,
            "photo": r.get("x_photo_evidence") or None,
            "audio": r.get("x_audio_evidence") or None,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@history_bp.route("/", methods=["POST"])
def create_incident():
    """
    POST /api/history/
    Crea un incidente en Odoo (x.emergelens.emergency).

    Permisos:
    - Admin: puede crear para cualquier uid (si manda uid), o para si mismo.
    - Usuario: solo puede crear para si mismo.
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data = request.get_json(silent=True) or {}
    is_admin = _is_admin()

    target_uid = data.get("uid")
    if target_uid is None or not is_admin:
        target_uid = int(uid)
    else:
        try:
            target_uid = int(target_uid)
        except Exception:
            return jsonify({"error": "uid invalido"}), 400

    e_type = (data.get("type") or "medical").strip().lower()
    if e_type not in VALID_TYPES:
        return jsonify({"error": f"type invalido: {e_type}"}), 400

    status = (data.get("status") or "resolved").strip().lower()
    if status not in VALID_STATUS:
        return jsonify({"error": f"status invalido: {status}"}), 400

    lat_val = _safe_float(data.get("lat"))
    lng_val = _safe_float(data.get("lng"))
    if (data.get("lat") is not None and lat_val is None) or (data.get("lng") is not None and lng_val is None):
        return jsonify({"error": "lat/lng invalidos"}), 400

    now = time.time()
    started = data.get("started")
    ended = data.get("ended")
    try:
        started_val = float(started) if started is not None else now
    except Exception:
        return jsonify({"error": "started invalido"}), 400
    try:
        ended_val = float(ended) if ended is not None else 0.0
    except Exception:
        return jsonify({"error": "ended invalido"}), 400

    ts = data.get("ts")
    try:
        ts_val = float(ts) if ts is not None else now
    except Exception:
        return jsonify({"error": "ts invalido"}), 400

    vals = {
        "x_user_id": int(target_uid),
        "x_type":    e_type,
        "x_status":  status,
        "x_ts":      ts_val,
        "x_started_at": started_val,
        "x_unit":    (data.get("unit") or False),
    }
    if ended_val and ended_val > 0:
        vals["x_ended_at"] = ended_val

    # Optional friendly display name in Odoo record.
    if data.get("name"):
        vals["x_name"] = str(data.get("name")).strip()

    if lat_val is not None and lng_val is not None:
        vals["x_lat"] = lat_val
        vals["x_lng"] = lng_val
    else:
        vals["x_lat"] = False
        vals["x_lng"] = False

    photo_b64 = data.get("photo")
    audio_b64 = data.get("audio")
    if photo_b64:
        vals["x_photo_evidence"] = photo_b64
    if audio_b64:
        vals["x_audio_evidence"] = audio_b64

    try:
        s = odoo_session()
        new_id = odoo_call(s, EMERGENCY_MODEL, "create", [vals])
        rec = _fetch_incident(s, new_id)
        return jsonify({"ok": True, "incident": serialize_incident(rec) if rec else {"id": new_id}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@history_bp.route("/<int:incident_id>", methods=["PUT"])
def update_incident(incident_id):
    """
    PUT /api/history/<id>
    Actualiza un incidente en Odoo.

    Permisos:
    - Admin: puede actualizar cualquier incidente.
    - Usuario: solo puede actualizar sus propios incidentes y no puede cambiar x_user_id.
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data = request.get_json(silent=True) or {}
    is_admin = _is_admin()

    try:
        s = odoo_session()
        existing = _fetch_incident(s, incident_id, fields=[
            "x_user_id", "x_status", "x_started_at", "x_ended_at", "x_ts", "x_lat", "x_lng"
        ])
        if not existing:
            return jsonify({"error": "No encontrado"}), 404

        owner_uid = _get_owner_uid(existing.get("x_user_id"))
        if not is_admin and owner_uid != int(uid):
            return jsonify({"error": "No autorizado"}), 403

        vals = {}

        if "type" in data:
            e_type = (data.get("type") or "").strip().lower()
            if e_type not in VALID_TYPES:
                return jsonify({"error": f"type invalido: {e_type}"}), 400
            vals["x_type"] = e_type

        if "status" in data:
            status = (data.get("status") or "").strip().lower()
            if status not in VALID_STATUS:
                return jsonify({"error": f"status invalido: {status}"}), 400
            vals["x_status"] = status
            if status in ("resolved", "false_alarm", "cancelled"):
                # Autocompletar fin si no lo mandan
                if "ended" not in data and not existing.get("x_ended_at"):
                    vals["x_ended_at"] = time.time()

        if "lat" in data or "lng" in data:
            lat_val = _safe_float(data.get("lat")) if "lat" in data else _safe_float(existing.get("x_lat"))
            lng_val = _safe_float(data.get("lng")) if "lng" in data else _safe_float(existing.get("x_lng"))
            if (("lat" in data) and data.get("lat") is not None and lat_val is None) or (("lng" in data) and data.get("lng") is not None and lng_val is None):
                return jsonify({"error": "lat/lng invalidos"}), 400
            if lat_val is not None and lng_val is not None:
                vals["x_lat"] = lat_val
                vals["x_lng"] = lng_val
            else:
                vals["x_lat"] = False
                vals["x_lng"] = False

        if "started" in data:
            try:
                vals["x_started_at"] = float(data.get("started")) if data.get("started") is not None else existing.get("x_started_at") or time.time()
            except Exception:
                return jsonify({"error": "started invalido"}), 400

        if "ended" in data:
            try:
                ended = data.get("ended")
                vals["x_ended_at"] = float(ended) if ended not in (None, "", 0, 0.0, False) else 0.0
            except Exception:
                return jsonify({"error": "ended invalido"}), 400

        if "ts" in data:
            try:
                vals["x_ts"] = float(data.get("ts")) if data.get("ts") is not None else existing.get("x_ts") or time.time()
            except Exception:
                return jsonify({"error": "ts invalido"}), 400

        if "name" in data:
            vals["x_name"] = (str(data.get("name") or "")).strip()

        if "unit" in data:
            vals["x_unit"] = data.get("unit") or False

        if "photo" in data:
            vals["x_photo_evidence"] = data.get("photo") or False
        if "audio" in data:
            vals["x_audio_evidence"] = data.get("audio") or False

        # No permitir cambiar propietario salvo admin.
        if "uid" in data and is_admin:
            try:
                vals["x_user_id"] = int(data.get("uid")) if data.get("uid") is not None else owner_uid
            except Exception:
                return jsonify({"error": "uid invalido"}), 400
        elif "uid" in data and not is_admin:
            return jsonify({"error": "No autorizado para cambiar uid"}), 403

        if not vals:
            rec = _fetch_incident(s, incident_id)
            return jsonify({"ok": True, "incident": serialize_incident(rec) if rec else {"id": incident_id}})

        odoo_call(s, EMERGENCY_MODEL, "write", [[int(incident_id)], vals])
        rec = _fetch_incident(s, incident_id)
        return jsonify({"ok": True, "incident": serialize_incident(rec) if rec else {"id": incident_id}})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@history_bp.route("/<int:incident_id>", methods=["DELETE"])
def delete_incident(incident_id):
    """
    DELETE /api/history/<id>
    Elimina un incidente en Odoo (unlink).

    Permisos:
    - Admin: puede eliminar cualquier incidente.
    - Usuario: solo puede eliminar incidentes propios que NO esten activos.
    """
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    is_admin = _is_admin()

    try:
        s = odoo_session()
        existing = _fetch_incident(s, incident_id, fields=["x_user_id", "x_status"])
        if not existing:
            return jsonify({"error": "No encontrado"}), 404

        owner_uid = _get_owner_uid(existing.get("x_user_id"))
        status = (existing.get("x_status") or "").strip().lower()

        if not is_admin:
            if owner_uid != int(uid):
                return jsonify({"error": "No autorizado"}), 403
            if status == "active":
                return jsonify({"error": "No se puede eliminar un incidente activo"}), 400

        odoo_call(s, EMERGENCY_MODEL, "unlink", [[int(incident_id)]])
        return jsonify({"ok": True, "deleted": int(incident_id)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
