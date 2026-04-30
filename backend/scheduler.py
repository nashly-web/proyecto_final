"""
backend/scheduler.py - Tareas programadas de EmergeLens (APScheduler).

- Recordatorios de medicamentos (cada minuto)
- Consejo del dia (bajo demanda por usuario)
- Notificacion a contactos cuando alguien activa SOS (helper reutilizable)

Todo ASCII (sin emojis) para evitar textos raros en la app.
"""

import os
import time
from datetime import datetime

import requests
from apscheduler.schedulers.background import BackgroundScheduler
import unicodedata

from mailer import send_email as smtp_send_email

ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_ODOO_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_ODOO_PASS = os.getenv("ADMIN_ODOO_PASS", "2408")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", ADMIN_ODOO_EMAIL)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

DAILY_TIP_COOLDOWN_HOURS = float(os.getenv("DAILY_TIP_COOLDOWN_HOURS", "12"))
# Minimum cooldown in seconds so the notification tray doesn't get flooded.
# Even if DAILY_TIP_COOLDOWN_HOURS is set to 0, we still enforce this.
DAILY_TIP_MIN_SECONDS = float(os.getenv("DAILY_TIP_MIN_SECONDS", "180"))

EMAIL_NOTIFICATIONS_ENABLED = (os.getenv("ENABLE_EMAIL_NOTIFICATIONS", "1") or "1").strip() == "1"


def _send_email_best_effort(*, to_email: str, subject: str, html: str) -> None:
    if not EMAIL_NOTIFICATIONS_ENABLED:
        return
    if not to_email or "@" not in str(to_email):
        return
    try:
        smtp_send_email(to_emails=to_email, subject=subject, html=html, attachments=None)
    except Exception as e:
        print(f"[scheduler] email error to {to_email}: {e}")


def _get_user_email(s, uid: int) -> str:
    try:
        rows = odoo_call(s, "res.users", "read", [[int(uid)]], {"fields": ["email"]})
        if not rows:
            return ""
        return (rows[0].get("email") or "").strip()
    except Exception:
        return ""


def _get_profile_contact_emails(s, uid: int) -> list[str]:
    try:
        profs = odoo_call(
            s,
            "x.emergelens.profile",
            "search_read",
            [[["x_user_id", "=", int(uid)]]],
            {"fields": ["x_ec1_email", "x_ec2_email"], "limit": 1},
        )
        p = profs[0] if profs else {}
        res = []
        for k in ("x_ec1_email", "x_ec2_email"):
            v = (p.get(k) or "").strip()
            if v and "@" in v:
                res.append(v)
        # de-dup (case-insensitive)
        out = []
        seen = set()
        for e in res:
            key = e.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(e)
        return out
    except Exception:
        return []


def _user_has_active_emergency(s, uid: int) -> bool:
    try:
        ids = odoo_call(
            s,
            "x.emergelens.emergency",
            "search",
            [[["x_user_id", "=", int(uid)], ["x_status", "in", ["active", "monitoring"]]]],
            {"limit": 1},
        )
        return bool(ids)
    except Exception:
        return False


def _fix_text(s):
    if not s:
        return ""
    s = str(s).strip()
    try:
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    except Exception:
        pass
    # collapse whitespace
    s = " ".join(s.split())
    return s


FALLBACK_TIPS = [
    "Consejo: comparte tu ubicacion con alguien de confianza si sales tarde.",
    "Consejo: mantente atento a tu entorno y evita zonas poco iluminadas.",
    "Consejo: guarda numeros de emergencia y contactos en tu telefono.",
    "Consejo: si te sientes mal, busca ayuda y no te quedes solo.",
    "Consejo: lleva el telefono cargado y activa el GPS cuando sea necesario.",
    "Consejo: confia en tu instinto y aléjate si algo no se siente seguro.",
]


def odoo_session():
    s = requests.Session()
    s.post(
        f"{ODOO_URL}/web/session/authenticate",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"db": ODOO_DB, "login": ADMIN_ODOO_EMAIL, "password": ADMIN_ODOO_PASS},
        },
        timeout=10,
    )
    return s


def odoo_call(s, model, method, args, kwargs=None):
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


def push_notification(notif_type, message, uid=None, name=None, target_uid=None):
    # Modelo Odoo: x.emergelens.notification
    try:
        s = odoo_session()
        vals = {
            "x_name": name or "Notificacion",
            "x_type": notif_type,
            "x_message": message,
            "x_read": False,
            "x_ts": time.time(),
        }
        if uid is not None:
            vals["x_user_id"] = int(uid)
        if target_uid is not None:
            vals["x_target_uid"] = int(target_uid)
        odoo_call(s, "x.emergelens.notification", "create", [vals])
    except Exception as e:
        print(f"[scheduler] push_notification error: {e}")


