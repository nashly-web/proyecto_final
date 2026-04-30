"""
backend/app.py - Servidor Flask principal de SOS EmergeLens.
"""

import os
from flask import Flask, request, session, g
from flask_cors import CORS
from datetime import timedelta

# ----------------------------------------------------------------------------
# Blueprints (modulos HTTP)
# - Cada archivo en routes/* define un "bloque" de endpoints.
# - Aqui solo los registramos bajo /api/* para armar la API completa.
# ----------------------------------------------------------------------------
from routes.auth import auth_bp
from routes.profile import profile_bp
from routes.contacts import contacts_bp
from routes.chat import chat_bp
from routes.lens_call import lens_call_bp
from routes.Emergency import emergency_bp
from routes.notif_routes import notif_bp
from routes.meds import meds_bp
from routes.history import history_bp
from routes.operator_chat import operator_chat_bp, start_scheduler
from routes.geofence import geofence_bp
from routes.donation import donations_bp     # RF Donaciones
from scheduler import init_scheduler
from routes.audit import audit_bp, log_audit
from routes.reports import reports_bp

app = Flask(__name__)

# ----------------------------------------------------------------------------
# Sesion Flask (cookie)
# - El backend guarda uid/email/nombre en la session (ver routes/auth.py).
# - PERMANENT_SESSION_LIFETIME controla cuantos dias dura la session.
# ----------------------------------------------------------------------------
app.secret_key = os.getenv("SECRET_KEY", "dev-insecure-secret-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.getenv("SESSION_SAMESITE", "Lax"),
    SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=int(os.getenv("SESSION_DAYS", "7"))),
)

# ----------------------------------------------------------------------------
# CORS (frontend -> backend)
# - El frontend (Vite) llama al backend con credenciales (cookies).
# - Por eso supports_credentials=True y origins configurables.
# ----------------------------------------------------------------------------
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
origins = [o.strip() for o in origins if o.strip()]
CORS(app, supports_credentials=True, origins=origins)

# Email del admin para RBAC / auditoria (ver security.py y require_admin).
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com"))


# ----------------------------------------------------------------------------
# Auditoria (best effort)
# - Registra acciones importantes del usuario/admin (POST/PUT/PATCH/DELETE).
# - Evita loguear auth/audit para no generar ruido o loops.
# ----------------------------------------------------------------------------
def _map_audit_action(method: str, path: str):
    if path.startswith("/api/profile") and method in ("POST", "PUT", "PATCH"):
        return "profile_updated"
    if path.startswith("/api/contacts"):
        if method == "POST":   return "contact_created"
        if method in ("PUT", "PATCH"): return "contact_updated"
        if method == "DELETE": return "contact_deleted"
    if path.startswith("/api/emergency/evidence") and method == "POST":
        return "evidence_sent"
    if path.startswith("/api/emergency/status") and method in ("PATCH", "PUT"):
        return "status_changed"
    return "api_action"


@app.before_request
def _audit_before():
    g._audit_skip = True
    if not request.path.startswith("/api/"):
        return
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return
    if request.path.startswith("/api/audit"):
        return
    if request.path.startswith("/api/auth"):
        return
    if request.path.startswith("/api/operator_chat"):
        return
    g._audit_skip = False


@app.after_request
def _audit_after(response):
    try:
        if getattr(g, "_audit_skip", True):
            return response
        uid   = session.get("uid")
        email = session.get("email")
        if not uid or not email:
            return response
        role   = "admin" if email == ADMIN_EMAIL else "user"
        action = _map_audit_action(request.method, request.path)
        detail = f"{request.method} {request.path} -> {response.status_code}"
        log_audit(int(uid), action, role, detail, request.remote_addr or "")
    except Exception:
        pass
    return response


# ----------------------------------------------------------------------------
# Registro de rutas
# - Todo queda bajo /api/*.
# - Cada blueprint contiene un grupo (auth, perfil, emergencia, etc.).
# ----------------------------------------------------------------------------
app.register_blueprint(auth_bp,          url_prefix="/api/auth")
app.register_blueprint(profile_bp,       url_prefix="/api/profile")
app.register_blueprint(contacts_bp,      url_prefix="/api/contacts")
app.register_blueprint(chat_bp,          url_prefix="/api/chat")
app.register_blueprint(lens_call_bp,     url_prefix="/api/lens")
app.register_blueprint(emergency_bp,     url_prefix="/api/emergency")
app.register_blueprint(notif_bp,         url_prefix="/api/notifications")
app.register_blueprint(meds_bp,          url_prefix="/api/meds")
app.register_blueprint(history_bp,       url_prefix="/api/history")
app.register_blueprint(operator_chat_bp, url_prefix="/api/operator_chat")
app.register_blueprint(geofence_bp,      url_prefix="/api/geofence")
app.register_blueprint(donations_bp,     url_prefix="/api/donations")   # RF Donaciones
app.register_blueprint(audit_bp,         url_prefix="/api")
app.register_blueprint(reports_bp,       url_prefix="/api/reports")


@app.route("/api/health")
def health():
    return {"ok": True, "msg": "EmergeLens backend activo"}


def _start_background_jobs():
    # ------------------------------------------------------------------------
    # Jobs de fondo (scheduler)
    # - scheduler.py: recordatorios de medicamentos y tips.
    # - operator_chat.py: tareas del panel de operador.
    # Nota: se evita arrancar doble con el reloader de Flask.
    # ------------------------------------------------------------------------
    # Make scheduled tasks run even when the server is started via `flask run` / WSGI import.
    # Avoid double-start under the Flask reloader.
    if os.getenv("DISABLE_SCHEDULERS") == "1":
        return
    if os.getenv("WERKZEUG_RUN_MAIN") not in (None, "true"):
        return
    try:
        init_scheduler()
    except Exception as e:
        print(f"[app] init_scheduler error: {e}")
    try:
        start_scheduler()
    except Exception as e:
        print(f"[app] start_scheduler error: {e}")


# Start background jobs on import (safe-guarded).
_start_background_jobs()


def main():
    init_scheduler()
    start_scheduler()
    app.run(host="0.0.0.0", port=5000, debug=True)


if __name__ == "__main__":
    main()
