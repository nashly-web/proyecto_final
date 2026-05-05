# Tesis del Proyecto - SOS EmergeLens

**Título del proyecto:** SOS EmergeLens  
**Tipo de producto:** Aplicación web de asistencia y gestión de emergencias con enfoque comunitario  
**Arquitectura:** Frontend React (Vite) + Backend Flask + Odoo 17 (addons custom) + PostgreSQL 15  
**Repositorio referenciado:** `https://github.com/nashly-web/proyecto_final.git`  
**Autor del desarrollo:** Nashly Adriana Magallanes Feliz  
**Administrador del proyecto:** Rijo  

---

## Índice (lectura tipo tesis)

1. Resumen / Abstract  
2. Introducción  
3. Planteamiento del problema  
4. Justificación  
5. Objetivos (general y específicos)  
6. Alcance y limitaciones  
7. Metodología y planificación del trabajo  
8. Marco teórico (conceptos y tecnologías)  
9. Análisis de requisitos (funcionales y no funcionales)  
10. Diseño del sistema  
11. Implementación (detalle por módulos)  
12. Seguridad, privacidad y ética  
13. Pruebas y validación  
14. Despliegue y operación (Docker/Odoo/Flask/React)  
15. Manual de usuario y manual técnico (referencias internas)  
16. Riesgos y mitigaciones  
17. Resultados y discusión  
18. Conclusiones  
19. Trabajo futuro  
20. Anexos (variables de entorno, endpoints, modelos)  

---

## 1. Resumen

SOS EmergeLens es una aplicación web orientada a **reducir el tiempo de respuesta** y **aumentar la probabilidad de asistencia efectiva** ante situaciones de emergencia (médicas, seguridad, incendios y accidentes), integrando además funcionalidades de **apoyo comunitario** (donaciones) y herramientas de **acompañamiento** (chat con asistente LENS y canal operador-usuario).

El sistema se compone de cuatro servicios coordinados con Docker Compose:

- **PostgreSQL 15** (`db`): motor de base de datos utilizado por Odoo.
- **Odoo 17** (`odoo`): capa de persistencia y lógica de negocio mediante addons personalizados (modelos `x.emergelens.*`).
- **Backend Flask** (`backend`): API HTTP que autentica usuarios, orquesta flujos (SOS, geofence, notificaciones, donaciones) y se comunica con Odoo vía JSON-RPC/HTTP.
- **Frontend React + Vite** (`frontend`): interfaz de usuario web que consume `/api/*` y opera con cookies de sesión.

Las funciones centrales incluyen: autenticación con OTP para verificación de correo, perfil médico, contactos de emergencia, activación SOS con ubicación en vivo, evidencia (foto/audio), notificaciones y bandejas (admin y usuario), geofencing (zonas seguras/peligrosas con confirmación de peligro), recordatorios de medicamentos, auditoría de acciones, chat con IA (Groq) con transcripción de audio (Whisper vía Groq), chat operador-usuario, y módulo de donaciones comunitarias con campañas, contribuciones y comprobante por correo.

---

## 1.1 Abstract (English summary)

SOS EmergeLens is a web application designed to improve emergency response readiness by enabling SOS activation, real-time location sharing, evidence capture, notifications, geofencing-based safety checks, and community support through donation campaigns. The platform uses a 4-service architecture (PostgreSQL + Odoo 17 + Flask backend + React/Vite frontend). Data persistence and business logic reside in custom Odoo addons (`x.emergelens.*`), while the Flask API exposes REST-like endpoints under `/api/*`. The frontend maintains authenticated sessions via cookies and provides a crisis-oriented UX for rapid SOS activation.

---

## 2. Introducción

En contextos de emergencia, cada segundo importa. La disponibilidad de un canal que:

1) permita activar una alerta de forma inmediata,  
2) comparta ubicación y señales contextuales (tipo de emergencia, estado, evidencia),  
3) notifique a contactos relevantes y a un administrador/operador,  
4) deje trazabilidad (auditoría),  

puede ser determinante para reducir riesgos y facilitar decisiones informadas.

SOS EmergeLens se concibe como un sistema web moderno donde la **experiencia del usuario** se orienta a acciones rápidas y claras, especialmente en el modo de "emergencia activa". A nivel técnico, el proyecto explota una integración con Odoo 17 para centralizar modelos de datos (perfil, emergencia, notificaciones, chat, auditoría, donaciones) y facilitar administración desde el ERP si fuese necesario.

El proyecto incorpora además un componente de **asistencia inteligente** (LENS) capaz de responder preguntas, sugerir pasos básicos de seguridad o salud, y detectar señales de peligro para levantar alertas internas (por ejemplo, notificar al feed admin).

---

## 3. Planteamiento del problema

Las situaciones de emergencia suelen presentar múltiples desafíos simultáneos:

- El usuario puede estar en estrés, con movilidad limitada o sin claridad para explicar el evento.
- No siempre se cuenta con contactos informados o con una ubicación exacta.
- Las herramientas disponibles suelen estar fragmentadas: llamadas telefónicas por un lado, mensajería por otro, sin registro trazable.
- En algunas circunstancias, el usuario no sabe si la situación es verdaderamente peligrosa (por ejemplo, una zona sospechosa). Se requiere un mecanismo de confirmación y actuación guiada.

