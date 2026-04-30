/**
 * IncidentMap.jsx
 * Mapa de incidentes con:
 * - Zonas de color (roja/naranja/verde) basadas en concentracion de alertas
 * - Alerta climatica en tiempo real (Open-Meteo via backend)
 * - Filtros por tipo de emergencia y estado
 * - Marcadores con popups detallados
 * - Auto-refresh cada 15s
 */

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
  LayerGroup,
} from "react-leaflet";
import L from "leaflet";

// ── Constantes ────────────────────────────────────────────────────────────────

const EMERGENCY_NAMES = {
  medical: "Emergencia Medica",
  security: "Emergencia de Seguridad",
  fire: "Incendio",
  accident: "Accidente",
};

const EMERGENCY_COLORS = {
  medical: "#E53935",
  security: "#7C3AED",
  fire: "#F97316",
  accident: "#F59E0B",
};

const STATUS_META = {
  active: { label: "Activo", color: "#E53935" },
  monitoring: { label: "En seguimiento", color: "#7C3AED" },
  resolved: { label: "Resuelto", color: "#16a34a" },
  false_alarm: { label: "Falso positivo", color: "#F59E0B" },
  cancelled: { label: "Cancelado", color: "#64748b" },
};

// Zonas de concentracion: radio en metros
const ZONE_RADIUS = 5000;

// Nivel climatico → colores y estilos
const WEATHER_META = {
  red: {
    bg: "#fef2f2",
    border: "#E53935",
    text: "#991b1b",
    dot: "#E53935",
    label: "Alerta Roja",
  },
  orange: {
    bg: "#fff7ed",
    border: "#F97316",
    text: "#9a3412",
    dot: "#F97316",
    label: "Alerta Naranja",
  },
  yellow: {
    bg: "#fffbeb",
    border: "#F59E0B",
    text: "#92400e",
    dot: "#F59E0B",
    label: "Precaucion",
  },
  green: {
    bg: "#f0fdf4",
    border: "#16a34a",
    text: "#14532d",
    dot: "#16a34a",
    label: "Normal",
  },
  unknown: {
    bg: "#f8fafc",
    border: "#94a3b8",
    text: "#475569",
    dot: "#94a3b8",
    label: "Sin datos",
  },
};

// ── Iconos Leaflet ────────────────────────────────────────────────────────────

function makeIcon(color, size = 14) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

const ICONS = {
  medical: makeIcon("#E53935", 16),
  security: makeIcon("#7C3AED", 16),
  fire: makeIcon("#F97316", 16),
  accident: makeIcon("#F59E0B", 16),
  default: makeIcon("#64748b", 14),
};

// ── Helper ────────────────────────────────────────────────────────────────────

