// frontend/src/components/SOSAlert.jsx
// Notificacion flotante en tiempo real para contactos de emergencia.

import { useState, useEffect, useRef } from "react";
import { useStore } from "../store";

const POLL_INTERVAL = 5000;

const TYPE_LABELS = {
  medical: "Emergencia Medica",
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

function BatteryBar({ level, charging }) {
  if (level === null || level === undefined) return null;
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
        marginBottom: 10,
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

export default function SOSAlert() {
  const { user } = useStore();
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const seenRef = useRef(new Set());

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
          const newAlerts = data.alerts.filter(
            (a) => !seenRef.current.has(a.id) && !dismissed.has(a.id),
          );
          if (newAlerts.length > 0) {
            newAlerts.forEach((a) => seenRef.current.add(a.id));
            setAlerts((prev) => {
              const ids = new Set(prev.map((x) => x.id));
              return [...prev, ...newAlerts.filter((a) => !ids.has(a.id))];
            });
          }
        }

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

  function dismiss(alertId) {
    setDismissed((prev) => new Set([...prev, alertId]));
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  function openMaps(lat, lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, "_blank");
  }

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "72px",
        right: "12px",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "340px",
        width: "calc(100vw - 24px)",
      }}
    >
      {visible.map((alert) => {
        const color = TYPE_COLORS[alert.type] || "#E53935";
        const label = TYPE_LABELS[alert.type] || "Emergencia";
        const icon = TYPE_ICONS[alert.type] || "ri-alarm-warning-fill";

        return (
          <div
            key={alert.id}
            style={{
              background: "#0D1B2A",
              borderRadius: 16,
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1.5px ${color}55`,
              overflow: "hidden",
              animation: "sosSlideIn 0.35s cubic-bezier(.22,.68,0,1.2)",
              border: `1px solid ${color}33`,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: `linear-gradient(135deg, ${color}ee, ${color}99)`,
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
                  <div
                    style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}
                  >
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
                onClick={() => dismiss(alert.id)}
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

            {/* Body */}
            <div style={{ padding: "14px 14px 12px" }}>
              {/* Nombre del usuario */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
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
                  <div
                    style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}
                  >
                    {alert.user_name}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 11 }}>
                    Te tiene como contacto de emergencia
                  </div>
                </div>
              </div>

              {/* Direccion */}
              {alert.address && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    marginBottom: 8,
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

              {/* Coordenadas */}
              {alert.lat && alert.lng && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#64748b",
                    marginBottom: 8,
                    paddingLeft: 2,
                  }}
                >
                  {Number(alert.lat).toFixed(5)}, {Number(alert.lng).toFixed(5)}
                </div>
              )}

              {/* Bateria */}
              <BatteryBar level={alert.battery} charging={alert.charging} />

              {/* Botones */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {alert.lat && alert.lng && (
                  <button
                    onClick={() => openMaps(alert.lat, alert.lng)}
                    style={{
                      flex: 1,
                      background: `linear-gradient(135deg, ${color}, ${color}bb)`,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      boxShadow: `0 4px 12px ${color}44`,
                    }}
                  >
                    <i className="ri-map-2-fill" />
                    Ir ahora
                  </button>
                )}
                <button
                  onClick={() => dismiss(alert.id)}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#94a3b8",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10,
                    padding: "10px 14px",
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
      })}

      <style>{`
        @keyframes sosSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
        @keyframes sosPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .4; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}