def check_med_reminders():
    # Corre cada minuto: busca medicamentos activos cuya hora coincide con ahora.
    now_str = datetime.now().strftime("%H:%M")
    try:
        s = odoo_session()
        meds = odoo_call(
            s,
            "x.emergelens.med",
            "search_read",
            [[["x_active", "=", True], ["x_time", "=", now_str]]],
            {"fields": ["x_name", "x_dose", "x_user_id", "x_time"]},
        )
        for med in meds:
            raw_uid = med.get("x_user_id")
            uid_val = raw_uid[0] if isinstance(raw_uid, (list, tuple)) and raw_uid else None
            if not uid_val:
                continue
            med_name = med.get("x_name", "Medicamento")
            med_dose = med.get("x_dose", "")
            name = f"Recordatorio {med_name} - {now_str}"
            msg = f"Es hora de tomar {med_name} {med_dose}".strip()

            # Dedup: evita dobles en caso de reloader / multiples schedulers / client push.
            recent = odoo_call(
                s,
                "x.emergelens.notification",
                "search",
                [[
                    ["x_target_uid", "=", int(uid_val)],
                    ["x_type", "=", "med_reminder"],
                    ["x_name", "=", name],
                    ["x_message", "=", msg],
                    ["x_ts", ">=", time.time() - 120],
                ]],
                {"limit": 1},
            )
            if recent:
                continue

            push_notification(
                "med_reminder",
                msg,
                uid=uid_val,
                name=name,
                target_uid=uid_val,
            )

            # Email: al menos al usuario. Opcionalmente a sus contactos si esta en emergencia.
            user_email = _get_user_email(s, int(uid_val))
            subject = f"Recordatorio: {med_name} ({now_str})"
            html = f"""<!doctype html><html><body style="font-family:Arial,sans-serif">
<h2>Recordatorio de medicamento</h2>
<p><strong>{msg}</strong></p>
<p style="color:#666;font-size:12px">Enviado por SOS EmergeLens.</p>
</body></html>"""
            _send_email_best_effort(to_email=user_email, subject=subject, html=html)

            if (os.getenv("MED_REMINDER_EMAIL_TO_CONTACTS", "1") or "1").strip() == "1":
                if _user_has_active_emergency(s, int(uid_val)):
                    for ec in _get_profile_contact_emails(s, int(uid_val)):
                        _send_email_best_effort(to_email=ec, subject=subject, html=html)
    except Exception as e:
        print(f"[scheduler] check_med_reminders error: {e}")


def _get_last_daily_tip(s, uid):
    try:
        rows = odoo_call(
            s,
            "x.emergelens.notification",
            "search_read",
            [[["x_target_uid", "=", int(uid)], ["x_type", "=", "daily_tip"]]],
            {"fields": ["x_message", "x_ts"], "order": "x_ts desc", "limit": 1},
        )
        if not rows:
            return None
        r = rows[0]
        return {"message": _fix_text(r.get("x_message") or ""), "ts": float(r.get("x_ts") or 0)}
    except Exception:
        return None