Por tanto, el problema se define como:

**¿Cómo proveer una plataforma web que permita activar, registrar y acompañar un evento de emergencia, compartiendo ubicación, evidencia y estado, notificando a actores relevantes, manteniendo trazabilidad y habilitando apoyo comunitario, todo con una arquitectura escalable y administrable?**

---

## 4. Justificación

Este proyecto se justifica en tres dimensiones:

### 4.1 Social

- Ayuda a canalizar alertas de emergencia hacia contactos de confianza y/o un operador.
- Promueve prevención a través de recordatorios (medicamentos) y consejos ("tip del día").
- Integra donaciones para apoyo comunitario, ofreciendo un canal estructurado para campañas y contribuciones.

### 4.2 Técnica

- Consolidación de lógica y datos en Odoo mediante addons custom: enfoque "ERP como backend de negocio".
- Backend Flask como capa de orquestación y exposición de endpoints limpios para el frontend.
- Frontend React con UX orientada a crisis, con mapas y evidencias.
- Integración opcional con IA (Groq) y transcripción (Whisper vía Groq).

### 4.3 Académica / formativa

- Aplica conceptos de arquitectura multicapa, integración con sistemas ERP, seguridad por sesiones, programación de tareas (APScheduler), diseño de APIs, y módulos funcionales de una app real.

---

## 5. Objetivos

### 5.1 Objetivo general

Diseñar e implementar un sistema web integral para asistencia y gestión de emergencias que permita activar alertas SOS, registrar y compartir ubicación/evidencia, notificar a contactos y administradores, y ofrecer módulos complementarios de prevención, comunicación y ayuda comunitaria.

### 5.2 Objetivos específicos

1. Implementar autenticación y registro de usuarios respaldado por Odoo, con verificación de email vía OTP.
2. Implementar perfil médico persistido en Odoo, incluyendo contactos principales y secundarios (ec1/ec2) e identificación tipo `EL-XXXX`.
3. Implementar el flujo SOS (activación, actualización de ubicación, evidencia, cancelación, cambio de estado y asignación de unidad).
4. Implementar notificaciones persistidas en Odoo con vistas separadas (feed admin y feed por usuario).
5. Implementar geofencing con zonas seguras/peligrosas, registro de eventos y confirmación de peligro con activación SOS automática.
6. Implementar chat asistido por IA con persistencia de conversaciones/mensajes, y transcripción de audio a texto.
7. Implementar módulo de donaciones comunitarias con campañas, contribuciones, imágenes y comprobante por correo.
8. Implementar auditoría de acciones críticas para trazabilidad y análisis.
9. Proveer despliegue local reproducible con Docker Compose.

---

## 6. Alcance y limitaciones

### 6.1 Alcance funcional (módulos)

Incluye (según el repositorio):

- **Autenticación (Odoo)**: login, register, logout, `me`.  
  Verificación previa de correo por OTP (`/api/auth/email-otp/*`).
- **Perfil médico** (`/api/profile/*`): lectura/guardado, foto, instrucciones personalizadas para LENS, búsqueda por ID `EL-XXXX`.
- **Contactos** (`/api/contacts/*`): CRUD sobre `res.partner` hijo del usuario con sincronización best-effort desde perfil.
- **Emergencias/SOS** (`/api/emergency/*`): activación/actualización (upsert), ubicación, evidencia, cancelación, cambio de estado y asignación de unidad.
- **Notificaciones** (`/api/notifications/*`): bandeja admin y usuario; debug; tip diario.
- **Geofence** (`/api/geofence/*`): geocode proxy Nominatim, CRUD de zonas, eventos, confirmación de peligro y activación SOS.
- **Auditoría** (`/api/audit/*`): registro y consulta; export (CSV y opcional PDF).
- **Chat LENS** (`/api/chat/*`): conversación IA, persistencia Odoo, transcripción audio.
- **Donaciones** (`/api/donations/*`): campañas, contribuciones, imagen, notificaciones y recibos email.
- **Recordatorios** (scheduler): jobs para meds y tip del día, con throttling.

### 6.2 Limitaciones (según implementación actual)

- **OTP in-memory:** `backend/otp_store.py` es memoria local; no persiste entre reinicios y no escala a múltiples workers sin un store compartido (ej. Redis/DB).
- **Sesiones por cookie:** el backend usa cookie de sesión de Flask; en producción se recomiendan medidas adicionales (HTTPS, `SESSION_COOKIE_SECURE=1`, CSRF, rotación de claves, etc.).
- **Dependencia de servicios externos (opcionales):**
  - Groq (LLM + Whisper) requiere `GROQ_API_KEY`.
  - Nominatim se usa como geocoding proxy (su política de uso debe respetarse en producción).
- **Mapa/rutas:** el frontend puede usar OSRM público (`router.project-osrm.org`) para trazar rutas (depende de disponibilidad y condiciones de uso).
- **Modo web:** algunas capacidades (llamadas reales, permisos, notificaciones, geolocalización precisa) dependen del navegador y/o HTTPS.

