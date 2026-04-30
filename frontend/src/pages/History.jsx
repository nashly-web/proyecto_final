// History: historial de emergencias y eventos.
// Sirve para revisar lo ocurrido y estados anteriores.
import { useState, useEffect, useCallback } from "react";
import { useStore } from "../store";

const EMERGENCY_NAMES = {
  medical: "Emergencia Medica",
  security: "Emergencia de Seguridad",
  fire: "Incendio",
  accident: "Accidente",
};

const EMERGENCY_ICONS = {
  medical: "ri-heart-pulse-fill",
  security: "ri-shield-fill",
  fire: "ri-fire-fill",
  accident: "ri-car-fill",
};

const STATUS_META = {
  active: { label: "Activo", color: "#E53935", bg: "#fff3f3" },
  monitoring: { label: "En seguimiento", color: "#7C3AED", bg: "#f5f3ff" },
  resolved: { label: "Resuelto", color: "#16a34a", bg: "#f0fdf4" },
  false_alarm: { label: "Falso positivo", color: "#F59E0B", bg: "#fffbeb" },
  cancelled: { label: "Cancelado", color: "#64748b", bg: "#f1f5f9" },
};

const EMERGENCY_COLORS = {
  medical: "#E53935",
  security: "#7C3AED",
  fire: "#F97316",
  accident: "#F59E0B",
};

