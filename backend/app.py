"""
backend/app.py - Servidor Flask principal de SOS EmergeLens.
"""

import os
from flask import Flask, request, session, g
from flask_cors import CORS
from datetime import timedelta

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
from routes.donation import donations_bp
from scheduler import init_scheduler
from routes.audit import audit_bp, log_audit
from routes.reports import reports_bp

app = Flask(__name__)

app.secret_key = os.getenv("SECRET_KEY", "dev-insecure-secret-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.getenv("SESSION_SAMESITE", "Lax"),
    SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=int(os.getenv("SESSION_DAYS", "7"))),
)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
origins = [o.strip() for o in origins if o.strip()]
CORS(app, supports_credentials=True, origins=origins)

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com"))


# ----------------------------------------------------------------------------
# Auditoria automatica (after_request)
#
# REGLA: solo se registran acciones con significado real.
# Cada ruta mapeada tiene un "por que" explicito.
# NO existe "api_action" — era ruido que llenaba la tabla de basura.
#
# Si una ruta no esta en _ROUTE_ACTION_MAP, simplemente no se audita.
# Las rutas de auth y audit NO se auditan aqui (auth.py llama log_audit
# directamente; audit en si no debe generar loops).
# ----------------------------------------------------------------------------

# (metodo, prefijo_de_ruta) -> accion
# Solo rutas que tienen impacto real en la seguridad o estado del sistema.
_ROUTE_ACTION_MAP = {
    ("POST",   "/api/profile"):                  "profile_updated",
    ("PUT",    "/api/profile"):                  "profile_updated",
    ("PATCH",  "/api/profile"):                  "profile_updated",
    ("POST",   "/api/contacts"):                 "contact_created",
    ("PUT",    "/api/contacts"):                 "contact_updated",
    ("PATCH",  "/api/contacts"):                 "contact_updated",
    ("DELETE", "/api/contacts"):                 "contact_deleted",
    ("POST",   "/api/chat/message"):             "message_sent",
    ("POST",   "/api/chat/transcribe"):          "message_sent",
    ("POST",   "/api/emergency/evidence"):       "evidence_sent",
    ("PATCH",  "/api/emergency/status"):         "status_changed",
    ("PUT",    "/api/emergency/status"):         "status_changed",
    ("POST",   "/api/geofence/exit-safe"):       "geofence_exit_safe",
    ("POST",   "/api/geofence/enter-danger"):    "geofence_enter_danger",
    ("POST",   "/api/emergency/confirm-danger"): "danger_confirm_yes",
    ("POST",   "/api/emergency/confirm-safe"):   "danger_confirm_no",
}

# Prefijos que NUNCA se auditan aqui (tienen su propio log_audit en la ruta)
_SKIP_PREFIXES = (
    "/api/audit",        # evitar loops
    "/api/auth",         # auth.py llama log_audit directamente (login/logout/register)
    "/api/operator_chat",
    "/api/health",
)


def _map_audit_action(method: str, path: str):
    """
    Devuelve la accion de auditoria para (method, path), o None si no aplica.
    Usa coincidencia de prefijo para tolerar IDs en la URL (/api/contacts/42).
    """
    for (m, prefix), action in _ROUTE_ACTION_MAP.items():
        if method == m and path.startswith(prefix):
            return action
    return None


@app.before_request
def _audit_before():
    # Marca si esta request debe auditarse (se evalua en after_request).
    g._audit_skip = True

    if not request.path.startswith("/api/"):
        return
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return
    if any(request.path.startswith(p) for p in _SKIP_PREFIXES):
        return

    g._audit_skip = False


@app.after_request
def _audit_after(response):
    try:
        if getattr(g, "_audit_skip", True):
            return response

        # Solo auditar respuestas exitosas (2xx).
        # Un 400/500 significa que la accion no se completo.
        if not (200 <= response.status_code < 300):
            return response

        uid   = session.get("uid")
        email = session.get("email")
        if not uid or not email:
            return response

        action = _map_audit_action(request.method, request.path)
        if not action:
            return response  # ruta sin accion definida, no se audita

        role   = "admin" if email == ADMIN_EMAIL else "user"
        detail = f"{request.method} {request.path}"
        log_audit(int(uid), action, role, detail, request.remote_addr or "")

    except Exception:
        pass  # auditoria es best-effort, nunca rompe la respuesta
    return response


# ----------------------------------------------------------------------------
# Registro de blueprints
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
app.register_blueprint(donations_bp,     url_prefix="/api/donations")
app.register_blueprint(audit_bp,         url_prefix="/api")
app.register_blueprint(reports_bp,       url_prefix="/api/reports")


@app.route("/api/health")
def health():
    return {"ok": True, "msg": "EmergeLens backend activo"}


def _start_background_jobs():
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


_start_background_jobs()


def main():
    init_scheduler()
    start_scheduler()
    app.run(host="0.0.0.0", port=5000, debug=True)


if __name__ == "__main__":
    main()
