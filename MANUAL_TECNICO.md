# Manual Técnico — SOS EmergeLens (Ampliado / Sin Resúmenes)

**Nombre:** SOS EmergeLens  
**Tipo:** Manual Técnico  
**Versión:** 2.0 (ampliado)  
**Fecha:** 03/05/2026  
**Autor:** Nashly Adriana Magallanes Feliz  

---

## 0) Propósito de este documento (y reglas de uso)

Este manual técnico está orientado a:

- Desarrolladores que deben **instalar, ejecutar, depurar, extender y desplegar** el proyecto.
- Administradores técnicos que deben entender la **arquitectura, endpoints, modelos y variables**.

Regla de lectura:

- Aquí NO se “resume”. Se detalla lo que existe en el repo, con pasos reproducibles.
- Los fragmentos de código y ejemplos aquí están escritos para que puedas “copiar/pegar” y probar.
- Cuando un flujo depende de variables o servicios externos (SMTP, Groq, etc.) se explica exactamente qué pasa con y sin configuración.

---

## 1) Arquitectura real del proyecto (servicios, puertos y flujo de datos)

### 1.1 Servicios (Docker Compose)

El proyecto se ejecuta como un stack de 4 servicios bajo `docker-compose.yml`:

- `db` — PostgreSQL 15  
  - Es la base de datos usada por Odoo.
  - Persistencia: volume `pgdata`.

- `odoo` — Odoo 17  
  - Sirve como capa de datos/lógica del negocio mediante addons custom.
  - UI y JSON-RPC: `http://localhost:8069`
  - Persistencia: volume `odoodata` (filestore y otros).
  - Addons custom montados desde `./odoo/addons` hacia `/mnt/extra-addons`.

- `backend` — Flask (Python 3.11)  
  - Expone endpoints bajo `/api/*`.
  - Mantiene sesión de usuario en cookie (Flask sessions).
  - Se comunica con Odoo por JSON-RPC/HTTP.
  - Health: `http://localhost:5000/api/health`

- `frontend` — React 18 + Vite 5  
  - UI web que consume `/api/*` y mantiene sesión por cookie.
  - Dev server: `http://localhost:5173`

### 1.2 Flujo de datos (diagrama)

```
Browser (Frontend Vite :5173)
  -> fetch /api/* (credentials: include)
       -> Backend Flask (:5000)
            -> JSON-RPC/HTTP -> Odoo 17 (:8069) -> PostgreSQL 15
            -> SMTP (opcional) -> correos (OTP, SOS, recibos)
            -> Groq (opcional) -> Chat IA (LLM)
            -> Groq Whisper (opcional) -> transcripción de audio
            -> Open-Meteo (sin API key) -> alertas climáticas
            -> Nominatim (opcional) -> geocoding (proxy en backend)
```

### 1.3 Persistencia

- Base de datos: Postgres (contenedor `db`) con volume `pgdata`.
- Archivos Odoo (filestore): volume `odoodata`.
- Archivos del repo: bind mounts (código backend y frontend montado en contenedores para desarrollo).

---

## 2) Requisitos de entorno y dependencias (qué necesitas y por qué)

### 2.1 Recomendado (Docker)

Necesitas:

- Docker Desktop (Windows/Mac) o Docker Engine (Linux).
- Docker Compose.
- RAM recomendada: 4GB+ (por Odoo + Postgres + Node + Python).

Por qué Docker:

- Evita instalación manual de Odoo 17 + Postgres.
- Asegura misma versión de stack en cada máquina.

### 2.2 Modo desarrollo sin Docker (no recomendado para este repo)

Implicaría:

- Instalar Postgres 15.
- Instalar Odoo 17 con dependencias (Python, wkhtmltopdf si aplica, etc.).
- Instalar backend (Python 3.11) y frontend (Node 20+).

Este manual se centra en Docker porque es como está diseñado el repo.

---

## 3) Instalación y ejecución local (Docker Compose) — paso por paso

### 3.1 Preparar variables de entorno

1) Crea `.env` a partir del ejemplo:

```powershell
copy .env.example .env
```

2) Edita `.env` y ajusta:

- `ADMIN_EMAIL`
- `ADMIN_ODOO_EMAIL`
- `ADMIN_ODOO_PASS`
- `SECRET_KEY`
- SMTP si vas a enviar correos
- `GROQ_API_KEY` si vas a usar chat IA y transcripción

> Importante: `.env` NO debe subirse a Git.

### 3.2 Levantar el stack

```bash
docker compose up --build
```

Verifica:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000/api/health`
- Odoo: `http://localhost:8069`

### 3.3 Detener el stack

```bash
docker compose down
```

### 3.4 Reinicio “desde cero” (BORRA DATOS)

Si ejecutas:

```bash
docker compose down -v
```

Se borran:

- Postgres (`pgdata`)
- Filestore Odoo (`odoodata`)

No se recupera sin backup.

---

## 4) Docker Compose: configuración real (qué hace cada bloque)

### 4.1 Servicio `db` (Postgres 15)

Características:

- Usuario/contraseña por defecto: `odoo`/`odoo` (solo dev local).
- DB por defecto: `sosemergelens`.
- Healthcheck con `pg_isready`.
- Persistencia en `pgdata`.

### 4.2 Servicio `odoo` (Odoo 17)

Montajes:

- `./odoo/config/odoo.conf` -> `/etc/odoo/odoo.conf`
- `./odoo/addons` -> `/mnt/extra-addons`
- `odoodata` -> `/var/lib/odoo`

Comando de arranque:

- Instala y actualiza addons: `emergelens` y `emergelens_donations`.

### 4.3 Servicio `backend` (Flask)

Puntos clave:

- `ODOO_URL=http://odoo:8069` (comunicación interna por red Docker).
- Variables SMTP y flags de notificación por correo.
- Variables Groq (IA).
- `DEV_OTP_ECHO` para desarrollo: opcional, expone el OTP en JSON (NO en producción).

### 4.4 Servicio `frontend` (Vite)

Puntos clave:

- Monta `./frontend` en `/app` para desarrollo.
- Conserva `node_modules` dentro del contenedor para evitar conflicto Windows.

---

## 5) Odoo: configuración, addons y modelos (la “base de datos del sistema”)

### 5.1 Configuración Odoo (`odoo/config/odoo.conf`)

Contenido real:

```ini
[options]
addons_path = /mnt/extra-addons,/usr/lib/python3/dist-packages/odoo/addons
admin_passwd = 2408
db_host = db
db_port = 5432
db_user = odoo
db_password = odoo
db_name = sosemergelens
http_port = 8069
http_interface = 0.0.0.0
log_level = info
workers = 0
```

Qué significa cada clave:

- `addons_path`: incluye los addons custom montados desde `/mnt/extra-addons`.
- `admin_passwd`: master password de Odoo (para acciones administrativas).
- `db_*`: conexión a Postgres (servicio `db`).
- `db_name`: base principal donde se instalan los addons.
- `workers=0`: modo single-process (adecuado para dev).

### 5.2 Addons custom

Carpetas:

- `odoo/addons/emergelens/` (addon core)
- `odoo/addons/emergelens_donations/` (addon donaciones)

### 5.3 Modelos Odoo (core) — lo que existe realmente

Archivo: `odoo/addons/emergelens/models/models.py`

Modelos definidos (lista exacta):

- `x.emergelens.profile` (perfil médico + contactos + foto + emergelens_id)
- `x.emergelens.chat` (conversaciones IA)
- `x.emergelens.message` (mensajes IA)
- `x.emergelens.emergency` (incidentes de emergencia)
- `x.emergelens.notification` (notificaciones)
- `x.emergelens.med` (medicamentos)
- `x.emergelens.operator.chat` (chat operador-usuario)
- `x.emergelens.scheduled.msg` (mensajes programados por admin)
- `x.emergelens.audit` (auditoría)
- `x.emergelens.geofence` (zonas)
- `x.emergelens.geofence.event` (eventos de zona)

> Nota: para entender el flujo real, debes leer `backend/routes/*` que consume estos modelos.

### 5.4 Modelos Odoo (donaciones)

Archivo: `odoo/addons/emergelens_donations/models/donation.py`

Modelos:

- `x.emergelens.donation.request` (campaña)
- `x.emergelens.donation` (donación individual)
- `x.emergelens.donation.request.image` (imágenes)

Campos computados:

- `x_total_received`, `x_remaining_amount`, `x_donors_count`, `x_donations_count`, `x_helped_by_me`, etc.

---

## 6) Backend Flask: estructura completa (app, sesión, CORS, blueprints)

### 6.1 Archivo principal: `backend/app.py`

Responsabilidades:

- Crea la app Flask.
- Configura cookies de sesión.
- Configura CORS con `supports_credentials=True`.
- Registra blueprints.
- Implementa auditoría automática best-effort en `after_request`.
- Arranca schedulers (APScheduler + scheduler de operador) si corresponde.

#### 6.1.1 Sesión (cookies)

Se configuran:

- `SESSION_COOKIE_HTTPONLY=True`
- `SESSION_COOKIE_SAMESITE` (default `Lax`)
- `SESSION_COOKIE_SECURE` (default `0`, debe ser `1` en HTTPS)
- `PERMANENT_SESSION_LIFETIME` (default 7 días)

#### 6.1.2 CORS

`CORS_ORIGINS` default: `http://localhost:5173`

Importante:

- `credentials: "include"` en frontend es obligatorio para que el navegador mande la cookie.

