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
  alert_viewed: "ri-eye-line",
  schedule_created: "ri-calendar-check-line",
  schedule_deleted: "ri-calendar-close-line",
  password_changed: "ri-lock-password-line",
  page_view: "ri-pages-line",
  api_action: "ri-terminal-box-line",
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
  status_changed: "#d69e2e",
  evidence_sent: "#805ad5",
  page_view: "#2b6cb0",
  api_action: "#4a5568",
};

const ROLE_BADGE = {
  admin: { label: "Admin", bg: "#e53e3e", color: "#fff" },
  user: { label: "Usuario", bg: "#e2e8f0", color: "#4a5568" },
};

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
  { value: "alert_viewed", label: "Alerta visualizada" },
  { value: "schedule_created", label: "Mensaje programado creado" },
  { value: "schedule_deleted", label: "Mensaje programado eliminado" },
  { value: "password_changed", label: "Contraseña cambiada" },
  { value: "page_view", label: "Vista de página" },
  { value: "api_action", label: "Acción del sistema" },
  { value: "contact_created", label: "Contacto creado" },
  { value: "contact_updated", label: "Contacto actualizado" },
  { value: "contact_deleted", label: "Contacto eliminado" },
  { value: "geofence_exit_safe", label: "Salida de zona segura" },
  { value: "geofence_enter_danger", label: "Entrada a zona peligrosa" },
  { value: "danger_confirm_no", label: "Confirmacion de peligro: No" },
  { value: "danger_confirm_yes", label: "Confirmacion de peligro: Si" },
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

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let url;
      if (isAdmin) {
        url = `${API}/all?admin_email=${encodeURIComponent(email)}&limit=${limit}&offset=${offset}`;
        if (filterAction) url += `&action=${filterAction}`;
        // optional server-side search support
      } else {
        url = `${API}/mine?email=${encodeURIComponent(email)}&limit=${limit}&offset=${offset}`;
        if (filterAction) url += `&action=${filterAction}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.records) {
        setRecords(data.records);
        setTotal(data.total);
        if (data.user) setOwner(data.user);
      }
    } catch (e) {
      console.error("[AuditLog]", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(
        `${API}/stats?admin_email=${encodeURIComponent(email)}`,
      );
      const data = await res.json();
      if (data.stats) setStats(data.stats);
    } catch (_) {}
  };

  useEffect(() => {
    fetchRecords();
    fetchStats();
  }, [offset, filterAction, limit]);

  const editDetail = async (r) => {
    const current = r?.x_detail || "";
    const next = window.prompt("Editar detalle del registro:", current);
    if (next === null) return;
    try {
      const res = await fetch(`${API}/record/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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

  const exportCSV = () => {
    const qs = filterAction ? `&action=${encodeURIComponent(filterAction)}` : "";
    window.open(
      `${API}/export/csv?admin_email=${encodeURIComponent(email)}${qs}`,
      "_blank",
    );
  };

  const exportPDF = () => {
    const qs = filterAction ? `&action=${encodeURIComponent(filterAction)}` : "";
    window.open(
      `${API}/export/pdf?admin_email=${encodeURIComponent(email)}${qs}`,
      "_blank",
    );
  };

  const deleteRecord = async (r) => {
    const ok = window.confirm("¿Borrar este registro de auditoría?");
    if (!ok) return;
    try {
      const res = await fetch(`${API}/record/${r.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
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

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
            {isAdmin ? "Registro de Auditoría" : "Mi Historial de Actividad"}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#718096" }}>
            {total} registro(s) en total
          </p>
          {!isAdmin && owner && (
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#a0aec0" }}>
              {owner.name || "Usuario"} {owner.login ? `— ${owner.login}` : ""}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setOffset(0);
            }}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: "12px",
              outline: "none",
              background: "#fff",
              cursor: "pointer",
            }}
            title="Cantidad de registros a mostrar"
          >
            <option value={5}>Ver 5</option>
            <option value={20}>Ver 20</option>
            <option value={50}>Ver 50</option>
            <option value={100}>Ver 100</option>
            <option value={5000}>Ver todo</option>
          </select>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setOffset(0);
            }}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: "12px",
              outline: "none",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {ALL_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {isAdmin && (
            <>
              <button
                onClick={exportCSV}
                style={{
                  background: "linear-gradient(135deg, #38a169, #276749)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Exportar CSV"
              >
                <i className="ri-download-2-line" /> Exportar CSV
              </button>
              <button
                onClick={exportPDF}
                style={{
                  background: "linear-gradient(135deg, #2b6cb0, #2c5282)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Exportar PDF"
              >
                <i className="ri-file-pdf-2-line" /> Exportar PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Stats (solo admin) ── */}
      {isAdmin && stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          {[
            {
              key: "total",
              label: "Total",
              icon: "ri-list-check-2",
              color: "#3182ce",
            },
            {
              key: "login",
              label: "Logins",
              icon: "ri-login-box-line",
              color: "#38a169",
            },
            {
              key: "sos_activated",
              label: "SOS",
              icon: "ri-alarm-warning-fill",
              color: "#e53e3e",
            },
            {
              key: "sos_cancelled",
              label: "Cancels",
              icon: "ri-shield-check-line",
              color: "#d69e2e",
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
            {
              key: "geofence_enter_danger",
              label: "Entradas",
              icon: "ri-login-circle-fill",
              color: "#f59e0b",
            },
          ].map((s) => (
            <div
              key={s.key}
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <i
                className={s.icon}
                style={{ color: s.color, fontSize: "20px" }}
              />
              <div
                style={{ fontSize: "22px", fontWeight: 700, color: s.color }}
              >
                {stats[s.key] ?? 0}
              </div>
              <div style={{ fontSize: "11px", color: "#718096" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabla ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>
          Cargando registros...
        </div>
      ) : records.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            color: "#a0aec0",
            background: "#f8f9fa",
            borderRadius: "12px",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>
            <i className="ri-file-list-3-line" />
          </div>
          <div>No hay registros de auditoría</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {records.map((r) => {
            const icon = ACTION_ICONS[r.x_action] || "ri-history-line";
            const color = ACTION_COLORS[r.x_action] || "#4a5568";
            const badge = ROLE_BADGE[r.x_role] || ROLE_BADGE.user;

            return (
              <div
                key={r.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {/* Icono */}
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: color + "18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <i className={icon} style={{ color, fontSize: "16px" }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "13px",
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
                        borderRadius: "20px",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {badge.label}
                    </span>
                    {isAdmin && r.user_name && (
                      <span style={{ fontSize: "11px", color: "#718096" }}>
                        — {r.user_name}
                      </span>
                    )}
                  </div>
                  {r.x_detail && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#718096",
                        marginTop: "2px",
                      }}
                    >
                  <div
                    onDoubleClick={() => editDetail(r)}
                    title="Doble click para editar"
                    style={{ cursor: "text" }}
                  >
                    {r.x_detail}
                  </div>
                </div>
              )}
              {!r.x_detail && (
                <div
                  onDoubleClick={() => editDetail(r)}
                  title="Doble click para editar"
                  style={{
                    fontSize: "12px",
                    color: "#a0aec0",
                    marginTop: "2px",
                    cursor: "text",
                  }}
                >
                  (sin detalle)
                </div>
              )}
            </div>

            {/* Fecha e IP */}
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                gap: "10px",
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
                  fontSize: "16px",
                }}
              >
                <i className="ri-delete-bin-6-line" />
              </button>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: "#718096" }}>
                  {formatDate(r.x_timestamp)}
                </div>
                {r.x_ip && (
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#a0aec0",
                      marginTop: "2px",
                    }}
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

      {/* ── Paginación ── */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            marginTop: "20px",
          }}
        >
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            style={{
              background:
                offset === 0
                  ? "#e2e8f0"
                  : "linear-gradient(135deg, #e53e3e, #c53030)",
              color: offset === 0 ? "#a0aec0" : "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: offset === 0 ? "default" : "pointer",
              fontSize: "12px",
            }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: "12px", color: "#718096" }}>
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={currentPage >= totalPages}
            style={{
              background:
                currentPage >= totalPages
                  ? "#e2e8f0"
                  : "linear-gradient(135deg, #e53e3e, #c53030)",
              color: currentPage >= totalPages ? "#a0aec0" : "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: currentPage >= totalPages ? "default" : "pointer",
              fontSize: "12px",
            }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
