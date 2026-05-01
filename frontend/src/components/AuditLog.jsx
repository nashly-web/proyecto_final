// frontend/src/components/AuditLog.jsx
// Uso:
//   Usuario: <AuditLog email={user.email} isAdmin={false} />
//   Admin:   <AuditLog email={user.email} isAdmin={true} />

import { useState, useEffect } from "react";

const API = "/api/audit";

const ACTION_ICONS = {
  login: "ri-login-box-line",
  logout: "ri-logout-box-line",
  register: "ri-user-add-line",
  sos_activated: "ri-alarm-warning-fill",
  sos_cancelled: "ri-shield-check-line",
  profile_updated: "ri-user-settings-line",
  evidence_sent: "ri-attachment-2",
  status_changed: "ri-edit-line",
  message_sent: "ri-chat-3-line",
  password_changed: "ri-lock-password-line",
  contact_created: "ri-user-add-line",
  contact_updated: "ri-user-settings-line",
  contact_deleted: "ri-user-unfollow-line",
  geofence_exit_safe: "ri-logout-circle-r-fill",
  geofence_enter_danger: "ri-login-circle-fill",
  danger_confirm_no: "ri-close-circle-line",
  danger_confirm_yes: "ri-alarm-warning-fill",
};

const ACTION_COLORS = {
  sos_activated: "#e53e3e",
  sos_cancelled: "#38a169",
  login: "#3182ce",
  logout: "#718096",
  register: "#6366f1",
  status_changed: "#d69e2e",
  evidence_sent: "#805ad5",
  password_changed: "#0ea5e9",
  contact_deleted: "#f43f5e",
  geofence_enter_danger: "#dc2626",
  danger_confirm_yes: "#b91c1c",
};

const ROLE_BADGE = {
  admin: { label: "Admin", bg: "#e53e3e", color: "#fff" },
  user: { label: "Usuario", bg: "#e2e8f0", color: "#4a5568" },
};

// Solo acciones que realmente se guardan en el backend (VALID_ACTIONS en audit.py).
// Eliminadas: page_view, api_action, alert_viewed, schedule_created, schedule_deleted
const ALL_ACTIONS = [
  { value: "", label: "Todas las acciones" },
  { value: "login", label: "Inicio de sesión" },
  { value: "logout", label: "Cierre de sesión" },
  { value: "register", label: "Registro de cuenta" },
  { value: "sos_activated", label: "SOS activado" },
  { value: "sos_cancelled", label: "SOS cancelado" },
  { value: "profile_updated", label: "Perfil actualizado" },
  { value: "evidence_sent", label: "Evidencia enviada" },
  { value: "status_changed", label: "Estado cambiado" },
  { value: "message_sent", label: "Mensaje enviado" },
  { value: "password_changed", label: "Contraseña cambiada" },
  { value: "contact_created", label: "Contacto creado" },
  { value: "contact_updated", label: "Contacto actualizado" },
  { value: "contact_deleted", label: "Contacto eliminado" },
  { value: "geofence_exit_safe", label: "Salida de zona segura" },
  { value: "geofence_enter_danger", label: "Entrada a zona peligrosa" },
  { value: "danger_confirm_no", label: "Confirmación de peligro: No" },
  { value: "danger_confirm_yes", label: "Confirmación de peligro: Sí" },
];

