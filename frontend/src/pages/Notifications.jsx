// Notifications: campana/lista de notificaciones.
// Lee notificaciones del backend (Odoo) y permite marcarlas como leidas.
import { useState, useEffect, useCallback } from "react";
import { useModal } from "../components/Providers";
import { useStore } from "../store";

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS no disponible"));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 20_000 },
    );
  });
}

const TYPE_META = {
  emergency: { icon: "ri-alarm-warning-fill", color: "#E53935" },
  new_user: { icon: "ri-user-add-fill", color: "#00BCD4" },
  user_login: { icon: "ri-login-circle-fill", color: "#7C3AED" },
  contact_alert: { icon: "ri-shield-user-fill", color: "#F59E0B" },
  geofence_warning: { icon: "ri-shield-flash-fill", color: "#F59E0B" },
  danger_confirm: { icon: "ri-alarm-warning-fill", color: "#ef4444" },
  med_reminder: { icon: "ri-capsule-fill", color: "#10B981" },
  daily_tip: { icon: "ri-lightbulb-flash-fill", color: "#F59E0B" },
  operator_msg: { icon: "ri-chat-1-fill", color: "#ef4444" },
  donation: { icon: "ri-hand-heart-fill", color: "#22d3b7" },
  info: { icon: "ri-information-fill", color: "#64748b" },
};

function fmtAgo(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return `hace ${Math.round(diff / 86400)}d`;
}

function openMapsFromNotif(n) {
  if (n.lat && n.lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lng}&travelmode=driving`;
    window.open(url, "_blank");
  }
}

function NotifList({
  notifs,
  loading,
  onMarkOne,
  onMarkAll,
  onDeleteAll,
  filter,
  setFilter,
  unreadCount,
  onOpenOperatorMsg,
  userEmail,
}) {
  const visible = filter === "unread" ? notifs.filter((n) => !n.read) : notifs;

  return (
    <>
      <div className="notif-toolbar">
        <div className="notif-filters">
          <button
            className={`notif-filter-btn ${filter === "all" ? "on" : ""}`}
            onClick={() => setFilter("all")}
          >
            Todas
          </button>
          <button
            className={`notif-filter-btn ${filter === "unread" ? "on" : ""}`}
            onClick={() => setFilter("unread")}
          >
            No leidas {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>
        {unreadCount > 0 && (
          <button className="notif-mark-all" onClick={onMarkAll}>
            <i className="ri-check-double-line" /> Marcar todo
          </button>
        )}
        {notifs.length > 0 && (
          <button
            className="notif-mark-all"
            onClick={onDeleteAll}
            style={{
              background: "rgba(239,68,68,0.12)",
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
            title="Borrar todas"
          >
            <i className="ri-delete-bin-6-line" /> Borrar todo
          </button>
        )}
      </div>

      <div className="m-body notif-list">
        {loading ? (
          <div className="empty">
            <i className="ri-loader-4-line notif-spin" />
            <p>Cargando...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <i className="ri-notification-off-fill" />
            <p>{filter === "unread" ? "Todo al dia" : "Sin notificaciones"}</p>
          </div>
        ) : (
          visible.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.info;
            const isContact = n.type === "contact_alert";
            const hasLocation = isContact && n.lat && n.lng;
            const isOperatorMsg = n.type === "operator_msg";
            const isDangerConfirm = n.type === "danger_confirm";
            const isGeofenceWarning = n.type === "geofence_warning";

            const title = isOperatorMsg
              ? (n.message || n.name || "Mensaje del operador")
              : n.name;
            const body = isOperatorMsg ? "Toca para abrir el chat" : n.message;

            return (
              <div
                key={n.id}
                className={`notif-item ${n.read ? "read" : "unread"}`}
                onClick={() => {
                  if (isOperatorMsg) onOpenOperatorMsg?.(n);
                  if (!n.read) onMarkOne(n.id);
                }}
                style={{ cursor: isContact ? "default" : "pointer" }}
              >
                <div
                  className="notif-icon"
                  style={{ background: meta.color + "22", color: meta.color }}
                >
                  <i className={meta.icon} />
                </div>
                <div className="notif-body">
                  <p className="notif-name">{title}</p>
                  <p className="notif-msg">{body}</p>
                  <span className="notif-time">{fmtAgo(n.ts)}</span>

                  {/* Boton Ir ahora para alertas de contacto */}
                  {hasLocation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openMapsFromNotif(n);
                      }}
                      style={{
                        marginTop: 6,
                        background: meta.color,
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      🗺️ Ver ubicacion y navegar
                    </button>
                  )}

                  {/* Acciones: confirmar peligro (SI/NO) */}
                  {isDangerConfirm && (
                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!userEmail) return;
                          try {
                            const pos = await getCurrentPosition();
                            await fetch("/api/geofence/danger/confirm", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({
                                requester_email: userEmail,
                                answer: "yes",
                                lat: pos.lat,
                                lng: pos.lng,
                              }),
                            });
                            window.dispatchEvent(
                              new CustomEvent("emergelens:sos:start", {
                                detail: { eType: "security", autoCall: true },
                              }),
                            );
                            onMarkOne?.(n.id);
                            window.dispatchEvent(
                              new Event("emergelens:notif:refresh"),
                            );
                          } catch {}
                        }}
                        style={{
                          background: "#ef4444",
                          color: "#fff",
                          border: "none",
                          borderRadius: 10,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Si, estoy en peligro
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!userEmail) return;
                          try {
                            const pos = await getCurrentPosition().catch(() => ({
                              lat: 0,
                              lng: 0,
                            }));
                            await fetch("/api/geofence/danger/confirm", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({
                                requester_email: userEmail,
                                answer: "no",
                                lat: pos.lat,
                                lng: pos.lng,
                              }),
                            });
                          } catch {}
                          onMarkOne?.(n.id);
                          window.dispatchEvent(
                            new Event("emergelens:notif:refresh"),
                          );
                        }}
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        No
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.dispatchEvent(
                            new CustomEvent("emergelens:sos:start", {
                              detail: { eType: "security", autoCall: true },
                            }),
                          );
                          onMarkOne?.(n.id);
                        }}
                        style={{
                          background: "rgba(34,211,183,0.18)",
                          color: "var(--teal)",
                          border: "1px solid rgba(34,211,183,0.35)",
                          borderRadius: 10,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Llamar
                      </button>
                    </div>
                  )}

                  {/* Accion rapida para advertencia de geofence */}
                  {isGeofenceWarning && (
                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.dispatchEvent(
                            new CustomEvent("emergelens:sos:start", {
                              detail: { eType: "security", autoCall: false },
                            }),
                          );
                          onMarkOne?.(n.id);
                        }}
                        style={{
                          background: "rgba(34,211,183,0.18)",
                          color: "var(--teal)",
                          border: "1px solid rgba(34,211,183,0.35)",
                          borderRadius: 10,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Activar SOS
                      </button>
                    </div>
                  )}
                </div>
                {!n.read && <span className="notif-dot" />}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// ── Modal Admin ──────────────────────────────────────────────────────────────

function AdminNotifModal({ onClose }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/notifications/${filter === "unread" ? "unread=1" : ""}`,
        { credentials: "include" },
      );
      const d = await r.json();
      if (d.ok) setNotifs(d.notifications || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    setNotifs((n) => n.map((x) => ({ ...x, read: true })));
  }

  async function deleteAll() {
    await fetch("/api/notifications/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    setNotifs([]);
  }

  async function markOne(id) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifs((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)));
  }

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <>
      <div
        className="m-head"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Notificaciones</h3>
          {unreadCount > 0 && (
            <span className="notif-badge-inline">{unreadCount}</span>
          )}
        </div>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <NotifList
        notifs={notifs}
        loading={loading}
        onMarkOne={markOne}
        onMarkAll={markAll}
        onDeleteAll={deleteAll}
        filter={filter}
        setFilter={setFilter}
        unreadCount={unreadCount}
        onOpenOperatorMsg={(n) => {
          try {
            if (n?.uid) localStorage.setItem("adminOperatorChatUserId", String(n.uid));
            else localStorage.removeItem("adminOperatorChatUserId");
          } catch {}
          onClose?.();
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("adminOperatorChat:open", {
                detail: { userId: n?.uid || null },
              }),
            );
          }, 30);
        }}
      />
    </>
  );
}

