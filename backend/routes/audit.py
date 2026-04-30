"""
routes/audit.py - Registro de auditoria guardado en Odoo.

Modelo Odoo:
- x.emergelens.audit

Uso:
- Otros modulos llaman log_audit(...) para registrar eventos.
- Frontend:
  - Usuario: GET /api/audit/mine
  - Admin:   GET /api/audit/all

Nota: comentarios en ASCII (sin tildes/emojis) para evitar problemas de encoding.
"""

import csv
import io
import os
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, Response, session
import requests

from security import enforce_requester_email_match, is_admin as sess_is_admin, login_required, require_admin
try:
    from fpdf import FPDF
except Exception:
    FPDF = None

audit_bp = Blueprint('audit', __name__)

ODOO_URL  = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB   = os.getenv("ODOO_DB", "sosemergelens")
ODOO_USER = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ODOO_PASS = os.getenv("ADMIN_ODOO_PASS", "2408")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", ODOO_USER)

# --- Helpers Odoo ----------------------------------------------------------
_uid_cache = None

def _get_uid():
    # Autentica una vez en Odoo (admin) y cachea el uid.
    # Esto reduce llamadas repetidas a /jsonrpc.
    global _uid_cache
    if _uid_cache:
        return _uid_cache
    payload = {
        "jsonrpc": "2.0", "method": "call",
        "params": {
            "service": "common", "method": "authenticate",
            "args": [ODOO_DB, ODOO_USER, ODOO_PASS, {}]
        }
    }
    r = requests.post(f"{ODOO_URL}/jsonrpc", json=payload, timeout=10)
    _uid_cache = r.json()["result"]
    return _uid_cache


def odoo_call(model, method, args=None, kwargs=None):
    # Wrapper simple para llamar a Odoo via JSON-RPC.
    payload = {
        "jsonrpc": "2.0", "method": "call",
        "params": {
            "service": "object", "method": "execute_kw",
            "args": [ODOO_DB, _get_uid(), ODOO_PASS,
                     model, method, args or [], kwargs or {}]
        }
    }
    r = requests.post(f"{ODOO_URL}/jsonrpc", json=payload, timeout=10)
    result = r.json()
    if "error" in result:
        raise Exception(result["error"]["data"]["message"])
    return result["result"]


def _user_id_from_email(email):
    # Busca el id (res.users.id) a partir del email/login.
    users = odoo_call("res.users", "search_read",
                      [[["login", "=", email]]],
                      {"fields": ["id"], "limit": 1})
    return users[0]["id"] if users else None


def _is_admin(email):
    # Regla simple: admin si el email coincide con ADMIN_EMAIL.
    return email == ADMIN_EMAIL


# --- Helper para registrar desde otros modulos -----------------------------
def log_audit(user_id: int, action: str, role: str = "user",
              detail: str = "", ip: str = ""):
    """
    Llamada interna desde otros blueprints para registrar una accion.
    Ejemplo: log_audit(user_id=8, action="sos_activated", detail="medical")
    """
    try:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        odoo_call("x.emergelens.audit", "create", [{
            "x_user_id":   user_id,
            "x_action":    action,
            "x_role":      role,
            "x_detail":    detail,
            "x_timestamp": now,
            "x_ip":        ip,
        }])
    except Exception as e:
        print(f"[Audit] Error al registrar: {e}")


# --- Etiquetas legibles para las acciones ---------------------------------
ACTION_LABELS = {
    "login":            "Inicio de sesion",
    "logout":           "Cierre de sesion",
    "register":         "Registro de cuenta",
    "sos_activated":    "SOS activado",
    "sos_cancelled":    "SOS cancelado",
    "profile_updated":  "Perfil actualizado",
    "evidence_sent":    "Evidencia enviada",
    "status_changed":   "Estado de incidente cambiado",
    "message_sent":     "Mensaje enviado a usuario",
    "alert_viewed":     "Alerta visualizada",
    "schedule_created": "Mensaje programado creado",
    "schedule_deleted": "Mensaje programado eliminado",
    "password_changed": "Contrasena cambiada",
    "page_view":        "Vista de pagina",
    "api_action":       "Accion del sistema",
    "contact_created":  "Contacto creado",
    "contact_updated":  "Contacto actualizado",
    "contact_deleted":  "Contacto eliminado",
    "geofence_exit_safe":   "Salida de zona segura",
    "geofence_enter_danger":"Entrada a zona peligrosa",
    "danger_confirm_no":    "Confirmacion peligro: No",
    "danger_confirm_yes":   "Confirmacion peligro: Si",
}


