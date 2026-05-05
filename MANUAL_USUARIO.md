# Manual de Usuario — SOS EmergeLens (Ampliado)

**Nombre:** SOS EmergeLens  
**Tipo:** Manual de Usuario  
**Versión:** 2.0 (ampliado)  
**Fecha:** 03/05/2026  
**Autor:** Nashly Adriana Magallanes Feliz  

---

## 0. Cómo leer este manual (muy importante)

Este manual está escrito para que una persona pueda usar la aplicación **sin ayuda técnica**. Por eso:

- Verás instrucciones **paso a paso** (clic por clic).
- Se describe **cada campo** de cada formulario y **para qué sirve**.
- Se explica **dónde se encuentra** cada opción en la pantalla (barra superior, navegación inferior, tarjetas, etc.).
- Se incluyen casos “si pasa X, haz Y” (permisos denegados, GPS fallando, etc.).

> Nota: este manual describe el uso de la aplicación web. Algunas capacidades dependen del navegador y del dispositivo (por ejemplo: cámara/micrófono en laptops vs. móviles).

---

## 1. Propósito del sistema

SOS EmergeLens es una aplicación web para:

1) **Activar y registrar una emergencia (SOS)** con tipo, estado y ubicación.  
2) **Compartir ubicación en tiempo real** durante emergencias (si el usuario lo permite).  
3) **Enviar evidencias** (foto automática y/o audio grabado) asociadas a la emergencia.  
4) **Recibir y gestionar notificaciones** (bandeja dentro de la app y, opcionalmente, notificaciones del sistema).  
5) Consultar **historial** de emergencias y eventos de zonas (geofence).  
6) Mantener **medicamentos** con recordatorios.  
7) Usar **Chat LENS** (texto y nota de voz) y “**Llamada LENS**” (simulador).  
8) Usar **Donaciones**: ver campañas, donar y crear campañas de ayuda.  
9) Configurar **Zonas seguras/peligrosas** y registrar violaciones (salida/entrada).  
10) (Para administradores) gestionar alertas, auditoría, geofence global y chat operador.

---

## 2. Público objetivo

- **Usuarios finales:** activan SOS, completan perfil y usan módulos cotidianos.
- **Contactos de emergencia:** reciben alertas/notificaciones (dependiendo de la configuración y si están registrados).
- **Operadores/administradores:** usan paneles especiales (solo si la cuenta es admin).

---

## 3. Requisitos, permisos y recomendaciones

### 3.1 Requisitos mínimos

- Navegador recomendado: **Chrome** o **Edge**.
- Conexión a Internet estable.

### 3.2 Permisos que la app puede pedir (y por qué)

1) **Ubicación (GPS)**  
   - Se usa para: SOS, mapas, zonas seguras/peligrosas, y eventos de geofence.
   - Si no concedes el permiso: algunas funciones seguirán (pero sin coordenadas).

2) **Notificaciones del sistema (del navegador)**  
   - Se usa para: recordatorios de medicamentos y códigos de verificación del módulo de donaciones (demo).
   - Si no concedes el permiso: seguirás viendo notificaciones dentro de la app, pero no “pop-ups” del sistema.

3) **Cámara**  
   - Se usa para: captura automática de foto como evidencia al activar SOS.

4) **Micrófono**  
   - Se usa para: grabación de audio como evidencia y para hablar en la llamada simulada con LENS.

> Recomendación técnica: para geolocalización confiable, se recomienda usar **HTTPS** o `localhost`.

---

## 4. Estructura de la interfaz (cómo orientarte)

### 4.1 Flujo típico de pantallas

1) **Bienvenida**  
2) **Autenticación** (Iniciar sesión / Crear cuenta)  
3) **Onboarding** (solo si es usuario nuevo)  
4) **Dashboard** (pantalla principal)  
5) Módulos: Inicio, Chat, Zona, Donar, Perfil

### 4.2 Barra superior (Top Bar)

En el Dashboard normalmente hay una barra superior con:

- Avatar/iniciales del usuario.
- Menú o dropdown con accesos a Perfil/Contactos/Info Médica/Historial.
- Botón de **notificaciones** (campana), según rol.

### 4.3 Navegación inferior (Bottom Nav)

En la parte inferior verás botones:

- **Inicio**
- **Chat**
- **Zona** (solo usuarios, no admin)
- **Donar**
- **Perfil** (desde aquí también navegas a Contactos/Info Médica/Historial)

> Si no ves “Zona”, es posible que estés usando una cuenta admin.

