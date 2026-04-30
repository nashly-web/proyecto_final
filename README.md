# SOS EmergeLens

Sistema web de asistencia y gestion de emergencias, con perfil medico, contactos de emergencia, alertas/notificaciones, geocercas (geofence), chat y modulo de donaciones comunitarias. La persistencia y la logica de negocio se soportan en **Odoo 17** (addons custom) y se exponen a traves de un **backend Flask** consumido por un **frontend React (Vite)**.

Repositorio: `https://github.com/nashly-web/proyecto_final.git`

## Tecnologias Utilizadas

- **Backend:** Python 3.11, Flask, Flask-CORS, Requests, APScheduler, python-dotenv, fpdf2
- **Frontend:** React 18, Vite 5, Leaflet + React-Leaflet
- **ERP/DB:** Odoo 17, PostgreSQL 15
- **Infra local:** Docker + Docker Compose
- **Reportes/documentos:** ReportLab (carpeta `reportland/`)

## Caracteristicas del Sistema

- Autenticacion y registro de usuarios (via Odoo)
- Perfil medico del usuario
- CRUD de contactos de emergencia
- Modulo de emergencias (estado, evidencia, historial)
- Notificaciones (y opcionalmente envio por correo)
- Recordatorios de medicamentos (jobs programados)
- Geofence (zona segura)
- Chat (usuario / operador)
- Donaciones comunitarias (campanas y contribuciones)
- Auditoria (registro de acciones clave)
- Generacion de documentos PDF (carpeta `reportland/`)

## Requisitos del Sistema

### Opcion recomendada (Docker)

- Docker Desktop (Windows/Mac) o Docker Engine (Linux)
- Docker Compose (incluido con Docker Desktop)
- RAM recomendada: 4GB+ (Odoo + Postgres + Node + Python)

### Opcion sin Docker (desarrollo)

- Python 3.11+
- Node.js 20+ (ver `frontend/Dockerfile`)
- PostgreSQL 15+
- Odoo 17 (con addons del proyecto)

## Instalacion del Proyecto

### 1- Clone de repositorio de GitHub

```bash
git clone https://github.com/nashly-web/proyecto_final.git
cd sos-emergelens
```

### 2- Configuracion

1. Crea tu archivo `.env` tomando como base `.env.example`:

```bash
copy .env.example .env
```

2. Ajusta variables segun tu entorno (especialmente SMTP si usaras correos).

Variables mas usadas (ver `docker-compose.yml`):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `SMTP_SSL` / `SMTP_STARTTLS`
- `MAIL_FROM`, `MAIL_FROM_NAME`
- `ENABLE_EMAIL_NOTIFICATIONS`, `MED_REMINDER_EMAIL_TO_CONTACTS`, `EMERGENCY_CONTACT_ALERT_EMAIL`
- `ADMIN_EMAIL` (correo que se tratara como admin dentro del backend)
- `ADMIN_ODOO_EMAIL`, `ADMIN_ODOO_PASS` (credenciales admin en Odoo usadas por el backend para operaciones server-side)

> Importante: `ADMIN_ODOO_EMAIL`/`ADMIN_ODOO_PASS` deben coincidir con un usuario admin valido en Odoo (ver alta inicial en `odoo/addons/emergelens/data/admin_user.xml`).

## Paso de ejecucion del proyecto (paso a paso)

### Levantar todo con Docker Compose

1. Construir y levantar servicios:

```bash
docker compose up --build
```

2. Verificar accesos:

- Frontend (Vite): `http://localhost:5173`
- Backend (Flask): `http://localhost:5000/api/health`
- Odoo: `http://localhost:8069`

3. Detener:

```bash
docker compose down
```

> Nota: los datos persisten en volumes (`pgdata`, `odoodata`). Para reiniciar desde cero, elimina volumes manualmente (esto borra datos).

## Reportes y documentos (ReportLand)

En `reportland/` hay scripts para generar documentos PDF del proyecto (por ejemplo cronograma, manuales).

- Requisito local: `pip install reportlab` (si no lo tienes en tu entorno Python).
- Ejemplo (cronograma):

```bash
python reportland/cro.py --start 2026-02-05 --end 2026-04-26 --out reportland/cronograma_proyecto.pdf
```

## Estructura del Proyecto

- `docker-compose.yml`: orquestacion local (Postgres + Odoo + Backend + Frontend)
- `backend/`: API Flask (rutas en `backend/routes/`)
- `frontend/`: app React (Vite) y mapa (Leaflet)
- `odoo/`
  - `odoo/config/odoo.conf`: configuracion base de Odoo dentro del contenedor
  - `odoo/addons/emergelens`: modulo principal (modelos, vistas, permisos)
  - `odoo/addons/emergelens_donations`: modulo de donaciones
- `reportland/`: generadores y PDFs (documentacion del proyecto)

## Uso del Sistema

1. Abre el frontend en `http://localhost:5173`.
2. Crea cuenta o inicia sesion (el backend valida contra Odoo).
3. Completa tu perfil medico y contactos de emergencia.
4. Usa los modulos disponibles (emergencias, historial, geofence, chat, donaciones).

## Credenciales relevantes (DESARROLLO)

Este repositorio incluye credenciales de ejemplo para desarrollo local (Docker). **No uses estas credenciales en produccion** y evita subir contrasenas reales a GitHub.

- **PostgreSQL (Odoo):** definidas en `docker-compose.yml` (usuario/db por defecto para local).
- **Odoo (master password):** definida en `odoo/config/odoo.conf` (`admin_passwd`).
- **Usuario admin inicial de Odoo:** definido por data del addon en `odoo/addons/emergelens/data/admin_user.xml`.
- **Backend (sesion):** define `SECRET_KEY` en entorno para evitar el valor inseguro por defecto en `backend/app.py`.

Recomendacion:

- Mueve contrasenas a `.env` y consume con variables (no hardcode).
- Mantiene `.env` fuera de Git (ver `.gitignore`) antes de publicar el repo.

## API utilizada y su implementacion (paso a paso)

### API de Odoo (JSON-RPC)

El backend consume **Odoo JSON-RPC** por HTTP, principalmente en:

- `backend/odoo_client.py` (auth/registro y llamadas `execute_kw`)
- Varias rutas en `backend/routes/*` (por ejemplo donaciones en `backend/routes/donation.py`)

Flujo general (resumen):

1. **Configurar variables** (desde `docker-compose.yml` / `.env`):
   - `ODOO_URL` (por defecto `http://odoo:8069` dentro de Docker)
   - `ODOO_DB` (por defecto `sosemergelens`)
   - `ADMIN_ODOO_EMAIL`, `ADMIN_ODOO_PASS` (credenciales server-side para operaciones con permisos)
2. **Autenticar** (obtiene `uid`):
   - Endpoint: `POST /web/session/authenticate`
3. **Operar sobre modelos** (CRUD):
   - Endpoint: `POST /jsonrpc`
   - Metodo: `execute_kw`
   - Ejemplo de modelos custom:
     - `x.emergelens.*` (modulo `emergelens`)
     - `x.emergelens.donation.*` (modulo `emergelens_donations`)
4. **Exponer API REST propia** para el frontend:
   - Frontend llama a `frontend/src/api.js` usando `fetch("/api/...")`
   - Backend responde bajo `/api/*` (ver `backend/app.py`)

## Autor(es)

- **Autor del desarrollo:** Nashly Adriana magallanes feliz
- **Administrador del proyecto:** Rijo

## Vincular el proyecto a GitHub

Este workspace aun no tiene commits ni remote configurado. Para publicarlo:

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/nashly-web/proyecto_final.git
git push -u origin main
```
