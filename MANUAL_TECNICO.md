# Manual Técnico — SOS EmergeLens

**Nombre:** SOS EmergeLens  
**Tipo:** Manual Técnico  
**Versión:** 1.0  
**Fecha:** 30/04/2026  
**Autor:** Nashly Adriana Magallanes Feliz  

## 1. Resumen

SOS EmergeLens es una aplicación web orientada a emergencias y ayuda comunitaria. Corre en 4 servicios (Docker Compose): **PostgreSQL + Odoo 17 + Backend Flask + Frontend React/Vite**.  
El **frontend** consume al **backend** vía `/api/*` y el **backend** persiste/consulta datos en **Odoo** usando JSON-RPC/HTTP.  
Incluye módulos de emergencia (SOS), chat asistido por IA (Groq), transcripción de audio (Whisper vía Groq), notificaciones, geofence, donaciones y reportes/documentos.

## 2. Stack tecnológico (verificado en el repo)

- **Frontend:** React 18 + Vite 5, CSS custom, Leaflet + React-Leaflet
- **Backend:** Python 3.11, Flask, Flask-CORS, Requests, APScheduler, python-dotenv, fpdf2
- **ERP/DB:** Odoo 17 + PostgreSQL 15 (modelos `x.emergelens.*`)
- **IA (opcional):** Groq Chat Completions + Groq Whisper (transcripción)  
- **Reportes/Documentos:** ReportLab (scripts en `reportland/`)
- **Infra local:** Docker + Docker Compose

## 3. Arquitectura (alto nivel)

Servicios (Docker Compose) — `docker-compose.yml`:

- `db` (PostgreSQL 15) → puerto interno 5432
- `odoo` (Odoo 17) → `http://localhost:8069`
- `backend` (Flask) → `http://localhost:5000`
- `frontend` (Vite dev server) → `http://localhost:5173`

Diagrama de flujo (datos):

```
Browser (5173)
  └── fetch /api/* (cookies)
        └── Flask (5000)
              ├── JSON-RPC/HTTP -> Odoo (8069) -> Postgres (5432)
              ├── SMTP (opcional) -> correos
              ├── Groq Chat (opcional) -> respuestas IA
              └── Groq Whisper (opcional) -> transcripción de audio
```

Persistencia:

- Volume `pgdata` → datos PostgreSQL (BD Odoo)
- Volume `odoodata` → filestore Odoo (adjuntos/archivos)

## 4. Estructura del repositorio

- `frontend/` — UI React (pages/components/hooks/lib)
- `backend/` — API Flask (rutas, scheduler, seguridad, mailer)
- `odoo/`
  - `odoo/config/odoo.conf` — configuración Odoo (addons_path, DB, admin_passwd)
  - `odoo/addons/emergelens` — addon principal
  - `odoo/addons/emergelens_donations` — addon de donaciones
- `reportland/` — generadores de PDFs/HTML (documentación del proyecto)

## 5. Despliegue local (Docker Compose)

Comando principal:

```bash
docker compose up --build
```

URLs:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:5000/api/health`
- Odoo: `http://localhost:8069`

Notas importantes:

- Odoo se levanta con `-i` y `-u` para instalar/actualizar addons (ver `docker-compose.yml` comando de `odoo`).
- Si ejecutas `docker compose down -v`, pierdes BD/filestore (volúmenes). Sin backup no se recupera.

### 5.1 Backups recomendados (técnico)

- **Odoo UI:** “Manage Databases” → **Backup** (descarga `.zip`).
- **Postgres:** `pg_dump` del DB `sosemergelens` (si estás en un entorno con acceso).

## 6. Variables de entorno (principales)

Fuente: `.env` (no versionar) + `docker-compose.yml` + defaults en código.

Backend (Flask) — `backend/app.py`:

- `SECRET_KEY` (recomendado definir siempre)
- `CORS_ORIGINS` (ej: `http://localhost:5173`)
- `SESSION_DAYS`, `SESSION_SAMESITE`, `SESSION_COOKIE_SECURE`
- `DISABLE_SCHEDULERS` (si `1`, desactiva jobs en background)

Odoo (conexión desde backend):

- `ODOO_URL` (en Docker: `http://odoo:8069`)
- `ODOO_DB` (por defecto `sosemergelens`)
- `ADMIN_ODOO_EMAIL`, `ADMIN_ODOO_PASS` (usuario admin que usa el backend para operaciones server-side)
- `ADMIN_EMAIL` (define quién es “admin” para RBAC simple por email)

Correo (opcional) — `backend/mailer.py`:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `SMTP_SSL` / `SMTP_STARTTLS`
- `MAIL_FROM`, `MAIL_FROM_NAME`
- `ENABLE_EMAIL_NOTIFICATIONS` (1/0)

IA (opcional) — `backend/routes/lens_call.py`, `backend/routes/chat.py`, `backend/routes/operator_chat.py`, `backend/scheduler.py`:

- `GROQ_API_KEY`
- `GROQ_MODEL` (por defecto `llama-3.3-70b-versatile`)

Geocoding (opcional) — `backend/routes/geofence.py`:

- `NOMINATIM_URL`, `NOMINATIM_EMAIL`, `NOMINATIM_UA`
- `GEOCODE_CACHE_TTL_S`

## 7. Frontend (React/Vite)

Entrada y estilos:

- `frontend/src/App.jsx` — flujo de pantallas y polling de emergencia
- `frontend/src/index.css` — estilos globales (incluye sección `/* ===== SOS ===== */`)

Consumo de API:

- `frontend/src/api.js` — helper `call()` con `credentials: "include"` y JSON.

Pantallas clave:

