"""
routes/geofence.py - RF16: Zonas seguras / peligrosas con geofencing.

Modelos Odoo (custom fields en addon emergelens):
  x.emergelens.geofence       -> zona definida (por usuario o admin)
  x.emergelens.geofence.event -> evento de violacion de zona

Rutas bajo /api/geofence:
  GET    /zones                       -> zonas del usuario actual
  POST   /zones                       -> crear zona
  PATCH  /zones/<id>                  -> editar zona
  DELETE /zones/<id>                  -> eliminar zona
  GET    /zones/all?admin_email=...   -> ADMIN: todas las zonas de todos
  POST   /event                       -> registrar violacion (desde frontend)
  POST   /danger/confirm              -> respuesta del usuario (yes/no) y activar SOS si aplica
  GET    /events?user_id=...          -> historial de violaciones
"""

import os
import json
from datetime import datetime, timezone
import time
from urllib.parse import quote_plus

import requests
from flask import Blueprint, jsonify, request, session

from security import (
    enforce_requester_email_match,
    is_admin as sess_is_admin,
    login_required,
    require_admin,
)
from routes.audit import log_audit
from routes.notifications import push_notification
from validation import as_float, clean_str

geofence_bp = Blueprint("geofence", __name__)

ODOO_URL  = os.getenv("ODOO_URL",  "http://odoo:8069")
ODOO_DB   = os.getenv("ODOO_DB",   "sosemergelens")
ODOO_USER = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ODOO_PASS = os.getenv("ADMIN_ODOO_PASS",  "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL",    "sosemergelens@gmail.com")

ZONE_MODEL  = "x.emergelens.geofence"
EVENT_MODEL = "x.emergelens.geofence.event"

_uid_cache = None

NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
NOMINATIM_EMAIL = os.getenv("NOMINATIM_EMAIL", "")
NOMINATIM_UA = os.getenv("NOMINATIM_UA", "EmergeLens/1.0")
_geocode_cache = {}  # q -> (ts, items)
_geocode_cache_ttl_s = int(os.getenv("GEOCODE_CACHE_TTL_S", "60"))


# ── Helpers Odoo ──────────────────────────────────────────────────────────────

def _rpc(payload):
    r = requests.post(f"{ODOO_URL}/jsonrpc", json=payload, timeout=15)
    data = r.json()
    if "error" in data:
        msg = (data["error"].get("data", {}).get("message")
               or data["error"].get("message", "Odoo error"))
        raise Exception(msg)
    return data.get("result")


def _get_uid():
    global _uid_cache
    if _uid_cache:
        return _uid_cache
    if not ODOO_PASS:
        raise Exception("Falta ADMIN_ODOO_PASS en variables de entorno")
    _uid_cache = _rpc({
        "jsonrpc": "2.0", "method": "call",
        "params": {"service": "common", "method": "authenticate",
                   "args": [ODOO_DB, ODOO_USER, ODOO_PASS, {}]},
    })
    return _uid_cache


def odoo(model, method, args=None, kwargs=None):
    return _rpc({
        "jsonrpc": "2.0", "method": "call",
        "params": {
            "service": "object", "method": "execute_kw",
            "args": [ODOO_DB, _get_uid(), ODOO_PASS,
                     model, method, args or [], kwargs or {}],
        },
    })


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _is_admin(email):
    return (email or "").strip() == ADMIN_EMAIL


def _uid_from_email(email):
    email = (email or "").strip()
    if not email:
        return None
    rows = odoo("res.users", "search_read",
                [[["login", "=", email]]], {"fields": ["id"], "limit": 1})
    return rows[0]["id"] if rows else None


# --- Geocoding -------------------------------------------------------------
# Proxy simple a Nominatim (OpenStreetMap) para evitar CORS en frontend.
# Nota: respeta la politica de uso de Nominatim en produccion.


def _geocode_cache_get(q: str):
    if not q:
        return None
    hit = _geocode_cache.get(q)
    if not hit:
        return None
    ts, items = hit
    if (time.time() - ts) > _geocode_cache_ttl_s:
        _geocode_cache.pop(q, None)
        return None
    return items


def _geocode_cache_set(q: str, items):
    if not q:
        return
    if len(_geocode_cache) > 200:
        _geocode_cache.clear()
    _geocode_cache[q] = (time.time(), items or [])


