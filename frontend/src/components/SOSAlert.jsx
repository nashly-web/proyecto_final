// frontend/src/components/SOSAlert.jsx
// Notificacion flotante en tiempo real para contactos de emergencia.
// El mapa muestra la ubicacion REAL en tiempo real de la victima (viene del
// backend via polling cada 5s) y la ubicacion del receptor (GPS propio).

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";

const POLL_INTERVAL = 5000; // ms — igual que antes
const OSRM = "https://router.project-osrm.org/route/v1/driving";

const TYPE_LABELS = {
  medical: "Emergencia Médica",
  security: "Emergencia de Seguridad",
  fire: "Incendio",
  accident: "Accidente",
};
const TYPE_COLORS = {
  medical: "#E53935",
  security: "#7C3AED",
  fire: "#F97316",
  accident: "#F59E0B",
};
const TYPE_ICONS = {
  medical: "ri-heart-pulse-fill",
  security: "ri-shield-fill",
  fire: "ri-fire-fill",
  accident: "ri-car-fill",
};

// ── Haversine km ──────────────────────────────────────────────────────────────
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ── Battery bar ───────────────────────────────────────────────────────────────
function BatteryBar({ level, charging }) {
  if (level == null) return null;
  const color = level <= 20 ? "#E53935" : level <= 50 ? "#F59E0B" : "#10B981";
  const icon = charging
    ? "ri-battery-charging-fill"
    : level <= 20
      ? "ri-battery-low-fill"
      : "ri-battery-fill";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 8,
        padding: "6px 10px",
        marginBottom: 8,
      }}
    >
      <i className={icon} style={{ color, fontSize: 16 }} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.15)",
            borderRadius: 4,
            height: 5,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(2, level)}%`,
              background: color,
              height: "100%",
              borderRadius: 4,
              transition: "width 0.5s",
            }}
          />
        </div>
      </div>
      <span
        style={{
          fontSize: 11,
          color: "#cbd5e1",
          minWidth: 36,
          textAlign: "right",
        }}
      >
        {level}%{charging ? " ⚡" : ""}
      </span>
      {level <= 20 && !charging && (
        <span style={{ fontSize: 10, color: "#E53935", fontWeight: 700 }}>
          BAJA
        </span>
      )}
    </div>
  );
}

// ── Map for one alert ─────────────────────────────────────────────────────────
// victimPos = { lat, lng } actualizado desde el padre (polling del backend).
// myPos     = { lat, lng } GPS propio del receptor.
function AlertMap({ victimPos, myPos, color }) {
  const mapRef = useRef(null);
  const leafRef = useRef(null); // L.Map instance
  const victimMarkerRef = useRef(null);
  const myMarkerRef = useRef(null);
  const routeRef = useRef(null);
  const lastRouteKeyRef = useRef(""); // evitar refetch innecesario

  // ── Init mapa ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !victimPos) return;

    let retries = 0;
    const tryInit = () => {
      if (!window.L) {
        if (retries++ < 25) setTimeout(tryInit, 200);
        return;
      }
      if (leafRef.current) return;
      const L = window.L;

      const map = L.map(mapRef.current, {
        center: [victimPos.lat, victimPos.lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
      });
      leafRef.current = map;

      // Tiles — OpenStreetMap (misma apariencia que Google Maps)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Marcador víctima (pin teardrop rojo/color)
      victimMarkerRef.current = L.marker([victimPos.lat, victimPos.lng], {
        icon: makePinIcon(color),
      }).addTo(map);
    };
    tryInit();

    return () => {
      if (leafRef.current) {
        leafRef.current.remove();
        leafRef.current = null;
        victimMarkerRef.current = null;
        myMarkerRef.current = null;
        routeRef.current = null;
      }
    };
  }, []); // solo una vez

  // ── Actualizar marcador víctima cuando llega nueva posición del backend ───
  useEffect(() => {
    if (!victimPos || !leafRef.current) return;
    const L = window.L;
    if (!L) return;

    if (victimMarkerRef.current) {
      victimMarkerRef.current.setLatLng([victimPos.lat, victimPos.lng]);
    } else {
      victimMarkerRef.current = L.marker([victimPos.lat, victimPos.lng], {
        icon: makePinIcon(color),
      }).addTo(leafRef.current);
    }

    // Redibujar ruta si cambian las coordenadas suficientemente
    if (myPos) refreshRoute(myPos, victimPos);
  }, [victimPos?.lat, victimPos?.lng]);

  // ── Actualizar marcador propio ─────────────────────────────────────────────
  useEffect(() => {
    if (!myPos || !leafRef.current) return;
    const L = window.L;
    if (!L) return;

    if (myMarkerRef.current) {
      myMarkerRef.current.setLatLng([myPos.lat, myPos.lng]);
    } else {
      myMarkerRef.current = L.marker([myPos.lat, myPos.lng], {
        icon: makeMyIcon(),
      }).addTo(leafRef.current);
    }

    if (victimPos) refreshRoute(myPos, victimPos);
  }, [myPos?.lat, myPos?.lng]);

  // ── Ruta OSRM ──────────────────────────────────────────────────────────────
  const refreshRoute = useCallback(async (from, to) => {
    // Evitar refetch si las coords apenas cambiaron (< 10 m)
    const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}-${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
    if (key === lastRouteKeyRef.current) return;
    lastRouteKeyRef.current = key;

    try {
      const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const data = await fetch(url).then((r) => r.json());
      if (data.code !== "Ok") return;

      const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [
        lat,
        lng,
      ]);
      const map = leafRef.current;
      if (!map || !window.L) return;

      if (routeRef.current) map.removeLayer(routeRef.current);
      routeRef.current = window.L.polyline(coords, {
        color: "#3B82F6",
        weight: 6,
        opacity: 0.9,
        lineJoin: "round",
      }).addTo(map);

      // Fit para mostrar ambos puntos
      map.fitBounds(
        window.L.latLngBounds([
          [from.lat, from.lng],
          [to.lat, to.lng],
        ]),
        { padding: [45, 45] },
      );
    } catch (e) {
      console.warn("[SOSAlert map] OSRM:", e);
    }
  }, []);

  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "100%", minHeight: 200 }}
    />
  );
}

function makePinIcon(color) {
  return window.L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:30px;height:40px">
        <div style="
          position:absolute;bottom:0;left:50%;
          width:28px;height:36px;
          background:${color};
          border-radius:50% 50% 50% 0;
          transform:translateX(-50%) rotate(-45deg);
          border:3px solid white;
          box-shadow:0 3px 10px rgba(0,0,0,0.45)
        "></div>
        <div style="
          position:absolute;bottom:9px;left:50%;transform:translateX(-50%);
          width:12px;height:12px;border-radius:50%;
          background:white;z-index:1
        "></div>
      </div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  });
}

function makeMyIcon() {
  return window.L.divIcon({
    className: "",
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:#3B82F6;
      border:3px solid white;
      box-shadow:0 0 0 5px rgba(59,130,246,0.25),0 2px 8px rgba(0,0,0,0.4)
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

// ── Single alert card ─────────────────────────────────────────────────────────
function AlertCard({ alert, myPos, onDismiss }) {
  const color = TYPE_COLORS[alert.type] || "#E53935";
  const label = TYPE_LABELS[alert.type] || "Emergencia";
  const icon = TYPE_ICONS[alert.type] || "ri-alarm-warning-fill";

  // victimPos viene del objeto alert, que el padre actualiza en cada poll
  const victimPos =
    alert.lat != null && alert.lng != null
      ? { lat: parseFloat(alert.lat), lng: parseFloat(alert.lng) }
      : null;

  const distKm =
    myPos && victimPos ? haversineKm(myPos, victimPos).toFixed(1) : null;
  const estMin = distKm ? Math.ceil((parseFloat(distKm) / 30) * 60) : null;

  function openGoogleMaps() {
    if (!victimPos) return;
    const dest = `${victimPos.lat},${victimPos.lng}`;
    const origin = myPos ? `${myPos.lat},${myPos.lng}` : "";
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    window.open(url, "_blank");
  }

  return (
    <div
      style={{
        background: "#0D1B2A",
        borderRadius: 16,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5),0 0 0 1.5px ${color}55`,
        overflow: "hidden",
        animation: "sosSlideIn 0.35s cubic-bezier(.22,.68,0,1.2)",
        border: `1px solid ${color}33`,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg,${color}ee,${color}99)`,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <i className={icon} style={{ color: "#fff", fontSize: 16 }} />
          </div>
          <div>
            <div
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: 13,
                lineHeight: 1.2,
              }}
            >
              {label}
            </div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>
              Alerta activa
            </div>
          </div>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#fff",
              animation: "sosPulse 1s infinite",
              marginLeft: 4,
            }}
          />
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            color: "#fff",
            borderRadius: "50%",
            width: 26,
            height: 26,
            cursor: "pointer",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <i className="ri-close-line" />
        </button>
      </div>

      {/* Contact name + address */}
      <div style={{ padding: "12px 14px 6px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: color + "22",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <i className="ri-user-fill" style={{ color, fontSize: 18 }} />
          </div>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}>
              {alert.user_name}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 11 }}>
              Te tiene como contacto de emergencia
            </div>
          </div>
        </div>

        {alert.address && (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "7px 10px",
              marginBottom: 6,
              fontSize: 12,
              color: "#cbd5e1",
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            <i
              className="ri-map-pin-fill"
              style={{ color, marginTop: 1, flexShrink: 0 }}
            />
            <span>{alert.address}</span>
          </div>
        )}

        {/* Coordenadas en tiempo real de la víctima */}
        {victimPos && (
          <div
            style={{
              fontSize: 10,
              color: "#64748b",
              marginBottom: 6,
              paddingLeft: 2,
            }}
          >
            📍 {victimPos.lat.toFixed(5)}, {victimPos.lng.toFixed(5)}
            <span style={{ color: "#22d3ee", marginLeft: 6 }}>● en vivo</span>
          </div>
        )}

        <BatteryBar level={alert.battery} charging={alert.charging} />
      </div>

      {/* MAP — aparece siempre que haya coordenadas de la víctima */}
      <div style={{ position: "relative", height: 210 }}>
        {victimPos ? (
          <>
            <AlertMap victimPos={victimPos} myPos={myPos} color={color} />

            {/* Stats chip — esquina superior izquierda (como Google Maps) */}
            {distKm && (
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 1000,
                  background: "rgba(13,27,42,0.92)",
                  borderRadius: 10,
                  padding: "7px 13px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  border: `1px solid ${color}55`,
                  boxShadow: "0 2px 14px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Distancia
                  </div>
                  <div
                    style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15 }}
                  >
                    {distKm} km
                  </div>
                </div>
                <div
                  style={{
                    width: 1,
                    height: 26,
                    background: "rgba(255,255,255,0.1)",
                  }}
                />
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Tiempo
                  </div>
                  <div
                    style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15 }}
                  >
                    ~{estMin} min
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div
              style={{
                position: "absolute",
                bottom: 8,
                right: 8,
                zIndex: 1000,
                background: "rgba(13,27,42,0.88)",
                borderRadius: 8,
                padding: "5px 9px",
                fontSize: 10,
                color: "#cbd5e1",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: color,
                    border: "2px solid white",
                  }}
                />
                <span style={{ fontWeight: 600 }}>{alert.user_name}</span>
              </div>
              {myPos && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#3B82F6",
                      border: "2px solid white",
                    }}
                  />
                  <span>Tu ubicación</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: "#111827",
            }}
          >
            <i
              className="ri-map-pin-line"
              style={{ fontSize: 28, color: "#374151" }}
            />
            <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>
              Esperando ubicación GPS...
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          padding: "10px 14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {victimPos && (
          <button
            onClick={openGoogleMaps}
            style={{
              width: "100%",
              background: `linear-gradient(135deg,${color},${color}cc)`,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: 12,
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: `0 4px 16px ${color}44`,
              letterSpacing: 0.3,
            }}
          >
            <i className="ri-navigation-fill" />
            Ir ahora — Abrir navegación
          </button>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {victimPos && (
            <button
              onClick={openGoogleMaps}
              style={{
                flex: 1,
                background: "rgba(59,130,246,0.13)",
                color: "#93c5fd",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: 10,
                padding: "9px 8px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <i className="ri-map-2-fill" /> Abrir Maps
            </button>
          )}
          <button
            onClick={() => onDismiss(alert.id)}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              color: "#94a3b8",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: "9px 8px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root: polling + GPS propio + container ────────────────────────────────────
export default function SOSAlert() {
  const { user } = useStore();
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [myPos, setMyPos] = useState(null);
  const seenRef = useRef(new Set());
  const watchRef = useRef(null);

  // ── Cargar Leaflet (CDN) si no está disponible ────────────────────────────
  useEffect(() => {
    if (window.L) return;
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[src*="leaflet"]')) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      document.head.appendChild(script);
    }
  }, []);

  // ── GPS propio del receptor (actualización continua) ─────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) =>
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("[SOSAlert] GPS receptor:", err),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 },
    );
    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // ── Polling /api/emergency/contact-alerts cada 5s ────────────────────────
  // El backend ya devuelve x_lat / x_lng actualizados porque EmergencyActive
  // llama /api/emergency/location cada ~2s y upsert_alert_odoo lo persiste.
  useEffect(() => {
    if (!user?.id && !user?.uid) return;

    const poll = async () => {
      try {
        const res = await fetch("/api/emergency/contact-alerts", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.alerts?.length > 0) {
          // Alertas nuevas — añadir al estado
          const newAlerts = data.alerts.filter(
            (a) => !seenRef.current.has(a.id) && !dismissed.has(a.id),
          );
          newAlerts.forEach((a) => seenRef.current.add(a.id));

          setAlerts((prev) => {
            const ids = new Set(prev.map((x) => x.id));
            // Actualizar lat/lng de alertas existentes con datos frescos del backend
            const updated = prev.map((existing) => {
              const fresh = data.alerts.find((a) => a.id === existing.id);
              if (!fresh) return existing;
              // Reemplazar lat/lng con la posición más reciente
              return {
                ...existing,
                lat: fresh.lat,
                lng: fresh.lng,
                battery: fresh.battery,
                charging: fresh.charging,
                address: fresh.address || existing.address,
              };
            });
            // Añadir las completamente nuevas
            const extras = newAlerts.filter((a) => !ids.has(a.id));
            return [...updated, ...extras];
          });
        }

        // Eliminar alertas que ya no están activas en el backend
        if (data.alerts) {
          const activeIds = new Set(data.alerts.map((a) => a.id));
          setAlerts((prev) =>
            prev.filter((a) => activeIds.has(a.id) || dismissed.has(a.id)),
          );
        }
      } catch (e) {
        console.warn("[SOSAlert] poll error:", e);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user?.id, user?.uid, dismissed]);

  function dismiss(id) {
    setDismissed((prev) => new Set([...prev, id]));
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <>
      <style>{`
        @keyframes sosSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
        @keyframes sosPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.4; transform:scale(1.4); }
        }
        .leaflet-container { font-family: inherit !important; }
        .leaflet-popup-content-wrapper {
          background: #0D1B2A !important;
          color: #f1f5f9 !important;
          border-radius: 10px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .leaflet-popup-tip { background: #0D1B2A !important; }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: "72px",
          right: "12px",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxWidth: "340px",
          width: "calc(100vw - 24px)",
        }}
      >
        {visible.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            myPos={myPos}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </>
  );
}