---

## 7. Metodología y planificación del trabajo

El proyecto se estructura en iteraciones (módulos), con un enfoque incremental:

1) Núcleo de autenticación y sesión (login/register + OTP).  
2) Persistencia de entidades base en Odoo (perfil, emergencia, notificación).  
3) Flujos críticos (SOS y ubicación).  
4) Funcionalidades de soporte (geofence, auditoría, notificaciones, scheduler).  
5) Módulos avanzados (chat IA + transcripción, operador, donaciones).  
6) Documentación y reportes (manual técnico, manual de usuario y PDFs en `reportland/`).  

El repositorio incluye documentación complementaria:

- `MANUAL_TECNICO.md`
- `MANUAL_USUARIO.md`
- `MODULOS_DETALLADOS.md`
- `CODEMAP.md`
- `reportland/` (generación de PDFs: cronograma, manuales, etc.)

---

## 8. Marco teórico (conceptos y tecnologías)

### 8.1 Emergencias y gestión de incidentes

En un sistema digital de emergencias se modelan típicamente:

- **Tipo de evento:** médico, seguridad, incendio, accidente.
- **Estado del evento:** activo, en seguimiento, resuelto, falsa alarma, cancelado.
- **Trazabilidad:** registro de cambios, timestamps, evidencia.
- **Contexto:** ubicación, batería, unidad asignada, notas.

En EmergeLens esto se refleja en el modelo `x.emergelens.emergency`.

### 8.2 Geolocalización y geofencing

La geolocalización en el navegador suele depender de:

- APIs de geolocalización (`navigator.geolocation`).
- Permisos del navegador.
- Condiciones de red (mejoras con HTTPS y dispositivos móviles).

El geofencing se implementa por evaluación de distancia frente a zonas (radio) y disparo de eventos (entry/exit). EmergeLens persiste zonas en `x.emergelens.geofence` y eventos en `x.emergelens.geofence.event`, además de incluir un mecanismo de **confirmación de peligro** que puede disparar un SOS.

### 8.3 Notificaciones y bandejas

El sistema utiliza un modelo persistente `x.emergelens.notification` para:

- Feed admin (notificaciones del sistema; `target_uid=False`).
- Feed por usuario (`target_uid=uid`).

El backend funciona como "emisor" de eventos (activación SOS, peligro detectado por chat, salud reportada, donación recibida, tip diario, etc.).

### 8.4 Asistente LENS e IA

El asistente LENS funciona como un chat orientado a acompañamiento. Integra:

- Groq Chat Completions (modelo configurable por `GROQ_MODEL`).
- Whisper vía Groq para transcripción de audio.
- Persistencia de conversaciones/mensajes en Odoo (`x.emergelens.chat`, `x.emergelens.message`).
- Detección de riesgo: si la respuesta del modelo incluye un marcador `[ALERTA_SOS]`, el backend eleva una notificación al feed admin.

### 8.5 ERP como capa de datos: Odoo 17

Odoo se utiliza como plataforma de:

- **Persistencia centralizada** (PostgreSQL + filestore).
- **Modelos de negocio** (addons custom `emergelens` y `emergelens_donations`).
- **Administración** (UI de Odoo para ver/gestionar datos, según permisos).

El backend Flask opera contra Odoo mediante JSON-RPC/HTTP, utilizando credenciales admin configuradas por variables de entorno.

### 8.6 Arquitectura de microservicios ligera (Docker Compose)

La solución se despliega localmente con `docker-compose.yml`, que orquesta:

- `db`: Postgres 15  
- `odoo`: Odoo 17 (instala/actualiza addons al iniciar)  
- `backend`: Flask API (puerto 5000)  
- `frontend`: Vite dev server (puerto 5173)  

---

## 9. Análisis de requisitos

> Nota: la numeración "RFxx" aparece en algunos comentarios del código. En esta tesis se consolidan los requisitos en lenguaje natural basados en el repositorio.

### 9.1 Requisitos funcionales (RF)

**RF-AUTH-01:** El sistema permite a usuarios iniciar sesión con email/contraseña contra Odoo.  
**RF-AUTH-02:** El sistema permite registrar un usuario nuevo en Odoo.  
**RF-AUTH-03:** El registro requiere verificación previa de email mediante OTP.  
**RF-AUTH-04:** El sistema permite cerrar sesión.  
**RF-AUTH-05:** El sistema expone un endpoint para conocer el usuario autenticado (`/me`).  

**RF-PERFIL-01:** El sistema permite guardar y consultar un perfil médico del usuario.  
**RF-PERFIL-02:** El perfil incluye edad, sexo, dirección, teléfono, tipo de sangre, alergias, condiciones y problemas de salud.  
**RF-PERFIL-03:** El perfil permite guardar hasta 2 contactos (ec1/ec2).  
**RF-PERFIL-04:** El perfil asigna un ID EmergeLens `EL-XXXX` único (o fallback `EL-XXXXXX`).  
**RF-PERFIL-05:** El perfil permite guardar foto base64 y sincronizarla hacia `res.users.image_1920` best-effort.  
**RF-PERFIL-06:** El usuario puede guardar instrucciones personalizadas para LENS.  
**RF-PERFIL-07:** El sistema permite buscar un usuario por `EL-XXXX` para facilitar alta de contactos.  