@geofence_bp.route("/geocode", methods=["GET"])
@login_required
def geocode_search():
    """
    GET /api/geofence/geocode?q=...&limit=5&requester_email=...

    Devuelve candidatos con lat/lng.
    Seguridad: requiere requester_email para evitar usarlo como proxy publico.
    """
    q = (request.args.get("q") or "").strip()
    requester = (request.args.get("requester_email") or "").strip()
    limit = int(request.args.get("limit") or 5)

    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    if not q or len(q) < 2:
        return jsonify({"ok": True, "items": []})

    limit = max(1, min(10, limit))

    cache_key = q.lower()
    cached = _geocode_cache_get(cache_key)
    if cached is not None:
        return jsonify({"ok": True, "items": cached, "cached": True})

    url = (
        f"{NOMINATIM_URL}?format=jsonv2&q={quote_plus(q)}"
        f"&limit={limit}&addressdetails=1"
    )
    if NOMINATIM_EMAIL:
        url += f"&email={quote_plus(NOMINATIM_EMAIL)}"

    try:
        res = requests.get(
            url,
            headers={
                "User-Agent": NOMINATIM_UA,
                "Accept": "application/json",
                "Accept-Language": "es,en;q=0.7",
            },
            timeout=12,
        )
        res.raise_for_status()
        data = res.json() or []

        items = []
        for r in data:
            try:
                lat = float(r.get("lat"))
                lng = float(r.get("lon"))
            except Exception:
                continue
            name = (r.get("display_name") or "").strip()
            short = name.split(",")[0].strip() if name else ""
            items.append(
                {
                    "name": name,
                    "short_name": short,
                    "lat": lat,
                    "lng": lng,
                    "type": r.get("type") or "",
                    "class": r.get("class") or "",
                    "importance": r.get("importance") or 0,
                }
            )

        _geocode_cache_set(cache_key, items)
        return jsonify({"ok": True, "items": items})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── CRUD de zonas ─────────────────────────────────────────────────────────────

@geofence_bp.route("/zones", methods=["GET"])
@login_required
def get_zones():
    """Zonas del usuario autenticado (o de un user_id si es admin)."""
    requester = request.args.get("requester_email", "")
    user_id   = request.args.get("user_id")

    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()
    target_id = int(user_id) if user_id and sess_is_admin(requester_email) else uid

    zones = odoo(ZONE_MODEL, "search_read",
                 [[["x_user_id", "=", target_id]]],
                 {"fields": ["id", "x_name", "x_lat", "x_lng", "x_radius",
                             "x_type", "x_active", "x_created_by",
                             "x_user_id"], "order": "id desc"})
    return jsonify({"ok": True, "zones": zones})


