// frontend/src/hooks/useGeofence.js
// RF16 - Geofencing: monitorea la posicion GPS del usuario y compara con zonas activas.
// Dispara callbacks cuando el usuario entra o sale de una zona.

import { useEffect, useRef, useCallback } from "react";

const API = "/api/geofence";
const POLL_MS = 30_000; // check GPS cada 30 segundos
const ZONES_MS = 60_000; // recargar zonas cada 60 segundos

/**
 * Calcula distancia en metros entre dos coordenadas (Haversine).
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6_371_000; // metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * useGeofence(options)
 *
 * options:
 *   userEmail   {string}   - email del usuario autenticado
 *   userId      {number}   - uid del usuario
 *   onViolation {function} - callback({ zone, eventType, lat, lng })
 *   enabled     {boolean}  - activar/desactivar el hook (default true)
 */
export function useGeofence({
  userEmail,
  userId,
  onViolation,
  enabled = true,
}) {
  const zonesRef = useRef([]); // zonas activas cargadas del backend
  const insideRef = useRef({}); // { zoneId: true/false } estado actual
  const reportedRef = useRef({}); // evitar reportar el mismo evento dos veces seguidas

  // ── Cargar zonas activas ────────────────────────────────────────────────
  const fetchZones = useCallback(async () => {
    if (!userEmail || !userId) return;
    try {
      const res = await fetch(
        `${API}/zones?requester_email=${encodeURIComponent(userEmail)}&user_id=${userId}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.zones) {
        zonesRef.current = data.zones.filter((z) => z.x_active);
      }
    } catch (e) {
      console.warn("[useGeofence] fetchZones error:", e);
    }
  }, [userEmail, userId]);

  // ── Registrar evento en backend ─────────────────────────────────────────
  const reportEvent = useCallback(
    async (zone, eventType, lat, lng) => {
      const key = `${zone.id}-${eventType}`;
      if (reportedRef.current[key]) return; // ya reportado
      reportedRef.current[key] = true;
      // limpiar flag opuesto para próximo ciclo
      const opposite = eventType === "exit" ? "enter" : "exit";
      delete reportedRef.current[`${zone.id}-${opposite}`];

      try {
        await fetch(`${API}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            requester_email: userEmail,
            zone_id: zone.id,
            zone_name: zone.x_name,
            zone_type: zone.x_type,
            event_type: eventType,
            lat,
            lng,
          }),
        });
        // Refrescar UI sin esperar el proximo polling.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("emergelens:geofence:refresh"));
          window.dispatchEvent(new Event("emergelens:notif:refresh"));
        }
      } catch (e) {
        console.warn("[useGeofence] reportEvent error:", e);
      }

      // Notificar al componente
      onViolation?.({ zone, eventType, lat, lng });
    },
    [userEmail, onViolation],
  );

  // ── Comprobar posicion actual contra zonas ──────────────────────────────
  const checkPosition = useCallback(() => {
    if (!navigator.geolocation || zonesRef.current.length === 0) return;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;

        zonesRef.current.forEach((zone) => {
          const dist = haversine(lat, lng, zone.x_lat, zone.x_lng);
          const inside = dist <= zone.x_radius;
          const wasInside = insideRef.current[zone.id] ?? null;

          if (zone.x_type === "safe") {
            // zona SEGURA: alerta si SALE
            // Si es la primera lectura y ya esta fuera, disparar advertencia tambien.
            if (wasInside === null && !inside) {
              reportEvent(zone, "exit", lat, lng);
            } else if (wasInside === true && !inside) {
              reportEvent(zone, "exit", lat, lng);
            } else if (wasInside === false && inside) {
              // volvio a entrar — limpiar flag para próximo exit
              delete reportedRef.current[`${zone.id}-exit`];
              onViolation?.({ zone, eventType: "enter", lat, lng });
            }
          } else {
            // zona PELIGROSA: alerta si ENTRA
            // Si es la primera lectura (wasInside === null) y ya esta dentro,
            // contamos eso como una "entrada" para que aparezca en Alertas.
            if ((wasInside === false || wasInside === null) && inside) {
              reportEvent(zone, "enter", lat, lng);
            } else if (wasInside === true && !inside) {
              delete reportedRef.current[`${zone.id}-enter`];
            }
          }

          insideRef.current[zone.id] = inside;
        });
      },
      (err) => console.warn("[useGeofence] GPS error:", err),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 20_000 },
    );
  }, [reportEvent, onViolation]);

  // ── Efecto principal ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !userEmail || !userId) return;

    fetchZones();

    const zoneInterval = setInterval(fetchZones, ZONES_MS);
    const pollInterval = setInterval(checkPosition, POLL_MS);

    // Primera comprobación inmediata (tras primer fetchZones)
    const initTimeout = setTimeout(checkPosition, 3_000);

    return () => {
      clearInterval(zoneInterval);
      clearInterval(pollInterval);
      clearTimeout(initTimeout);
    };
  }, [enabled, userEmail, userId, fetchZones, checkPosition]);

  return { refetchZones: fetchZones };
}

/**
 * Exportar haversine para usar en el mapa (calcular si punto está dentro)
 */
export { haversine };
