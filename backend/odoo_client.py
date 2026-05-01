"""
backend/odoo_client.py - Cliente minimo para Odoo (JSON-RPC) usado por Flask.

Objetivo:
- Login de usuarios via /web/session/authenticate
- Registro de usuarios via /jsonrpc (execute_kw) con el uid real del admin

Nota:
- ASCII only (sin tildes/emojis) para evitar simbolos raros en la UI.
"""

import os
import json
import time
import requests


ODOO_URL = os.getenv("ODOO_URL", "http://odoo:8069")
ODOO_DB = os.getenv("ODOO_DB", "sosemergelens")
ADMIN_EMAIL = os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_ODOO_PASS", "")

# Cache del uid del admin (se obtiene una vez y se reutiliza)
_admin_uid_cache = None


def rpc(endpoint, params, session=None, timeout=20):
    """
    Llamada JSON-RPC basica a endpoints tipo:
    - /web/session/authenticate
    - /web/dataset/call_kw

    Devuelve: (result, requests.Session)
    """
    # Helper general:
    # - Maneja cookies via requests.Session (Odoo usa session cookies).
    # - Reintenta si Odoo todavia esta iniciando.
    # - Normaliza errores JSON-RPC para el frontend.
    s = session or requests.Session()
    last_err = None
    for attempt in range(3):
        try:
            res = s.post(
                f"{ODOO_URL}{endpoint}",
                json={"jsonrpc": "2.0", "method": "call", "params": params},
                headers={"Content-Type": "application/json"},
                timeout=timeout,
            )
            res.raise_for_status()
            data = res.json()
            last_err = None
            break
        except requests.exceptions.RequestException as e:
            last_err = e
            # Odoo may be starting up; retry briefly.
            time.sleep(0.4 * (attempt + 1))
            data = None

    if last_err is not None and data is None:
        raise Exception("No se pudo conectar a Odoo. Revisa que Docker y Odoo esten encendidos.")

    if data.get("error"):
        msg = (
            data["error"].get("data", {}).get("message")
            or data["error"].get("message")
            or "Odoo error"
        )
        raise Exception(str(msg))
    return data.get("result"), s


def get_admin_uid():
    """Obtiene el uid real del admin autenticandose en Odoo."""
    # Odoo requiere uid/password reales para execute_kw (registro y operaciones server-side).
    # Por eso lo autenticamos una vez y cacheamos el uid.
    global _admin_uid_cache
    if _admin_uid_cache:
        return _admin_uid_cache

    if not ADMIN_PASSWORD:
        raise Exception("Falta ADMIN_ODOO_PASS en variables de entorno")

    result, _ = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    if not result or not result.get("uid"):
        raise Exception("No se pudo autenticar al admin")

    _admin_uid_cache = int(result["uid"])
    return _admin_uid_cache


def jsonrpc_call(model, method, args, kwargs=None, timeout=25):
    """
    Llamada via /jsonrpc usando execute_kw con el uid real del admin.
    Devuelve el "result" directo de Odoo.
    """
    # A diferencia de /web/dataset/call_kw, aqui enviamos el uid real del admin.
    # Esto ayuda con permisos en operaciones sensibles (ej: crear usuarios).
    if kwargs is None:
        kwargs = {}

    admin_uid = get_admin_uid()
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                ODOO_DB,
                admin_uid,
                ADMIN_PASSWORD,
                model,
                method,
                args,
                kwargs,
            ],
        },
    }

    last_err = None
    data = None
    for attempt in range(3):
        try:
            res = requests.post(
                f"{ODOO_URL}/jsonrpc",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=timeout,
            )
            res.raise_for_status()
            data = res.json()
            last_err = None
            break
        except requests.exceptions.RequestException as e:
            last_err = e
            time.sleep(0.4 * (attempt + 1))

    if last_err is not None and data is None:
        raise Exception("No se pudo conectar a Odoo. Revisa que Docker y Odoo esten encendidos.")

    if data.get("error"):
        msg = (
            data["error"].get("data", {}).get("message")
            or data["error"].get("message")
            or "Odoo error"
        )
        raise Exception(str(msg))
    return data.get("result")


# -- AUTH ----------------------------------------------------------------------

def login(email, password):
    """Autentica un usuario en Odoo. Devuelve { uid, name, email }."""
    # Login del usuario final (valida sus credenciales en Odoo).
    result, _ = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": email, "password": password},
        timeout=20,
    )
    if not result or not result.get("uid"):
        raise Exception("Credenciales incorrectas")
    return {"uid": int(result["uid"]), "name": result.get("name") or "Usuario", "email": email}


def register(name, email, password):
    """
    Crea un usuario nuevo en Odoo usando execute_kw via /jsonrpc con el uid real del admin.
    Esto evita errores de permisos cuando Odoo crea el res.partner asociado.
    """
    # Flujo general:
    # 1) validar que no exista el login
    # 2) crear res.users con permisos de admin
    # Verificar que el email no existe ya
    existing = jsonrpc_call("res.users", "search", [[["login", "=", email]]], {"limit": 1})
    if existing:
        raise Exception("Ya existe una cuenta con ese correo")

    # Crear usuario. Odoo crea el res.partner automaticamente.
    # Nota: en algunas instalaciones, pasar "password" en create puede no aplicarse,
    # por eso hacemos un write despues para asegurar que el login funcione.
    user_id = jsonrpc_call(
        "res.users",
        "create",
        [
            {
                "name": name,
                "login": email,
                # En muchos setups esto rellena partner email tambien.
                "email": email,
            }
        ],
    )
    user_id = int(user_id)

    # Asegurar password (y reintentar con nombres alternos si hiciera falta).
    try:
        jsonrpc_call("res.users", "write", [[user_id], {"password": password}])
    except Exception:
        # Algunos setups usan "new_password" como alias, intentamos por compat.
        jsonrpc_call("res.users", "write", [[user_id], {"new_password": password}])

    # Asegurar email en partner si aplica (best effort).
    try:
        rows = jsonrpc_call("res.users", "read", [[user_id], ["partner_id"]])
        partner = (rows or [{}])[0].get("partner_id")
        if isinstance(partner, (list, tuple)) and partner:
            partner_id = int(partner[0])
            jsonrpc_call("res.partner", "write", [[partner_id], {"email": email}])
    except Exception:
        pass

    return user_id


