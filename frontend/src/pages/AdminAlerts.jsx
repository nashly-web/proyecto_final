// AdminAlerts: panel para el operador/admin.
// Muestra alertas activas, permite cambiar estados y revisar informacion relacionada.
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { BatteryBadge } from "../hooks/useBattery";
import AdminOperatorPanel from "../components/Adminoperatorpanel";
import AuditLog from "../components/AuditLog";
import IncidentMap from "../components/IncidentMap";
import AdminGeofence from "../components/AdminGeofence"; // RF16

const NAMES = {
  medical: "Emergencia Medica",
  security: "Emergencia de Seguridad",
  fire: "Incendio",
  accident: "Accidente",
};

const STATUS_META = {
  active: { label: "Activo", color: "#E53935", icon: "ri-alarm-warning-fill" },
  monitoring: {
    label: "En seguimiento",
    color: "#7C3AED",
    icon: "ri-eye-fill",
  },
  resolved: {
    label: "Resuelto",
    color: "#16a34a",
    icon: "ri-shield-check-fill",
  },
  false_alarm: {
    label: "Falso positivo",
    color: "#F59E0B",
    icon: "ri-error-warning-fill",
  },
  cancelled: {
    label: "Cancelado",
    color: "#64748b",
    icon: "ri-close-circle-fill",
  },
};

const UNIT_META = {
  ambulancia: {
    label: "Ambulancia",
    icon: "ri-heart-pulse-fill",
    color: "#E53935",
  },
  policia: { label: "Policia", icon: "ri-shield-fill", color: "#1565C0" },
  bomberos: { label: "Bomberos", icon: "ri-fire-fill", color: "#F97316" },
  rescate: {
    label: "Rescate",
    icon: "ri-first-aid-kit-fill",
    color: "#7C3AED",
  },
  multiple: { label: "Multiples", icon: "ri-team-fill", color: "#0D1B2A" },
};

function UnitBadge({ unit }) {
  if (!unit) return null;
  const meta = UNIT_META[unit] || {
    label: unit,
    icon: "ri-car-fill",
    color: "#555",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 20,
        background: meta.color + "18",
        color: meta.color,
      }}
    >
      <i className={meta.icon} style={{ fontSize: 12 }} />
      {meta.label}
    </span>
  );
}