export default function AuditLog({ email, isAdmin }) {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const [stats, setStats] = useState(null);
  const [limit, setLimit] = useState(20);

  // ── Carga registros ───────────────────────────────────────────────────
  const fetchRecords = async () => {
    setLoading(true);
    try {
      let url;
      if (isAdmin) {
        url = `${API}/all?admin_email=${encodeURIComponent(email)}&limit=${limit}&offset=${offset}`;
        if (filterAction) url += `&action=${encodeURIComponent(filterAction)}`;
      } else {
        url = `${API}/mine?email=${encodeURIComponent(email)}&limit=${limit}&offset=${offset}`;
        if (filterAction) url += `&action=${encodeURIComponent(filterAction)}`;
      }
      // credentials: "include" es obligatorio — el backend usa session cookie
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (data.records) {
        setRecords(data.records);
        setTotal(data.total ?? data.records.length);
        if (data.user) setOwner(data.user);
      }
    } catch (e) {
      console.error("[AuditLog] fetchRecords:", e);
    } finally {
      setLoading(false);
    }
  };

  // ── Carga estadisticas ───────────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const url = isAdmin
        ? `${API}/stats?admin_email=${encodeURIComponent(email)}`
        : `${API}/stats/mine?email=${encodeURIComponent(email)}`;
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (data.stats) setStats(data.stats);
    } catch (e) {
      console.error("[AuditLog] fetchStats:", e);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, filterAction, limit]);

  // ── Editar detalle ────────────────────────────────────────────────────
  const editDetail = async (r) => {
    const next = window.prompt(
      "Editar detalle del registro:",
      r?.x_detail || "",
    );
    if (next === null) return;
    try {
      const res = await fetch(`${API}/record/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requester_email: email, detail: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setRecords((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, x_detail: next } : x)),
        );
      }
    } catch (e) {
      console.error("[AuditLog] editDetail:", e);
    }
  };

  // ── Borrar registro ───────────────────────────────────────────────────
  const deleteRecord = async (r) => {
    if (!window.confirm("¿Borrar este registro de auditoría?")) return;
    try {
      const res = await fetch(`${API}/record/${r.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requester_email: email }),
      });
      const data = await res.json();
      if (data.ok) {
        setRecords((prev) => prev.filter((x) => x.id !== r.id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        alert(data.error || "No se pudo borrar");
      }
    } catch (e) {
      console.error("[AuditLog] delete:", e);
      alert("Error al borrar");
    }
  };

  // ── Exportar ─────────────────────────────────────────────────────────
  const exportCSV = () => {
    const qs = filterAction
      ? `&action=${encodeURIComponent(filterAction)}`
      : "";
    const url = isAdmin
      ? `${API}/export/csv?admin_email=${encodeURIComponent(email)}${qs}`
      : `${API}/export/csv/mine?email=${encodeURIComponent(email)}${qs}`;
    window.open(url, "_blank");
  };

  const exportPDF = () => {
    const qs = filterAction
      ? `&action=${encodeURIComponent(filterAction)}`
      : "";
    const url = isAdmin
      ? `${API}/export/pdf?admin_email=${encodeURIComponent(email)}${qs}`
      : `${API}/export/pdf/mine?email=${encodeURIComponent(email)}${qs}`;
    window.open(url, "_blank");
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const formatDate = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleString("es-DO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = limit >= 5000 ? 1 : Math.ceil(total / limit);
  const currentPage = limit >= 5000 ? 1 : Math.floor(offset / limit) + 1;

  // ── Stat cards config — claves coinciden exactamente con el backend ───
  const STAT_CARDS = [
    { key: "total", label: "Total", icon: "ri-list-check-2", color: "#3182ce" },
    {
      key: "login",
      label: "Logins",
      icon: "ri-login-box-line",
      color: "#38a169",
    },
    {
      key: "evidence_sent",
      label: "Evidencias",
      icon: "ri-attachment-2",
      color: "#805ad5",
    },
    {
      key: "status_changed",
      label: "Estados",
      icon: "ri-edit-line",
      color: "#667eea",
    },
    {
      key: "geofence_exit_safe",
      label: "Salidas",
      icon: "ri-logout-circle-r-fill",
      color: "#ef4444",
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {isAdmin ? "Registro de Auditoría" : "Mi Historial de Actividad"}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#718096" }}>
            {total} registro(s) en total
          </p>
          {!isAdmin && owner && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a0aec0" }}>
              {owner.name || "Usuario"}
              {owner.login ? ` — ${owner.login}` : ""}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Cantidad */}
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setOffset(0);
            }}
            style={SEL}
          >
            {[5, 20, 50, 100, 5000].map((n) => (
              <option key={n} value={n}>
                {n === 5000 ? "Ver todo" : `Ver ${n}`}
              </option>
            ))}
          </select>

          {/* Filtro accion */}
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setOffset(0);
            }}
            style={SEL}
          >
            {ALL_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          {isAdmin && (
            <>
              <button onClick={exportCSV} style={BTN_GREEN}>
                <i className="ri-download-2-line" /> Exportar CSV
              </button>
              <button onClick={exportPDF} style={BTN_BLUE}>
                <i className="ri-file-pdf-2-line" /> Exportar PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stat Cards — solo admin */}
      {isAdmin && stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {STAT_CARDS.map((s) => (
            <div key={s.key} style={STAT_CARD}>
              <i className={s.icon} style={{ color: s.color, fontSize: 20 }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
                {/* FIX: usar ?? 0 para que "0" real se muestre, no "-" */}
                {stats[s.key] ?? 0}
              </div>
              <div style={{ fontSize: 11, color: "#718096" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cargando */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#a0aec0" }}>
          Cargando registros...
        </div>
      )}

      {/* Sin resultados */}
      {!loading && records.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "#a0aec0",
            background: "#f8f9fa",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            <i className="ri-file-list-3-line" />
          </div>
          <div>No hay registros de auditoría</div>
        </div>
      )}

      {/* Lista */}
      {!loading && records.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {records.map((r) => {
            const icon = ACTION_ICONS[r.x_action] || "ri-history-line";
            const color = ACTION_COLORS[r.x_action] || "#4a5568";
            const badge = ROLE_BADGE[r.x_role] || ROLE_BADGE.user;

            return (
              <div key={r.id} style={ROW}>
                {/* Icono */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: color + "18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <i className={icon} style={{ color, fontSize: 16 }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: "#1a1a1a",
                      }}
                    >
                      {r.label || r.x_action}
                    </span>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.color,
                        padding: "1px 7px",
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {badge.label}
                    </span>
                    {isAdmin && r.user_name && (
                      <span style={{ fontSize: 11, color: "#718096" }}>
                        — {r.user_name}
                      </span>
                    )}
                  </div>
                  <div
                    onDoubleClick={() => editDetail(r)}
                    title="Doble click para editar"
                    style={{
                      fontSize: 12,
                      color: r.x_detail ? "#718096" : "#a0aec0",
                      marginTop: 2,
                      cursor: "text",
                    }}
                  >
                    {r.x_detail || "(sin detalle)"}
                  </div>
                </div>

                {/* Fecha, IP, borrar */}
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() => deleteRecord(r)}
                    title="Borrar registro"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "#e53e3e",
                      fontSize: 16,
                    }}
                  >
                    <i className="ri-delete-bin-6-line" />
                  </button>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "#718096" }}>
                      {formatDate(r.x_timestamp)}
                    </div>
                    {r.x_ip && (
                      <div
                        style={{ fontSize: 10, color: "#a0aec0", marginTop: 2 }}
                      >
                        {r.x_ip}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginacion */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            marginTop: 20,
          }}
        >
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            style={pageBtnStyle(offset === 0)}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 12, color: "#718096" }}>
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={currentPage >= totalPages}
            style={pageBtnStyle(currentPage >= totalPages)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Estilos reutilizables ─────────────────────────────────────────────────
const SEL = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  outline: "none",
  background: "#fff",
  cursor: "pointer",
};
const BTN_GREEN = {
  background: "linear-gradient(135deg,#38a169,#276749)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const BTN_BLUE = {
  background: "linear-gradient(135deg,#2b6cb0,#2c5282)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const STAT_CARD = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const ROW = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
  gap: 12,
};
const pageBtnStyle = (disabled) => ({
  background: disabled ? "#e2e8f0" : "linear-gradient(135deg,#e53e3e,#c53030)",
  color: disabled ? "#a0aec0" : "#fff",
  border: "none",
  borderRadius: 8,
  padding: "6px 14px",
  cursor: disabled ? "default" : "pointer",
  fontSize: 12,
});
