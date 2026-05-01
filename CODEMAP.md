# SOS EmergeLens - Codemap (resumen rapido)

Objetivo: dar contexto rapido de la arquitectura sin textos largos.

## Estructura

- `frontend/`: app React (Vite) que consume `GET/POST /api/*` con cookies de sesion.
- `backend/`: API Flask que habla con Odoo (JSON-RPC) y registra auditoria.
- `odoo/addons/`: addons custom de Odoo (modelos `x.emergelens.*`).
- `docker-compose.yml`: levanta Postgres + Odoo + backend + frontend.

## Frontend (React)

- `frontend/src/App.jsx`: router simple por pantallas (`welcome/auth/dash/emergency`).
- `frontend/src/store.jsx`: contexto global (usuario, contactos, eType, etc.).
- `frontend/src/api.js`: wrapper `call()` para hablar con el backend (`credentials: "include"`).

Paginas:
- `frontend/src/pages/Dashboard.jsx`: hub principal; integra geofence (`useGeofence`) y SOS.
- `frontend/src/pages/EmergencyActive.jsx`: flujo SOS activo (ubicacion/bateria, evidencia, llamada simulada).
- `frontend/src/pages/Contacts.jsx`: CRUD de contactos de emergencia; ahora tambien refleja los contactos guardados en el perfil (via backend).
- `frontend/src/pages/Chat.jsx`: chat informativo LENS (texto + nota de voz).
- `frontend/src/pages/Donations.jsx`: campanas de ayuda (donaciones) + fotos.
- `frontend/src/pages/Notifications.jsx`: bandeja de notificaciones + acciones rapidas (confirmar peligro SI/NO).

Componentes:
- `frontend/src/components/AuditLog.jsx`: UI de auditoria (filtros, export CSV/PDF, stats).
- `frontend/src/components/OperatorChat.jsx`: chat operador (admin <-> usuario).
- `frontend/src/components/Providers.jsx`: Toast/Modal providers.

Hooks:
- `frontend/src/hooks/useGeofence.js`: polling GPS y reportes a `/api/geofence/event`.

## Backend (Flask)

- `backend/app.py`: registra blueprints + auditoria automatica (after_request) para rutas criticas.
- `backend/security.py`: helpers de session, roles (admin por email).

Rutas:
- `backend/routes/auth.py`: login/register/logout; setea session y registra auditoria.
- `backend/routes/profile.py`: CRUD de perfil medico (modelo `x.emergelens.profile`).
- `backend/routes/contacts.py`: CRUD de contactos (res.partner hijos del usuario) y sincroniza ec1/ec2 del perfil.
- `backend/routes/Emergency.py`: SOS (email, location, evidencia, cancelar, estados, unidad).
- `backend/routes/geofence.py`: zonas seguras/peligrosas + confirmacion de peligro (auditoria + notifs).
- `backend/routes/audit.py`: guardar/leer auditoria (modelo `x.emergelens.audit`) + export CSV/PDF + stats.
- `backend/routes/operator_chat.py`: chat operador + mensajes programados (scheduler interno).
- `backend/routes/donation.py`: campanas de ayuda + contribuciones + fotos en Odoo.
- `backend/routes/chat.py`: chat IA (Groq) + persistencia de conversaciones en Odoo.

Integraciones:
- `backend/odoo_client.py`: cliente Odoo (auth, perfil legacy, contactos legacy en `res.partner`).
- `backend/mailer.py`: envio de correos (SMTP).

## Odoo (addons)

- `odoo/addons/emergelens/`: modelos principales (emergencias, geofence, notificaciones, auditoria, operador).
- `odoo/addons/emergelens_donations/`: modelos de donaciones:
  - `x.emergelens.donation.request`
  - `x.emergelens.donation.request.image`
  - `x.emergelens.donation`

## Flujos importantes (1 linea)

- SOS: `EmergencyActive.jsx` -> `/api/emergency/email` + `/api/emergency/location` -> Odoo `x.emergelens.emergency` + notificaciones.
- Geofence: `useGeofence.js` -> `/api/geofence/event` -> notificacion + auditoria; confirmacion -> `/api/geofence/danger/confirm`.
- Auditoria: `log_audit()` -> Odoo `x.emergelens.audit` -> UI `AuditLog.jsx` + exports.

