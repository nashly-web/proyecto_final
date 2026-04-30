// frontend/src/components/AdminGeofence.jsx
// RF16 - Vista admin: todas las zonas de todos los usuarios + eventos recientes

import { useState, useEffect, useCallback } from "react";

const API = "/api/geofence";

const TYPE_META = {
  safe: {
    label: "Segura",
    color: "#22d3b7",
    icon: "ri-shield-check-fill",
    bg: "rgba(34,211,183,0.12)",
  },
  danger: {
    label: "Peligrosa",
    color: "#ef4444",
    icon: "ri-alarm-warning-fill",
    bg: "rgba(239,68,68,0.12)",
  },
};

const EVENT_LABELS = {
  exit: {
    label: "Salió de zona segura",
    color: "#ef4444",
    icon: "ri-logout-circle-r-fill",
  },
  enter: {
    label: "Entró a zona peligrosa",
    color: "#f59e0b",
    icon: "ri-login-circle-fill",
  },
};

function fmtTs(ts) {
  if (!ts) return "";
  const fixed = String(ts).includes("T")
    ? String(ts)
    : String(ts).replace(" ", "T") + "Z";
  return new Date(fixed).toLocaleString("es-DO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminGeofence({ adminEmail }) {
  const [zones, setZones] = useState([]);
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState("zones");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ── Formulario nueva zona para un usuario ──────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [users, setUsers] = useState([]);
  const [placeQ, setPlaceQ] = useState("");
  const [placeItems, setPlaceItems] = useState([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeErr, setPlaceErr] = useState("");
  const [form, setForm] = useState({
    name: "",
    lat: "",
    lng: "",
    radius: 500,
    type: "safe",
    user_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const searchPlace = async () => {
    const q = placeQ.trim();
    if (q.length < 2) return;
    setPlaceLoading(true);
    setPlaceErr("");
    try {
      const res = await fetch(
        `${API}/geocode?q=${encodeURIComponent(q)}&limit=6&requester_email=${encodeURIComponent(adminEmail)}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.ok) setPlaceItems(data.items || []);
      else setPlaceErr(data.error || "No se pudo buscar");
    } catch (_) {
      setPlaceErr("Error de conexion");
    } finally {
      setPlaceLoading(false);
    }
  };

  const pickPlace = (p) => {
    const lat = p?.lat != null ? String(p.lat) : "";
    const lng = p?.lng != null ? String(p.lng) : "";
    setForm((f) => ({
      ...f,
      lat,
      lng,
      name: f.name?.trim() ? f.name : (p.short_name || p.name || "").split(",")[0],
    }));
    setPlaceItems([]);
    setPlaceQ(p?.name || "");
  };

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch(
        `${API}/zones/all?admin_email=${encodeURIComponent(adminEmail)}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.zones) setZones(data.zones);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [adminEmail]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(
        `${API}/events/all?admin_email=${encodeURIComponent(adminEmail)}`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await res.json();
      if (data.events) setEvents(data.events);
    } catch (_) {}
  }, [adminEmail]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/operator_chat/users?admin_email=${encodeURIComponent(adminEmail)}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch (_) {}
  }, [adminEmail]);

  useEffect(() => {
    fetchZones();
    fetchUsers();
  }, [fetchZones, fetchUsers]);
  useEffect(() => {
    fetchEvents();
  }, [zones, fetchEvents]);

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm("¿Eliminar esta zona?")) return;
    try {
      await fetch(
        `${API}/zones/${zoneId}?requester_email=${encodeURIComponent(adminEmail)}`,
        { method: "DELETE", credentials: "include" },
      );
      await fetchZones();
    } catch (_) {}
  };

  const handleToggleZone = async (zone) => {
    try {
      await fetch(`${API}/zones/${zone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requester_email: adminEmail,
          active: !zone.x_active,
        }),
      });
      await fetchZones();
    } catch (_) {}
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return setErr("Escribe un nombre.");
    if (!form.user_id) return setErr("Selecciona un usuario.");
    if (!form.lat || !form.lng) return setErr("Escribe latitud y longitud.");
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`${API}/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requester_email: adminEmail,
          user_id: parseInt(form.user_id),
          name: form.name,
          lat: parseFloat(form.lat),
          lng: parseFloat(form.lng),
          radius: form.radius,
          type: form.type,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        setForm({
          name: "",
          lat: "",
          lng: "",
          radius: 500,
          type: "safe",
          user_id: "",
        });
        setPlaceQ("");
        setPlaceItems([]);
        setPlaceErr("");
        await fetchZones();
      } else {
        setErr(data.error || "Error al guardar");
      }
    } catch (_) {
      setErr("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const filteredZones = zones.filter(
    (z) =>
      z.x_name?.toLowerCase().includes(search.toLowerCase()) ||
      z.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      z.user_email?.toLowerCase().includes(search.toLowerCase()),
  );

  const recentEvents = events.slice(0, 30);

  return (
    <>
      <style>{`
        .agf-wrap { }

        /* Header */
        .agf-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .agf-new-btn {
          background: linear-gradient(135deg,#22d3b7,#16a39a);
          color: var(--navy);
          border: none;
          border-radius: 10px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
          transition: opacity .2s;
        }
        .agf-new-btn:hover { opacity: .88; }

        /* Stats row */
        .agf-stats {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .agf-stat {
          background: var(--navy-mid);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px;
          text-align: center;
        }
        .agf-stat-val {
          font-size: 22px;
          font-weight: 800;
          display: block;
        }
        .agf-stat-label {
          font-size: 10px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        /* Tabs */
        .agf-tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          margin-bottom: 12px;
        }
        .agf-tab {
          flex: 1;
          padding: 9px 8px;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 500;
          color: var(--muted);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all .15s;
          font-family: inherit;
        }
        .agf-tab.on { color: #22d3b7; font-weight: 700; border-bottom-color: #22d3b7; }

        /* Search */
        .agf-search {
          background: var(--navy);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          margin-bottom: 12px;
          transition: border-color .2s;
        }
        .agf-search:focus-within { border-color: #22d3b7; }
        .agf-search input {
          flex: 1;
          border: none;
          background: transparent;
          color: var(--white);
          font-size: 13px;
          font-family: inherit;
          outline: none;
        }
        .agf-search input::placeholder { color: var(--muted); }

        /* Zone list */
        .agf-zone-list { display: flex; flex-direction: column; gap: 8px; }
        .agf-zone-row {
          background: var(--navy-mid);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
        }
        .agf-zone-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
        }
        .agf-zone-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        .agf-zone-info { flex: 1; min-width: 0; }
        .agf-zone-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--white);
          margin: 0 0 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .agf-zone-sub {
          font-size: 11px;
          color: var(--muted);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }
        .agf-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 20px;
        }
        .agf-zone-actions { display: flex; gap: 4px; }
        .agf-icon-btn {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          transition: opacity .15s;
        }
        .agf-icon-btn:hover { opacity: .75; }
        .agf-icon-btn.toggle { background: rgba(34,211,183,.12); color: #22d3b7; }
        .agf-icon-btn.del    { background: rgba(239,68,68,.12);   color: #ef4444; }

        .agf-zone-coords {
          font-size: 10px;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 4px;
        }

        /* Form */
        .agf-form {
          background: var(--navy-mid);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 14px;
        }
        .agf-form-title {
          font-size: 13px;
          font-weight: 700;
          margin: 0 0 14px;
          color: var(--white);
        }
        .agf-field { margin-bottom: 10px; }
        .agf-label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .04em;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .agf-input {
          width: 100%;
          background: var(--navy);
          border: 1.5px solid var(--border);
          border-radius: 9px;
          padding: 8px 11px;
          color: var(--white);
          font-size: 13px;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color .2s;
        }
        .agf-input:focus { border-color: #22d3b7; }

        .agf-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

        .agf-place-row { display:flex; gap:8px; align-items:center; }
        .agf-place-btn {
          flex: 0 0 auto;
          background: #111827;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }
        .agf-place-btn:disabled { opacity: .55; cursor: not-allowed; }
        .agf-place-err {
          margin-top: 8px;
          color: #ef4444;
          font-size: 12px;
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .agf-place-list {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 180px;
          overflow: auto;
          padding-right: 4px;
        }
        .agf-place-item {
          text-align: left;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          padding: 10px 10px;
          cursor: pointer;
          color: var(--white);
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-family: inherit;
        }
        .agf-place-item:hover { border-color: #22d3b7; }
        .agf-place-name { font-weight: 800; font-size: 12px; }
        .agf-place-sub { font-size: 10px; color: var(--muted); }
        .agf-place-coords { font-size: 10px; color: var(--muted); }

        .agf-type-row { display: flex; gap: 6px; }
        .agf-type-btn {
          flex: 1;
          padding: 8px;
          border-radius: 9px;
          border: 1.5px solid var(--border);
          background: transparent;
          color: var(--muted);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-family: inherit;
          transition: all .15s;
        }
        .agf-type-btn.safe.on   { border-color: #22d3b7; background: rgba(34,211,183,.1); color: #22d3b7; }
        .agf-type-btn.danger.on { border-color: #ef4444; background: rgba(239,68,68,.1);   color: #ef4444; }

        .agf-err {
          background: rgba(239,68,68,.1);
          border: 1px solid rgba(239,68,68,.3);
          border-radius: 8px;
          padding: 7px 11px;
          font-size: 12px;
          color: #ef4444;
          margin-bottom: 10px;
        }
        .agf-form-btns { display: flex; gap: 8px; justify-content: flex-end; }
        .agf-cancel-btn {
          background: none;
          border: 1.5px solid var(--border);
          border-radius: 9px;
          padding: 7px 14px;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .agf-save-btn {
          background: linear-gradient(135deg,#22d3b7,#16a39a);
          color: var(--navy);
          border: none;
          border-radius: 9px;
          padding: 7px 16px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: opacity .15s;
        }
        .agf-save-btn:disabled { opacity: .55; cursor: default; }

        /* Eventos */
        .agf-event-list { display: flex; flex-direction: column; gap: 8px; }
        .agf-event-row {
          background: var(--navy-mid);
          border: 1px solid var(--border);
          border-radius: 11px;
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .agf-event-icon {
          width: 34px; height: 34px;
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; flex-shrink: 0;
        }
        .agf-event-info { flex: 1; min-width: 0; }
        .agf-event-title { font-size: 13px; font-weight: 600; color: var(--white); margin: 0 0 2px; }
        .agf-event-sub   { font-size: 11px; color: var(--muted); margin: 0; }

        .agf-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 32px 0; color: var(--muted);
        }
        .agf-empty i { font-size: 32px; opacity: .35; }
        .agf-empty p { margin: 0; font-size: 12px; }
      `}</style>

      <div className="agf-wrap">
        {/* Stats */}
        <div className="agf-stats">
          <div className="agf-stat">
            <span className="agf-stat-val" style={{ color: "#22d3b7" }}>
              {zones.filter((z) => z.x_type === "safe" && z.x_active).length}
            </span>
            <span className="agf-stat-label">Zonas seguras</span>
          </div>
          <div className="agf-stat">
            <span className="agf-stat-val" style={{ color: "#ef4444" }}>
              {zones.filter((z) => z.x_type === "danger" && z.x_active).length}
            </span>
            <span className="agf-stat-label">Zonas peligrosas</span>
          </div>
          <div className="agf-stat">
            <span className="agf-stat-val" style={{ color: "#f59e0b" }}>
              {events.length}
            </span>
            <span className="agf-stat-label">Violaciones</span>
          </div>
        </div>

        {/* Header con botón nuevo */}
        <div className="agf-header">
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {zones.length} zona{zones.length !== 1 ? "s" : ""} en total
          </div>
          <button
            className="agf-new-btn"
            onClick={() => setShowForm((f) => !f)}
          >
            {showForm ? "✕ Cancelar" : "+ Crear zona"}
          </button>
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="agf-form">
            <p className="agf-form-title">
              <i className="ri-map-pin-add-fill" style={{ color: "#22d3b7" }} />{" "}
              Nueva zona para usuario
            </p>

            <div className="agf-field">
              <label className="agf-label">Usuario</label>
              <select
                className="agf-input"
                value={form.user_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, user_id: e.target.value }))
                }
              >
                <option value="">Selecciona un usuario...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.login}
                  </option>
                ))}
              </select>
            </div>

            <div className="agf-field">
              <label className="agf-label">Nombre de la zona</label>
              <input
                className="agf-input"
                placeholder="Ej: Zona restringida norte"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="agf-field">
              <label className="agf-label">Buscar lugar</label>
              <div className="agf-place-row">
                <input
                  className="agf-input"
                  placeholder="Ej: Santiago, RD / Punta Cana / New York"
                  value={placeQ}
                  onChange={(e) => setPlaceQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      searchPlace();
                    }
                  }}
                />
                <button
                  className="agf-place-btn"
                  onClick={searchPlace}
                  disabled={placeLoading || placeQ.trim().length < 2}
                  title="Buscar"
                  type="button"
                >
                  {placeLoading ? "..." : "Buscar"}
                </button>
              </div>
              {placeErr && (
                <div className="agf-place-err">
                  <i className="ri-error-warning-line" /> {placeErr}
                </div>
              )}
              {placeItems.length > 0 && (
                <div className="agf-place-list">
                  {placeItems.map((p, idx) => (
                    <button
                      key={idx}
                      className="agf-place-item"
                      onClick={() => pickPlace(p)}
                      type="button"
                    >
                      <span className="agf-place-name">
                        {p.short_name || (p.name || "").split(",")[0]}
                      </span>
                      <span className="agf-place-sub">{p.name}</span>
                      <span className="agf-place-coords">
                        {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="agf-field">
              <label className="agf-label">Tipo</label>
              <div className="agf-type-row">
                {["safe", "danger"].map((t) => {
                  const meta = TYPE_META[t];
                  return (
                    <button
                      key={t}
                      className={`agf-type-btn ${t} ${form.type === t ? "on" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                    >
                      <i className={meta.icon} /> {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="agf-row2">
              <div className="agf-field">
                <label className="agf-label">Latitud</label>
                <input
                  className="agf-input"
                  placeholder="18.4861"
                  value={form.lat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lat: e.target.value }))
                  }
                />
              </div>
              <div className="agf-field">
                <label className="agf-label">Longitud</label>
                <input
                  className="agf-input"
                  placeholder="-69.9312"
                  value={form.lng}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lng: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="agf-field">
              <label className="agf-label">Radio (metros)</label>
              <input
                className="agf-input"
                type="number"
                min="50"
                max="50000"
                value={form.radius}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    radius: parseInt(e.target.value) || 500,
                  }))
                }
              />
            </div>

            {err && (
              <div className="agf-err">
                <i className="ri-error-warning-line" /> {err}
              </div>
            )}

            <div className="agf-form-btns">
              <button
                className="agf-cancel-btn"
                onClick={() => {
                  setShowForm(false);
                  setErr("");
                }}
              >
                Cancelar
              </button>
              <button
                className="agf-save-btn"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar zona"}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="agf-tabs">
          <button
            className={`agf-tab ${tab === "zones" ? "on" : ""}`}
            onClick={() => setTab("zones")}
          >
            🛡️ Zonas ({zones.length})
          </button>
          <button
            className={`agf-tab ${tab === "events" ? "on" : ""}`}
            onClick={() => setTab("events")}
          >
            ⚠️ Violaciones ({events.length})
          </button>
        </div>

        {/* Search */}
        {tab === "zones" && (
          <div className="agf-search">
            <i
              className="ri-search-line"
              style={{ color: "var(--muted)", fontSize: 14 }}
            />
            <input
              placeholder="Buscar zona o usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* Lista zonas */}
        {tab === "zones" &&
          (loading ? (
            <div className="agf-empty">
              <i className="ri-loader-4-line" />
              <p>Cargando zonas...</p>
            </div>
          ) : filteredZones.length === 0 ? (
            <div className="agf-empty">
              <i className="ri-map-pin-2-line" />
              <p>{search ? "Sin resultados" : "No hay zonas creadas"}</p>
            </div>
          ) : (
            <div className="agf-zone-list">
              {filteredZones.map((z) => {
                const meta = TYPE_META[z.x_type] || TYPE_META.safe;
                return (
                  <div
                    key={z.id}
                    className="agf-zone-row"
                    style={{ opacity: z.x_active ? 1 : 0.55 }}
                  >
                    <div className="agf-zone-top">
                      <div
                        className="agf-zone-icon"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <i className={meta.icon} />
                      </div>
                      <div className="agf-zone-info">
                        <p className="agf-zone-name">{z.x_name}</p>
                        <div className="agf-zone-sub">
                          <span
                            className="agf-badge"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span>👤 {z.user_name || "?"}</span>
                          <span>📍 {z.x_radius}m</span>
                          {!z.x_active && (
                            <span style={{ color: "var(--muted)" }}>
                              ● Inactiva
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="agf-zone-actions">
                        <button
                          className="agf-icon-btn toggle"
                          title={z.x_active ? "Desactivar" : "Activar"}
                          onClick={() => handleToggleZone(z)}
                        >
                          {z.x_active ? "⏸" : "▶"}
                        </button>
                        <button
                          className="agf-icon-btn del"
                          title="Eliminar"
                          onClick={() => handleDeleteZone(z.id)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    <div className="agf-zone-coords">
                      <span>
                        📌 {Number(z.x_lat).toFixed(5)},{" "}
                        {Number(z.x_lng).toFixed(5)}
                      </span>
                      <span
                        style={{
                          color:
                            z.x_created_by === "admin"
                              ? "#f59e0b"
                              : "var(--muted)",
                        }}
                      >
                        {z.x_created_by === "admin"
                          ? "🔒 Creada por admin"
                          : "👤 Creada por usuario"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {/* Violaciones */}
        {tab === "events" &&
          (recentEvents.length === 0 ? (
            <div className="agf-empty">
              <i className="ri-shield-check-line" />
              <p>Sin violaciones de zona registradas</p>
            </div>
          ) : (
            <div className="agf-event-list">
              {recentEvents.map((ev) => {
                const isExit = ev.x_event_type === "exit";
                const isDanger = ev.x_zone_type === "danger";
                const color = isExit || isDanger ? "#ef4444" : "#f59e0b";
                const icon = isExit
                  ? "ri-logout-circle-r-fill"
                  : "ri-login-circle-fill";
                return (
                  <div key={ev.id} className="agf-event-row">
                    <div
                      className="agf-event-icon"
                      style={{ background: `${color}18`, color }}
                    >
                      <i className={icon} />
                    </div>
                    <div className="agf-event-info">
                      <p className="agf-event-title">
                        {isExit ? "Salió de" : "Entró a"}: {ev.x_zone_name}
                      </p>
                      <p className="agf-event-sub">{fmtTs(ev.x_timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </>
  );
}