**RF-CONTACTOS-01:** El usuario puede listar, crear, editar y eliminar contactos de emergencia.  
**RF-CONTACTOS-02:** Se sincronizan contactos del perfil (ec1/ec2) hacia `res.partner` hijos best-effort.  

**RF-SOS-01:** El usuario puede activar un SOS indicando el tipo de emergencia.  
**RF-SOS-02:** El sistema crea/actualiza una emergencia activa (`active`) con lat/lng y timestamps.  
**RF-SOS-03:** El sistema actualiza ubicación y estado (y puede guardar dirección).  
**RF-SOS-04:** El sistema permite adjuntar evidencia (foto y/o audio) en base64 asociada al incidente.  
**RF-SOS-05:** El usuario puede cancelar una emergencia (controlado por PIN en UI).  
**RF-SOS-06:** Un administrador puede cambiar el estado del incidente (`monitoring`, `resolved`).  
**RF-SOS-07:** El sistema sugiere y permite asignar una unidad (ambulancia/policía/bomberos/rescate/múltiples).  
**RF-SOS-08:** El sistema notifica a contactos registrados (usuarios que tengan al afectado como ec1/ec2 por email).  
**RF-SOS-09:** El sistema expone `my-alert` para que el frontend conozca el estado más reciente (polling).  

**RF-NOTIF-01:** El sistema persiste notificaciones en Odoo para feed admin y feed de usuario.  
**RF-NOTIF-02:** El admin puede listar, marcar leídas y borrar notificaciones del sistema.  
**RF-NOTIF-03:** El usuario puede listar, marcar leídas y borrar sus notificaciones.  
**RF-NOTIF-04:** El sistema puede generar un tip diario por usuario, con throttling.  

**RF-GEOFENCE-01:** El usuario puede crear/editar/eliminar zonas seguras/peligrosas con radio.  
**RF-GEOFENCE-02:** El sistema registra eventos de salida/entrada asociados a zonas.  
**RF-GEOFENCE-03:** El sistema permite proxy de geocoding (Nominatim) para búsqueda de direcciones.  
**RF-GEOFENCE-04:** El usuario puede confirmar si hay peligro; si responde "sí", se activa SOS tipo seguridad.  

**RF-AUDIT-01:** El sistema registra auditoría de acciones críticas (login/logout/register, SOS, perfil, evidencia, geofence, etc.).  
**RF-AUDIT-02:** El usuario puede consultar su auditoría; el admin puede consultar globalmente (según endpoints).  
**RF-AUDIT-03:** El sistema permite exportar auditoría en CSV y opcionalmente PDF (si `fpdf` está disponible).  

**RF-CHAT-01:** El usuario puede crear conversaciones y enviar mensajes al asistente.  
**RF-CHAT-02:** El sistema persiste conversaciones y mensajes en Odoo (best-effort).  
**RF-CHAT-03:** El sistema permite transcripción de audio a texto (si Groq está configurado).  
**RF-CHAT-04:** Si el asistente detecta riesgo, el sistema notifica al feed admin (peligro detectado).  

**RF-DON-01:** El usuario puede listar campañas de donación y crear nuevas campañas.  
**RF-DON-02:** El usuario puede contribuir (donar) a campañas.  
**RF-DON-03:** El sistema calcula totales, donantes y progreso de campaña en Odoo mediante campos computed.  
**RF-DON-04:** El sistema puede enviar comprobante de donación por correo (si SMTP está configurado).  

### 9.2 Requisitos no funcionales (RNF)

**RNF-01 (Disponibilidad local):** el sistema se despliega con un comando `docker compose up --build`.  
**RNF-02 (Tolerancia a fallos):** persistencia de chat y notificaciones es best-effort; una falla en Odoo no debe romper toda la experiencia cuando sea posible.  
**RNF-03 (Seguridad):** se evita exponer secretos en código; se usa `.env` para variables sensibles.  
**RNF-04 (Usabilidad):** UI clara en crisis, con estados y acciones directas.  
**RNF-05 (Auditoría):** trazabilidad de acciones con significado real (se filtra ruido).  
**RNF-06 (Escalabilidad):** reconocer limitaciones del OTP in-memory y recomendar store compartido en producción.  

---

## 10. Diseño del sistema

### 10.1 Arquitectura general

```
Navegador (Frontend React/Vite :5173)
  -> fetch /api/* (credentials: include)
       -> Backend Flask (:5000)
            -> JSON-RPC/HTTP -> Odoo 17 (:8069) -> PostgreSQL 15
            -> SMTP (opcional) -> correos (OTP, SOS, recibos)
            -> Groq (opcional) -> chat IA (LLM)
            -> Groq Whisper (opcional) -> transcripción de audio
```

### 10.2 Componentes y responsabilidades

**Frontend (React/Vite)**