# -- PERFIL MEDICO (LEGACY) -----------------------------------------------------

def save_medical_profile(partner_id, data):
    """Guarda perfil medico en res.partner (legacy)."""
    _, s = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    rpc(
        "/web/dataset/call_kw",
        {
            "model": "res.partner",
            "method": "write",
            "args": [
                [int(partner_id)],
                {
                    "phone": data.get("phone"),
                    "email": data.get("email"),
                    "street": data.get("address"),
                    "comment": json.dumps(
                        {
                            "age": data.get("age"),
                            "sex": data.get("sex"),
                            "blood": data.get("blood"),
                            "allergies": data.get("allergies"),
                            "conditions": data.get("conditions"),
                            "healthIssues": data.get("healthIssues"),
                        }
                    ),
                },
            ],
            "kwargs": {},
        },
        session=s,
        timeout=25,
    )


def get_medical_profile(partner_id):
    """Lee perfil medico desde res.partner (legacy)."""
    _, s = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    result, _ = rpc(
        "/web/dataset/call_kw",
        {
            "model": "res.partner",
            "method": "read",
            "args": [[int(partner_id)], ["name", "phone", "email", "street", "comment"]],
            "kwargs": {},
        },
        session=s,
        timeout=25,
    )
    partner = (result or [{}])[0]
    extra = {}
    try:
        extra = json.loads(partner.get("comment") or "{}")
    except Exception:
        extra = {}
    out = dict(partner)
    out.update(extra)
    return out


# -- CONTACTOS DE EMERGENCIA (LEGACY) ------------------------------------------

def create_contact(parent_id, contact):
    _, s = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    contact_id, _ = rpc(
        "/web/dataset/call_kw",
        {
            "model": "res.partner",
            "method": "create",
            "args": [
                {
                    "name": contact["name"],
                    "phone": contact.get("phone"),
                    "email": contact.get("email"),
                    "parent_id": int(parent_id),
                    "comment": json.dumps(
                        {
                            "rel": contact.get("rel"),
                            "primary": bool(contact.get("primary", False)),
                            "emergelens_id": contact.get("emergelens_id"),
                        }
                    ),
                    "type": "contact",
                }
            ],
            "kwargs": {},
        },
        session=s,
        timeout=25,
    )
    return int(contact_id)


def get_contacts(parent_id):
    _, s = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    result, _ = rpc(
        "/web/dataset/call_kw",
        {
            "model": "res.partner",
            "method": "search_read",
            "args": [[["parent_id", "=", int(parent_id)]]],
            "kwargs": {"fields": ["id", "name", "phone", "email", "comment"]},
        },
        session=s,
        timeout=25,
    )
    contacts = []
    for c in result or []:
        extra = {}
        try:
            extra = json.loads(c.get("comment") or "{}")
        except Exception:
            extra = {}
        contacts.append(
            {
                "id": c["id"],
                "name": c.get("name"),
                "phone": c.get("phone"),
                "email": c.get("email"),
                **extra,
            }
        )
    return contacts


def update_contact(contact_id, data):
    _, s = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    # Merge comment JSON so we don't drop fields we don't explicitly set.
    existing_extra = {}
    try:
        rows, _ = rpc(
            "/web/dataset/call_kw",
            {
                "model": "res.partner",
                "method": "read",
                "args": [[int(contact_id)], ["comment"]],
                "kwargs": {},
            },
            session=s,
            timeout=25,
        )
        raw = (rows or [{}])[0].get("comment") or "{}"
        existing_extra = json.loads(raw) if isinstance(raw, str) else {}
    except Exception:
        existing_extra = {}

    next_extra = dict(existing_extra or {})
    next_extra.update(
        {
            "rel": data.get("rel"),
            "primary": bool(data.get("primary", False)),
            "emergelens_id": data.get("emergelens_id") or existing_extra.get("emergelens_id"),
        }
    )

    rpc(
        "/web/dataset/call_kw",
        {
            "model": "res.partner",
            "method": "write",
            "args": [
                [int(contact_id)],
                {
                    "name": data.get("name"),
                    "phone": data.get("phone"),
                    "email": data.get("email"),
                    "comment": json.dumps(
                        next_extra
                    ),
                },
            ],
            "kwargs": {},
        },
        session=s,
        timeout=25,
    )


def delete_contact(contact_id):
    _, s = rpc(
        "/web/session/authenticate",
        {"db": ODOO_DB, "login": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    rpc(
        "/web/dataset/call_kw",
        {
            "model": "res.partner",
            "method": "unlink",
            "args": [[int(contact_id)]],
            "kwargs": {},
        },
        session=s,
        timeout=25,
    )