@geofence_bp.route("/zones/all", methods=["GET"])
@require_admin
def get_all_zones():
    """ADMIN: todas las zonas de todos los usuarios."""
    admin_email = request.args.get("admin_email", "")
    mismatch = enforce_requester_email_match(admin_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    zones = odoo(ZONE_MODEL, "search_read",
                 [[]],
                 {"fields": ["id", "x_name", "x_lat", "x_lng", "x_radius",
                             "x_type", "x_active", "x_created_by",
                             "x_user_id"], "order": "id desc"})

    # Enriquecer con nombre del usuario
    user_ids = list({z["x_user_id"][0] if isinstance(z["x_user_id"], list)
                     else z["x_user_id"] for z in zones if z.get("x_user_id")})
    users = {}
    if user_ids:
        rows = odoo("res.users", "read",
                    [user_ids, ["id", "name", "login"]])
        users = {r["id"]: r for r in rows}

    for z in zones:
        uid_val = (z["x_user_id"][0] if isinstance(z["x_user_id"], list)
                   else z["x_user_id"])
        u = users.get(uid_val, {})
        z["user_name"]  = u.get("name", "Desconocido")
        z["user_email"] = u.get("login", "")

    return jsonify({"ok": True, "zones": zones})


@geofence_bp.route("/zones", methods=["POST"])
@login_required
def create_zone():
    data = request.json or {}
    requester = (data.get("requester_email") or "").strip()
    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()

    name = clean_str(data.get("name") or "Mi zona", max_len=80)
    try:
        lat = as_float(data.get("lat", 0), min_val=-90, max_val=90)
        lng = as_float(data.get("lng", 0), min_val=-180, max_val=180)
    except ValueError:
        return jsonify({"error": "Coordenadas invalidas"}), 400
    radius  = max(50, min(50000, int(data.get("radius", 500))))
    zone_type = (data.get("type") or "safe").strip()          # safe | danger
    if zone_type not in ("safe", "danger"):
        zone_type = "safe"
    target_uid = (int(data.get("user_id")) if data.get("user_id")
                  and sess_is_admin(requester_email) else uid)

    zone_id = odoo(ZONE_MODEL, "create", [[{
        "x_name":       name,
        "x_lat":        lat,
        "x_lng":        lng,
        "x_radius":     radius,
        "x_type":       zone_type,
        "x_active":     True,
        "x_user_id":    target_uid,
        "x_created_by": "admin" if sess_is_admin(requester_email) else "user",
    }]])
    return jsonify({"ok": True, "id": zone_id}), 201


@geofence_bp.route("/zones/<int:zone_id>", methods=["PATCH"])
@login_required
def update_zone(zone_id):
    data = request.json or {}
    requester = (data.get("requester_email") or "").strip()
    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()

    # Verificar que la zona pertenece al usuario (o es admin)
    rows = odoo(ZONE_MODEL, "read", [[zone_id], ["x_user_id"]])
    if not rows:
        return jsonify({"error": "Zona no encontrada"}), 404
    owner = (rows[0]["x_user_id"][0] if isinstance(rows[0]["x_user_id"], list)
             else rows[0]["x_user_id"])
    if owner != uid and not sess_is_admin(requester_email):
        return jsonify({"error": "Sin permiso"}), 403

    vals = {}
    if "name"   in data: vals["x_name"]   = clean_str(data["name"], max_len=80)
    if "radius" in data: vals["x_radius"] = max(50, int(data["radius"]))
    if "type"   in data:
        t = (data["type"] or "").strip()
        if t in ("safe", "danger"):
            vals["x_type"] = t
    if "active" in data: vals["x_active"] = bool(data["active"])

    odoo(ZONE_MODEL, "write", [[zone_id], vals])
    return jsonify({"ok": True})


@geofence_bp.route("/zones/<int:zone_id>", methods=["DELETE"])
@login_required
def delete_zone(zone_id):
    requester = request.args.get("requester_email", "")
    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()

    rows = odoo(ZONE_MODEL, "read", [[zone_id], ["x_user_id"]])
    if not rows:
        return jsonify({"error": "Zona no encontrada"}), 404
    owner = (rows[0]["x_user_id"][0] if isinstance(rows[0]["x_user_id"], list)
             else rows[0]["x_user_id"])
    if owner != uid and not sess_is_admin(requester_email):
        return jsonify({"error": "Sin permiso"}), 403

    odoo(ZONE_MODEL, "unlink", [[zone_id]])
    return jsonify({"ok": True})


# ── Eventos de violacion ──────────────────────────────────────────────────────

@geofence_bp.route("/event", methods=["POST"])
@login_required
def register_event():
    """El frontend reporta que el usuario violó una zona."""
    data = request.json or {}
    requester = (data.get("requester_email") or "").strip()
    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))

    zone_id = data.get("zone_id")
    event_type = (data.get("event_type") or "exit").strip()   # exit | enter
    if event_type not in ("exit", "enter"):
        event_type = "exit"
    try:
        lat = as_float(data.get("lat", 0), min_val=-90, max_val=90)
        lng = as_float(data.get("lng", 0), min_val=-180, max_val=180)
    except ValueError:
        lat, lng = 0, 0
    zone_name = clean_str(data.get("zone_name") or "Zona", max_len=120)
    zone_type = (data.get("zone_type") or "safe").strip()
    if zone_type not in ("safe", "danger"):
        zone_type = "safe"

    odoo(EVENT_MODEL, "create", [[{
        "x_user_id":   uid,
        "x_zone_id":   int(zone_id) if zone_id else False,
        "x_zone_name": zone_name,
        "x_zone_type": zone_type,
        "x_event_type": event_type,
        "x_lat":       lat,
        "x_lng":       lng,
        "x_timestamp": _now(),
    }]])

    # Notificaciones (campana) basadas en la violacion.
    # - exit + safe    -> advertencia (fuera de zona segura)
    # - enter + danger -> pedir confirmacion de peligro
    if zone_type == "safe" and event_type == "exit":
        try:
            push_notification(
                "geofence_warning",
                f"Saliste de tu zona segura: {zone_name}. Si estas en peligro, activa SOS.",
                uid=uid,
                name="Fuera de zona segura",
                target_uid=uid,
            )
        except Exception as e:
            print(f"[geofence] notif error (exit safe): {e}")
        try:
            log_audit(uid, "geofence_exit_safe", "user", f"{zone_name} ({lat},{lng})")
        except Exception:
            pass

    elif zone_type == "danger" and event_type == "enter":
        try:
            push_notification(
                "danger_confirm",
                "Entraste en una zona marcada como peligrosa. Si estas en peligro, toca SI para compartir tu ubicacion y llamar automaticamente.",
                uid=uid,
                name="Estas en peligro?",
                target_uid=uid,
            )
        except Exception as e:
            print(f"[geofence] notif error (enter danger): {e}")
        try:
            log_audit(uid, "geofence_enter_danger", "user", f"{zone_name} ({lat},{lng})")
        except Exception:
            pass
    return jsonify({"ok": True}), 201