- Navegación por pantallas (`frontend/src/App.jsx`).
- Estado global en memoria (`frontend/src/store.jsx`).
- Wrapper de API (`frontend/src/api.js`) con cookies.
- Pantalla crítica de emergencia activa: `frontend/src/pages/EmergencyActive.jsx` (GPS, batería, evidencia, SOS).
- Componente de alerta para contactos: `frontend/src/components/SOSAlert.jsx` (polling de alertas y mapa).

**Backend (Flask)**

- Sesión por cookie: `backend/app.py` define `SECRET_KEY`, `SameSite`, `Secure`, TTL.
- Blueprints por dominio (`backend/routes/*`).
- Auditoría best-effort y mapeada solo a acciones significativas (`backend/app.py` + `backend/routes/audit.py`).
- Scheduler de fondo (APScheduler) para meds y tip diario (`backend/scheduler.py`).
- Envío de correos por SMTP (`backend/mailer.py`).

**Odoo (addons custom)**

- Addon `emergelens`: modelos core (`x.emergelens.*`).
- Addon `emergelens_donations`: modelos de campañas y donaciones.

---

## 11. Implementación (detalle por módulos)

> Esta sección describe el "cómo" a partir de los archivos del repositorio. Se listan endpoints, modelos y comportamientos operativos.

### 11.1 Autenticación y registro

**Archivos clave (backend):**

- `backend/routes/auth.py`
- `backend/odoo_client.py`
- `backend/otp_store.py`
- `backend/security.py` (helpers de sesión/roles)

**Flujo de registro con OTP:**

1) Solicitud de OTP: `POST /api/auth/email-otp/request`  
   - Genera un OTP de 6 dígitos.
   - TTL: 5 minutos (`OTP_TTL_SECONDS=300`).
   - Rate limiting: cooldown (20s) y máximo de envíos por ventana (5 envíos / 15 minutos).
   - Envía el código por email con `send_html_email`.
   - Para desarrollo puede devolver `debug_code` si `DEV_OTP_ECHO=1`.

2) Verificación de OTP: `POST /api/auth/email-otp/verify`  
   - Si es correcto, guarda banderas en sesión: `email_verified` y `email_verified_at`.
   - La verificación expira para completar registro en 30 minutos.

3) Registro: `POST /api/auth/register`  
   - Valida que el email haya sido verificado previamente en la sesión.
   - Crea el usuario en Odoo (por `odoo_client.register`).
   - Guarda identidad en sesión (uid, name, email).
   - Registra auditoría: `register`.

**Flujo de login:**

- `POST /api/auth/login` valida contra Odoo (`odoo_client.login`), guarda sesión y registra auditoría `login`.
- Si Odoo retorna "Too many login failures", el backend responde 429 con `retry_after_seconds=60`.

**Flujo de logout:**

- `POST /api/auth/logout` limpia la sesión y registra auditoría `logout` best-effort.

**Endpoint de identidad actual:**

- `GET /api/auth/me` devuelve `{ uid, name, email, roles }` si está autenticado.

### 11.2 Perfil médico

**Archivo clave:** `backend/routes/profile.py`  
**Modelo Odoo:** `x.emergelens.profile`  

Endpoints:

- `GET /api/profile/`  
- `POST /api/profile/`  
- `GET /api/profile/instructions`  
- `POST /api/profile/instructions`  
- `GET /api/profile/by-emergelens-id/<eid>`  

Características del perfil:

- Datos médicos básicos y de contacto.
- Contactos ec1/ec2 y relación.
- Instrucciones personalizadas para LENS (`x_custom_instructions`).
- Foto base64 (`x_photo`) y sincronización best-effort a `res.users.image_1920`.
- Generación de ID EmergeLens: `EL-XXXX` con verificación de unicidad en Odoo.

El backend utiliza sesión admin de Odoo para leer/escribir en el modelo custom, pero el UID real proviene de la sesión Flask del usuario.

### 11.3 Contactos de emergencia

**Archivo clave:** `backend/routes/contacts.py`  
**Persistencia:** `res.partner` (hijos del usuario) con JSON en `comment` para `rel`, `primary`, `emergelens_id` (en capa legacy).  

Endpoints:

- `GET /api/contacts/` lista contactos del usuario autenticado.
- `POST /api/contacts/` crea contacto.
- `PUT /api/contacts/<id>` actualiza contacto.
- `DELETE /api/contacts/<id>` elimina contacto.

Sincronización con perfil:

El backend intenta reflejar ec1/ec2 del perfil en `res.partner` para que aparezcan en la pantalla de contactos y sean editables. Esto es best-effort y no rompe la respuesta si falla.

### 11.4 Emergencias (SOS)

**Archivo clave:** `backend/routes/Emergency.py`  
**Modelo Odoo:** `x.emergelens.emergency`  

EmergeLens modela un incidente con:

- `x_type` (medical/security/fire/accident)
- `x_status` (active/monitoring/resolved/false_alarm/cancelled)
- `x_lat`, `x_lng`, `x_address`
- `x_ts`, `x_started_at`, `x_ended_at`
- `x_battery`, `x_charging`
- `x_photo_evidence`, `x_audio_evidence`
- `x_unit` (unidad asignada)

