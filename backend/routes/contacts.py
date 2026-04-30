"""
routes/contacts.py - CRUD de contactos de emergencia.

Estos endpoints son una capa fina sobre backend/odoo_client.py.
Requieren session (uid) activa.

Endpoints (bajo /api/contacts):
- GET    /            : lista contactos del usuario
- POST   /            : crea contacto del usuario
- PUT    /<id>        : actualiza contacto del usuario
- DELETE /<id>        : elimina contacto del usuario

Notas:
- La "seguridad" aqui se basa en la session de Flask (uid).
- El backend valida que exista uid antes de tocar Odoo.
"""

from flask import Blueprint, request, jsonify, session
import odoo_client as odoo

contacts_bp = Blueprint("contacts", __name__)


@contacts_bp.route("/", methods=["GET"])
def get_contacts():
    """Lista contactos de emergencia del usuario autenticado."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        contacts = odoo.get_contacts(uid)
        return jsonify({"ok": True, "contacts": contacts})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@contacts_bp.route("/", methods=["POST"])
def create_contact():
    """Crea un nuevo contacto de emergencia para el usuario autenticado."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data = request.get_json()
    try:
        contact_id = odoo.create_contact(uid, data)
        return jsonify({"ok": True, "id": contact_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@contacts_bp.route("/<int:contact_id>", methods=["PUT"])
def update_contact(contact_id):
    """Actualiza un contacto de emergencia por id (del usuario autenticado)."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    data = request.get_json()
    try:
        odoo.update_contact(contact_id, data)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@contacts_bp.route("/<int:contact_id>", methods=["DELETE"])
def delete_contact(contact_id):
    """Elimina un contacto de emergencia por id (del usuario autenticado)."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        odoo.delete_contact(contact_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