---

## 5. Primer uso (guía completa paso a paso)

### 5.1 Entrar a la pantalla de Bienvenida

1) Abre la aplicación.
2) En Bienvenida elige:
   - **Iniciar sesión** si ya tienes cuenta.
   - **Crear cuenta** si no tienes cuenta.

---

## 6. Crear cuenta (Registro) — explicado paso por paso y campo por campo

El registro está dividido en varios pasos internos. Completa en orden.

### 6.1 Registro — Paso 1: Datos básicos

Campos:

1) **Nombre**
   - Qué escribir: nombre y apellido (ej. “María García”).
   - Para qué sirve: identifica tu perfil y aparece en alertas.

2) **Correo electrónico**
   - Qué escribir: un correo real (ej. `maria@email.com`).
   - Para qué sirve: inicio de sesión y verificación por código.

3) **Teléfono (10 dígitos)**
   - Formato: solo números, 10 dígitos (ej. `8090000000`).
   - Importante: no uses espacios, guiones o +.

Acción:

- Presiona **Siguiente**.

Errores comunes:

- “Completa todos los campos”: falta información.
- “Teléfono inválido (10 dígitos)”: el teléfono no cumple el formato.

### 6.2 Registro — Paso 2: Verificación de correo (OTP de 6 dígitos)

Qué es:

- Un código de verificación de 6 dígitos que llega a tu correo.

Elementos:

1) **Campo: Código**
   - Qué escribir: los 6 dígitos.
   - Consejo: escribe solo números (sin espacios).

2) **Botón: Verificar**
   - Confirma el código.

3) **Reenviar código**
   - Reenvía el código (puede haber un conteo/espera antes de permitir reenviar).

Mensajes típicos:

- “Código enviado a tu correo”
- “Código reenviado”
- “Ingresa el código de 6 dígitos”
- “Correo verificado correctamente”

Cuando el OTP se verifica:

- El registro te deja continuar al siguiente paso.

### 6.3 Registro — Paso 3: Contraseña

Campos:

1) **Contraseña**
   - Requisito: mínimo 8 caracteres.

2) **Confirmar contraseña**
   - Debe ser exactamente igual.

Errores comunes:

- “La contraseña debe tener 8+ caracteres”
- “Las contraseñas no coinciden”

### 6.4 Registro — Paso 4: PIN y consentimientos

Campos:

1) **PIN de cancelación de emergencia (4 dígitos)**
   - Qué escribir: 4 números (ej. `1234`).
   - Para qué sirve: para cancelar una emergencia desde la app.

Casillas:

2) **Acepto los Términos y Condiciones / Política de Privacidad**
   - Debes marcarla para poder completar el registro.

3) **Autorizo compartir mi ubicación en tiempo real durante emergencias** (opcional)
   - Es tu consentimiento dentro de la app.
   - Aun así el navegador puede pedir permiso de GPS cuando lo necesite.

Acción final:

- Presiona **Crear cuenta**.

Al terminar:

- Quedas con sesión iniciada.

---

## 7. Iniciar sesión (Login)

Campos:

1) **Correo**
2) **Contraseña**

Acción:

- Presiona **Iniciar sesión**.

Caso especial:

- Si aparece “Demasiados intentos fallidos… espera 1 minuto”, espera ~60 segundos antes de intentar de nuevo.

---

## 8. Onboarding (solo usuarios nuevos) — 4 pasos explicados

El Onboarding aparece si el sistema te pide completar información antes del Dashboard.

> Este flujo guarda tu perfil inicial y dos contactos de emergencia.

### 8.1 Paso 1 de 4: Datos personales

Campos:

1) **Edad**
   - Qué escribir: número (ej. `23`).

2) **Sexo**
   - Selecciona según tu caso.

3) **Dirección**
   - Qué escribir: dirección completa (calle, sector, ciudad).

4) **Teléfono**
   - Formato: 10 dígitos (ej. `8090000000`).

5) **Correo**
   - Debe contener `@`.

Errores:

- “Completa todos los campos”
- “Teléfono inválido (10 dígitos)”
- “Correo inválido”

### 8.2 Paso 2 de 4: Información médica

Campos:

1) **Tipo de sangre** (obligatorio)
   - Opciones típicas: A+, A-, B+, B-, AB+, AB-, O+, O-.

2) **Alergias** (texto, máx. 300)
   - Ejemplos: “Penicilina”, “Polen”, “Mariscos”.