La capa backend implementa (entre otros) los siguientes comportamientos:

- **Upsert** de emergencia activa: si existe una emergencia del usuario en estado activo/monitoring, se actualiza; si no, se crea una nueva.
- **Notificación a contactos:** se reutiliza `scheduler.notify_emergency_contacts` para notificar a usuarios que tengan el email del afectado en ec1/ec2 dentro de su perfil.
- **Correo SOS (opcional):** si SMTP está configurado y `ENABLE_EMAIL_NOTIFICATIONS=1`, se pueden enviar correos.
- **Auditoría:** registra acciones como `sos_activated`, `sos_cancelled`, `evidence_sent` y `status_changed`.
- **Administración de estado:** el admin puede marcar `monitoring` o `resolved`; el usuario puede marcar `false_alarm` o `cancelled`.
- **Asignación de unidad:** sugiere unidad según tipo de emergencia y guarda `x_unit`.

El frontend "vive" el incidente en tiempo real mediante:

- `GET /api/emergency/my-alert` (polling en `frontend/src/App.jsx`).
- En modo emergencia activa, envía ubicación y batería al backend periódicamente (ver `frontend/src/pages/EmergencyActive.jsx`).

### 11.5 Notificaciones

**Archivos clave:**

- `backend/routes/notifications.py` (helper; sin Blueprint)
- `backend/routes/notif_routes.py` (Blueprint `/api/notifications`)

Persistencia en Odoo: `x.emergelens.notification` con:

- Feed admin: `x_target_uid = False`
- Feed usuario: `x_target_uid = uid`

Operaciones:

- Admin: listar/contar/marcar leídas/borrar todo.
- Usuario: listar/contar/marcar leídas/borrar todo.
- Debug: endpoints para validar envío/lectura.
- Tip del día: endpoint que invoca generación con cooldown.

El helper `push_notification()` implementa un throttling adicional para "tips diarios" y normaliza texto (limpieza mojibake y forzado ASCII en el almacenamiento, para compatibilidad de UI).

### 11.6 Scheduler (APScheduler): recordatorios y tip diario

**Archivo:** `backend/scheduler.py`

Funciones principales:

- `init_scheduler()`: registra y ejecuta jobs en background.
- Job de recordatorios de medicamentos (cron cada minuto).
- `generate_daily_tip(uid)`: genera tip con Groq (si `GROQ_API_KEY` existe) o usa fallback local, con control de repetición y cooldown.
- `notify_emergency_contacts(...)`: notifica a contactos (usuarios) cuando alguien activa SOS:
  - Busca perfiles donde `x_ec1_email` o `x_ec2_email` coincide con el email del afectado.
  - Crea notificación dirigida al contacto.
  - (Opcional) envía email con enlace a Google Maps si hay lat/lng.

### 11.7 Geofence (zonas seguras/peligrosas)

**Archivo:** `backend/routes/geofence.py`  
**Modelos Odoo:** `x.emergelens.geofence`, `x.emergelens.geofence.event`

Funcionalidades:

- CRUD de zonas con nombre, lat/lng, radio, tipo (`safe` o `danger`), activa, creada por (user/admin).
- Eventos (`/event`) con auditoría de salida de zona segura o entrada a zona peligrosa.
- Proxy de geocoding (Nominatim) con cache TTL.
- Confirmación de peligro: `POST /api/geofence/danger/confirm`:
  - Si `answer=no`, notifica "ok" al usuario y audita `danger_confirm_no`.
  - Si `answer=yes`, activa un SOS tipo `security` usando `upsert_alert_odoo(...)`, notifica al usuario y audita `danger_confirm_yes`.

### 11.8 Auditoría

**Archivo:** `backend/routes/audit.py`  
**Modelo Odoo:** `x.emergelens.audit`

Principio de diseño: auditar solo acciones con significado real y filtrar ruido. El archivo define:

- Conjunto de acciones válidas (`VALID_ACTIONS`) y etiqueta legible (`ACTION_LABELS`).
- Función `log_audit(...)` reusable desde otros módulos.
- Endpoints para registrar, consultar, filtrar y exportar auditoría.

El backend principal (`backend/app.py`) también mapea auditoría automática para ciertas rutas de impacto (POST/PUT/PATCH/DELETE) y omite prefijos (auth, audit, operator_chat, health) para evitar loops o duplicación.

### 11.9 Chat LENS (IA) y transcripción

**Archivo:** `backend/routes/chat.py`  
**Modelos Odoo:** `x.emergelens.chat`, `x.emergelens.message`

Características:

- Sistema de prompt (SYSTEM_PROMPT) que fuerza idioma español, manejo de peligro y estilo.
- Contexto del usuario: se agrega al prompt con datos del perfil (sangre, alergias, condiciones, instrucciones personalizadas).
- Persistencia best-effort en Odoo (si conv_id existe).
- Detección de riesgo: si IA devuelve marcador `[ALERTA_SOS]`, se marca `is_emergency=true` y se notifica al feed admin.
- Endpoint de transcripción (`/transcribe`) mediante Whisper vía Groq.