#### 6.1.3 Registro de blueprints (mapa exacto)

Registrados bajo:

- `/api/auth` -> `backend/routes/auth.py`
- `/api/profile` -> `backend/routes/profile.py`
- `/api/contacts` -> `backend/routes/contacts.py`
- `/api/chat` -> `backend/routes/chat.py`
- `/api/lens` -> `backend/routes/lens_call.py`
- `/api/emergency` -> `backend/routes/Emergency.py`
- `/api/notifications` -> `backend/routes/notif_routes.py`
- `/api/meds` -> `backend/routes/meds.py`
- `/api/history` -> `backend/routes/history.py`
- `/api/operator_chat` -> `backend/routes/operator_chat.py`
- `/api/geofence` -> `backend/routes/geofence.py`
- `/api/donations` -> `backend/routes/donation.py`
- `/api` -> `backend/routes/audit.py` (blueprint con prefijo `/api`)
- `/api/reports` -> `backend/routes/reports.py`
- `/api/weather` -> `backend/routes/weather.py`

---

## 7) Seguridad: sesión, roles y validaciones (backend)

### 7.1 RBAC simple por email (admin)

Archivo: `backend/security.py`

Concepto:

- Un usuario es admin si su `session["email"]` coincide con `ADMIN_EMAIL`.
- `ADMIN_EMAIL` se toma de env: `ADMIN_EMAIL` o fallback `ADMIN_ODOO_EMAIL`.

Código real (extracto completo, funcional):

```python
ADMIN_EMAIL = (
    os.getenv("ADMIN_EMAIL", os.getenv("ADMIN_ODOO_EMAIL", "sosemergelens@gmail.com"))
    or ""
).strip()

def is_admin(email: str | None = None) -> bool:
    em = (email if email is not None else (session.get("email") or "")).strip()
    return bool(em and ADMIN_EMAIL and em == ADMIN_EMAIL)

def login_required(fn: Callable):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"error": "No autenticado"}), 401
        return fn(*args, **kwargs)
    return wrapper

require_admin = require_roles("admin")
```

### 7.2 `requester_email` (compatibilidad)

El backend incluye `enforce_requester_email_match()`:

- Si el frontend envía `requester_email`, debe coincidir con el email de la sesión.
- OJO: esto NO autoriza; solo detecta llamadas inconsistentes.

### 7.3 Validación de inputs

Archivo: `backend/validation.py`

Incluye:

- `clean_str`
- `require_email`
- `as_int`
- `as_float`

Ejemplo real:

```python
def require_email(value: Any, *, max_len: int = 254) -> str:
    s = clean_str(value, max_len=max_len)
    if not s or not _EMAIL_RE.match(s):
        raise ValueError("Email invalido")
    return s
```

---

## 8) Backend: integración con Odoo (JSON-RPC) — cómo está implementado

### 8.1 Dos estilos de acceso a Odoo en el repo (importante)

En el backend existen dos patrones usados:

1) `backend/odoo_client.py`  
   - Implementa helpers `rpc()` y `jsonrpc_call()` y cachea el uid del admin.
   - Se usa para auth/registro y llamadas `execute_kw`.

2) “Helpers internos por ruta” (`odoo_session` + `odoo_call`)  
   - Varias rutas implementan su propia sesión Odoo con cookie:
     - `requests.Session()` + POST a `/web/session/authenticate`
     - Llamadas a `/web/dataset/call_kw`

Esto significa que:

- No todo pasa por un único wrapper.
- Para depurar, debes revisar el helper local del archivo que falla.

### 8.2 `backend/odoo_client.py` (concepto operativo)

Características:

- Reintentos si Odoo está iniciando.
- Normalización de errores JSON-RPC.
- Cache del `admin_uid` para `execute_kw`.

Uso típico:

- Login/registro de usuario.
- Reportes agregados.
- Contactos legacy en `res.partner`.

---

## 9) Autenticación (Auth) + OTP (verificación de correo)

### 9.1 Rutas de Auth (backend)

Archivo: `backend/routes/auth.py`

Endpoints:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `POST /api/auth/email-otp/request`
- `POST /api/auth/email-otp/verify`

### 9.2 Sesión y persistencia de identidad

En login/register, se usa `set_session_user(uid, name, email)` para:

- `session["uid"]`
- `session["name"]`
- `session["email"]`
- `session["roles"]` (admin/user)

### 9.3 OTP store (in-memory) — implementación completa

Archivo: `backend/otp_store.py`

Propiedades reales:

- `OTP_LEN = 6`
- `OTP_TTL_SECONDS = 300` (5 minutos)
- `MAX_ATTEMPTS = 8`
- `RESEND_COOLDOWN_SECONDS = 20`
- `MAX_SENDS_PER_15MIN = 5`

Esto implica:

- No persiste entre reinicios.
- No funciona bien con multi-worker sin store compartido.