3) **Condiciones médicas** (texto, máx. 300)
   - Ejemplos: “Diabetes”, “Hipertensión”.

4) **Problemas de salud adicionales** (texto, máx. 500)
   - Cualquier información relevante adicional.

Error:

- “Selecciona tu tipo de sangre”

### 8.3 Paso 3 de 4: Contacto 1 (principal)

Campos obligatorios:

1) **Nombre completo**
2) **Teléfono** (10 dígitos)
3) **Correo electrónico** (debe tener `@`)
4) **Relación** (selector)

Errores:

- “Completa el primer contacto…”
- “Teléfono del contacto 1 inválido…”
- “Correo del contacto 1 inválido”

### 8.4 Paso 4 de 4: Contacto 2 (respaldo)

Campos obligatorios:

1) **Nombre completo**
2) **Teléfono** (10 dígitos)
3) **Correo electrónico** (debe tener `@`)
4) **Relación** (selector)

Errores:

- “Completa el segundo contacto…”
- “Teléfono del contacto 2 inválido…”
- “Correo del contacto 2 inválido”

Acción:

- Presiona **Finalizar** para guardar y entrar al Dashboard.

---

## 9. Dashboard: explicación completa de cada módulo

### 9.1 Inicio (Home)

La sección Inicio sirve como “hub” principal.

Incluye:

- Selección del tipo de emergencia.
- Acciones SOS (envío rápido de ubicación).
- Acceso a llamada simulada de LENS.
- Compartir ubicación (copiar enlace).
- Medicamentos (lista y gestión).
- Banner de clima/alertas (si aplica).

#### 9.1.1 Seleccionar tipo de emergencia

Tipos:

- Emergencia Médica
- Emergencia de Seguridad
- Incendio
- Accidente

Cómo elegir:

1) Haz clic sobre el tipo.
2) Si vuelves a tocar el mismo, puede deseleccionarse (según estado).

#### 9.1.2 Botón SOS (modo rápido: envía ubicación a contactos/admin)

Qué hace:

- Intenta obtener GPS y batería (best-effort).
- Envía al sistema una alerta con tu tipo de emergencia y ubicación.

Pasos:

1) Selecciona tipo (opcional).
2) Presiona el botón de SOS/Enviar ubicación.
3) Espera el mensaje “Obteniendo ubicación…”
4) Si no hay GPS, puede enviar sin coordenadas.
5) Verás mensajes de confirmación.

#### 9.1.3 Compartir ubicación (copiar enlace)

Pasos:

1) Presiona el botón “Compartir ubicación”.
2) Acepta permiso de ubicación (si aparece).
3) El sistema copia un enlace de Google Maps a tu portapapeles.
4) Pégalo donde necesites (WhatsApp, SMS, etc.).

#### 9.1.4 Permitir notificaciones del sistema

Pasos:

1) Presiona “Permitir”.
2) En el popup del navegador selecciona “Permitir”.

Si bloqueas:

- No verás notificaciones emergentes del sistema.

#### 9.1.5 Medicamentos (lista, agregar, editar, eliminar)

La lista muestra:

- Nombre
- Dosis
- Frecuencia
- Hora

Acciones:

- Editar (icono lápiz)
- Eliminar (icono basura)
- “Agregar Medicamento”

Formulario (Agregar/Editar):

1) **Nombre**
2) **Dosis**
3) **Hora** (selector `HH:MM`)
4) **Frecuencia** (selector: Una vez al día / Cada 8h / Cada 12h / Según necesidad)

Errores:

- “Completa todos los campos” si faltan nombre/dosis/hora.

---

### 9.2 Emergencia activa (modo crisis)

Esta pantalla se abre cuando el usuario entra al estado de “SOS activo”.

Incluye:

- GPS en vivo (si disponible)
- Registro de emergencia
- Evidencias (foto/audio)
- Batería (si el navegador lo soporta)
- Botón Llamar a LENS (simulador)
- Cancelación con PIN

#### 9.2.1 Estado de emergencia

Estados que pueden aparecer:

- Activa
- En seguimiento
- Resuelta
- Falsa alarma
- Cancelada

#### 9.2.2 Evidencia: foto automática

Al activar SOS, la app intenta:

- Abrir cámara.
- Capturar una foto automáticamente.

Si falla:

- Revisa permisos de cámara.

#### 9.2.3 Evidencia: audio

Pasos:

1) Presiona “Grabar audio”.
2) Habla.
3) Presiona “Detener”.
4) Reproduce si deseas verificar.
5) Borra si te equivocaste.