Degradación si IA no está configurada:

- Si no hay `GROQ_API_KEY`, se utiliza respuesta fallback simple y se evita fallar la API.

### 11.10 Donaciones comunitarias

**Archivo:** `backend/routes/donation.py`  
**Addon Odoo:** `odoo/addons/emergelens_donations/`

Modelos Odoo:

- `x.emergelens.donation.request` (campaña)
- `x.emergelens.donation` (contribución)
- `x.emergelens.donation.request.image` (imágenes base64)

Características destacadas:

- `x_reference` autogenerado con secuencia (fallback a timestamp si hay error).
- Cálculo en Odoo (compute/store) de totales, faltante, conteo de donantes y donaciones.
- API backend con sesión compartida HTTP y pool grande para evitar errores "connection pool is full".
- Comprobante de donación por correo con HTML (si SMTP está configurado).
- Notificación a dueño de la campaña mediante `x.emergelens.notification`.

---

## 12. Seguridad, privacidad y ética

### 12.1 Autenticación y sesiones

- El backend usa sesiones de Flask (cookies) con opciones configurables:
  - `SESSION_COOKIE_HTTPONLY=True`
  - `SESSION_COOKIE_SAMESITE` (por defecto `Lax`)
  - `SESSION_COOKIE_SECURE` (por defecto `0` en desarrollo; debe ser `1` en producción con HTTPS)
  - `PERMANENT_SESSION_LIFETIME` configurable

### 12.2 Datos sensibles

Este sistema manipula datos sensibles:

- Perfil médico (alergias, condiciones, problemas de salud).
- Ubicación (lat/lng) en emergencias y geofence.
- Evidencia (foto/audio).

Por tanto, se deben aplicar controles en entornos reales:

- HTTPS obligatorio.
- Minimización de retención de evidencias si la normativa lo exige.
- Control de acceso estricto (solo dueño/operador autorizado).
- Auditoría y monitoreo.
- Gestión de secretos (no versionar `.env`, rotar claves, no hardcodear credenciales).

### 12.3 OTP y rate limiting

El OTP implementa rate limiting básico, pero para producción se recomienda:

- Store compartido (Redis) para escala horizontal.
- Mayor trazabilidad de intentos por IP y anti-bot.

### 12.4 IA: riesgos y responsabilidad

El chat LENS es un asistente informativo, no un sustituto de servicios de emergencia. El sistema incorpora un mecanismo para elevar alertas internas (notificación admin) al detectar peligro, pero:

- La IA puede equivocarse.
- Debe comunicarse de forma clara que ante peligro real el usuario debe llamar a emergencias.

---

## 13. Pruebas y validación

Este repositorio prioriza el funcionamiento modular. Estrategias recomendadas (y aplicables al estado actual):

- Pruebas de endpoints críticos:
  - Auth: login, OTP request/verify, register.
  - SOS: activación, ubicación, evidencia, cancelación.
  - Notifs: creación y lectura (admin/user).
  - Geofence: CRUD y confirmación de peligro.
- Pruebas de integración con Odoo:
  - Verificar creación/lectura de modelos `x.emergelens.*`.
- Pruebas UX:
  - Flujo de emergencia activa sin permisos de GPS.
  - Evidencia sin cámara/micrófono.
  - Modo sin `GROQ_API_KEY` (fallback).

---

## 14. Despliegue y operación

### 14.1 Requisitos

Opción recomendada (Docker):

- Docker Desktop / Docker Engine
- Docker Compose
- 4GB+ RAM recomendado

### 14.2 Variables de entorno

Se recomienda crear `.env` desde `.env.example`:

```bash
copy .env.example .env
```

Variables relevantes (resumen operativo):

- Odoo: `ODOO_URL`, `ODOO_DB`, `ADMIN_ODOO_EMAIL`, `ADMIN_ODOO_PASS`
- Admin RBAC: `ADMIN_EMAIL`
- Backend: `SECRET_KEY`, `CORS_ORIGINS`, `SESSION_DAYS`, `SESSION_SAMESITE`, `SESSION_COOKIE_SECURE`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SSL`, `SMTP_STARTTLS`, `MAIL_FROM`, `MAIL_FROM_NAME`
- Notificaciones por correo: `ENABLE_EMAIL_NOTIFICATIONS`, `MED_REMINDER_EMAIL_TO_CONTACTS`, `EMERGENCY_CONTACT_ALERT_EMAIL`
- IA: `GROQ_API_KEY`, `GROQ_MODEL`
- Geocode: `NOMINATIM_URL`, `NOMINATIM_EMAIL`, `NOMINATIM_UA`, `GEOCODE_CACHE_TTL_S`

### 14.3 Levantar el stack

```bash
docker compose up --build
```

Accesos:

- Frontend (Vite): `http://localhost:5173`
- Backend (health): `http://localhost:5000/api/health`
- Odoo: `http://localhost:8069`

Detener:

```bash
docker compose down
```

Persistencia:

- `pgdata` (Postgres)
- `odoodata` (filestore Odoo)

Si se eliminan volúmenes, se pierde la información local.

---