### 9.4 Flujo de OTP

1) Request OTP:

```bash
curl -X POST http://localhost:5000/api/auth/email-otp/request ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"user@email.com\"}"
```

2) Verify OTP:

```bash
curl -X POST http://localhost:5000/api/auth/email-otp/verify ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"user@email.com\",\"code\":\"123456\"}"
```

3) Register (requiere OTP verificado en la sesión):

```bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"User\",\"email\":\"user@email.com\",\"password\":\"12345678\"}"
```

> Nota técnica: el OTP se marca en `session["email_verified"]` y expira en 30 minutos para completar registro.

---

## 10) Perfil médico (Profile)

Archivo: `backend/routes/profile.py`  
Modelo Odoo: `x.emergelens.profile`

Endpoints:

- `GET  /api/profile/`
- `POST /api/profile/`
- `GET  /api/profile/instructions`
- `POST /api/profile/instructions`
- `GET  /api/profile/by-emergelens-id/<eid>`

### 10.1 Campos guardados (según backend + modelo)

El backend usa campos:

- `x_age`, `x_sex`, `x_address`, `x_phone`
- `x_blood`, `x_allergies`, `x_conditions`, `x_health_issues`
- `x_ec1_*` y `x_ec2_*`
- `x_custom_instructions`
- `x_photo` (data URL base64)
- `x_emergelens_id`

### 10.2 Generación de `EL-XXXX`

La función `generate_emergelens_id()`:

- Intenta 20 veces generar `EL-` + 4 dígitos.
- Verifica unicidad en Odoo por `search`.
- Fallback a `EL-` + 6 dígitos si hay colisiones repetidas.

---

## 11) Contactos (Contacts) — implementación real

Archivo: `backend/routes/contacts.py`

Concepto:

- Se usa `res.partner` como “contactos hijos” del usuario.
- Existe sincronización best-effort de contactos guardados en perfil (ec1/ec2) hacia `res.partner`.

Endpoints:

- `GET    /api/contacts/`
- `POST   /api/contacts/`
- `PUT    /api/contacts/<contact_id>`
- `DELETE /api/contacts/<contact_id>`

---

## 12) Emergencias (SOS) — backend + frontend + Odoo

### 12.1 Modelo Odoo: `x.emergelens.emergency`

Campos relevantes (según `models.py`):

- `x_user_id`, `x_name`, `x_email`
- `x_type` (medical/security/fire/accident)
- `x_status` (active/monitoring/resolved/false_alarm/cancelled)
- `x_lat`, `x_lng`, `x_address`
- `x_ts`, `x_started_at`, `x_ended_at`
- `x_battery`, `x_charging`
- `x_photo_evidence`, `x_audio_evidence`
- `x_unit`

### 12.2 Backend: `backend/routes/Emergency.py`

Responsabilidades:

- Upsert de emergencia activa del usuario (si ya existe active/monitoring, se actualiza).
- Endpoint de ubicación, evidencia, cancelación, estados, unidad.
- Notificación a contactos (vía `scheduler.notify_emergency_contacts`).

> Este archivo es largo: si necesitas depurar SOS, esta es la primera ruta a revisar.

### 12.3 Frontend: `frontend/src/pages/EmergencyActive.jsx`

Responsabilidades:

- Obtiene GPS en vivo.
- Obtiene batería (si disponible).
- Envía al backend:
  - ubicación periódicamente
  - evidencia (foto/audio)
  - cancelación con PIN
  - abre LENS Call Simulator

### 12.4 Endpoint de estado en vivo: `GET /api/emergency/my-alert`

El frontend hace polling cada ~4s para saber si el admin cambió el estado.

Regla temporal:

- Si el incidente más reciente tiene `x_ts` viejo (más de 6 horas), el backend responde `has_alert=false`.

---

## 13) Geofence (zonas seguras/peligrosas) — backend + frontend + Odoo

### 13.1 Modelos Odoo

- `x.emergelens.geofence`
- `x.emergelens.geofence.event`

### 13.2 Backend: `backend/routes/geofence.py`

Endpoints principales:

- `GET    /api/geofence/zones`
- `POST   /api/geofence/zones`
- `PATCH  /api/geofence/zones/<id>`
- `DELETE /api/geofence/zones/<id>`
- `GET    /api/geofence/zones/all?admin_email=...` (admin)
- `POST   /api/geofence/event`
- `POST   /api/geofence/danger/confirm` (yes/no)
- `GET    /api/geofence/events`
- `GET    /api/geofence/events/all?admin_email=...` (admin)
- `GET    /api/geofence/geocode?q=...` (proxy Nominatim)

### 13.3 Activación SOS desde geofence (confirmación)

`POST /api/geofence/danger/confirm`:

- Si `answer=no`:
  - Notifica al usuario “Ok. Mantente atento…”
  - Audita `danger_confirm_no`

- Si `answer=yes`:
  - Importa `get_profile` y `upsert_alert_odoo` desde `routes/Emergency`.
  - Activa SOS tipo `security`.
  - Notifica al usuario.
  - Audita `danger_confirm_yes`

---

## 14) Notificaciones (bandejas) — backend + Odoo

### 14.1 Modelo Odoo: `x.emergelens.notification`

Uso:

- Feed admin: `x_target_uid = False`
- Feed usuario: `x_target_uid = uid`

### 14.2 Helper: `backend/routes/notifications.py`

No es blueprint: contiene funciones para:

- crear notificación (`push_notification`)
- listar notificaciones admin (`get_notifications`)
- listar notificaciones por usuario (`get_user_notifications`)
- marcar como leídas
- borrar feeds

Incluye limpieza de texto y forzado ASCII best-effort.

### 14.3 Blueprint: `backend/routes/notif_routes.py`

Endpoints:

- Admin:
  - `GET  /api/notifications/`
  - `POST /api/notifications/read`
  - `POST /api/notifications/delete-all`
  - `GET  /api/notifications/unread-count`
- Usuario:
  - `GET  /api/notifications/mine`
  - `POST /api/notifications/mine/read`
  - `POST /api/notifications/mine/delete-all`
  - `GET  /api/notifications/mine/unread-count`
  - `POST /api/notifications/mine/push` (solo `med_reminder`)
- Tip diario:
  - `POST /api/notifications/daily-tip`
- Debug:
  - `POST /api/notifications/debug/push`
  - `GET  /api/notifications/debug/status`

---

## 15) Medicamentos (CRUD) + recordatorios

### 15.1 Backend: `backend/routes/meds.py`

Modelo Odoo: `x.emergelens.med`

Endpoints:

- `GET    /api/meds/`
- `POST   /api/meds/`
- `PUT    /api/meds/<id>`
- `DELETE /api/meds/<id>` (soft delete `x_active=False`)

Propiedad importante:

- PUT/DELETE valida que el med pertenezca al `uid` de la sesión.

### 15.2 Scheduler (APScheduler): `backend/scheduler.py`

Job:

- `check_med_reminders` cada minuto (cron).

Y:

- `generate_daily_tip(uid)`
- `notify_emergency_contacts(...)`

> Nota: el scheduler se puede desactivar con `DISABLE_SCHEDULERS=1`.

---

## 16) Historial (History) — incidentes y geofence events

### 16.1 Backend: `backend/routes/history.py`

Qué devuelve:

- Incidentes del usuario.
- Incidentes de usuarios donde el usuario actual figura como contacto (ec1/ec2 email).
- Si admin: todos los incidentes y eventos de geofence.

Incluye:

- `as_contact=True` cuando el incidente no es del usuario, sino de alguien que lo tiene como contacto.

Endpoints:

- `GET    /api/history/`
- `PATCH  /api/history/<id>` (actualiza campos permitidos; admin puede más)
- `DELETE /api/history/<id>` (admin puede cualquiera; usuario solo propios no activos)

---

## 17) Auditoría (Audit) — modelo, acciones válidas, endpoints y UI

### 17.1 Backend: `backend/routes/audit.py`

Modelo Odoo: `x.emergelens.audit`

Acciones válidas (`VALID_ACTIONS`):

- login, logout, register
- sos_activated, sos_cancelled
- profile_updated
- evidence_sent
- status_changed
- message_sent
- password_changed
- contact_created, contact_updated, contact_deleted
- geofence_exit_safe, geofence_enter_danger
- danger_confirm_no, danger_confirm_yes

Regla:

- Si una acción no está en `VALID_ACTIONS`, se ignora silenciosamente.

### 17.2 Frontend: `frontend/src/components/AuditLog.jsx`

UI:

- filtros por acción
- paginación
- exportaciones (si endpoints lo soportan)

---

## 18) Chat LENS (texto) + transcripción (audio) — backend

### 18.1 Backend: `backend/routes/chat.py`

Incluye:

- Chat IA (Groq) usando `GROQ_API_KEY`.
- Transcripción de audio usando Whisper vía Groq.
- Persistencia en Odoo:
  - `x.emergelens.chat`
  - `x.emergelens.message`

Degradación:

- Si no hay `GROQ_API_KEY`, responde con fallback (no revienta endpoint).

Detección de peligro:

- Si IA devuelve marcador `[ALERTA_SOS]`, el backend:
  - marca `is_emergency=true`
  - envía notificación al feed admin (tipo `danger_detected`)

---

## 19) LENS Call Simulator (operadora por voz) — backend + frontend

### 19.1 Backend: `backend/routes/lens_call.py`

Características:

- Prompt con reglas estrictas (operadora 911, 1 pregunta a la vez, sin emojis).
- Contexto por tipo de emergencia (medical/security/fire/accident).
- Cierre controlado después de varios intercambios (una sola vez).
- Anti-repetición y filtros para no decir frases prohibidas (“alerta enviada”, etc.).

Endpoint (prefijo por blueprint):

- `POST /api/lens/message`

Payload típico (frontend envía algo equivalente):

```json
{
  "message": "Me duele el pecho",
  "eType": "medical",
  "userName": "Maria",
  "lat": 18.48,
  "lng": -69.93,
  "history": [
    {"role":"assistant","content":"..."},
    {"role":"user","content":"..."}
  ]
}
```

### 19.2 Frontend: `frontend/src/pages/CallSimulator.jsx`

Implementa:

- TTS: `SpeechSynthesisUtterance`
- STT: `SpeechRecognition` / `webkitSpeechRecognition`
- Lógica de “commit por silencio” (buffer interim/final).
- Modal PIN al colgar para cancelar emergencia (según flujo).

---

## 20) Chat Operador (admin <-> usuario) + mensajes automáticos

### 20.1 Backend: `backend/routes/operator_chat.py`

Modelos Odoo:

- `x.emergelens.operator.chat`
- `x.emergelens.scheduled.msg`

Endpoints:

- Usuario:
  - `GET  /api/operator_chat/operator-chat/<user_id>?requester_email=...`
  - `POST /api/operator_chat/operator-chat/send`
  - `GET  /api/operator_chat/operator-chat/unread/<user_id>`
- Admin:
  - `GET  /api/operator_chat/users?admin_email=...`
  - Schedule:
    - `GET/POST /api/operator_chat/schedule`
    - `POST /api/operator_chat/schedule/generate-ai`
    - `PATCH /api/operator_chat/schedule/<id>/toggle`
    - `DELETE /api/operator_chat/schedule/<id>`

Scheduler interno (thread):

- `start_scheduler()` inicia un loop que verifica horarios `HH:MM` y envía mensajes programados.
- Controla idempotencia “una vez por día por horario”.

### 20.2 Frontend (usuario): `frontend/src/components/OperatorChat.jsx`

Características:

- Polling:
  - si chat abierto: mensajes cada ~1500ms
  - si chat cerrado: unread count cada ~5s
- Optimistic UI al enviar.
- “pendientes nuevos” si el usuario no está scrolleado al final.

### 20.3 Frontend (admin): `frontend/src/components/AdminOperatorPanel.jsx`

Incluye:

- Lista de usuarios con unread_count.
- Ventana chat admin->usuario.
- Gestión de schedules (automáticos).

---

## 21) Donaciones (campañas + contribuciones + imágenes + recibos)

### 21.1 Backend: `backend/routes/donation.py`

Modelos Odoo:

- `x.emergelens.donation.request`
- `x.emergelens.donation`
- `x.emergelens.donation.request.image`

Endpoints (prefijo `/api/donations`):

- `GET    /`
- `POST   /` (crear campaña)
- `DELETE /<id>` (eliminar campaña)
- `POST   /<id>/contribute` (donar)
- `GET    /<id>/contributors`

Características:

- Sesión HTTP compartida con pool grande (evita “connection pool is full”).
- Recibo por email (si SMTP está configurado).
- Notificaciones a dueño de campaña.

### 21.2 Frontend: `frontend/src/pages/Donations.jsx`

Incluye:

- Modales:
  - Crear campaña (foto opcional + título + descripción + meta).
  - Editar campaña (con preview + drag-to-reposition).
  - Donar (flujo 2 pasos con OTP demo).
  - Lista de donantes.
  - Vista de campaña.

OTP demo del pago:

- Se genera client-side, se muestra vía notificación del sistema.
- Se valida client-side antes de enviar.

> Esto es un flujo demo (no pasarela real).

---

## 22) Weather (alertas climáticas) — backend

Archivo: `backend/routes/weather.py`

Características:

- Consulta Open-Meteo sin API key.
- Cache TTL 10 minutos.
- Devuelve nivel (`green`/`yellow`/`orange`/`red`) y descripción.
- Coordenadas por defecto: Santo Domingo (RD).

Endpoints:

- `GET /api/weather/alerts`
- `GET /api/weather/ping`

---

## 23) Frontend: estructura técnica (dónde está cada cosa)

### 23.1 Entradas principales

- `frontend/src/App.jsx`:
  - controla páginas: welcome/auth/onboarding/dash/emergency
  - polling de `GET /api/emergency/my-alert`
  - inicializa recordatorios
  - dispara auditoría de navegación (aunque el backend ignora `page_view` por diseño)

- `frontend/src/api.js`:
  - wrapper `call(endpoint, method, body)` con `credentials: "include"`
  - funciones: login/register/logout, profile, contacts, etc.

