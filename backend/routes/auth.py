"""
routes/auth.py - Autenticacion contra Odoo.
Guarda uid, name y email en session Flask.
"""

import time
import os
from flask import Blueprint, jsonify, request, session

from odoo_client import login as odoo_login
from odoo_client import register as odoo_register
from mailer import send_html_email
from otp_store import OTP_TTL_SECONDS, request_email_otp, verify_email_otp
from security import is_admin, login_required, set_session_user
from routes.audit import log_audit
from validation import clean_str, require_email


auth_bp = Blueprint("auth", __name__)
EMAIL_VERIFY_SESSION_TTL_SECONDS = 30 * 60  # 30 minutos para completar registro

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
        try:
            role = "admin" if is_admin(user.get("email")) else "user"
            log_audit(int(user["uid"]), "login", role, "login", request.remote_addr or "")
        except Exception:
            pass
        return jsonify({"ok": True, "user": user})
    except Exception as e:
        msg = str(e)
        if "Too many login failures" in msg:
            return jsonify({"error": msg, "retry_after_seconds": 60}), 429
        return jsonify({"error": msg}), 401


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

    # Requiere que el email haya sido verificado por OTP primero.
    verified_email = (session.get("email_verified") or "").strip().lower()
    verified_at = int(session.get("email_verified_at") or 0)
    if verified_email != email.strip().lower():
        return jsonify({"error": "Debes verificar tu correo antes de registrarte."}), 403
    if not verified_at or (verified_at + EMAIL_VERIFY_SESSION_TTL_SECONDS) < int(time.time()):
        return jsonify({"error": "La verificación expiró. Reenvía el código."}), 403

    try:
        user_id = int(odoo_register(name, email, password))
        set_session_user(uid=user_id, name=name, email=email)
        session.permanent = True
        # consume the verification flag after account creation
        session.pop("email_verified", None)
        session.pop("email_verified_at", None)
        try:
            role = "admin" if is_admin(email) else "user"
            log_audit(int(user_id), "register", role, "register", request.remote_addr or "")
        except Exception:
            pass
        return jsonify({"ok": True, "uid": user_id, "name": name, "email": email})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@auth_bp.route("/email-otp/request", methods=["POST"])
def request_email_verification_otp():
    data = request.get_json(silent=True) or {}
    try:
        email = require_email(data.get("email"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    try:
        code, meta = request_email_otp(email)
        html = f"""
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 10px">Verifica tu correo</h2>
          <p>Tu código de verificación es:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:6px;margin:14px 0">{code}</div>
          <p style="color:#666;margin:0">Expira en {OTP_TTL_SECONDS//60} minutos.</p>
        </div>
        """
        send_html_email(to_email=email, subject="Código de verificación - EmergeLens", html=html)
        payload = {"ok": True, **meta}
        # DEV helper: permite ver el OTP sin email (solo si se activa el flag).
        if (os.getenv("DEV_OTP_ECHO") or "").strip() == "1":
            payload["debug_code"] = code
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@auth_bp.route("/email-otp/verify", methods=["POST"])
def verify_email_verification_otp():
    data = request.get_json(silent=True) or {}
    try:
        email = require_email(data.get("email"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    code = clean_str(data.get("code"), max_len=12).replace(" ", "")

    if not code:
        return jsonify({"error": "Código requerido"}), 400

    try:
        verify_email_otp(email, code)
        session["email_verified"] = email.strip().lower()
        session["email_verified_at"] = int(time.time())
        return jsonify({"ok": True, "msg": "Correo verificado correctamente"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@auth_bp.route("/logout", methods=["POST"])
def logout():
    # Borra la session del navegador (equivalente a "cerrar sesion").
    try:
        uid = session.get("uid")
        email = (session.get("email") or "").strip()
        if uid:
            role = "admin" if is_admin(email) else "user"
            log_audit(int(uid), "logout", role, "logout", request.remote_addr or "")
    except Exception:
        pass
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
