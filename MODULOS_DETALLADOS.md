# Módulos Odoo — SOS EmergeLens

## Mapa rápido

- **Odoo 17 (Addons custom)**: base de datos y lógica de negocio (modelos `x.emergelens.*`).
- **PostgreSQL**: base de datos usada por Odoo.

---

## Addon `emergelens` (módulo base)

**Ruta:** `odoo/addons/emergelens/`

**Propósito:** Define los modelos principales del sistema (perfil médico, emergencias, notificaciones, geofence, chat, auditoría, etc.), permisos y vistas en la UI de Odoo.

### Archivos clave

- `__manifest__.py` — metadata y dependencias del módulo
- `models/models.py` — definición de modelos `x.emergelens.*`
- `security/ir.model.access.csv` — permisos básicos
- `views/views.xml` — vistas y menús en Odoo
- `data/admin_user.xml` — data inicial (usuario admin de la app en Odoo)

### Modelos

| Modelo | Descripción |
|---|---|
| `x.emergelens.profile` | Perfil médico y contactos: sangre, alergias, condiciones, instrucciones LENS, foto base64, ID único `EL-XXXX` |
| `x.emergelens.emergency` | Incidente activo/histórico: tipo, estado, lat/lng, timestamps, evidencia foto/audio, batería, unidad asignada |
| `x.emergelens.notification` | Bandeja de notificaciones: mensajes para usuario/admin, relación opcional a alerta y coordenadas |
| `x.emergelens.med` | Medicamentos del usuario: dosis, frecuencia, hora, soft-delete (`x_active`) |
| `x.emergelens.geofence` | Zonas seguras/peligrosas definidas por el usuario |
| `x.emergelens.geofence.event` | Eventos de entrada/salida de zonas geofence |
| `x.emergelens.chat` | Conversaciones del chat LENS (IA) persistidas en Odoo |
| `x.emergelens.message` | Mensajes individuales de cada conversación de chat |
| `x.emergelens.operator.chat` | Chat entre operador (admin) y usuario |
| `x.emergelens.scheduled.msg` | Mensajes automáticos programados |
| `x.emergelens.audit` | Auditoría: acción, rol, detalle, timestamp, IP |

---

## Addon `emergelens_donations` (donaciones)

**Ruta:** `odoo/addons/emergelens_donations/`

**Propósito:** Agrega el módulo de donaciones comunitarias: campañas, contribuciones y fotos.

### Archivos clave

- `__manifest__.py`
- `models/donation.py`
- `security/*`
- `data/sequence.xml` — referencia `DON-…`
- `views/donation_views.xml`

### Modelos

| Modelo | Descripción |
|---|---|
| `x.emergelens.donation.request` | Campaña: título, solicitante, descripción, meta, estado (`open/done/cancelled`), imágenes. Incluye campos compute: total recibido, faltante, cantidad de donaciones y donantes |
| `x.emergelens.donation` | Contribución individual: campaña, donante, monto, mensaje, estado (`confirmed/cancelled`) |
| `x.emergelens.donation.request.image` | Imágenes base64 asociadas a una campaña |