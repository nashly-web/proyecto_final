# Manual de Usuario — SOS EmergeLens

**Nombre:** SOS EmergeLens  
**Tipo:** Manual de Usuario  
**Versión:** 1.0  
**Fecha:** 30/04/2026  
**Autor:** Nashly Adriana Magallanes Feliz  

## 1. Propósito

Este manual explica cómo usar SOS EmergeLens en el día a día: registro/inicio de sesión, configuración básica, activar emergencias (SOS), evidencias (foto/audio), llamada con LENS (simulador), contactos y funciones principales.

## 2. Público objetivo

- Usuarios finales (personas que activan SOS y gestionan su perfil).
- Operadores/soporte (para guiar a un usuario por teléfono).

## 3. Requisitos

- Navegador moderno (Chrome/Edge recomendado).
- Conexión a Internet.
- Permisos recomendados:
  - Ubicación (para compartir GPS durante una emergencia).
  - Micrófono (para audio de evidencia y para LENS).
  - Cámara (si deseas capturar/enviar foto como evidencia).
  - Notificaciones (para recordatorios y mensajes del sistema, si están habilitados).

> Nota: para geolocalización y algunas APIs del navegador, se recomienda abrir la app en **HTTPS** o en `localhost`.

## 4. Diseño de la interfaz (UI)

La interfaz sigue un estilo de “app de emergencia”: fondo oscuro (navy), tarjetas con transparencia, iconografía Remix Icon y acentos de color para estados críticos.

- Tema: la app soporta tema automático según la preferencia del sistema (claro/oscuro).
- Componentes: tarjetas, modales, toasts (mensajes), botones con bordes suaves.

## 5. Guía rápida (primer uso)

1. Entra a la pantalla de Bienvenida.
2. Crea una cuenta (Registro) o inicia sesión.
3. Completa tu perfil médico (recomendado).
4. Agrega contactos de emergencia.
5. (Opcional) Permite notificaciones para recordatorios.
6. Prueba la llamada con LENS en un entorno seguro (es un simulador).

## 6. Registro

En “Crear cuenta” completa:

- Nombre
- Email
- Teléfono
- Contraseña (mínimo 8 caracteres)
- PIN (4 dígitos) — se usa para acciones de seguridad (por ejemplo, cancelar emergencia).
- Consentimiento de ubicación (opcional, recomendado)

Al finalizar, la sesión queda iniciada.

## 7. Inicio de sesión

1. Ingresa email y contraseña.
2. Presiona “Iniciar sesión”.

La sesión se mantiene con cookies, por lo que no necesitas autenticarte en cada pantalla.

## 8. Panel principal (Dashboard / Home)

Desde el panel principal puedes:

- Elegir el tipo de emergencia: **Médica**, **Seguridad**, **Incendio**, **Accidente**.
- Activar el flujo SOS.
- Abrir “Llamar LENS” (simulador).
- Abrir “Chat SOS”.
- Compartir tu ubicación (copia un enlace).
- Ver información de tu zona (mapa y alertas climáticas).
- Gestionar medicamentos (si está habilitado).

## 9. Emergencia Activa (SOS)

Al activar una emergencia, la app intenta:

- Obtener tu ubicación (si diste permiso).
- Registrar/actualizar la emergencia en el sistema.
- Permitir envío de evidencias (foto/audio).
- Mostrar estado de la emergencia y, si aplica, **unidad asignada** (ambulancia/policía/bomberos/rescate).

### 9.1 Botón SOS y llamada a autoridades (importante)

El botón SOS activa la emergencia dentro de la aplicación.

- En móviles, la app intenta abrir el marcador con el número de emergencia (por defecto `911`).
- En computadoras, el navegador normalmente no puede iniciar una llamada real; se muestra un cuadro con el número para llamar manualmente o copiarlo.

> Recomendación: en una emergencia real, llama a tu número local de emergencias además de usar la app.

### 9.2 Lo que verás

- Tipo de emergencia y estado: Activa / En seguimiento / Resuelta.
- Ubicación (si está disponible) y mapa.
- Evidencias: foto y/o audio.
- Acciones: llamar LENS (simulador), enviar evidencia, cancelar emergencia (con PIN).

## 10. Evidencias (foto y audio)

### Foto

- Puede capturarse automáticamente o manualmente según el flujo y permisos.
- Se adjunta como evidencia de la emergencia.

### Audio

- Graba desde el micrófono por tiempo controlado.
- Se envía como evidencia al sistema.

## 11. Llamada con LENS (operadora virtual) — simulador

“Llamar LENS” abre un simulador de conversación:

- LENS habla con voz sintetizada y responde según lo que digas.
- Si el micrófono no funciona, revisa permisos del navegador.
- Responde con frases cortas y claras (una idea por frase).

## 12. Perfil médico

En “Mi Perfil” puedes completar información útil para emergencias, como:

- Datos de contacto y dirección.
- Datos médicos: tipo de sangre, alergias, condiciones.

## 13. Contactos de emergencia

Permite agregar contactos (por ejemplo, familiares o personas de confianza).

- Recomendado: agregar al menos 1 contacto con email válido si tu entorno usa notificaciones por correo.

## 14. Notificaciones

La app puede usar notificaciones del sistema (si concedes permisos) para:

- Recordatorios (por ejemplo, medicamentos).
- Mensajes puntuales del sistema.

## 15. Donaciones (modo demo)

El módulo de donaciones permite contribuir a campañas.

- En modo demo, al continuar se genera un código de verificación.
- El código se envía por notificación del sistema si está permitido. Si no, puedes usar “Reenviar” o “Mostrar aquí”.

## 16. Solución de problemas (Troubleshooting)

- No hay ubicación: requiere permiso del navegador y se recomienda HTTPS o `localhost`.
- No funciona micrófono/cámara: revisa permisos del sitio y recarga la página.
- No llegan notificaciones: habilita notificaciones en el navegador y en el sistema operativo.
- “Too many login failures”: espera ~1 minuto e intenta de nuevo (Odoo aplica bloqueo temporal tras múltiples intentos fallidos).

