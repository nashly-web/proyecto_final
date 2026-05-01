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
import os
import requests

contacts_bp = Blueprint("contacts", __name__)


ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_ODOO_PASS", "2408")
PROFILE_MODEL = "x.emergelens.profile"


def _odoo_session():
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


def _odoo_call(s, model, method, args, kwargs=None):
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


def _profile_emergency_contacts(uid: int):
    """
    Returns up to 2 emergency contacts stored in x.emergelens.profile (ec1/ec2).
    Shape matches frontend Contacts.jsx fields.
    """
    s = _odoo_session()
    rows = _odoo_call(
        s,
        PROFILE_MODEL,
        "search_read",
        [[["x_user_id", "=", int(uid)]]],
        {
            "fields": [
                "x_ec1_name",
                "x_ec1_phone",
                "x_ec1_email",
                "x_ec1_rel",
                "x_ec2_name",
                "x_ec2_phone",
                "x_ec2_email",
                "x_ec2_rel",
            ],
            "limit": 1,
        },
    )
    p = rows[0] if rows else {}
    out = []

    def add(name, phone, email, rel, primary):
        name = (name or "").strip()
        phone = (phone or "").strip()
        email = (email or "").strip()
        rel = (rel or "").strip()
        if not name and not phone and not email:
            return
        out.append(
            {
                "name": name or "Contacto",
                "phone": phone or "",
                "email": email or "",
                "rel": rel or ("Principal" if primary else "Respaldo"),
                "primary": bool(primary),
            }
        )

    add(p.get("x_ec1_name"), p.get("x_ec1_phone"), p.get("x_ec1_email"), p.get("x_ec1_rel"), True)
    add(p.get("x_ec2_name"), p.get("x_ec2_phone"), p.get("x_ec2_email"), p.get("x_ec2_rel"), False)
    return out


def _sync_profile_contacts(uid: int, contacts: list[dict]):
    """
    Ensures contacts stored in the user's profile also exist in res.partner children
    so they appear in the Contacts screen and are editable.
    Best-effort: never breaks the request.
    """
    try:
        prof_contacts = _profile_emergency_contacts(uid)
    except Exception:
        prof_contacts = []

    if not prof_contacts:
        return contacts

    by_email = {}
    by_phone = {}
    for c in contacts or []:
        em = (c.get("email") or "").strip().lower()
        ph = (c.get("phone") or "").strip()
        if em:
            by_email[em] = c
        if ph:
            by_phone[ph] = c

    for pc in prof_contacts:
        em = (pc.get("email") or "").strip().lower()
        ph = (pc.get("phone") or "").strip()
        found = by_email.get(em) if em else None
        if not found and ph:
            found = by_phone.get(ph)

        if found:
            # Only update missing fields; do not clobber user edits.
            patch = dict(found)
            changed = False
            for k in ("name", "phone", "email", "rel"):
                if not (patch.get(k) or "").strip() and (pc.get(k) or "").strip():
                    patch[k] = pc.get(k)
                    changed = True
            if pc.get("primary") and not patch.get("primary"):
                patch["primary"] = True
                changed = True
            if changed:
                try:
                    odoo.update_contact(int(found["id"]), patch)
                    found.update(patch)
                except Exception:
                    pass
            continue

        # Create new contact record.
        try:
            new_id = odoo.create_contact(uid, pc)
            new_ct = {"id": int(new_id), **pc}
            contacts.append(new_ct)
            if em:
                by_email[em] = new_ct
            if ph:
                by_phone[ph] = new_ct
        except Exception:
            pass

    return contacts


@contacts_bp.route("/", methods=["GET"])
def get_contacts():
    """Lista contactos de emergencia del usuario autenticado."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"error": "No autenticado"}), 401

    try:
        contacts = odoo.get_contacts(uid)
        contacts = _sync_profile_contacts(int(uid), list(contacts or []))
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
