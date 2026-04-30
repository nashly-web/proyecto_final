// frontend/src/pages/SafeZone.jsx
// RF16 - Vista de zonas seguras para el USUARIO
// Usa Leaflet (ya incluido en LiveMap) para mostrar/crear zonas en el mapa.

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";

const API = "/api/geofence";

const TYPE_META = {
  safe: {
    label: "Zona Segura",
    color: "#22d3b7",
    icon: "ri-shield-check-fill",
    bg: "rgba(34,211,183,0.15)",
  },
  danger: {
    label: "Zona Peligrosa",
    color: "#ef4444",
    icon: "ri-alarm-warning-fill",
    bg: "rgba(239,68,68,0.15)",
  },
};

const RADIUS_OPTIONS = [
  { label: "50 m", value: 50 },
  { label: "100 m", value: 100 },
  { label: "250 m", value: 250 },
  { label: "500 m", value: 500 },
  { label: "1 km", value: 1000 },
  { label: "2 km", value: 2000 },
];

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

// ── Mini mapa con Leaflet ────────────────────────────────────────────────────
function ZoneMap({ zones, pickMode, onPick, userPos, mapFocus }) {
  const mapRef = useRef(null);
  const leafRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const pickMarkerRef = useRef(null);

  useEffect(() => {
    if (leafRef.current) return; // ya inicializado

    const L = window.L;
    if (!L) return;

    const center = userPos ? [userPos.lat, userPos.lng] : [18.4861, -69.9312]; // Santo Domingo

    leafRef.current = L.map(mapRef.current, {
      center,
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(leafRef.current);

    // Marcador posicion usuario
    if (userPos) {
      const meIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:#3b82f6;border:3px solid #fff;
          box-shadow:0 0 0 2px #3b82f6;">
        </div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([userPos.lat, userPos.lng], { icon: meIcon })
        .addTo(leafRef.current)
        .bindTooltip("Tú estás aquí", { permanent: false });
    }
  }, [userPos]);

  // Dibujar zonas
  useEffect(() => {
    const L = window.L;
    const map = leafRef.current;
    if (!L || !map) return;

    markersRef.current.forEach((m) => m.remove());
    circlesRef.current.forEach((c) => c.remove());
    markersRef.current = [];
    circlesRef.current = [];

    zones.forEach((z) => {
      const meta = TYPE_META[z.x_type] || TYPE_META.safe;
      const circle = L.circle([z.x_lat, z.x_lng], {
        radius: z.x_radius,
        color: meta.color,
        fillColor: meta.color,
        fillOpacity: 0.12,
        weight: 2,
      })
        .addTo(map)
        .bindTooltip(`${z.x_name} (${z.x_radius}m)`, { sticky: true });

      const icon = L.divIcon({
        className: "",
        html: `<div style="
          background:${meta.color};border-radius:50%;
          width:12px;height:12px;border:2px solid #fff;
          box-shadow:0 0 6px ${meta.color};">
        </div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const marker = L.marker([z.x_lat, z.x_lng], { icon }).addTo(map);

      markersRef.current.push(marker);
      circlesRef.current.push(circle);
    });
  }, [zones]);

  // Modo de seleccion de punto
  useEffect(() => {
    const L = window.L;
    const map = leafRef.current;
    if (!L || !map) return;

    if (pickMode) {
      map.getContainer().style.cursor = "crosshair";
      const handler = (e) => {
        const { lat, lng } = e.latlng;

        if (pickMarkerRef.current) pickMarkerRef.current.remove();
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            background:#ef4444;border-radius:50%;
            width:14px;height:14px;border:3px solid #fff;
            box-shadow:0 0 0 2px #ef4444;animation:none;">
          </div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        pickMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        onPick?.(lat, lng);
      };
      map.on("click", handler);
      return () => {
        map.off("click", handler);
        map.getContainer().style.cursor = "";
      };
    } else {
      map.getContainer().style.cursor = "";
    }
  }, [pickMode, onPick]);

  // Enfocar el mapa en un punto (por buscador) y marcarlo como centro.
  useEffect(() => {
    const L = window.L;
    const map = leafRef.current;
    if (!L || !map) return;
    if (!mapFocus || mapFocus.lat == null || mapFocus.lng == null) return;

    const lat = Number(mapFocus.lat);
    const lng = Number(mapFocus.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    try {
      map.setView([lat, lng], Math.max(13, map.getZoom() || 15), { animate: true });
    } catch (_) {}

    if (pickMarkerRef.current) pickMarkerRef.current.remove();
    const icon = L.divIcon({
      className: "",
      html: `<div style="
        background:#ef4444;border-radius:50%;
        width:14px;height:14px;border:3px solid #fff;
        box-shadow:0 0 0 2px #ef4444;animation:none;">
      </div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    pickMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
  }, [mapFocus?.key]);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "260px",
        borderRadius: 12,
        overflow: "hidden",
      }}
    />
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function SafeZone() {
  const { user } = useStore();
  const [zones, setZones] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [activeTab, setActiveTab] = useState("zones"); // zones | events
  const [mapFocus, setMapFocus] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    lat: null,
    lng: null,
    radius: 250,
    type: "safe",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [placeQ, setPlaceQ] = useState("");
  const [placeItems, setPlaceItems] = useState([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeErr, setPlaceErr] = useState("");

  // GPS usuario
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    );
  }, []);

  const fetchZones = useCallback(async () => {
    if (!user?.email || !user?.uid) return;
    try {
      const res = await fetch(
        `${API}/zones?requester_email=${encodeURIComponent(user.email)}&user_id=${user.uid}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.zones) setZones(data.zones);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchEvents = useCallback(async () => {
    if (!user?.email || !user?.uid) return;
    try {
      const res = await fetch(
        `${API}/events?requester_email=${encodeURIComponent(user.email)}&user_id=${user.uid}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.events) setEvents(data.events);
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    fetchZones();
    fetchEvents();
  }, [fetchZones, fetchEvents]);

  // Refrescar Alertas cuando el hook de geofence registra un evento.
  useEffect(() => {
    const onRefresh = () => {
      fetchEvents();
    };
    window.addEventListener("emergelens:geofence:refresh", onRefresh);
    return () => window.removeEventListener("emergelens:geofence:refresh", onRefresh);
  }, [fetchEvents]);

  const handlePick = useCallback((lat, lng) => {
    setForm((f) => ({ ...f, lat, lng }));
  }, []);

  const searchPlace = async () => {
    const q = placeQ.trim();
    if (!user?.email || q.length < 2) return;
    setPlaceLoading(true);
    setPlaceErr("");
    try {
      const res = await fetch(
        `${API}/geocode?q=${encodeURIComponent(q)}&limit=6&requester_email=${encodeURIComponent(user.email)}`,
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
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    setForm((f) => ({
      ...f,
      lat,
      lng,
      name: f.name?.trim() ? f.name : (p.short_name || p.name || "").split(",")[0],
    }));
    setMapFocus({ lat, lng, key: Date.now() });
    setPickMode(false);
    setPlaceItems([]);
    setPlaceQ(p?.name || "");
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return setErr("Escribe un nombre para la zona.");
    if (form.lat == null)
      return setErr("Selecciona el centro de la zona en el mapa.");
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`${API}/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requester_email: user.email,
          user_id: user.uid,
          name: form.name,
          lat: form.lat,
          lng: form.lng,
          radius: form.radius,
          type: form.type,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        setPickMode(false);
        setForm({ name: "", lat: null, lng: null, radius: 250, type: "safe" });
        setPlaceQ("");
        setPlaceItems([]);
        setPlaceErr("");
        await fetchZones();
      } else {
        setErr(data.error || "Error al guardar");
      }
    } catch (_) {
      setErr("Error de conexion");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zoneId) => {
    // Confirmacion manejada en UI (no usar window.confirm).
    try {
      await fetch(
        `${API}/zones/${zoneId}?requester_email=${encodeURIComponent(user.email)}`,
        { method: "DELETE", credentials: "include" },
      );
      await fetchZones();
    } catch (_) {}
  };

  const handleToggle = async (zone) => {
    try {
      await fetch(`${API}/zones/${zone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requester_email: user.email,
          active: !zone.x_active,
        }),
      });
      setDeleteConfirmId(null);
      await fetchZones();
    } catch (_) {}
  };

  return (
    <>
      <style>{`
        .sz-page { padding: 0 0 24px; }

        .sz-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .sz-title {
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0 0 2px;
          color: var(--white);
        }
        .sz-sub {
          font-size: 0.82rem;
          color: var(--muted);
          margin: 0;
        }
        .sz-new-btn {
          background: linear-gradient(135deg, #22d3b7, #16a39a);
          color: var(--navy);
          border: none;
          border-radius: 12px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: opacity .2s;
        }
        .sz-new-btn:hover { opacity: .88; }

        .sz-tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          margin-bottom: 14px;
        }
        .sz-tab {
          flex: 1;
          padding: 10px 8px;
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
        .sz-tab.on {
          color: #22d3b7;
          font-weight: 700;
          border-bottom-color: #22d3b7;
        }

        /* Mapa card */
        .sz-map-card {
          background: var(--navy-mid);
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 14px;
        }
        .sz-map-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
        }
        .sz-map-head strong { font-size: 13px; }
        .sz-map-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

        .sz-pick-banner {
          background: rgba(34,211,183,0.1);
          border: 1px dashed #22d3b7;
          border-radius: 10px;
          padding: 10px 14px;
          margin: 10px 10px 0;
          font-size: 12px;
          color: #22d3b7;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Form */
        .sz-form {
          background: var(--navy-mid);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 14px;
        }
        .sz-form-title {
          font-size: 13px;
          font-weight: 700;
          margin: 0 0 14px;
          color: var(--white);
        }
        .sz-field { margin-bottom: 12px; }
        .sz-label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .04em;
          color: var(--muted);
          margin-bottom: 5px;
        }
        .sz-input {
          width: 100%;
          background: var(--navy);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 9px 12px;
          color: var(--white);
          font-size: 13px;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color .2s;
        }
        .sz-input:focus { border-color: #22d3b7; }

        .sz-place-row { display:flex; gap:8px; align-items:center; }
        .sz-place-btn {
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
        .sz-place-btn:disabled { opacity: .55; cursor: not-allowed; }
        .sz-place-err {
          margin-top: 8px;
          color: #ef4444;
          font-size: 12px;
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .sz-place-list {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 180px;
          overflow: auto;
          padding-right: 4px;
        }
        .sz-place-item {
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
        .sz-place-item:hover { border-color: #22d3b7; }
        .sz-place-name { font-weight: 800; font-size: 12px; }
        .sz-place-sub { font-size: 10px; color: var(--muted); }
        .sz-place-coords { font-size: 10px; color: var(--muted); }

        .sz-type-row {
          display: flex;
          gap: 8px;
        }
        .sz-type-btn {
          flex: 1;
          padding: 10px 8px;
          border-radius: 10px;
          border: 1.5px solid var(--border);
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all .15s;
          font-family: inherit;
        }
        .sz-type-btn.safe.on   { border-color: #22d3b7; background: rgba(34,211,183,.12); color: #22d3b7; }
        .sz-type-btn.danger.on { border-color: #ef4444; background: rgba(239,68,68,.12);   color: #ef4444; }

        .sz-radius-grid {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 6px;
        }
        .sz-radius-btn {
          padding: 8px 4px;
          border-radius: 8px;
          border: 1.5px solid var(--border);
          background: transparent;
          color: var(--muted);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all .15s;
          font-family: inherit;
        }
        .sz-radius-btn.on { border-color: #22d3b7; background: rgba(34,211,183,.1); color: #22d3b7; }

        .sz-coord-badge {
          background: var(--navy);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 11px;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sz-coord-badge.set { border-color: #22d3b7; color: #22d3b7; }

        .sz-err {
          background: rgba(239,68,68,.1);
          border: 1px solid rgba(239,68,68,.3);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: #ef4444;
          margin-bottom: 10px;
        }

        .sz-form-btns { display: flex; gap: 8px; justify-content: flex-end; }
        .sz-cancel-btn {
          background: none;
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 8px 16px;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .sz-save-btn {
          background: linear-gradient(135deg, #22d3b7, #16a39a);
          color: var(--navy);
          border: none;
          border-radius: 10px;
          padding: 8px 18px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: opacity .15s;
        }
        .sz-save-btn:disabled { opacity: .55; cursor: default; }

        /* Lista zonas */
        .sz-zone-list { display: flex; flex-direction: column; gap: 10px; }
        .sz-zone-card {
          background: var(--navy-mid);
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: border-color .15s;
        }
        .sz-zone-card.inactive { opacity: .55; }
        .sz-zone-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .sz-zone-info { flex: 1; min-width: 0; }
        .sz-zone-name {
          font-size: 14px;
          font-weight: 700;
          color: var(--white);
          margin: 0 0 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sz-zone-meta {
          font-size: 11px;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .sz-zone-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 20px;
        }
        .sz-zone-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .sz-icon-btn {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: background .15s;
        }
        .sz-icon-btn.toggle { background: rgba(34,211,183,.1); color: #22d3b7; }
        .sz-icon-btn.del    { background: rgba(239,68,68,.1);   color: #ef4444; }
        .sz-icon-btn:hover  { opacity: .8; }

        /* Eventos */
        .sz-event-list { display: flex; flex-direction: column; gap: 8px; }
        .sz-event-row {
          background: var(--navy-mid);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sz-event-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        .sz-event-info { flex: 1; min-width: 0; }
        .sz-event-title { font-size: 13px; font-weight: 600; color: var(--white); margin: 0 0 2px; }
        .sz-event-sub   { font-size: 11px; color: var(--muted); margin: 0; }

        .sz-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 40px 0;
          color: var(--muted);
        }
        .sz-empty i { font-size: 36px; opacity: .35; }
        .sz-empty p { margin: 0; font-size: 13px; }
      `}</style>

      <div className="sz-page">
        <div className="sz-header">
          <div>
            <h2 className="sz-title">Zona Segura</h2>
            <p className="sz-sub">Define áreas seguras y peligrosas.</p>
          </div>
          <button
            className="sz-new-btn"
            onClick={() => {
              setShowForm(true);
              setPickMode(true);
            }}
          >
            <i className="ri-add-line" /> Nueva zona
          </button>
        </div>

        {/* Mapa */}
        <div className="sz-map-card">
          <div className="sz-map-head">
            <div>
              <strong>Mapa de zonas</strong>
              <div className="sz-map-sub">
                {pickMode
                  ? "Toca el mapa para colocar el centro de la zona"
                  : "Tus zonas se muestran aqui (pausadas se ven opacas)"}
              </div>
            </div>
            <i
              className="ri-map-pin-2-fill"
              style={{ color: "var(--muted)" }}
            />
          </div>
          {pickMode && (
            <div className="sz-pick-banner">
              <i className="ri-cursor-fill" />
              Toca el mapa para elegir el centro de tu nueva zona
            </div>
          )}
          <div style={{ padding: "10px" }}>
            <ZoneMap
              zones={zones}
              pickMode={pickMode}
              onPick={handlePick}
              userPos={userPos}
              mapFocus={mapFocus}
            />
          </div>
        </div>

        {/* Formulario nueva zona */}
        {showForm && (
          <div className="sz-form">
            <p className="sz-form-title">
              <i className="ri-map-pin-add-fill" style={{ color: "#22d3b7" }} />{" "}
              Nueva zona
            </p>

            <div className="sz-field">
              <label className="sz-label">Nombre</label>
              <input
                className="sz-input"
                placeholder="Ej: Mi casa, Trabajo, Zona peligrosa..."
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="sz-field">
              <label className="sz-label">Buscar lugar</label>
              <div className="sz-place-row">
                <input
                  className="sz-input"
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
                  className="sz-place-btn"
                  onClick={searchPlace}
                  disabled={placeLoading || placeQ.trim().length < 2}
                  type="button"
                >
                  {placeLoading ? "..." : "Buscar"}
                </button>
              </div>
              {placeErr && (
                <div className="sz-place-err">
                  <i className="ri-error-warning-line" /> {placeErr}
                </div>
              )}
              {placeItems.length > 0 && (
                <div className="sz-place-list">
                  {placeItems.map((p, idx) => (
                    <button
                      key={idx}
                      className="sz-place-item"
                      onClick={() => pickPlace(p)}
                      type="button"
                    >
                      <span className="sz-place-name">
                        {p.short_name || (p.name || "").split(",")[0]}
                      </span>
                      <span className="sz-place-sub">{p.name}</span>
                      <span className="sz-place-coords">
                        {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="sz-field">
              <label className="sz-label">Tipo de zona</label>
              <div className="sz-type-row">
                {["safe", "danger"].map((t) => {
                  const meta = TYPE_META[t];
                  return (
                    <button
                      key={t}
                      className={`sz-type-btn ${t} ${form.type === t ? "on" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                    >
                      <i className={meta.icon} /> {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sz-field">
              <label className="sz-label">Radio de la zona</label>
              <div className="sz-radius-grid">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    className={`sz-radius-btn ${form.radius === r.value ? "on" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, radius: r.value }))}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sz-field">
              <label className="sz-label">Centro de la zona</label>
              <div
                className={`sz-coord-badge ${form.lat != null ? "set" : ""}`}
              >
                {form.lat != null ? (
                  <>
                    <i className="ri-map-pin-fill" />
                    {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                  </>
                ) : (
                  <>
                    <i className="ri-map-pin-line" />
                    Toca el mapa para seleccionar el punto
                  </>
                )}
              </div>
            </div>

            {err && (
              <div className="sz-err">
                <i className="ri-error-warning-line" /> {err}
              </div>
            )}

            <div className="sz-form-btns">
              <button
                className="sz-cancel-btn"
                onClick={() => {
                  setShowForm(false);
                  setPickMode(false);
                  setErr("");
                }}
              >
                Cancelar
              </button>
              <button
                className="sz-save-btn"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar zona"}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="sz-tabs">
          <button
            className={`sz-tab ${activeTab === "zones" ? "on" : ""}`}
            onClick={() => setActiveTab("zones")}
          >
            🛡️ Mis zonas ({zones.length})
          </button>
          <button
            className={`sz-tab ${activeTab === "events" ? "on" : ""}`}
            onClick={() => setActiveTab("events")}
          >
            ⚠️ Alertas ({events.length})
          </button>
        </div>

        {/* Lista zonas */}
        {activeTab === "zones" &&
          (loading ? (
            <div className="sz-empty">
              <i className="ri-loader-4-line" />
              <p>Cargando...</p>
            </div>
          ) : zones.length === 0 ? (
            <div className="sz-empty">
              <i className="ri-map-pin-2-line" />
              <p>No tienes zonas definidas.</p>
              <p style={{ fontSize: 11 }}>Crea tu primera zona segura 👆</p>
            </div>
          ) : (
            <div className="sz-zone-list">
              {zones.map((z) => {
                const meta = TYPE_META[z.x_type] || TYPE_META.safe;
                return (
                  <div
                    key={z.id}
                    className={`sz-zone-card ${z.x_active ? "" : "inactive"}`}
                  >
                    <div
                      className="sz-zone-icon"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      <i className={meta.icon} />
                    </div>
                    <div className="sz-zone-info">
                      <p className="sz-zone-name">{z.x_name}</p>
                      <div className="sz-zone-meta">
                        <span
                          className="sz-zone-badge"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <span>📍 {z.x_radius}m de radio</span>
                        {z.x_created_by === "admin" && (
                          <span style={{ color: "#f59e0b" }}>🔒 Admin</span>
                        )}
                      </div>
                    </div>
                    <div className="sz-zone-actions">
                      <button
                        className="sz-icon-btn toggle"
                        title={z.x_active ? "Desactivar" : "Activar"}
                        onClick={() => handleToggle(z)}
                      >
                        {z.x_active ? "⏸" : "▶"}
                      </button>
                      {z.x_created_by !== "admin" && (
                        deleteConfirmId === z.id ? (
                          <>
                            <button
                              className="sz-icon-btn del"
                              title="Confirmar eliminar"
                              onClick={() => handleDelete(z.id)}
                            >
                              Si
                            </button>
                            <button
                              className="sz-icon-btn toggle"
                              title="Cancelar"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            className="sz-icon-btn del"
                            title="Eliminar"
                            onClick={() => setDeleteConfirmId(z.id)}
                          >
                            🗑
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {/* Lista eventos */}
        {activeTab === "events" &&
          (events.length === 0 ? (
            <div className="sz-empty">
              <i className="ri-shield-check-line" />
              <p>Sin alertas de zona registradas.</p>
            </div>
          ) : (
            <div className="sz-event-list">
              {events.map((ev) => {
                const isExit = ev.x_event_type === "exit";
                const isDanger = ev.x_zone_type === "danger";
                const color = isExit || isDanger ? "#ef4444" : "#22d3b7";
                const icon = isExit
                  ? "ri-logout-circle-r-fill"
                  : "ri-login-circle-fill";
                return (
                  <div key={ev.id} className="sz-event-row">
                    <div
                      className="sz-event-icon"
                      style={{ background: `${color}18`, color }}
                    >
                      <i className={icon} />
                    </div>
                    <div className="sz-event-info">
                      <p className="sz-event-title">
                        {isExit ? "Saliste de" : "Entraste a"}: {ev.x_zone_name}
                      </p>
                      <p className="sz-event-sub">{fmtTs(ev.x_timestamp)}</p>
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
