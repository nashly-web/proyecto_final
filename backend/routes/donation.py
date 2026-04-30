"""
routes/donation.py - Donaciones comunitarias EmergeLens.

Usa los modelos del addon emergelens_donations:
  x.emergelens.donation.request  -> campana de donacion
  x.emergelens.donation          -> contribucion individual

Rutas bajo /api/donations:
  GET    /                        -> todas las campanas activas
  POST   /                        -> crear campana
  DELETE /<id>                    -> eliminar campana (solo dueno o admin)
  POST   /<id>/contribute         -> donar a una campana
  GET    /<id>/contributors       -> lista de donantes de una campana
"""

import os
from datetime import datetime, timezone
from html import escape

import requests
from flask import Blueprint, jsonify, request, session

from mailer import send_html_email
from routes.notifications import push_notification
from security import (
    enforce_requester_email_match,
    is_admin as sess_is_admin,
    login_required,
    requester_email_from_request,
)
from validation import as_float, clean_str

donations_bp = Blueprint("donations", __name__)

ODOO_URL   = os.getenv("ODOO_URL",  "http://odoo:8069")
ODOO_DB    = os.getenv("ODOO_DB",   "sosemergelens")
ODOO_USER  = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ODOO_PASS  = os.getenv("ADMIN_ODOO_PASS",  "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL",     "sosemergelens@gmail.com")

REQUEST_MODEL = "x.emergelens.donation.request"
DONATION_MODEL = "x.emergelens.donation"
NOTIF_MODEL    = "x.emergelens.notification"

_uid_cache = None


# ── Odoo helpers ──────────────────────────────────────────────────────────────

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


def _now_dt():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _require_session_identity():
    mismatch = enforce_requester_email_match(requester_email_from_request())
    if mismatch is not None:
        return mismatch
    if not session.get("uid"):
        return ({"error": "No autenticado"}, 401)
    return None


def _user_name(uid):
    rows = odoo("res.users", "read", [[uid], ["name"]])
    return rows[0]["name"] if rows else "Usuario"


def _notify(target_uid, title, message="", notif_type="donation"):
    """Crear notificacion en x.emergelens.notification para el dueno de la campana."""
    import time
    try:
        odoo(NOTIF_MODEL, "create", [[{
            "x_target_uid": target_uid,
            "x_user_id":    target_uid,
            "x_name":       title,
            "x_message":    message,
            "x_type":       notif_type,
            "x_read":       False,
            "x_ts":         float(time.time()),
            "x_timestamp":  _now_dt(),
            "x_for_admin":  False,
        }]])
    except Exception as e:
        print(f"[donations] _notify error: {e}")