@geofence_bp.route("/danger/confirm", methods=["POST"])
@login_required
def danger_confirm():
    """
    POST /api/geofence/danger/confirm
    Body:
      {
        "requester_email": "...",
        "answer": "yes" | "no",
        "lat": 18.4, "lng": -69.9,
        "battery": 0-100 (opcional),
        "charging": true/false (opcional)
      }

    Si answer=yes:
      - Crea/actualiza una alerta SOS tipo "security" (emergency/location)
      - Genera una notificacion informativa para el usuario
    """
    data = request.get_json(silent=True) or {}
    requester = (data.get("requester_email") or "").strip()
    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    answer = (data.get("answer") or "").strip().lower()
    if answer not in ("yes", "no"):
        return jsonify({"error": "answer debe ser yes o no"}), 400

    try:
        lat = as_float(data.get("lat", 0), min_val=-90, max_val=90)
        lng = as_float(data.get("lng", 0), min_val=-180, max_val=180)
    except ValueError:
        return jsonify({"error": "Lat/Lng invalidos"}), 400

    battery = data.get("battery")
    charging = bool(data.get("charging", False))

    if answer == "no":
        try:
            push_notification(
                "info",
                "Ok. Mantente atento. Si la situacion cambia, activa SOS.",
                uid=uid,
                name="Confirmacion recibida",
                target_uid=uid,
            )
        except Exception as e:
            print(f"[geofence] danger_confirm no notify error: {e}")
        try:
            log_audit(uid, "danger_confirm_no", "user", f"({lat},{lng})")
        except Exception:
            pass
        return jsonify({"ok": True, "started": False})

    # answer == "yes" -> activar SOS (seguridad) y empezar a compartir ubicacion.
    try:
        from routes.Emergency import get_profile, upsert_alert_odoo  # import local para evitar ciclos

        user_name, user_email, _ = get_profile(uid)
        upsert_alert_odoo(uid, user_name, user_email, "security", lat, lng, battery, charging)

        try:
            push_notification(
                "emergency",
                "Se activo SOS por seguridad. Mantente en un lugar seguro si puedes. La app iniciara la llamada automaticamente.",
                uid=uid,
                name="SOS activado",
                target_uid=uid,
            )
        except Exception as e:
            print(f"[geofence] danger_confirm yes notify error: {e}")
        try:
            log_audit(uid, "danger_confirm_yes", "user", f"({lat},{lng}) battery={battery} charging={charging}")
        except Exception:
            pass
        return jsonify({"ok": True, "started": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@geofence_bp.route("/events", methods=["GET"])
@login_required
def get_events():
    requester = request.args.get("requester_email", "")
    user_id   = request.args.get("user_id")
    mismatch = enforce_requester_email_match(requester)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()
    target_id = int(user_id) if user_id and sess_is_admin(requester_email) else uid

    events = odoo(EVENT_MODEL, "search_read",
                  [[["x_user_id", "=", target_id]]],
                  {"fields": ["id", "x_zone_name", "x_zone_type",
                              "x_event_type", "x_lat", "x_lng",
                              "x_timestamp"], "order": "x_timestamp desc",
                   "limit": 50})
    return jsonify({"ok": True, "events": events})


@geofence_bp.route("/events/all", methods=["GET"])
@require_admin
def get_all_events():
    """
    GET /api/geofence/events/all?admin_email=...
    ADMIN: devuelve violaciones de zona recientes de todos los usuarios.
    """
    admin_email = request.args.get("admin_email", "")
    mismatch = enforce_requester_email_match(admin_email)
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    events = odoo(
        EVENT_MODEL,
        "search_read",
        [[]],
        {
            "fields": [
                "id",
                "x_user_id",
                "x_zone_name",
                "x_zone_type",
                "x_event_type",
                "x_lat",
                "x_lng",
                "x_timestamp",
            ],
            "order": "x_timestamp desc",
            "limit": 200,
        },
    )
    return jsonify({"ok": True, "events": events})