def generate_daily_tip(uid):
    """
    Genera un consejo motivacional (daily_tip) y lo guarda como notificacion.
    No crea duplicados: respeta cooldown y evita repetir el mismo mensaje.
    Return: {"tip": str|None, "new": bool}
    """
    s = None
    try:
        s = odoo_session()
        last = _get_last_daily_tip(s, uid)
        if last and last.get("ts"):
            cooldown_s = max(0, DAILY_TIP_COOLDOWN_HOURS) * 3600.0
            cooldown_s = max(cooldown_s, max(0, DAILY_TIP_MIN_SECONDS))
            if cooldown_s > 0 and (time.time() - float(last["ts"])) < cooldown_s:
                # Too soon: do not create another notification.
                return {"tip": last.get("message") or None, "new": False}
    except Exception:
        # If Odoo is not available, still return a tip but do not loop.
        last = None

    last_msg = (last or {}).get("message") or ""

    try:
        if not GROQ_API_KEY:
            # Deterministic-ish rotation to reduce repeats, plus avoid last message.
            day_key = int(datetime.now().strftime("%j"))  # day of year 1..366
            idx = (int(uid) + day_key) % len(FALLBACK_TIPS)
            tip = _fix_text(FALLBACK_TIPS[idx])
            if tip == last_msg and len(FALLBACK_TIPS) > 1:
                tip = _fix_text(FALLBACK_TIPS[(idx + 1) % len(FALLBACK_TIPS)])
        else:
            base_prompt = (
                "Dame un consejo corto de seguridad personal o salud. "
                "Maximo 1 oracion. Sin emojis. Solo texto."
            )
            if last_msg:
                base_prompt += f" No repitas este consejo anterior: {last_msg}"

            tip = None
            for attempt in range(3):
                res = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": GROQ_MODEL,
                        "messages": [{"role": "user", "content": base_prompt}],
                        "max_tokens": 80,
                        "temperature": 0.8 + (attempt * 0.1),
                        "presence_penalty": 0.6,
                        "frequency_penalty": 0.6,
                    },
                    timeout=15,
                )
                res.raise_for_status()
                cand = _fix_text(res.json()["choices"][0]["message"]["content"].strip())
                if cand and cand != last_msg:
                    tip = cand
                    break
            if not tip:
                tip = _fix_text(FALLBACK_TIPS[int(time.time()) % len(FALLBACK_TIPS)])

        if not tip or tip == last_msg:
            return {"tip": tip or None, "new": False}

        push_notification("daily_tip", tip, uid=uid, name="Consejo del dia", target_uid=uid)
        return {"tip": tip, "new": True}
    except Exception as e:
        print(f"[scheduler] generate_daily_tip error: {e}")
        return {"tip": None, "new": False}


def notify_emergency_contacts(emergency_uid, user_name, e_type, lat=None, lng=None):
    # Cuando alguien activa SOS, busca usuarios que lo tienen como contacto y les notifica.
    emergency_names = {
        "medical": "Emergencia medica",
        "security": "Emergencia de seguridad",
        "fire": "Incendio",
        "accident": "Accidente",
    }

    try:
        s = odoo_session()

        user_data = odoo_call(s, "res.users", "read", [[int(emergency_uid)]], {"fields": ["email"]})
        if not user_data:
            return
        emergency_email = user_data[0].get("email") or ""
        if not emergency_email:
            return

        profiles = odoo_call(
            s,
            "x.emergelens.profile",
            "search_read",
            [[
                "|",
                ["x_ec1_email", "=", emergency_email],
                ["x_ec2_email", "=", emergency_email],
            ]],
            {"fields": ["x_user_id"], "limit": 100},
        )

        e_name = emergency_names.get(e_type, "Emergencia")
        for p in profiles:
            raw_uid = p.get("x_user_id")
            contact_uid = raw_uid[0] if isinstance(raw_uid, (list, tuple)) and raw_uid else None
            if not contact_uid or contact_uid == int(emergency_uid):
                continue
            push_notification(
                "contact_alert",
                f"{user_name} esta en peligro. Alerta: {e_name}.",
                uid=contact_uid,
                name=f"ALERTA SOS: {user_name} en peligro",
                target_uid=contact_uid,
            )

            # Email al contacto (usuario registrado) si tiene correo en res.users.
            if (os.getenv("EMERGENCY_CONTACT_ALERT_EMAIL", "1") or "1").strip() == "1":
                contact_email = _get_user_email(s, int(contact_uid))
                maps = ""
                if lat is not None and lng is not None:
                    maps_url = f"https://maps.google.com/?q={lat},{lng}"
                    maps = f'<p><a href="{maps_url}">Ver ubicacion (Google Maps)</a></p>'
                html = f"""<!doctype html><html><body style="font-family:Arial,sans-serif">
<h2>Alerta SOS</h2>
<p><strong>{user_name}</strong> esta en peligro. Tipo: <strong>{e_name}</strong>.</p>
{maps}
<p style="color:#666;font-size:12px">Enviado por SOS EmergeLens.</p>
</body></html>"""
                _send_email_best_effort(
                    to_email=contact_email,
                    subject=f"ALERTA SOS: {user_name} en peligro - {e_name}",
                    html=html,
                )
    except Exception as e:
        print(f"[scheduler] notify_emergency_contacts error: {e}")


_scheduler = None


def init_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    scheduler = BackgroundScheduler()
    scheduler.add_job(check_med_reminders, "cron", minute="*", id="med_reminders", replace_existing=True)
    scheduler.start()
    _scheduler = scheduler
    print("[scheduler] started")
    return scheduler