## 15. Manual de usuario y manual técnico (referencias internas)

Este repositorio incluye (y recomienda consultar) documentación adicional:

- `MANUAL_USUARIO.md`: guía de uso (registro/login, dashboard, emergencia activa, evidencias, LENS, troubleshooting).
- `MANUAL_TECNICO.md`: arquitectura, variables, endpoints y observaciones técnicas.
- `MODULOS_DETALLADOS.md`: descripción de modelos Odoo y addons.
- `CODEMAP.md`: mapa rápido del repo.
- `reportland/`: scripts de generación de PDFs de documentación (cronograma, manuales, etc.).

---

## 16. Riesgos y mitigaciones

- **R1: OTP in-memory (pérdida en reinicios / escala horizontal).**  
  Mitigación: migrar OTP a Redis/DB; añadir rate limiting por IP.
- **R2: Dependencia de servicios externos (Groq, Nominatim, OSRM).**  
  Mitigación: fallbacks, caché, proveedores alternos, y límites.
- **R3: Privacidad de ubicación y evidencias.**  
  Mitigación: HTTPS, control de acceso, retención mínima, cifrado en tránsito, políticas claras.
- **R4: Seguridad de credenciales.**  
  Mitigación: usar `.env`, rotación de claves, evitar hardcode, y secret managers en producción.
- **R5: Errores de UX en crisis (permisos denegados, latencia).**  
  Mitigación: mensajes claros, degradación progresiva, y acciones alternativas (copiar ubicación, mostrar 911).

---

## 17. Resultados y discusión

La implementación actual consolida:

- Un núcleo robusto de autenticación en Odoo con sesiones cookie en Flask.
- Un modelo de emergencia persistente con estados, evidencia y unidad asignada.
- Bandejas de notificación persistidas, con segregación admin/usuario.
- Geofencing con confirmación de peligro y activación SOS.
- Auditoría enfocada en acciones con valor (eliminación de ruido).
- Chat IA integrado con contexto del perfil y transcripción de audio.
- Donaciones con cálculo de totales y comprobante por correo.

La decisión de usar Odoo como capa de datos permite administrar información y extender modelos con relativa rapidez, a cambio de introducir complejidad de integración (JSON-RPC, credenciales admin, latencia).

---

## 18. Conclusiones

SOS EmergeLens cumple el objetivo de ofrecer una plataforma web integral para emergencias que unifica:

- activación SOS,  
- ubicación y evidencia,  
- notificaciones y trazabilidad,  
- prevención (meds/tips),  
- geofencing como mecanismo de seguridad proactiva,  
- comunicación (chat IA + operador),  
- y apoyo comunitario (donaciones).  

La arquitectura multicapa, el despliegue con Docker Compose y la centralización en Odoo aportan una base sólida para evolución futura.

---

## 19. Trabajo futuro (líneas de mejora)

1) Persistir OTP en Redis/DB y fortalecer rate limiting por IP/dispositivo.  
2) Implementar CSRF y endurecer la capa de cookies en producción.  
3) Mejorar control de acceso a evidencias y políticas de retención.  
4) Reemplazar dependencias públicas (OSRM/Nominatim) por instancias propias o proveedores con SLA.  
5) Agregar suite de pruebas automatizadas (unitarias e integración) por módulo.  
6) Implementar un canal de notificaciones push real (Web Push / FCM) además de bandeja persistida.  
7) Refinar analítica y métricas (tiempos de respuesta, volumen de emergencias, etc.).  

---

## 20. Anexos

### 20.1 Tecnologías verificadas en el repositorio

- Backend: Python 3.11, Flask, Flask-CORS, Requests, APScheduler, python-dotenv, fpdf2
- Frontend: React 18, Vite 5, Leaflet + React-Leaflet
- ERP/DB: Odoo 17, PostgreSQL 15
- Infra local: Docker + Docker Compose
- Documentos: ReportLab (carpeta `reportland/`)

### 20.2 Modelos Odoo (core)

Addon `emergelens` (`odoo/addons/emergelens/models/models.py`):

- `x.emergelens.profile`
- `x.emergelens.emergency`
- `x.emergelens.notification`
- `x.emergelens.med`
- `x.emergelens.geofence`
- `x.emergelens.geofence.event`
- `x.emergelens.chat`
- `x.emergelens.message`
- `x.emergelens.operator.chat`
- `x.emergelens.scheduled.msg`
- `x.emergelens.audit`

Addon `emergelens_donations` (`odoo/addons/emergelens_donations/models/donation.py`):

- `x.emergelens.donation.request`
- `x.emergelens.donation`
- `x.emergelens.donation.request.image`

### 20.3 Puertos del stack (Docker Compose)

- Odoo: `8069:8069`
- Backend: `5000:5000`
- Frontend: `5173:5173`

### 20.4 Generación de documentos (ReportLand)

En `reportland/` existen scripts de generación de PDFs. Ejemplo de cronograma:

```bash
python reportland/cro.py --start 2026-02-05 --end 2026-04-26 --out reportland/cronograma_proyecto.pdf

https://github.com/nashly-web/proyecto_final.git
```