def _send_receipt_email(*, to_email: str, donor_name: str, campaign_title: str, amount: float, method: str, last4: str):
    try:
        safe_name = escape(donor_name or "Usuario")
        safe_campaign = escape(campaign_title or "Campana de ayuda")
        pay = escape(method or "")
        card = f" ****{escape(last4)}" if (method == "card" and last4) else ""
        html = f"""<!doctype html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#0D1B2A;margin:0;padding:0">
  <div style="max-width:640px;margin:0 auto;padding:20px">
    <div style="background:#1E3A5F;border-radius:12px 12px 0 0;padding:18px 20px">
      <h2 style="color:#fff;margin:0;font-size:18px">Recibo de donacion</h2>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:13px">EmergeLens</p>
    </div>
    <div style="background:#152238;border:1px solid rgba(255,255,255,.08);border-top:none;border-radius:0 0 12px 12px;padding:18px 20px;color:#fff">
      <p style="margin:0 0 10px">Hola {safe_name}, gracias por tu aporte.</p>
      <div style="background:#0D1B2A;border-radius:10px;padding:14px;margin:12px 0">
        <p style="margin:0 0 8px"><strong>Campana:</strong> {safe_campaign}</p>
        <p style="margin:0 0 8px"><strong>Monto:</strong> ${amount:,.2f}</p>
        <p style="margin:0"><strong>Pago:</strong> {pay}{card}</p>
      </div>
      <p style="margin:12px 0 0;font-size:12px;opacity:.75">Este es un comprobante automatico.</p>
    </div>
  </div>
</body></html>"""
        send_html_email(to_email=to_email, subject="Recibo de donacion - EmergeLens", html=html)
    except Exception as e:
        print(f"[donations] receipt email error: {e}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@donations_bp.route("/", methods=["GET"])
@login_required
def list_campaigns():
    """Lista campanas. Todos ven campanas abiertas/completadas; admin ve todo."""
    mismatch = _require_session_identity()
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    requester_email = (session.get("email") or "").strip()
    uid = int(session.get("uid"))
    include_cancelled = (request.args.get("include_cancelled") or "").strip() == "1"

    # Admin: ve todo (incluye canceladas).
    # Usuario: ve campañas abiertas/completadas de todos + *sus* campañas aunque no estén abiertas
    # (ej. canceladas), para que siempre pueda ver la que creó.
    # Nota UX: "Eliminar campaña" marca la campaña como cancelled; para que desaparezca del listado,
    # por defecto NO devolvemos canceladas (admin puede pedirlas con ?include_cancelled=1).
    if sess_is_admin(requester_email):
        domain = [] if include_cancelled else [["x_state", "!=", "cancelled"]]
    else:
        domain = [["x_state", "in", ["open", "done"]]]

    campaigns = odoo(
        REQUEST_MODEL, "search_read",
        [domain],
        {
            "fields": [
                "id", "x_reference", "x_name", "x_description",
                "x_goal_amount", "x_total_received", "x_donations_count",
                "x_donors_count", "x_state", "x_created_at",
                "x_user_id", "x_image_ids",
            ],
            "order": "x_created_at desc",
        },
    )

    result = []
    for c in campaigns:
        owner_id = c["x_user_id"][0] if isinstance(c["x_user_id"], list) else c["x_user_id"]
        owner_name = c["x_user_id"][1] if isinstance(c["x_user_id"], list) else ""
        goal = c.get("x_goal_amount") or 0
        raised = c.get("x_total_received") or 0
        pct = round((raised / goal * 100), 1) if goal > 0 else 0

        # Foto principal (primera imagen adjunta o campo binario directo si existe)
        photo = None
        if c.get("x_image_ids"):
            img_id = c["x_image_ids"][0]
            if isinstance(img_id, (list, tuple)) and img_id:
                img_id = img_id[0]
            try:
                imgs = odoo(
                    "x.emergelens.donation.request.image",
                    "read",
                    [[img_id], ["x_image"]],
                )
                if imgs and imgs[0].get("x_image"):
                    photo = str(imgs[0]["x_image"]).strip()
            except Exception:
                pass

        # Saber si el usuario actual ya dono
        contributed = bool(odoo(
            DONATION_MODEL, "search_count",
            [[
                ["x_request_id", "=", c["id"]],
                ["x_donor_user_id", "=", uid],
                ["x_state", "=", "confirmed"],
            ]],
        ))

        result.append({
            "id":            c["id"],
            "reference":     c.get("x_reference", ""),
            "title":         c.get("x_name", ""),
            "description":   c.get("x_description", ""),
            "goal":          goal,
            "raised":        raised,
            "pct":           pct,
            "donations":     c.get("x_donations_count", 0),
            "donors":        c.get("x_donors_count", 0),
            "state":         c.get("x_state", "open"),
            "created_at":    c.get("x_created_at", ""),
            "owner_id":      owner_id,
            "owner_name":    owner_name,
            "photo":         photo,
            "i_contributed": contributed,
            "is_mine":       owner_id == uid,
        })

    return jsonify({"ok": True, "campaigns": result})


@donations_bp.route("/<int:campaign_id>", methods=["GET"])
@login_required
def get_campaign(campaign_id):
    mismatch = _require_session_identity()
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()
    include_cancelled = (request.args.get("include_cancelled") or "").strip() == "1"

    rows = odoo(
        REQUEST_MODEL,
        "read",
        [[int(campaign_id)], ["id", "x_name", "x_description", "x_goal_amount", "x_total_received", "x_state", "x_user_id", "x_image_ids", "x_created_at"]],
    )
    if not rows:
        return jsonify({"error": "Campana no encontrada"}), 404

    c = rows[0]
    owner_id = c["x_user_id"][0] if isinstance(c["x_user_id"], list) else c["x_user_id"]
    owner_name = c["x_user_id"][1] if isinstance(c["x_user_id"], list) else ""
    state = (c.get("x_state") or "").strip()
    if state == "cancelled" and not (sess_is_admin(requester_email) and include_cancelled):
        return jsonify({"error": "Campana no encontrada"}), 404
    if not sess_is_admin(requester_email) and state not in ("open", "done"):
        return jsonify({"error": "No autorizado"}), 403

    photo = None
    if c.get("x_image_ids"):
        img_id = c["x_image_ids"][0]
        if isinstance(img_id, (list, tuple)) and img_id:
            img_id = img_id[0]
        try:
            imgs = odoo("x.emergelens.donation.request.image", "read", [[img_id], ["x_image"]])
            if imgs and imgs[0].get("x_image"):
                photo = str(imgs[0]["x_image"]).strip()
        except Exception:
            pass

    goal = c.get("x_goal_amount") or 0
    raised = c.get("x_total_received") or 0
    pct = round((raised / goal * 100), 1) if goal > 0 else 0
    contributed = bool(
        odoo(
            DONATION_MODEL,
            "search_count",
            [[["x_request_id", "=", int(campaign_id)], ["x_donor_user_id", "=", uid], ["x_state", "=", "confirmed"]]],
        )
    )

    return jsonify(
        {
            "ok": True,
            "campaign": {
                "id": c.get("id"),
                "title": c.get("x_name", ""),
                "description": c.get("x_description", ""),
                "goal": goal,
                "raised": raised,
                "pct": pct,
                "state": state or "open",
                "created_at": c.get("x_created_at", ""),
                "owner_id": owner_id,
                "owner_name": owner_name,
                "photo": photo,
                "i_contributed": contributed,
                "is_mine": int(owner_id) == int(uid),
            },
        }
    )


@donations_bp.route("/", methods=["POST"])
@login_required
def create_campaign():
    """Crear una nueva campana de donacion."""
    mismatch = _require_session_identity()
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    data = request.json or {}
    uid = int(session.get("uid"))

    title = clean_str(data.get("title"), max_len=140)
    description = clean_str(data.get("description"), max_len=1200, allow_newlines=True)
    try:
        goal = as_float(data.get("goal"), min_val=0.01)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    photo_b64   = data.get("photo")  # base64 opcional

    if not title:
        return jsonify({"error": "El titulo es obligatorio"}), 400
    if goal <= 0:
        return jsonify({"error": "La meta debe ser mayor a 0"}), 400

    vals = {
        "x_name":        title,
        "x_description": description,
        "x_goal_amount": goal,
        "x_user_id":     uid,
        "x_state":       "open",
    }
    try:
        campaign_id = odoo(REQUEST_MODEL, "create", [[vals]])
    except Exception as e:
        return jsonify({"error": f"No se pudo crear la campana: {e}"}), 502

    # Guardar foto si viene
    if photo_b64 and campaign_id:
        try:
            # Extraer solo el base64 sin el prefijo data:image/...;base64,
            b64 = photo_b64.split(",")[-1] if "," in photo_b64 else photo_b64
            odoo("x.emergelens.donation.request.image", "create", [[{
                "x_request_id": campaign_id,
                "x_name":       "foto",
                "x_image":      b64,
            }]])
        except Exception as e:
            print(f"[donations] foto error: {e}")

    return jsonify({"ok": True, "id": campaign_id}), 201


@donations_bp.route("/<int:campaign_id>", methods=["PATCH"])
@login_required
def update_campaign(campaign_id):
    mismatch = _require_session_identity()
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()

    rows = odoo(REQUEST_MODEL, "read", [[int(campaign_id)], ["x_user_id"]])
    if not rows:
        return jsonify({"error": "Campana no encontrada"}), 404

    owner_id = rows[0]["x_user_id"][0] if isinstance(rows[0]["x_user_id"], list) else rows[0]["x_user_id"]
    if int(owner_id) != int(uid) and not sess_is_admin(requester_email):
        return jsonify({"error": "Solo el creador o el admin pueden editar esta campana"}), 403

    data = request.get_json(silent=True) or {}
    vals = {}
    if "title" in data:
        title = clean_str(data.get("title"), max_len=140)
        if not title:
            return jsonify({"error": "El titulo es obligatorio"}), 400
        vals["x_name"] = title
    if "description" in data:
        vals["x_description"] = clean_str(data.get("description"), max_len=1200, allow_newlines=True)
    if "goal" in data:
        try:
            vals["x_goal_amount"] = as_float(data.get("goal"), min_val=0.01)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    if vals:
        odoo(REQUEST_MODEL, "write", [[int(campaign_id)], vals])

    photo_b64 = data.get("photo")
    if photo_b64:
        try:
            b64 = photo_b64.split(",")[-1] if "," in photo_b64 else photo_b64
            odoo(
                "x.emergelens.donation.request.image",
                "create",
                [[{"x_request_id": int(campaign_id), "x_name": "foto", "x_image": b64}]],
            )
        except Exception as e:
            print(f"[donations] update photo error: {e}")

    return jsonify({"ok": True})


@donations_bp.route("/<int:campaign_id>", methods=["DELETE"])
@login_required
def delete_campaign(campaign_id):
    """Eliminar campana — solo dueno o admin."""
    mismatch = _require_session_identity()
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    requester_email = (session.get("email") or "").strip()
    uid = int(session.get("uid"))

    rows = odoo(REQUEST_MODEL, "read", [[campaign_id], ["x_user_id"]])
    if not rows:
        return jsonify({"error": "Campana no encontrada"}), 404

    owner_id = rows[0]["x_user_id"][0] if isinstance(rows[0]["x_user_id"], list) else rows[0]["x_user_id"]
    if owner_id != uid and not sess_is_admin(requester_email):
        return jsonify({"error": "Solo el creador o el admin pueden eliminar esta campana"}), 403

    odoo(REQUEST_MODEL, "write", [[campaign_id], {"x_state": "cancelled"}])
    return jsonify({"ok": True})


@donations_bp.route("/<int:campaign_id>/contribute", methods=["POST"])
@login_required
def contribute(campaign_id):
    """Donar a una campana."""
    mismatch = _require_session_identity()
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    data = request.json or {}
    requester_email = (session.get("email") or "").strip()
    uid = int(session.get("uid"))

    try:
        amount = as_float(data.get("amount"), min_val=0.01)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    note = clean_str(data.get("note"), max_len=240, allow_newlines=True)
    payment = data.get("payment") or {}
    method = clean_str(payment.get("method"), max_len=20)  # card | transfer | wallet
    auth_code = clean_str(payment.get("auth_code"), max_len=10)
    last4 = clean_str(payment.get("last4"), max_len=4)

    # Pago simulado (no se cobran fondos): se valida para que parezca real.
    if method not in ("card", "transfer", "wallet"):
        return jsonify({"error": "Selecciona un metodo de pago"}), 400
    if not auth_code.isdigit() or not (4 <= len(auth_code) <= 8):
        return jsonify({"error": "Codigo de verificacion invalido"}), 400
    if method == "card" and (not last4.isdigit() or len(last4) != 4):
        return jsonify({"error": "Tarjeta invalida (faltan ultimos 4)"}), 400

    # Verificar que la campana existe y esta abierta
    rows = odoo(REQUEST_MODEL, "read",
                [[campaign_id], ["x_state", "x_user_id", "x_name", "x_goal_amount", "x_total_received"]])
    if not rows:
        return jsonify({"error": "Campana no encontrada"}), 404
    if rows[0]["x_state"] != "open":
        return jsonify({"error": "Esta campana ya no acepta donaciones"}), 400

    # Crear la contribucion
    pay_tag = ""
    if method == "card":
        pay_tag = f"[Pago simulado: tarjeta ****{last4}] "
    elif method == "transfer":
        pay_tag = "[Pago simulado: transferencia] "
    elif method == "wallet":
        pay_tag = "[Pago simulado: billetera] "

    odoo(DONATION_MODEL, "create", [[{
        "x_request_id":     campaign_id,
        "x_donor_user_id":  uid,
        "x_amount":         amount,
        "x_note":           (pay_tag + note).strip(),
        "x_state":          "confirmed",
        "x_date":           _now_dt(),
    }]])

    # Verificar si llego a la meta para marcar como done
    new_total = (rows[0].get("x_total_received") or 0) + amount
    goal = rows[0].get("x_goal_amount") or 0
    if goal > 0 and new_total >= goal:
        odoo(REQUEST_MODEL, "write", [[campaign_id], {"x_state": "done"}])

    # Notificar al dueno de la campana
    owner_id = rows[0]["x_user_id"][0] if isinstance(rows[0]["x_user_id"], list) else rows[0]["x_user_id"]
    if owner_id != uid:  # no notificarse a si mismo
        donor_name = _user_name(uid)
        campaign_title = rows[0].get("x_name", "tu campana")
        _notify(
            target_uid=owner_id,
            title=f"Donacion recibida: ${amount:,.0f} de {donor_name}",
            message=f"Campana: {campaign_title}" + (f" — {note}" if note else ""),
            notif_type="donation",
        )

    # Notificacion de agradecimiento al donante (campana de notificaciones).
    try:
        campaign_title = rows[0].get("x_name", "Campana de ayuda")
        push_notification(
            "donation",
            f"Gracias por tu donacion de ${amount:,.0f}. Campana: {campaign_title}",
            uid=uid,
            name="Gracias por tu apoyo",
            target_uid=uid,
        )
    except Exception:
        pass

    # Email de recibo (factura/confirmacion) al donante (best effort)
    donor_name = (session.get("name") or "").strip() or _user_name(uid)
    campaign_title = rows[0].get("x_name", "Campana de ayuda")
    if requester_email and "@" in requester_email:
        _send_receipt_email(
            to_email=requester_email,
            donor_name=donor_name,
            campaign_title=campaign_title,
            amount=amount,
            method=method,
            last4=last4,
        )

    return jsonify({"ok": True}), 201


@donations_bp.route("/<int:campaign_id>/contributors", methods=["GET"])
@login_required
def get_contributors(campaign_id):
    """Lista de donantes de una campana (solo dueno o admin)."""
    mismatch = _require_session_identity()
    if mismatch is not None:
        return jsonify(mismatch[0]), mismatch[1]

    uid = int(session.get("uid"))
    requester_email = (session.get("email") or "").strip()

    rows = odoo(REQUEST_MODEL, "read", [[int(campaign_id)], ["x_user_id"]])
    if not rows:
        return jsonify({"error": "Campana no encontrada"}), 404
    owner_id = rows[0]["x_user_id"][0] if isinstance(rows[0]["x_user_id"], list) else rows[0]["x_user_id"]
    if int(owner_id) != int(uid) and not sess_is_admin(requester_email):
        return jsonify({"error": "Solo el dueno o el admin pueden ver los donantes"}), 403

    contribs = odoo(
        DONATION_MODEL, "search_read",
        [[["x_request_id", "=", campaign_id], ["x_state", "=", "confirmed"]]],
        {
            "fields": ["id", "x_donor_user_id", "x_amount", "x_note", "x_date"],
            "order":  "x_date desc",
        },
    )

    result = []
    for c in contribs:
        donor_id   = c["x_donor_user_id"][0] if isinstance(c["x_donor_user_id"], list) else c["x_donor_user_id"]
        donor_name = c["x_donor_user_id"][1] if isinstance(c["x_donor_user_id"], list) else ""
        result.append({
            "id":         c["id"],
            "donor_id":   donor_id,
            "donor_name": donor_name,
            "amount":     c.get("x_amount", 0),
            "note":       c.get("x_note", ""),
            "date":       c.get("x_date", ""),
        })

    return jsonify({"ok": True, "contributors": result})
