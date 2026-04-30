"""
routes/auth.py - Autenticacion contra Odoo.
Guarda uid, name y email en session Flask.
"""

from flask import Blueprint, jsonify, request, session

from odoo_client import login as odoo_login
from odoo_client import register as odoo_register
from security import login_required, set_session_user
from validation import clean_str, require_email


auth_bp = Blueprint("auth", __name__)

# ----------------------------------------------------------------------------
# Auth (login/register/logout/me)
# - login/register delegan en odoo_client.py para autenticar/crear el usuario.
# - al autenticar, se guarda la identidad en session (cookie) con set_session_user.
# ----------------------------------------------------------------------------

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    try:
        email = require_email(data.get("email"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    password = clean_str(data.get("password"), max_len=200)

    if not email or not password:
        return jsonify({"error": "Email y contrasena requeridos"}), 400

    try:
        user = odoo_login(email, password)
        set_session_user(uid=user["uid"], name=user["name"], email=user["email"])
        session.permanent = True
        return jsonify({"ok": True, "user": user})
    except Exception as e:
        return jsonify({"error": str(e)}), 401


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    name = clean_str(data.get("name"), max_len=120)
    try:
        email = require_email(data.get("email"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    password = clean_str(data.get("password"), max_len=200)

    if not name or not email or not password:
        return jsonify({"error": "Nombre, email y contrasena requeridos"}), 400

    try:
        user_id = int(odoo_register(name, email, password))
        set_session_user(uid=user_id, name=name, email=email)
        session.permanent = True
        return jsonify({"ok": True, "uid": user_id, "name": name, "email": email})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@auth_bp.route("/logout", methods=["POST"])
def logout():
    # Borra la session del navegador (equivalente a "cerrar sesion").
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    # Endpoint simple para que el frontend sepa si hay usuario autenticado.
    return jsonify(
        {
            "uid": session.get("uid"),
            "name": session.get("name"),
            "email": session.get("email"),
            "roles": session.get("roles") or [],
        }
    )