function fmtAgo(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`;
  return `hace ${Math.round(diff / 3600)}h`;
}

// Calcula "nivel de zona" segun cantidad de alertas activas en radio
function zoneLevel(count) {
  if (count >= 3)
    return { color: "#E53935", opacity: 0.18, label: "Zona Roja" };
  if (count >= 1)
    return { color: "#F97316", opacity: 0.14, label: "Zona Naranja" };
  return null;
}

// Agrupa marcadores cercanos para dibujar circulos de zona
function buildZones(alerts) {
  const zones = [];
  const used = new Set();

  alerts.forEach((a, i) => {
    if (used.has(i) || !a.lat || !a.lng) return;
    const nearby = alerts.filter((b, j) => {
      if (j === i || !b.lat || !b.lng) return false;
      const dlat = (a.lat - b.lat) * 111000;
      const dlng = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180);
      return Math.sqrt(dlat * dlat + dlng * dlng) < ZONE_RADIUS;
    });
    const count = 1 + nearby.length;
    const level = zoneLevel(count);
    if (level) {
      used.add(i);
      nearby.forEach((_, j) => used.add(j));
      zones.push({ lat: a.lat, lng: a.lng, count, ...level });
    }
  });

  return zones;
}

// ── Sub-componente: recentrar mapa ────────────────────────────────────────────

function RecenterMap({ center }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!center?.lat || !center?.lng) return;
    const key = `${center.lat},${center.lng}`;
    if (key === prev.current) return;
    prev.current = key;
    map.setView([center.lat, center.lng]);
  }, [center, map]);
  return null;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function IncidentMap({
  isAdmin = false,
  initialAlerts = null, // si se pasa, no hace fetch propio
  showWeather = true,
  compact = false, // modo compacto para Home
}) {
  const [alerts, setAlerts] = useState(initialAlerts || []);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(!initialAlerts);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [center, setCenter] = useState({ lat: 18.4861, lng: -69.9312 });
  const timerRef = useRef(null);

  // GPS del usuario para centrar
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    );
  }, []);

  // Cargar alertas (si no vienen como prop)
  const loadAlerts = useCallback(async () => {
    if (initialAlerts) return;
    try {
      const endpoint = isAdmin
        ? "/api/emergency/alerts"
        : "/api/emergency/contact-alerts";
      const r = await fetch(endpoint, { credentials: "include" });
      const d = await r.json();
      const list = d.alerts || [];
      setAlerts(list);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [isAdmin, initialAlerts]);

  // Cargar clima
  const loadWeather = useCallback(async () => {
    if (!showWeather) return;
    try {
      const r = await fetch("/api/weather/alerts", { credentials: "include" });
      const d = await r.json();
      setWeather(d);
    } catch {}
  }, [showWeather]);

  useEffect(() => {
    loadAlerts();
    loadWeather();
    timerRef.current = setInterval(() => {
      loadAlerts();
      loadWeather();
    }, 15000);
    return () => clearInterval(timerRef.current);
  }, [loadAlerts, loadWeather]);

  // Cuando las alertas vienen como prop (desde AdminAlerts)
  useEffect(() => {
    if (initialAlerts) setAlerts(initialAlerts);
  }, [initialAlerts]);

  // Filtrado
  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filterType !== "all" && a.type !== filterType) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      return a.lat && a.lng;
    });
  }, [alerts, filterType, filterStatus]);

  // Zonas de concentracion
  const zones = useMemo(() => buildZones(filtered), [filtered]);

  // Centro del mapa: primera alerta o GPS
  const mapCenter = filtered[0]
    ? { lat: filtered[0].lat, lng: filtered[0].lng }
    : center;

  const wMeta = weather
    ? WEATHER_META[weather.level] || WEATHER_META.unknown
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── Banner de alerta climatica ── */}
      {wMeta && showWeather && (
        <div
          style={{
            background: wMeta.bg,
            border: `1px solid ${wMeta.border}44`,
            borderLeft: `4px solid ${wMeta.border}`,
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: wMeta.dot,
              flexShrink: 0,
              animation:
                weather?.level === "red"
                  ? "weatherPulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          />
          <div style={{ flex: 1 }}>
            <strong style={{ color: wMeta.text }}>{wMeta.label}</strong>
            {weather?.description && (
              <span style={{ color: wMeta.text, opacity: 0.8, marginLeft: 8 }}>
                — {weather.description}
              </span>
            )}
            {weather?.wind_kmh > 0 && (
              <span
                style={{
                  color: wMeta.text,
                  opacity: 0.65,
                  marginLeft: 8,
                  fontSize: 11,
                }}
              >
                💨 {weather.wind_kmh} km/h
              </span>
            )}
            {weather?.precip_mm > 0 && (
              <span
                style={{
                  color: wMeta.text,
                  opacity: 0.65,
                  marginLeft: 6,
                  fontSize: 11,
                }}
              >
                🌧 {weather.precip_mm}mm
              </span>
            )}
          </div>
          {weather?.precip_prob_next6h > 0 && (
            <span
              style={{
                background: wMeta.border + "22",
                color: wMeta.text,
                borderRadius: 20,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {weather.precip_prob_next6h}% lluvia próx. 6h
            </span>
          )}
        </div>
      )}

      {/* ── Filtros (solo admin o si no es compact) ── */}
      {!compact && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* Tipo */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              background: "var(--card, #1a2332)",
              color: "var(--text, #e2e8f0)",
              border: "1px solid var(--border, rgba(255,255,255,.1))",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
            }}
          >
            <option value="all">Todos los tipos</option>
            {Object.entries(EMERGENCY_NAMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          {/* Estado */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              background: "var(--card, #1a2332)",
              color: "var(--text, #e2e8f0)",
              border: "1px solid var(--border, rgba(255,255,255,.1))",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
            }}
          >
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          {/* Contador */}
          <span
            style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}
          >
            {filtered.length} alertas
          </span>
        </div>
      )}

      {/* ── Leyenda de zonas ── */}
      {!compact && zones.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zones.some((z) => z.label === "Zona Roja") && (
            <span
              style={{
                background: "#fef2f2",
                color: "#991b1b",
                border: "1px solid #fca5a5",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              🔴 Zona Roja — alta concentracion
            </span>
          )}
          {zones.some((z) => z.label === "Zona Naranja") && (
            <span
              style={{
                background: "#fff7ed",
                color: "#9a3412",
                border: "1px solid #fdba74",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              🟠 Zona Naranja — incidentes activos
            </span>
          )}
        </div>
      )}

      {/* ── Mapa ── */}
      <div
        style={{
          height: compact ? 220 : 420,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid var(--border, rgba(255,255,255,.08))",
        }}
      >
        {loading ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--card, #1a2332)",
              color: "var(--muted)",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <i
              className="ri-loader-4-line"
              style={{ fontSize: 28, animation: "spin 1s linear infinite" }}
            />
            <span style={{ fontSize: 13 }}>Cargando mapa...</span>
          </div>
        ) : (
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={compact ? 11 : 13}
            scrollWheelZoom={!compact}
            style={{ width: "100%", height: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <RecenterMap center={mapCenter} />

            {/* Circulos de zona */}
            <LayerGroup>
              {zones.map((z, i) => (
                <Circle
                  key={i}
                  center={[z.lat, z.lng]}
                  radius={ZONE_RADIUS}
                  pathOptions={{
                    color: z.color,
                    fillColor: z.color,
                    fillOpacity: z.opacity,
                    weight: 1.5,
                    dashArray: "6 4",
                  }}
                />
              ))}
            </LayerGroup>

            {/* Marcadores de alertas */}
            {filtered.map((a) => {
              const color = EMERGENCY_COLORS[a.type] || "#64748b";
              const icon = ICONS[a.type] || ICONS.default;
              const sMeta = STATUS_META[a.status] || STATUS_META.active;
              const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}&travelmode=driving`;

              return (
                <Marker
                  key={a.id || `${a.lat},${a.lng}`}
                  position={[a.lat, a.lng]}
                  icon={icon}
                >
                  <Popup minWidth={200}>
                    <div style={{ fontFamily: "Arial, sans-serif" }}>
                      <div
                        style={{
                          background: color,
                          color: "#fff",
                          padding: "6px 10px",
                          margin: "-8px -8px 10px",
                          borderRadius: "4px 4px 0 0",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {EMERGENCY_NAMES[a.type] || "Emergencia"}
                      </div>
                      {a.name && (
                        <div style={{ fontSize: 13, marginBottom: 6 }}>
                          <strong>{a.name}</strong>
                        </div>
                      )}
                      <div
                        style={{
                          display: "inline-block",
                          background: sMeta.color + "22",
                          color: sMeta.color,
                          borderRadius: 20,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        {sMeta.label}
                      </div>
                      {a.ts && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#718096",
                            marginBottom: 6,
                          }}
                        >
                          🕐 {fmtAgo(a.ts)}
                        </div>
                      )}
                      {a.battery !== null && a.battery !== undefined && (
                        <div
                          style={{
                            fontSize: 11,
                            color: a.battery <= 20 ? "#E53935" : "#718096",
                            marginBottom: 6,
                          }}
                        >
                          🔋 {a.battery}%{a.charging ? " (cargando)" : ""}
                        </div>
                      )}
                      {a.unit && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#555",
                            marginBottom: 8,
                          }}
                        >
                          🚑 Unidad: {a.unit}
                        </div>
                      )}
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "block",
                          textAlign: "center",
                          background: color,
                          color: "#fff",
                          borderRadius: 8,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          textDecoration: "none",
                          marginTop: 4,
                        }}
                      >
                        🗺️ Navegar hasta aqui
                      </a>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}
      </div>

      <style>{`
        @keyframes weatherPulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(1.5); opacity: .5; }
        }
      `}</style>
    </div>
  );
}