#### 9.2.4 Enviar evidencia a contactos

Cuando haya foto y/o audio:

1) Presiona “Enviar evidencia a contactos”.
2) Espera confirmación “Enviada”.

#### 9.2.5 Batería

Si aparece “Batería baja”:

- Significa que el sistema detectó porcentaje bajo (≤ 20%) y no cargando.

#### 9.2.6 Llamar a LENS (simulador)

Ver sección 9.9 para detalles de llamada.

#### 9.2.7 Cancelar emergencia (PIN)

Pasos:

1) Presiona “Cancelar Emergencia (PIN)”.
2) En el modal, escribe el PIN (4 dígitos).
3) Presiona “Confirmar”.

Error:

- “PIN incorrecto” si no coincide.

---

### 9.3 Perfil (Mi Perfil) — campos y vistas

Dentro del Perfil puedes ver/editar:

- Datos personales
- Datos médicos
- Foto
- Contactos ec1/ec2
- Configuración de chat (LENS)
- ID EmergeLens (EL-XXXX)

#### 9.3.1 Datos personales

Campos típicos:

1) Nombre
2) Correo
3) Teléfono (10 dígitos)
4) Dirección
5) Edad
6) Sexo

#### 9.3.2 Datos médicos

Campos:

1) Tipo de sangre
2) Alergias
3) Condiciones
4) Problemas de salud

#### 9.3.3 Foto de perfil

Pasos:

1) Selecciona una imagen desde tu dispositivo.
2) Verifica la previsualización.
3) Presiona “Guardar”.

#### 9.3.4 ID EmergeLens (EL-XXXX)

Qué es:

- Un identificador único para que otros usuarios te agreguen como contacto.

#### 9.3.5 Contactos del perfil (ec1/ec2) y búsqueda por EL-XXXX

Para cada contacto:

- Nombre
- Teléfono
- Correo
- Relación

Si hay búsqueda por ID:

1) Escribe `EL-1234`.
2) Presiona buscar.
3) Se rellenan los campos si existe.

#### 9.3.6 Configuración de chat (LENS)

Campo:

- Texto (máx. 500) con instrucciones de trato/respuesta.

Ejemplos:

- “Háblame formal.”
- “Responde corto.”

Guardar:

- Presiona “Guardar” para aplicar.

---

### 9.4 Contactos de emergencia (módulo Contactos)

Lista de contactos con acciones:

- Editar
- Eliminar
- Agregar

#### 9.4.1 Agregar/Editar contacto (modal)

Campo de búsqueda (opcional):

- ID EmergeLens: `EL-1234` para rellenar datos.

Campos del contacto:

1) **Nombre** (obligatorio, máx. 60)
2) **Teléfono** (obligatorio, 10 dígitos)
3) **Correo electrónico** (opcional, máx. 120)
4) **Relación** (selector)
5) **Contacto principal** (checkbox)

Botones:

- Cancelar
- Guardar

Eliminar:

- Confirmación “No se puede deshacer”.

---

### 9.5 Info Médica (Mis Medicamentos)

Esta sección es una vista dedicada del CRUD de medicamentos.

Ver sección 9.1.5 para campos y pasos exactos.

---

### 9.6 Historial

Incluye:

- Historial de emergencias.
- Violaciones de zona (eventos geofence).

Acción:

- Exportar PDF de un incidente.

---

### 9.7 Zona Segura / Zonas peligrosas (Geofence)

Pestañas:

- Zonas
- Eventos

Crear zona (idea):

- Selecciona un punto en el mapa.
- Define nombre, tipo (segura/peligrosa) y radio.

Acciones por zona:

- Activar/Desactivar
- Eliminar (si no es de admin)

Eventos:

- “Saliste de…”
- “Entraste a…”

---

### 9.8 Notificaciones (campana)

El modal de notificaciones permite:

- Ver todas o solo no leídas.
- Marcar como leído todo o por una.
- Borrar todas.

Tipos comunes:

- contact_alert: eres contacto de alguien
- danger_confirm: confirmación de peligro (geofence)
- med_reminder: recordatorio de medicamento
- daily_tip: consejo del día
- operator_msg: mensaje del operador
- donation: actividad de donaciones

Al tocar “operator_msg”:

- Se abre el chat del operador.

---

### 9.9 Llamada con LENS (simulador)

Qué es:

- Un simulador de llamada donde LENS habla y tú respondes por micrófono.

Qué necesitas:

- Permitir micrófono (para hablar).
- En algunos casos, el navegador debe soportar reconocimiento de voz.

Qué verás:

- Estado “Llamando a LENS…” y luego “Conectado con LENS”.
- Transcripción de la conversación.

Botones:

- **Hablar** (activa escucha).
- **Colgar** (cierra llamada).

Si al colgar te pide PIN:

- Ingresa tu PIN de 4 dígitos para cancelar emergencia (si estás en modo crisis).

---

### 9.10 Chat LENS (texto + nota de voz)

Qué permite:

- Crear conversaciones.
- Enviar mensajes de texto.
- Grabar audio para transcripción.

Elementos clave:

- Lista de conversaciones (drawer).
- Área de mensajes.
- Barra inferior para escribir o grabar.

Texto:

1) Escribe.
2) Envía.
3) Espera respuesta.

Audio:

1) Presiona micrófono.
2) Detén.
3) Espera “Transcribiendo…” y respuesta.

---

### 9.11 Donaciones (campañas de ayuda)

Vista principal:

- Filtros: Todas / Mis campañas / Completadas
- Tarjetas de campaña
- Botón flotante: Crear campaña

#### 9.11.1 Crear campaña (modal)

Campos:

1) Foto (opcional)
2) Título (obligatorio)
3) Descripción (recomendado)
4) Meta (RD$) (obligatorio)

#### 9.11.2 Donar (modal en 2 pasos)

Paso 1 (Detalles):

- Monto (presets o manual)
- Método de pago (Tarjeta/Transferencia/Billetera)
- Campos específicos según método
- Mensaje opcional

Paso 2 (Verificación demo):

- Código OTP de 6 dígitos mostrado por notificación del sistema (si permites).
- Campo código.
- Confirmar donación.

---

### 9.12 Chat Operador (flotante)

Qué es:

- Un chat directo con un operador (admin).

Cómo abrir:

- Desde una notificación de tipo “Mensaje operador”, o el botón flotante (según UI).

Qué verás:

- Mensajes agrupados por fecha.
- Indicador de no leídos cuando el chat está cerrado.

---

## 10. Manual para Administrador/Operador (solo si tu cuenta es admin)

> Si eres usuario normal, puedes ignorar este capítulo.

### 10.1 Panel de alertas (admin)

Permite:

- Ver alertas activas.
- Expandir incidentes.
- Cambiar estado a “En seguimiento” o “Resolver”.
- Ver ubicación (Google Maps).
- Asignar unidad de respuesta.

### 10.2 Geofence Admin

Permite:

- Ver todas las zonas de todos los usuarios.
- Buscar zonas.
- Activar/desactivar y eliminar.
- Ver eventos recientes.
- Crear zona para un usuario específico.

### 10.3 Auditoría (admin)

Permite:

- Ver acciones del sistema.
- Filtrar por acción.
- Paginación y exportaciones (si están habilitadas).

### 10.4 Panel de Operador

Permite:

- Ver conversaciones por usuario y no leídos.
- Responder chats.
- Gestionar mensajes automáticos.

---

## 11. Solución de problemas (Troubleshooting)

### 11.1 “No aparece mi ubicación” / “Obteniendo ubicación…” no termina

1) Revisa permisos del navegador (candado en barra de direcciones).
2) Permite ubicación.
3) Activa GPS del dispositivo.
4) Si estás en HTTP, intenta en HTTPS/localhost.

### 11.2 “No puedo grabar audio”

1) Permite micrófono.
2) Revisa el dispositivo de entrada en el sistema.
3) Cierra otras apps que usen micrófono.

### 11.3 “No se captura la foto automática”

1) Permite cámara.
2) Verifica que el dispositivo tenga cámara.
3) Prueba recargar en entorno de prueba.

### 11.4 “No llegan notificaciones del sistema”

1) Permite notificaciones del navegador.
2) Revisa “No molestar” del sistema operativo.
3) Verifica que el sitio no esté bloqueado.

### 11.5 “Demasiados intentos fallidos” al iniciar sesión

- Espera ~60 segundos y reintenta.

---

## 12. Glosario

- **SOS:** alerta de emergencia activada por el usuario.
- **LENS:** asistente (chat y llamada simulada).
- **OTP:** código de 6 dígitos de verificación.
- **Geofence:** zona geográfica con radio (segura/peligrosa).
- **Evidencia:** foto/audio adjunto a una emergencia.
- **Unidad asignada:** ambulancia/policía/bomberos/rescate/múltiples.