function fmtDate(ts) {
  if (!ts) return "--";
  return new Date(ts * 1000).toLocaleString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(secs) {
  if (!secs || secs <= 0) return "--";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function fmtGeoTs(ts) {
  if (!ts) return "";
  const fixed = String(ts).includes("T")
    ? String(ts)
    : String(ts).replace(" ", "T") + "Z";
  return new Date(fixed).toLocaleString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exportPDF(incident, photoB64 = null, hasAudio = false) {
  const mapsUrl =
    incident.lat && incident.lng
      ? `https://maps.google.com/?q=${incident.lat},${incident.lng}`
      : null;
  const sMeta = STATUS_META[incident.status] || STATUS_META.active;

  const photoSection = photoB64
    ? `<div style="margin:20px 0">
        <h3 style="font-size:13px;color:#555;margin:0 0 10px;text-transform:uppercase">Foto de evidencia</h3>
        <img src="${photoB64}" style="width:100%;max-height:320px;object-fit:cover;border-radius:10px;border:1px solid #eee" />
      </div>`
    : "";

  const audioSection = hasAudio
    ? `<div style="background:#fff8e1;border-left:4px solid #FFA000;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px;color:#555">
        Audio de evidencia disponible en SOS EmergeLens.
      </div>`
    : "";

  const contactBadge = incident.as_contact
    ? `<div style="background:#e8f5e9;border-left:4px solid #43A047;padding:10px 16px;border-radius:6px;margin:16px 0;font-size:13px">
        Eras el contacto de emergencia de <strong>${incident.name}</strong> en este incidente.
      </div>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;padding:40px;color:#1a1a2e;max-width:700px;margin:0 auto}
  .header{background:#E53935;color:white;padding:24px;border-radius:12px;margin-bottom:24px}
  .header h1{margin:0;font-size:22px}.header p{margin:6px 0 0;opacity:.85;font-size:14px}
  .row{display:flex;gap:16px;margin-bottom:16px}
  .field{flex:1;background:#f5f5f5;border-radius:8px;padding:14px}
  .field label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px}
  .field span{font-size:15px;font-weight:600}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${sMeta.bg};color:${sMeta.color}}
  a{color:#E53935}
  .footer{margin-top:32px;font-size:12px;color:#888;text-align:center;border-top:1px solid #eee;padding-top:16px}
</style></head><body>
<div class="header">
  <h1>Reporte de Incidente -- SOS EmergeLens</h1>
  <p>${EMERGENCY_NAMES[incident.type] || "Emergencia"} · ${incident.name}</p>
</div>
${contactBadge}
<div class="row">
  <div class="field"><label>Tipo</label><span>${EMERGENCY_NAMES[incident.type] || incident.type}</span></div>
  <div class="field"><label>Estado</label><span class="badge">${sMeta.label}</span></div>
</div>
<div class="row">
  <div class="field"><label>Fecha y hora</label><span>${fmtDate(incident.started)}</span></div>
  <div class="field"><label>Duracion</label><span>${fmtDuration(incident.duration)}</span></div>
</div>
<div class="row">
  <div class="field"><label>Coordenadas</label><span>${incident.lat?.toFixed(6) ?? "--"}, ${incident.lng?.toFixed(6) ?? "--"}</span></div>
  <div class="field"><label>Ubicacion</label><span>${
    mapsUrl
      ? `<a href="${mapsUrl}" target="_blank">Ver en Google Maps</a>`
      : "No disponible"
  }</span></div>
</div>
${incident.name ? `<div class="row"><div class="field" style="flex:1"><label>Usuario</label><span>${incident.name}</span></div></div>` : ""}
${
  incident.ended > 0
    ? `<div class="row">
  <div class="field"><label>Inicio</label><span>${fmtDate(incident.started)}</span></div>
  <div class="field"><label>Fin</label><span>${fmtDate(incident.ended)}</span></div>
</div>`
    : ""
}
${photoB64 || hasAudio ? `<div style="margin-top:24px"><h2 style="font-size:15px;color:#333;margin:0 0 12px;border-bottom:2px solid #E53935;padding-bottom:6px">Evidencia</h2>${photoSection}${audioSection}</div>` : ""}
<div class="footer">Generado por SOS EmergeLens · ${new Date().toLocaleString("es-DO")}</div>
</body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

export default function History() {
  const { user } = useStore();
  const [incidents, setIncidents] = useState([]);
  const [geoEvents, setGeoEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [evidenceCache, setEvidenceCache] = useState({});
  const [viewFilter, setViewFilter] = useState("all"); // all | mine | contact

  const isAdmin = user?.email === "sosemergelens@gmail.com";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/history/", { credentials: "include" });
      const d = await r.json();
      if (d.ok) {
        setIncidents(d.incidents || []);
        setGeoEvents(d.geofence_events || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadEvidence(inc) {
    if (!inc.has_photo && !inc.has_audio) return;
    if (evidenceCache[inc.id]) return;
    setEvidenceCache((prev) => ({ ...prev, [inc.id]: { loading: true } }));
    try {
      const r = await fetch(`/api/history/evidence/${inc.id}`, {
        credentials: "include",
      });
      const d = await r.json();
      setEvidenceCache((prev) => ({
        ...prev,
        [inc.id]: {
          loading: false,
          photo: d.photo || null,
          audio: d.audio || null,
        },
      }));
    } catch {
      setEvidenceCache((prev) => ({ ...prev, [inc.id]: { loading: false } }));
    }
  }

  function toggleExpand(inc) {
    const next = expanded === inc.id ? null : inc.id;
    setExpanded(next);
    if (next) loadEvidence(inc);
  }

  async function changeStatus(incidentId, status) {
    const r = await fetch(`/api/emergency/status/${incidentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    const d = await r.json();
    if (d.ok)
      setIncidents((prev) =>
        prev.map((i) => (i.id === incidentId ? { ...i, status } : i)),
      );
  }

  async function handleExportPDF(inc) {
    let ev = evidenceCache[inc.id];
    if (!ev && (inc.has_photo || inc.has_audio)) {
      try {
        const r = await fetch(`/api/history/evidence/${inc.id}`, {
          credentials: "include",
        });
        const d = await r.json();
        ev = { photo: d.photo || null, audio: d.audio || null };
        setEvidenceCache((prev) => ({
          ...prev,
          [inc.id]: { ...ev, loading: false },
        }));
      } catch {}
    }
    exportPDF(inc, ev?.photo || null, inc.has_audio);
  }

  // Filtrado combinado: estado + tipo de vista (mio / como contacto)
  let filtered =
    filter === "all" ? incidents : incidents.filter((i) => i.status === filter);
  if (viewFilter === "mine") filtered = filtered.filter((i) => !i.as_contact);
  if (viewFilter === "contact") filtered = filtered.filter((i) => i.as_contact);

  const hasContactIncidents = incidents.some((i) => i.as_contact);

  return (
    <section id="secHistory">
      <div className="card">
        <div className="card-title">
          <div className="ic teal">
            <i className="ri-history-fill" />
          </div>
          <h3>Historial de Incidentes</h3>
        </div>

        {/* Filtro mio / como contacto (solo si hay incidentes de contacto) */}
        {hasContactIncidents && !isAdmin && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[
              { v: "all", label: "Todos" },
              { v: "mine", label: "Mis incidentes" },
              { v: "contact", label: "Soy contacto" },
            ].map(({ v, label }) => (
              <button
                key={v}
                className={`notif-filter-btn ${viewFilter === v ? "on" : ""}`}
                onClick={() => setViewFilter(v)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Filtro por estado */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {[
            "all",
            "active",
            "monitoring",
            "resolved",
            "false_alarm",
            "cancelled",
          ].map((f) => {
            const meta = STATUS_META[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="notif-filter-btn"
                style={
                  filter === f && meta
                    ? {
                        background: meta.color,
                        borderColor: meta.color,
                        color: "#fff",
                      }
                    : {}
                }
              >
                {f === "all" ? "Todos" : meta?.label || f}
              </button>
            );
          })}
          <button
            className="notif-mark-all"
            onClick={load}
            style={{ marginLeft: "auto" }}
          >
            <i className="ri-refresh-line" /> Actualizar
          </button>
        </div>

        {loading ? (
          <div className="empty">
            <i
              className="ri-loader-4-line"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <p>Cargando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <i className="ri-shield-check-fill" />
            <p>Sin incidentes{filter !== "all" ? " en este filtro" : ""}</p>
          </div>
        ) : (
          filtered.map((inc) => {
            const color = EMERGENCY_COLORS[inc.type] || "#E53935";
            const icon = EMERGENCY_ICONS[inc.type] || "ri-alarm-warning-fill";
            const sMeta = STATUS_META[inc.status] || STATUS_META.active;
            const isOpen = expanded === inc.id;
            const mapsUrl =
              inc.lat && inc.lng
                ? `https://maps.google.com/?q=${inc.lat},${inc.lng}`
                : null;
            const ev = evidenceCache[inc.id];

            return (
              <div key={inc.id} className="history-item">
                <div
                  className="history-header"
                  onClick={() => toggleExpand(inc)}
                >
                  <div
                    className="history-icon"
                    style={{ background: color + "22", color }}
                  >
                    <i className={icon} />
                  </div>
                  <div className="history-info">
                    <div className="history-top">
                      <strong>{EMERGENCY_NAMES[inc.type] || inc.type}</strong>
                      <span
                        className="h-badge"
                        style={{ background: sMeta.bg, color: sMeta.color }}
                      >
                        {sMeta.label}
                      </span>
                    </div>

                    {/* Nombre — mostrar siempre si es admin o si es incidente de contacto */}
                    {(isAdmin || inc.as_contact) && inc.name && (
                      <p className="history-user">
                        <i
                          className={
                            inc.as_contact
                              ? "ri-shield-user-fill"
                              : "ri-user-fill"
                          }
                        />
                        {inc.name}
                        {inc.as_contact && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#F59E0B",
                              background: "#fffbeb",
                              padding: "1px 6px",
                              borderRadius: 10,
                            }}
                          >
                            contacto
                          </span>
                        )}
                      </p>
                    )}

                    <p className="history-date">
                      <i className="ri-calendar-line" /> {fmtDate(inc.started)}
                    </p>

                    {(inc.has_photo || inc.has_audio) && (
                      <div className="history-evidence-badges">
                        {inc.has_photo && (
                          <span className="hev-badge">
                            <i className="ri-camera-fill" /> Foto
                          </span>
                        )}
                        {inc.has_audio && (
                          <span className="hev-badge">
                            <i className="ri-mic-fill" /> Audio
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <i
                    className={`ri-arrow-${isOpen ? "up" : "down"}-s-line history-chevron`}
                  />
                </div>

                {isOpen && (
                  <div className="history-detail">
                    {/* Badge de contacto en detalle */}
                    {inc.as_contact && (
                      <div
                        style={{
                          background: "#fffbeb",
                          border: "1px solid #F59E0B44",
                          borderRadius: 10,
                          padding: "10px 14px",
                          fontSize: 13,
                          color: "#92400e",
                          marginBottom: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <i
                          className="ri-shield-user-fill"
                          style={{ color: "#F59E0B" }}
                        />
                        Eras el contacto de emergencia de{" "}
                        <strong>{inc.name}</strong>
                      </div>
                    )}

                    <div className="history-detail-grid">
                      <div className="hd-field">
                        <label>Duracion</label>
                        <span>{fmtDuration(inc.duration)}</span>
                      </div>
                      <div className="hd-field">
                        <label>Coordenadas</label>
                        <span>
                          {inc.lat
                            ? `${inc.lat.toFixed(4)}, ${inc.lng.toFixed(4)}`
                            : "--"}
                        </span>
                      </div>
                      {inc.started > 0 && (
                        <div className="hd-field">
                          <label>Inicio</label>
                          <span>{fmtDate(inc.started)}</span>
                        </div>
                      )}
                      {inc.ended > 0 && (
                        <div className="hd-field">
                          <label>Fin</label>
                          <span>{fmtDate(inc.ended)}</span>
                        </div>
                      )}
                    </div>

                    {/* Evidencia */}
                    {(inc.has_photo || inc.has_audio) && (
                      <div className="history-evidence-section">
                        <p className="hev-title">
                          <i className="ri-attachment-2" /> Evidencia
                        </p>
                        {ev?.loading && (
                          <div
                            style={{
                              textAlign: "center",
                              padding: "16px 0",
                              color: "var(--muted)",
                            }}
                          >
                            <i
                              className="ri-loader-4-line"
                              style={{
                                animation: "spin 1s linear infinite",
                                fontSize: 22,
                              }}
                            />
                          </div>
                        )}
                        {ev?.photo && !ev.loading && (
                          <div className="hev-photo">
                            <img src={ev.photo} alt="Foto de evidencia" />
                            <a
                              href={ev.photo}
                              download="evidencia.jpg"
                              className="hev-download"
                              title="Descargar"
                            >
                              <i className="ri-download-line" />
                            </a>
                          </div>
                        )}
                        {ev?.audio && !ev.loading && (
                          <div className="hev-audio">
                            <i className="ri-mic-fill" />
                            <audio
                              controls
                              src={ev.audio}
                              style={{ flex: 1, height: 34 }}
                            />
                            <a
                              href={ev.audio}
                              download="audio_evidencia.webm"
                              className="hev-download"
                              title="Descargar"
                            >
                              <i className="ri-download-line" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="history-actions">
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-muted"
                          style={{ fontSize: 13, padding: "8px 14px" }}
                        >
                          <i className="ri-map-pin-line" /> Ver en mapa
                        </a>
                      )}
                      {/* Navegar (para incidentes de contacto con ubicacion) */}
                      {inc.as_contact && mapsUrl && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${inc.lat},${inc.lng}&travelmode=driving`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn"
                          style={{
                            fontSize: 13,
                            padding: "8px 14px",
                            background: "#fffbeb",
                            color: "#F59E0B",
                            border: "1px solid #F59E0B44",
                          }}
                        >
                          🗺️ Navegar hasta aqui
                        </a>
                      )}
                      {/* Falso positivo (usuario, sus propios incidentes activos) */}
                      {!isAdmin &&
                        !inc.as_contact &&
                        inc.status === "active" && (
                          <button
                            className="btn"
                            style={{
                              fontSize: 13,
                              padding: "8px 14px",
                              background: "#fffbeb",
                              color: "#F59E0B",
                              border: "1px solid #F59E0B44",
                            }}
                            onClick={() => changeStatus(inc.id, "false_alarm")}
                          >
                            <i className="ri-error-warning-fill" /> Falso
                            positivo
                          </button>
                        )}
                      {/* Admin: en seguimiento */}
                      {isAdmin && inc.status === "active" && (
                        <button
                          className="btn"
                          style={{
                            fontSize: 13,
                            padding: "8px 14px",
                            background: "#f5f3ff",
                            color: "#7C3AED",
                            border: "1px solid #7C3AED44",
                          }}
                          onClick={() => changeStatus(inc.id, "monitoring")}
                        >
                          <i className="ri-eye-fill" /> En seguimiento
                        </button>
                      )}
                      {/* Admin: resolver */}
                      {isAdmin &&
                        ["active", "monitoring"].includes(inc.status) && (
                          <button
                            className="btn"
                            style={{
                              fontSize: 13,
                              padding: "8px 14px",
                              background: "#f0fdf4",
                              color: "#16a34a",
                              border: "1px solid #16a34a44",
                            }}
                            onClick={() => changeStatus(inc.id, "resolved")}
                          >
                            <i className="ri-shield-check-fill" /> Resolver
                          </button>
                        )}
                      <button
                        className="btn btn-red"
                        style={{ fontSize: 13, padding: "8px 14px" }}
                        onClick={() => handleExportPDF(inc)}
                      >
                        <i className="ri-file-pdf-fill" /> Exportar PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">
          <div className="ic" style={{ background: "#fef3c7", color: "#f59e0b" }}>
            <i className="ri-shield-flash-fill" />
          </div>
          <h3>Violaciones de Zona</h3>
        </div>

        {loading ? (
          <p className="muted">Cargando...</p>
        ) : !geoEvents || geoEvents.length === 0 ? (
          <p className="muted">Sin violaciones de zona registradas.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {geoEvents.slice(0, 100).map((ev) => {
              const isExit = ev.x_event_type === "exit";
              const isDanger = ev.x_zone_type === "danger";
              const color = isExit || isDanger ? "#ef4444" : "#f59e0b";
              const icon = isExit ? "ri-logout-circle-r-fill" : "ri-login-circle-fill";
              const rawUser = ev.x_user_id;
              const userName =
                Array.isArray(rawUser) && rawUser.length > 1 ? rawUser[1] : "";
              return (
                <div
                  key={ev.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: "12px 14px",
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: color + "18",
                      color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 18,
                    }}
                  >
                    <i className={icon} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>
                      {isExit ? "Salio de" : "Entro a"}: {ev.x_zone_name || "Zona"}
                      {isDanger && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#ef4444",
                            background: "#ef444418",
                            border: "1px solid #ef444433",
                            padding: "2px 8px",
                            borderRadius: 999,
                          }}
                        >
                          Peligro
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {fmtGeoTs(ev.x_timestamp)}
                      {isAdmin && userName ? ` · ${userName}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
