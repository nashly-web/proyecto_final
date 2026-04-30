"""
routes/meds.py - CRUD de medicamentos del usuario.

Modelo Odoo:
- x.emergelens.med (custom)

Notas:
- Se usa "soft delete" (x_active=False) para eliminar.
- Requiere session (uid).

Endpoints (bajo /api/meds):
- GET    /         : lista medicamentos activos del usuario
- POST   /         : crea medicamento
- PUT    /<id>     : actualiza medicamento (solo si pertenece al usuario)
- DELETE /<id>     : elimina medicamento (soft delete)

Seguridad:
- El uid se toma de session Flask.
- Para PUT/DELETE se valida que el medicamento sea del uid.
"""

from flask import Blueprint, request, jsonify, session
import os
import requests

meds_bp = Blueprint("meds", __name__)

ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_ODOO_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_ODOO_PASS = os.getenv("ADMIN_ODOO_PASS", "2408")


def odoo_session():
    """Crea una sesion HTTP autenticada en Odoo (cookie)."""
    s = requests.Session()
    s.post(f"{ODOO_URL}/web/session/authenticate", json={
    "jsonrpc": "2.0", "method": "call",
    "params": {"db": ODOO_DB, "login": ADMIN_ODOO_EMAIL, "password": ADMIN_ODOO_PASS}
    })
    return s


def odoo_call(s, model, method, args, kwargs={}):
    """Helper generico para /web/dataset/call_kw."""
    res = s.post(f"{ODOO_URL}/web/dataset/call_kw", json={
    "jsonrpc": "2.0", "method": "call",
    "params": {"model": model, "method": method, "args": args, "kwargs": kwargs}
    })
    data = res.json()
    if data.get("error"):
        raise Exception(data["error"].get("data", {}).get("message", "Odoo error"))
    return data["result"]


def serialize_med(r):
    """Normaliza un record de Odoo (search_read) a formato frontend."""
    return {
    "id":  r["id"],
    "name":  r.get("x_name", ""),
    "dose":  r.get("x_dose", ""),
    "freq":  r.get("x_freq", ""),
    "time":  r.get("x_time", ""),
    "active": r.get("x_active", True),
    }


@meds_bp.route("/", methods=["GET"])
def get_meds():
    """Lista medicamentos activos del usuario autenticado."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    try:
        s = odoo_session()
        results = odoo_call(s, "x.emergelens.med", "search_read",
        [[["x_user_id", "=", int(uid)], ["x_active", "=", True]]],
        {"fields": ["x_name", "x_dose", "x_freq", "x_time", "x_active"],
        "order": "id asc"}
        )
        return jsonify({"ok": True, "meds": [serialize_med(r) for r in results]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@meds_bp.route("/", methods=["POST"])
def create_med():
    """Crea un medicamento para el usuario autenticado."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Nombre requerido"}), 400
    try:
        s = odoo_session()
        new_id = odoo_call(s, "x.emergelens.med", "create", [{
        "x_name":  name,
        "x_dose":  data.get("dose", ""),
        "x_freq":  data.get("freq", "Una vez al dia"),
        "x_time":  data.get("time", ""),
        "x_active":  True,
        "x_user_id": int(uid),
        }])
        return jsonify({"ok": True, "id": new_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@meds_bp.route("/<int:med_id>", methods=["PUT"])
def update_med(med_id):
    """Actualiza un medicamento (solo si pertenece al usuario)."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    data = request.get_json() or {}
    try:
        s = odoo_session()
        # Verificar que pertenece al usuario
        existing = odoo_call(s, "x.emergelens.med", "search",
        [[["id", "=", med_id], ["x_user_id", "=", int(uid)]]], {"limit": 1}
        )
        if not existing:
            return jsonify({"error": "No encontrado"}), 404
        odoo_call(s, "x.emergelens.med", "write", [[med_id], {
        "x_name": data.get("name", ""),
        "x_dose": data.get("dose", ""),
        "x_freq": data.get("freq", ""),
        "x_time": data.get("time", ""),
        }])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@meds_bp.route("/<int:med_id>", methods=["DELETE"])
def delete_med(med_id):
    """Soft-delete de un medicamento (x_active=False)."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401
    try:
        s = odoo_session()
        existing = odoo_call(s, "x.emergelens.med", "search",
        [[["id", "=", med_id], ["x_user_id", "=", int(uid)]]], {"limit": 1}
        )
        if not existing:
            return jsonify({"error": "No encontrado"}), 404
        # Soft delete
        odoo_call(s, "x.emergelens.med", "write", [[med_id], {"x_active": False}])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