// ── Modal Usuario ─────────────────────────────────────────────────────────────

function UserNotifModal({ onClose }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const { user } = useStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/notifications/mine", {
        credentials: "include",
      });
      const d = await r.json();
      if (d.ok) setNotifs(d.notifications || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications/mine/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    setNotifs((n) => n.map((x) => ({ ...x, read: true })));
  }

  async function deleteAll() {
    await fetch("/api/notifications/mine/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    setNotifs([]);
  }

  async function markOne(id) {
    await fetch("/api/notifications/mine/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifs((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)));
  }

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <>
      <div
        className="m-head"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Notificaciones</h3>
          {unreadCount > 0 && (
            <span className="notif-badge-inline">{unreadCount}</span>
          )}
        </div>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <NotifList
        notifs={notifs}
        loading={loading}
        onMarkOne={markOne}
        onMarkAll={markAll}
        onDeleteAll={deleteAll}
        filter={filter}
        setFilter={setFilter}
        unreadCount={unreadCount}
        userEmail={user?.email || null}
        onOpenOperatorMsg={() => {
          onClose?.();
          setTimeout(() => {
            window.dispatchEvent(new Event("operatorChat:open"));
          }, 30);
        }}
      />
    </>
  );
}

// ── Bell ──────────────────────────────────────────────────────────────────────

export default function NotifBell({ isAdmin }) {
  const { openModal, closeModal } = useModal();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const endpoint = isAdmin
      ? "/api/notifications/unread-count"
      : "/api/notifications/mine/unread-count";
    async function tick() {
      try {
        const r = await fetch(endpoint, { credentials: "include" });
        const d = await r.json();
        setCount(d.count || 0);
      } catch {}
    }
    tick();
    const id = setInterval(tick, 15000);
    const onRefresh = () => tick();
    window.addEventListener("emergelens:notif:refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("emergelens:notif:refresh", onRefresh);
    };
  }, [isAdmin]);

  function open() {
    if (isAdmin) openModal(<AdminNotifModal onClose={closeModal} />);
    else openModal(<UserNotifModal onClose={closeModal} />);
    setCount(0);
  }

  return (
    <button
      className="tb-btn notif-bell-btn"
      onClick={open}
      style={{ position: "relative" }}
    >
      <i className="ri-notification-3-fill" />
      {count > 0 && (
        <span className="notif-badge">{count > 99 ? "99+" : count}</span>
      )}
    </button>
  );
}