def _build_domain(filter_uid: str = "", filter_action: str = "", q: str = ""):
    domain = []
    if filter_uid:
        domain.append(["x_user_id", "=", int(filter_uid)])
    if filter_action:
        domain.append(["x_action", "=", filter_action])
    if q:
        domain.append(["x_detail", "ilike", q])
    return domain


def _safe_pdf_text(val):
    if val is None:
        return ""
    # FPDF (core fonts) trabaja con Latin-1; reemplazamos caracteres fuera del set.
    return str(val).encode("latin-1", errors="replace").decode("latin-1")


# --- 1) Registrar accion (desde frontend) ----------------------------------
@audit_bp.route("/audit/log", methods=["POST"])
@login_required
def log_action():
    """
    POST /api/audit/log
    Body: { email, action, detail (opcional) }
    """
    data = request.json or {}
    mismatch = enforce_requester_email_match(data.get("email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    email = (session.get("email") or "").strip()
    action = data.get("action", "")
    detail = data.get("detail", "")
    ip     = request.remote_addr or ""

    if not email or not action:
        return jsonify({"error": "Faltan campos"}), 400

    user_id = _user_id_from_email(email)
    if not user_id:
        return jsonify({"error": "Usuario no encontrado"}), 404

    role = "admin" if sess_is_admin(email) else "user"
    log_audit(user_id, action, role, detail, ip)

    return jsonify({"ok": True})


# --- 2) Auditoria del usuario (solo sus acciones) --------------------------
@audit_bp.route("/audit/mine", methods=["GET"])
@login_required
def get_my_audit():
    """
    GET /api/audit/mine?email=...&limit=50&offset=0
    El usuario solo ve sus propias acciones.
    """
    mismatch = enforce_requester_email_match(request.args.get("email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    email = (session.get("email") or "").strip()
    limit  = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))
    filter_action = (request.args.get("action", "") or "").strip()
    q = (request.args.get("q", "") or "").strip()

    user_id = _user_id_from_email(email)
    if not user_id:
        return jsonify({"error": "Usuario no encontrado"}), 404

    domain = [["x_user_id", "=", user_id]]
    if filter_action:
        domain.append(["x_action", "=", filter_action])
    if q:
        domain.append(["x_detail", "ilike", q])

    records = odoo_call(
        "x.emergelens.audit",
        "search_read",
        [domain],
        {
            "fields": ["id", "x_action", "x_role", "x_detail", "x_timestamp", "x_ip"],
            "order": "x_timestamp desc",
            "limit": limit,
            "offset": offset,
        },
    )

    # Agregar etiqueta legible
    for r in records:
        r["label"] = ACTION_LABELS.get(r["x_action"], r["x_action"])

    total = odoo_call("x.emergelens.audit", "search_count", [domain])

    user_rows = odoo_call("res.users", "read", [[int(user_id)]], {"fields": ["id", "name", "login"]})
    user_info = user_rows[0] if user_rows else {"id": int(user_id), "name": "", "login": email}

    return jsonify({"records": records, "total": total, "user": user_info})


# --- 3) Auditoria completa (solo admin) -----------------------------------
@audit_bp.route("/audit/all", methods=["GET"])
@require_admin
def get_all_audit():
    """
    GET /api/audit/all?admin_email=...&limit=100&offset=0&user_id=&action=
    """
    mismatch = enforce_requester_email_match(request.args.get("admin_email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    limit        = int(request.args.get("limit", 100))
    offset       = int(request.args.get("offset", 0))
    filter_uid   = (request.args.get("user_id", "") or "").strip()
    filter_action = (request.args.get("action", "") or "").strip()
    q            = (request.args.get("q", "") or "").strip()

    domain = _build_domain(filter_uid, filter_action, q)

    records = odoo_call(
        "x.emergelens.audit", "search_read",
        [domain],
        {
            "fields": ["id", "x_user_id", "x_action", "x_role",
                       "x_detail", "x_timestamp", "x_ip"],
            "order":  "x_timestamp desc",
            "limit":  limit,
            "offset": offset,
        }
    )

    for r in records:
        r["label"] = ACTION_LABELS.get(r["x_action"], r["x_action"])
        if isinstance(r.get("x_user_id"), list):
            r["user_name"] = r["x_user_id"][1]
            r["x_user_id"] = r["x_user_id"][0]

    total = odoo_call("x.emergelens.audit", "search_count", [domain])

    return jsonify({"records": records, "total": total})


# --- 4) Exportar CSV (admin) ----------------------------------------------
@audit_bp.route("/audit/export/csv", methods=["GET"])
@require_admin
def export_csv():
    mismatch = enforce_requester_email_match(request.args.get("admin_email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    filter_uid = (request.args.get("user_id", "") or "").strip()
    filter_action = (request.args.get("action", "") or "").strip()
    q = (request.args.get("q", "") or "").strip()
    limit = int(request.args.get("limit", 5000))

    domain = _build_domain(filter_uid, filter_action, q)

    records = odoo_call(
        "x.emergelens.audit", "search_read",
        [domain],
        {
            "fields": ["x_user_id", "x_action", "x_role",
                       "x_detail", "x_timestamp", "x_ip"],
            "order":  "x_timestamp desc",
            "limit":  limit,
        }
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID Usuario", "Usuario", "Accion", "Descripcion",
                     "Rol", "Fecha y Hora", "IP"])

    for r in records:
        uid  = r["x_user_id"][0] if isinstance(r["x_user_id"], list) else r["x_user_id"]
        name = r["x_user_id"][1] if isinstance(r["x_user_id"], list) else ""
        writer.writerow([
            uid, name,
            ACTION_LABELS.get(r["x_action"], r["x_action"]),
            r.get("x_detail", ""),
            r.get("x_role", ""),
            r.get("x_timestamp", ""),
            r.get("x_ip", ""),
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=auditoria_emergelens.csv"
        }
    )


# --- 4b) Exportar PDF (admin) ----------------------------------------------
@audit_bp.route("/audit/export/pdf", methods=["GET"])
@require_admin
def export_pdf():
    mismatch = enforce_requester_email_match(request.args.get("admin_email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    if FPDF is None:
        return jsonify({"error": "PDF no disponible: falta dependencia 'fpdf2'. Rebuild del backend requerido."}), 501

    filter_uid = (request.args.get("user_id", "") or "").strip()
    filter_action = (request.args.get("action", "") or "").strip()
    q = (request.args.get("q", "") or "").strip()
    limit = int(request.args.get("limit", 2000))

    domain = _build_domain(filter_uid, filter_action, q)

    records = odoo_call(
        "x.emergelens.audit", "search_read",
        [domain],
        {
            "fields": ["x_user_id", "x_action", "x_role",
                       "x_detail", "x_timestamp", "x_ip"],
            "order":  "x_timestamp desc",
            "limit":  limit,
        }
    )

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 14)
    title = "Auditoria EmergeLens"
    if filter_action:
        title += f" - {ACTION_LABELS.get(filter_action, filter_action)}"
    pdf.cell(0, 10, _safe_pdf_text(title), ln=1)

    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, _safe_pdf_text(f"Exportado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"), ln=1)
    pdf.ln(2)

    # Columnas (mm)
    cols = [
        ("Fecha", 34),
        ("Usuario", 45),
        ("Accion", 45),
        ("Detalle", 140),
        ("IP", 25),
    ]

    pdf.set_font("Helvetica", "B", 9)
    for name, w in cols:
        pdf.cell(w, 7, _safe_pdf_text(name), border=1)
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    for r in records:
        uid = ""
        name = ""
        if isinstance(r.get("x_user_id"), list):
            uid = r["x_user_id"][0]
            name = r["x_user_id"][1]
        else:
            uid = r.get("x_user_id", "")
        user_label = f"{name}" if name else f"UID {uid}"
        action_label = ACTION_LABELS.get(r.get("x_action", ""), r.get("x_action", ""))
        detail = (r.get("x_detail") or "").replace("\n", " ").strip()

        row = [
            r.get("x_timestamp", ""),
            user_label,
            action_label,
            detail,
            r.get("x_ip", ""),
        ]

        # Altura dinamica para el detalle (multi_cell)
        base_h = 6
        pdf.cell(cols[0][1], base_h, _safe_pdf_text(row[0]), border=1)
        pdf.cell(cols[1][1], base_h, _safe_pdf_text(row[1])[:60], border=1)
        pdf.cell(cols[2][1], base_h, _safe_pdf_text(row[2])[:60], border=1)

        x = pdf.get_x()
        y = pdf.get_y()
        pdf.multi_cell(cols[3][1], base_h, _safe_pdf_text(row[3])[:260], border=1)
        y2 = pdf.get_y()
        pdf.set_xy(x + cols[3][1], y)
        pdf.cell(cols[4][1], max(base_h, y2 - y), _safe_pdf_text(row[4]), border=1)
        pdf.set_xy(pdf.l_margin, y2)

    pdf_bytes = bytes(pdf.output())
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=auditoria_emergelens.pdf"
        },
    )


# --- 5) Estadisticas rapidas (admin) --------------------------------------
@audit_bp.route("/audit/stats", methods=["GET"])
@require_admin
def get_stats():
    mismatch = enforce_requester_email_match(request.args.get("admin_email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    actions = [
        "login",
        "sos_activated",
        "sos_cancelled",
        "profile_updated",
        "evidence_sent",
        "status_changed",
        "geofence_exit_safe",
        "geofence_enter_danger",
        "danger_confirm_no",
        "danger_confirm_yes",
    ]

    stats = {}
    for action in actions:
        count = odoo_call("x.emergelens.audit", "search_count",
                          [[["x_action", "=", action]]])
        stats[action] = count

    stats["total"] = odoo_call("x.emergelens.audit", "search_count", [[]])

    return jsonify({"stats": stats})


@audit_bp.route("/audit/record/<int:record_id>", methods=["PATCH"])
@login_required
def update_audit_record(record_id):
    """
    PATCH /api/audit/record/<id>
    Body: { requester_email, detail }
    Permisos:
      - Admin: puede editar cualquier registro.
      - Usuario: solo puede editar sus propios registros.
    """
    data = request.json or {}
    mismatch = enforce_requester_email_match(data.get("requester_email"))
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    requester_email = (session.get("email") or "").strip()
    detail = (data.get("detail") or "").strip()

    requester_uid = _user_id_from_email(requester_email)
    if not requester_uid:
        return jsonify({"error": "Usuario no encontrado"}), 403

    try:
        rows = odoo_call(
            "x.emergelens.audit",
            "read",
            [[int(record_id)]],
            {"fields": ["id", "x_user_id"]},
        )
        if not rows:
            return jsonify({"error": "Registro no encontrado"}), 404

        owner = rows[0].get("x_user_id")
        owner_uid = owner[0] if isinstance(owner, list) else owner

        if not sess_is_admin(requester_email) and int(owner_uid) != int(requester_uid):
            return jsonify({"error": "Sin permiso"}), 403

        odoo_call("x.emergelens.audit", "write", [[int(record_id)], {"x_detail": detail}])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@audit_bp.route("/audit/record/<int:record_id>", methods=["DELETE"])
@login_required
def delete_audit_record(record_id):
    """
    DELETE /api/audit/record/<id>
    Body o query: requester_email
    Permisos:
      - Admin: puede borrar cualquier registro.
      - Usuario: solo puede borrar sus propios registros.
    """
    data = request.json or {}
    mismatch = enforce_requester_email_match(
        data.get("requester_email") or request.args.get("requester_email")
    )
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    requester_email = (session.get("email") or "").strip()

    requester_uid = _user_id_from_email(requester_email)
    if not requester_uid:
        return jsonify({"error": "Usuario no encontrado"}), 403

    try:
        rows = odoo_call(
            "x.emergelens.audit",
            "read",
            [[int(record_id)]],
            {"fields": ["id", "x_user_id"]},
        )
        if not rows:
            return jsonify({"error": "Registro no encontrado"}), 404

        owner = rows[0].get("x_user_id")
        owner_uid = owner[0] if isinstance(owner, list) else owner

        if not sess_is_admin(requester_email) and int(owner_uid) != int(requester_uid):
            return jsonify({"error": "Sin permiso"}), 403

        odoo_call("x.emergelens.audit", "unlink", [[int(record_id)]])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