- `frontend/src/store.jsx`:
  - estado global (user, meds, contacts, eType, pin, etc.)

### 23.2 Páginas

Ubicación: `frontend/src/pages/`

- `Welcome.jsx`
- `Auth.jsx`
- `Onboardingform.jsx`
- `Dashboard.jsx`
- `Home.jsx`
- `EmergencyActive.jsx`
- `Profile.jsx`
- `Contacts.jsx`
- `Medical.jsx`
- `History.jsx`
- `SafeZone.jsx`
- `Notifications.jsx` (campana/modal)
- `Chat.jsx` (chat IA)
- `CallSimulator.jsx` (llamada simulada)
- `Donations.jsx`
- `AdminAlerts.jsx` (panel admin)

### 23.3 Componentes relevantes

- `frontend/src/components/OperatorChat.jsx` (chat operador flotante)
- `frontend/src/components/AuditLog.jsx` (auditoría UI)
- `frontend/src/components/Adminoperatorpanel.jsx` (panel operador admin)
- `frontend/src/components/AdminGeofence.jsx` (geofence admin)
- `frontend/src/components/SOSAlert.jsx` (notificación flotante para contactos)

---

## 24) SMTP (correo) — configuración exacta y cómo probar

Archivo: `backend/mailer.py`

Variables:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `SMTP_SSL` (1/0)
- `SMTP_STARTTLS` (1/0)
- `MAIL_FROM`, `MAIL_FROM_NAME`

Cómo probar en runtime:

- Existe endpoint debug en emergencias: `POST /api/emergency/debug/smtp` (requiere sesión autenticada).

Si SMTP no está configurado:

- `mailer.send_email` lanza error “SMTP no configurado…”.
- Los flujos que dependen de correo deben manejarlo best-effort (ver rutas).

---

## 25) Groq (IA) — configuración exacta y qué rompe si no está

Variables:

- `GROQ_API_KEY` (vacío = modo fallback para chat y tip diario).
- `GROQ_MODEL` (default `llama-3.3-70b-versatile`).

Si no hay `GROQ_API_KEY`:

- Chat IA (`/api/chat/message`) responde con fallback.
- Transcripción (`/api/chat/transcribe`) responde friendly failure (no transcribe).
- Tip diario: usa `FALLBACK_TIPS`.
- Admin schedule AI generator: usa fallback local.
- LENS Call Simulator (`/api/lens/message`): responde fallback.

---

## 26) Backups y recuperación (entorno Docker)

### 26.1 Backup desde UI de Odoo

1) Entra a Odoo: `http://localhost:8069`
2) Ve a la pantalla de gestión de bases de datos (según configuración de Odoo).
3) Usa “Backup” y descarga el `.zip`.

### 26.2 Backup Postgres

Si tienes acceso a `pg_dump` en un entorno adecuado:

- Base: `sosemergelens`
- Usuario: `odoo`

Ejemplo (conceptual):

```bash
pg_dump -h localhost -U odoo -d sosemergelens > backup.sql
```

> En Docker, esto suele hacerse ejecutando `pg_dump` dentro del contenedor de Postgres o exponiendo puertos según configuración.

---

## 27) Diagnóstico y depuración (procedimientos concretos)

### 27.1 Verificar salud de servicios

Backend:

```bash
curl http://localhost:5000/api/health
```

Weather:

```bash
curl http://localhost:5000/api/weather/ping
```

### 27.2 Verificar sesión (cookie)

1) Haz login desde el frontend.
2) Luego prueba:

```bash
curl http://localhost:5000/api/auth/me
```

Si responde 401:

- No estás enviando cookie.
- En `curl`, debes usar `-c` y `-b` (cookie jar) o probar desde navegador.

### 27.3 Depurar Odoo JSON-RPC

Si fallan rutas con “No se pudo conectar a Odoo”:

- Asegúrate que el contenedor `odoo` está healthy.
- Revisa que `ODOO_URL` apunte a `http://odoo:8069` dentro de Docker.
- Revisa credenciales `ADMIN_ODOO_EMAIL` y `ADMIN_ODOO_PASS`.

### 27.4 Problemas de encoding/mojibake

Este repo tiene la regla “ASCII only” en algunos archivos backend para evitar texto raro en UI.

Documentos `.md` deben guardarse en UTF-8 (preferible con BOM en Windows).

---

## 28) Anexo A — Variables de entorno (lista exhaustiva por módulo)

### Backend (Flask)

- `SECRET_KEY`
- `CORS_ORIGINS`
- `SESSION_DAYS`
- `SESSION_SAMESITE`
- `SESSION_COOKIE_SECURE`
- `DISABLE_SCHEDULERS`

### Odoo (conexión backend)