- `frontend/src/pages/Auth.jsx` — login/registro
- `frontend/src/pages/Dashboard.jsx` — navegación principal
- `frontend/src/pages/Home.jsx` — selección de tipo y activación SOS  
  - Llamada a autoridades: intenta `tel:` en móvil; en desktop muestra modal con número (`VITE_EMERGENCY_NUMBER`, default `911`).
- `frontend/src/pages/EmergencyActive.jsx` — modo emergencia (mapa, evidencias, unidad asignada)
- `frontend/src/pages/Chat.jsx` — chat usuario con IA y/o operador según flujo
- `frontend/src/pages/Donations.jsx` — donaciones (modo demo con verificación)

Voz (LENS “llamada” simulada):

- `frontend/src/pages/CallSimulator.jsx`
  - TTS: `SpeechSynthesisUtterance`
  - STT: `SpeechRecognition`/`webkitSpeechRecognition` con `interimResults` y “commit por silencio”.

## 8. Backend (Flask)

Servidor principal:

- `backend/app.py`
  - Config de sesión (cookie) con `SESSION_COOKIE_HTTPONLY`, `SAMESITE`, `SECURE`.
  - CORS con `supports_credentials=True`.
  - Auditoría (best-effort) en `before_request`/`after_request`.
  - Registro de blueprints bajo `/api/*`.

Seguridad y validación:

- `backend/security.py`
  - `login_required`
  - `require_admin` y RBAC simple: admin = `ADMIN_EMAIL`
  - `enforce_requester_email_match` (compatibilidad; no autoriza por sí solo)
- `backend/validation.py` — sanitización y validaciones básicas

Scheduler / jobs:

- `backend/scheduler.py` (APScheduler)
  - Recordatorios meds
  - Consejo del día (con Groq opcional; fallback si no hay API key)
  - Notificación a contactos cuando alguien activa SOS (helper)

### 8.1 Mapa de endpoints (por blueprint)

Basado en `backend/app.py`:

- `/api/auth/*` → `backend/routes/auth.py` (login/register/logout/me)
- `/api/profile/*` → `backend/routes/profile.py` (perfil médico)
- `/api/contacts/*` → `backend/routes/contacts.py`
- `/api/emergency/*` → `backend/routes/Emergency.py` (SOS, ubicación, evidencia, unidad, estado)
- `/api/notifications/*` → `backend/routes/notif_routes.py` y `backend/routes/notifications.py`
- `/api/meds/*` → `backend/routes/meds.py`
- `/api/history/*` → `backend/routes/history.py`
- `/api/chat/*` → `backend/routes/chat.py` (Groq + Whisper; persistencia en Odoo)
- `/api/operator_chat/*` → `backend/routes/operator_chat.py` (chat admin<->usuario + schedule)
- `/api/geofence/*` → `backend/routes/geofence.py` (zonas + eventos + geocoding)
- `/api/donations/*` → `backend/routes/donation.py` (campañas + contribuciones + recibo)
- `/api/reports/*` → `backend/routes/reports.py`
- `/api/weather/*` → `backend/routes/weather.py` (Open-Meteo; sin API key)
- `/api/audit/*` → `backend/routes/audit.py` (log y lectura)

## 9. Integración con Odoo (addons y modelos)

Addons:

- `odoo/addons/emergelens` — módulo principal
- `odoo/addons/emergelens_donations` — donaciones

Modelos (principales) — `odoo/addons/emergelens/models/models.py`:

- `x.emergelens.profile` — perfil médico y contactos
- `x.emergelens.emergency` — incidentes
- `x.emergelens.notification` — notificaciones
- `x.emergelens.med` — medicamentos
- `x.emergelens.geofence` y `x.emergelens.geofence.event` — geofence
- `x.emergelens.chat` y `x.emergelens.message` — chat LENS/IA
- `x.emergelens.operator.chat` y `x.emergelens.scheduled.msg` — chat operador y mensajes programados
- `x.emergelens.audit` — auditoría

Donaciones — `odoo/addons/emergelens_donations`:

- `x.emergelens.donation.request` — campaña
- `x.emergelens.donation` — contribución

## 10. Reportes / Documentos (ReportLand)

En `reportland/` hay scripts de ReportLab para generar PDFs (manuales, cronograma, etc.).  
Ejemplo: `reportland/cro.py` genera un cronograma en PDF.

## 11. Validación del borrador (qué está bien / qué está mal)

**Bien (coincide con el repo):**

- Arquitectura 4 servicios (db/odoo/backend/frontend) y flujo `/api` → backend → Odoo.
- Backend con sesiones por cookies y CORS con credenciales.
- Voz en el frontend usando Web Speech API (TTS + SpeechRecognition).
- IA por Groq Chat Completions (LENS y generación de textos), y transcripción por Whisper vía Groq (en chat).
- Reportes con ReportLab en `reportland/`.

**Ajustes necesarios (para que el manual sea 100% real):**

- El folder correcto es `reportland/` (no `reportlab/`).
- “Whisper” está implementado en `backend/routes/chat.py` (chat), no en `lens_call` (llamada LENS).
- Seguridad: **no debes hardcodear** llaves y contraseñas en código. En este repo, Groq debe venir por `GROQ_API_KEY` en entorno (y `.env` no debe subirse).

## 12. Observaciones técnicas (mejoras recomendadas)

- **Secretos:** mantener todo en `.env` (SMTP, Groq, SECRET_KEY) y nunca versionarlo.
- **CSRF/producción:** al usar cookies, en un despliegue real conviene CSRF y `SESSION_COOKIE_SECURE=1` + HTTPS.
- **Rate limiting:** Odoo puede bloquear por muchos intentos de login (“Too many login failures”). Evitar reintentos automáticos agresivos.
- **Testing:** no hay suite de tests visible; recomendable agregar pruebas mínimas a endpoints críticos.