function UnitSelector({ alertId, currentUnit, onAssigned }) {
  const [selected, setSelected] = useState(currentUnit || "ambulancia");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function assign() {
    setLoading(true);
    try {
      const r = await fetch(`/api/emergency/unit/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ unit: selected }),
      });
      const d = await r.json();
      if (d.ok) {
        onAssigned(selected);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="unit-selector">
      <p className="unit-selector-label">
        <i className="ri-car-fill" /> Asignar unidad de respuesta
      </p>
      <div className="unit-selector-grid">
        {Object.entries(UNIT_META).map(([key, meta]) => (
          <button
            key={key}
            className={`unit-btn ${selected === key ? "unit-btn--active" : ""}`}
            style={
              selected === key
                ? {
                    borderColor: meta.color,
                    background: meta.color + "18",
                    color: meta.color,
                  }
                : {}
            }
            onClick={() => setSelected(key)}
          >
            <i className={meta.icon} />
            <span>{meta.label}</span>
          </button>
        ))}
      </div>
      <button
        className="btn unit-assign-btn"
        onClick={assign}
        disabled={loading}
      >
        {saved
          ? "✓ Unidad asignada"
          : loading
            ? "Asignando..."
            : `Confirmar — ${UNIT_META[selected]?.label}`}
      </button>
    </div>
  );
}

function fmtAgo(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`;
  return `hace ${Math.round(diff / 3600)}h`;
}

export default function AdminAlerts() {
  const { user } = useStore();
  const [alerts, setAlerts] = useState([]);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);

  async function loadAlerts() {
    try {
      const r = await fetch("/api/emergency/alerts", {
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error || "No se pudieron cargar alertas");
        return;
      }
      setErr("");
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
    } catch {
      setErr("No se pudieron cargar alertas");
    }
  }

  useEffect(() => {
    let alive = true;
    async function tick() {
      if (alive) await loadAlerts();
    }
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  async function changeStatus(alertId, status) {
    const r = await fetch(`/api/emergency/status/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    const d = await r.json();
    if (d.ok) await loadAlerts();
  }

  function handleUnitAssigned(alertId, unit) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, unit } : a)),
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <div>
          <h2 className="admin-title">Panel Admin</h2>
          <p className="admin-sub">Alertas activas en tiempo real.</p>
        </div>
        <div className="admin-pill">
          <span className="dot-live" />
          {alerts.length} en peligro
        </div>
      </div>

      {err && (
        <div className="admin-warn">
          <i className="ri-error-warning-line" /> {err}
        </div>
      )}

      {/* ── Mapa con zonas de color + clima en tiempo real ── */}
      <div className="map-card">
        <div className="map-head">
          <div>
            <strong>Mapa de emergencias</strong>
            <div className="map-sub">
              Zonas de color segun concentracion · Clima en tiempo real
            </div>
          </div>
          <i className="ri-map-2-fill" style={{ color: "var(--muted)" }} />
        </div>
        <IncidentMap
          isAdmin={true}
          initialAlerts={alerts}
          showWeather={true}
          compact={false}
        />
      </div>

      {/* ── Lista de alertas ── */}
      <div className="admin-list">
        {alerts.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>
            <i className="ri-shield-check-fill" />
            <p>Sin emergencias activas</p>
          </div>
        ) : (
          alerts.map((a) => {
            const meta = STATUS_META[a.status] || STATUS_META.active;
            const isOpen = expanded === (a.id || a.uid);
            const battLow =
              a.battery !== null &&
              a.battery !== undefined &&
              a.battery <= 20 &&
              !a.charging;

            return (
              <div
                key={a.id || a.uid}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div
                  className="admin-item"
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpanded(isOpen ? null : a.id || a.uid)}
                >
                  <div
                    className="admin-item-ic"
                    style={{ background: meta.color + "22", color: meta.color }}
                  >
                    <i className={meta.icon} />
                  </div>
                  <div className="admin-item-body">
                    <strong>{a.name || a.email || `UID ${a.uid}`}</strong>
                    <span>
                      {NAMES[a.type] || "Emergencia"} · {fmtAgo(a.ts)}
                    </span>
                  </div>
                  <UnitBadge unit={a.unit} />
                  {a.battery !== null && a.battery !== undefined && (
                    <BatteryBadge level={a.battery} charging={a.charging} />
                  )}
                  <span
                    className="h-badge"
                    style={{
                      background: meta.color + "22",
                      color: meta.color,
                      marginLeft: 6,
                    }}
                  >
                    {meta.label}
                  </span>
                  <i
                    className={`ri-arrow-${isOpen ? "up" : "down"}-s-line`}
                    style={{ color: "var(--muted)", marginLeft: 4 }}
                  />
                </div>

                {isOpen && (
                  <div style={{ padding: "8px 16px 16px" }}>
                    {a.battery !== null && a.battery !== undefined && (
                      <div
                        className={`admin-battery-info ${battLow ? "admin-battery-info--low" : ""}`}
                      >
                        <BatteryBadge
                          level={a.battery}
                          charging={a.charging}
                          showLabel
                        />
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          {a.charging
                            ? "Cargando"
                            : battLow
                              ? "Bateria baja"
                              : "Nivel de bateria"}
                        </span>
                      </div>
                    )}

                    <UnitSelector
                      alertId={a.id}
                      currentUnit={a.unit}
                      onAssigned={(unit) => handleUnitAssigned(a.id, unit)}
                    />

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 10,
                      }}
                    >
                      {a.lat && a.lng && (
                        <a
                          className="btn btn-muted"
                          style={{ fontSize: 12, padding: "6px 12px" }}
                          href={`https://maps.google.com/?q=${a.lat},${a.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <i className="ri-map-pin-line" /> Ver ubicacion
                        </a>
                      )}
                      {a.status !== "monitoring" && a.status !== "resolved" && (
                        <button
                          className="btn"
                          style={{
                            fontSize: 12,
                            padding: "6px 12px",
                            background: "#f5f3ff",
                            color: "#7C3AED",
                            border: "1px solid #7C3AED44",
                          }}
                          onClick={() => changeStatus(a.id, "monitoring")}
                        >
                          <i className="ri-eye-fill" /> En seguimiento
                        </button>
                      )}
                      {a.status !== "resolved" && (
                        <button
                          className="btn"
                          style={{
                            fontSize: 12,
                            padding: "6px 12px",
                            background: "#f0fdf4",
                            color: "#16a34a",
                            border: "1px solid #16a34a44",
                          }}
                          onClick={() => changeStatus(a.id, "resolved")}
                        >
                          <i className="ri-shield-check-fill" /> Resolver
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── RF16: Geofencing ── */}
      {user?.email && (
        <div className="map-card" style={{ marginTop: 16 }}>
          <div className="map-head">
            <div>
              <strong>Zonas Seguras / Peligrosas</strong>
              <div className="map-sub">
                Gestiona zonas geofencing de todos los usuarios.
              </div>
            </div>
            <i className="ri-shield-check-fill" style={{ color: "#22d3b7" }} />
          </div>
          <div style={{ padding: "14px" }}>
            <AdminGeofence adminEmail={user.email} />
          </div>
        </div>
      )}

      {/* ── Auditoría ── */}
      {user?.email && (
        <div className="map-card" style={{ marginTop: 16 }}>
          <div className="map-head">
            <div>
              <strong>Registro de Auditoria</strong>
              <div className="map-sub">Acciones del sistema.</div>
            </div>
            <i
              className="ri-file-list-3-fill"
              style={{ color: "var(--muted)" }}
            />
          </div>
          <AuditLog email={user.email} isAdmin={true} />
        </div>
      )}

      {/* ── Chat Operador ── */}
      {user?.email && (
        <div className="map-card" style={{ marginTop: 16 }}>
          <div className="map-head">
            <div>
              <strong>Chat Operador</strong>
              <div className="map-sub">Conversa con usuarios.</div>
            </div>
            <i
              className="ri-customer-service-2-fill"
              style={{ color: "var(--muted)" }}
            />
          </div>
          <div
            style={{
              marginTop: 12,
              height: 520,
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid var(--border)",
              background: "#fff",
            }}
          >
            <AdminOperatorPanel adminEmail={user.email} />
          </div>
        </div>
      )}
    </div>
  );
}