- `ODOO_URL`
- `ODOO_DB`
- `ADMIN_ODOO_EMAIL`
- `ADMIN_ODOO_PASS`
- `ADMIN_EMAIL`

### SMTP

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SSL`
- `SMTP_STARTTLS`
- `MAIL_FROM`
- `MAIL_FROM_NAME`
- `ENABLE_EMAIL_NOTIFICATIONS`
- `MED_REMINDER_EMAIL_TO_CONTACTS`
- `EMERGENCY_CONTACT_ALERT_EMAIL`
- `OPERATOR_EMAIL_NOTIFS`

### Groq

- `GROQ_API_KEY`
- `GROQ_MODEL`

### Geocoding / Geofence

- `NOMINATIM_URL`
- `NOMINATIM_EMAIL`
- `NOMINATIM_UA`
- `GEOCODE_CACHE_TTL_S`

### Scheduler / Timezone

- `SCHEDULE_TZ` (operator schedule loop)
- `TZ` (fallback)
- `DAILY_TIP_COOLDOWN_HOURS`
- `DAILY_TIP_MIN_SECONDS`

---

## 29) Anexo B — Endpoints (lista completa con prefijos)

> Nota: este anexo lista rutas por área. Para payloads exactos, revisa el archivo del blueprint correspondiente.

### Auth

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `POST /api/auth/email-otp/request`
- `POST /api/auth/email-otp/verify`

### Profile

- `GET  /api/profile/`
- `POST /api/profile/`
- `GET  /api/profile/instructions`
- `POST /api/profile/instructions`
- `GET  /api/profile/by-emergelens-id/<eid>`

### Contacts

- `GET    /api/contacts/`
- `POST   /api/contacts/`
- `PUT    /api/contacts/<id>`
- `DELETE /api/contacts/<id>`

### Emergency

- `POST  /api/emergency/email`
- `POST  /api/emergency/location`
- `POST  /api/emergency/evidence`
- `POST  /api/emergency/cancel`
- `GET   /api/emergency/alerts` (admin)
- `GET   /api/emergency/contact-alerts` (contactos)
- `PATCH /api/emergency/status/<alert_id>`
- `PATCH /api/emergency/unit/<alert_id>`
- `GET   /api/emergency/my-alert`
- `GET   /api/emergency/debug/alert`
- `POST  /api/emergency/debug/smtp`

### Notifications

- `GET  /api/notifications/` (admin)
- `POST /api/notifications/read` (admin)
- `POST /api/notifications/delete-all` (admin)
- `GET  /api/notifications/unread-count` (admin)
- `GET  /api/notifications/mine`
- `POST /api/notifications/mine/read`
- `POST /api/notifications/mine/delete-all`
- `GET  /api/notifications/mine/unread-count`
- `POST /api/notifications/mine/push`
- `POST /api/notifications/daily-tip`
- `POST /api/notifications/debug/push`
- `GET  /api/notifications/debug/status`

### Meds

- `GET    /api/meds/`
- `POST   /api/meds/`
- `PUT    /api/meds/<id>`
- `DELETE /api/meds/<id>`

### History

- `GET    /api/history/`
- `PATCH  /api/history/<id>`
- `DELETE /api/history/<id>`

### Chat

- `GET  /api/chat/conversations`
- `POST /api/chat/conversations`
- `GET  /api/chat/conversations/<id>/messages`
- `POST /api/chat/message`
- `POST /api/chat/transcribe`
- (otros endpoints internos según archivo)

### LENS Call

- `POST /api/lens/message`

### Operator Chat

- `GET  /api/operator_chat/operator-chat/<user_id>`
- `POST /api/operator_chat/operator-chat/send`
- `GET  /api/operator_chat/operator-chat/unread/<user_id>`
- `GET  /api/operator_chat/users`
- `GET/POST /api/operator_chat/schedule`
- `POST /api/operator_chat/schedule/generate-ai`
- `PATCH /api/operator_chat/schedule/<id>/toggle`
- `DELETE /api/operator_chat/schedule/<id>`

### Geofence

- `GET    /api/geofence/geocode`
- `GET    /api/geofence/zones`
- `POST   /api/geofence/zones`
- `PATCH  /api/geofence/zones/<id>`
- `DELETE /api/geofence/zones/<id>`
- `GET    /api/geofence/zones/all` (admin)
- `POST   /api/geofence/event`
- `POST   /api/geofence/danger/confirm`
- `GET    /api/geofence/events`
- `GET    /api/geofence/events/all` (admin)

### Donations

- `GET    /api/donations/`
- `POST   /api/donations/`
- `DELETE /api/donations/<id>`
- `POST   /api/donations/<id>/contribute`
- `GET    /api/donations/<id>/contributors`

### Reports

- `GET /api/reports/donations/summary` (admin)

### Weather

- `GET /api/weather/alerts`
- `GET /api/weather/ping`

