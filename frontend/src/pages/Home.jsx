// Home: pantalla de inicio (antes de entrar a SOS).
// Desde aqui el usuario elige tipo de emergencia y dispara el flujo SOS.
import React, { useState, useEffect, useCallback } from "react";
import { useStore } from "../store";
import { useToast, useModal } from "../components/Providers";
import CallSimulator from "./CallSimulator";
import IncidentMap from "../components/IncidentMap";
import { refreshMedReminders } from "../lib/medReminders";
import {
  requestSystemNotificationPermission,
  getSystemNotificationPermission,
} from "../lib/systemNotifications";

const FREQS = [
  "Una vez al dia",
  "Cada 8 horas",
  "Cada 12 horas",
  "Segun necesidad",
];

export default function Home({ onFireSOS, onGoChat }) {
  const { eType, setEType, user } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [meds, setMeds] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(true);
  const [weather, setWeather] = useState(null);

  // Cargar medicamentos
  const loadMeds = useCallback(async () => {
    try {
      const r = await fetch("/api/meds/", { credentials: "include" });
      const d = await r.json();
      if (d.ok) setMeds(d.meds);
    } catch {
    } finally {
      setLoadingMeds(false);
    }
  }, []);

  // Cargar clima para el banner superior
  useEffect(() => {
    loadMeds();
    fetch("/api/weather/alerts", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setWeather(d))
      .catch(() => {});
  }, [loadMeds]);

  // SOS
  function pickType(type) {
    setEType(eType === type ? null : type);
  }
  function fireSOS() {
    onFireSOS();
  }

  function openLensCall() {
    const type = eType || "medical";
    setEType(type);
    onFireSOS();
    setTimeout(() => {
      openModal(
        <CallSimulator
          eType={type}
          userName={user.name || "Usuario"}
          loc={null}
          onClose={closeModal}
        />,
        true,
      );
    }, 300);
  }

  function shareLoc() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const url = `https://maps.google.com/q=${p.coords.latitude},${p.coords.longitude}`;
          navigator.clipboard
            .writeText(url)
            .then(() => toast("Enlace de ubicacion copiado", "ok"))
            .catch(() => toast("Ubicacion lista para compartir", "ok"));
        },
        () => toast("No se pudo obtener ubicacion", "err"),
      );
    } else {
      toast("Geolocalizacion no soportada", "err");
    }
  }

  // Medicamentos CRUD
  function openAddMed() {
    openModal(
      <MedModal
        onSave={async (m) => {
          const r = await fetch("/api/meds/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(m),
          });
          const d = await r.json();
          if (d.ok) {
            await loadMeds();
            await refreshMedReminders();
            closeModal();
            toast("Medicamento agregado", "ok");
          } else toast(d.error || "Error al guardar", "err");
        }}
        onClose={closeModal}
      />,
    );
  }

  function openEditMed(med) {
    openModal(
      <MedModal
        initial={med}
        onSave={async (m) => {
          const r = await fetch(`/api/meds/${med.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(m),
          });
          const d = await r.json();
          if (d.ok) {
            await loadMeds();
            await refreshMedReminders();
            closeModal();
            toast("Actualizado", "ok");
          } else toast(d.error || "Error al actualizar", "err");
        }}
        onClose={closeModal}
      />,
    );
  }

  async function deleteMed(id) {
    if (!window.confirm("Eliminar este medicamento")) return;
    const r = await fetch(`/api/meds/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const d = await r.json();
    if (d.ok) {
      setMeds((p) => p.filter((x) => x.id !== id));
      await refreshMedReminders();
      toast("Eliminado", "ok");
    } else toast(d.error || "Error al eliminar", "err");
  }

  // Banner climatico para Home
  const WEATHER_META = {
    red: { bg: "#fef2f2", border: "#E53935", text: "#991b1b", dot: "#E53935" },
    orange: {
      bg: "#fff7ed",
      border: "#F97316",
      text: "#9a3412",
      dot: "#F97316",
    },
    yellow: {
      bg: "#fffbeb",
      border: "#F59E0B",
      text: "#92400e",
      dot: "#F59E0B",
    },
    green: {
      bg: "#f0fdf4",
      border: "#16a34a",
      text: "#14532d",
      dot: "#16a34a",
    },
    unknown: {
      bg: "#f8fafc",
      border: "#94a3b8",
      text: "#475569",
      dot: "#94a3b8",
    },
  };
  const wm = weather
    ? WEATHER_META[weather.level] || WEATHER_META.unknown
    : null;

  const notifPerm = getSystemNotificationPermission();

  return (
    <section id="secHome">
      {/* Banner climatico — solo si no es verde */}
      {wm && weather?.level !== "green" && weather?.level !== "unknown" && (
        <div
          style={{
            background: wm.bg,
            border: `1px solid ${wm.border}44`,
            borderLeft: `4px solid ${wm.border}`,
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: wm.dot,
              flexShrink: 0,
              animation:
                weather.level === "red"
                  ? "weatherPulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          />
          <div style={{ flex: 1 }}>
            <strong style={{ color: wm.text }}>{weather.label}</strong>
            {weather.description && (
              <span style={{ color: wm.text, opacity: 0.8, marginLeft: 8 }}>
                — {weather.description}
              </span>
            )}
          </div>
          {weather.precip_prob_next6h > 0 && (
            <span
              style={{
                background: wm.border + "22",
                color: wm.text,
                borderRadius: 20,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {weather.precip_prob_next6h}% lluvia
            </span>
          )}
        </div>
      )}

      {/* SOS Hero */}
      <div className="sos-hero">
        <div className="sos-ring">
          <button className="sos-btn" onClick={fireSOS}>
            <i className="ri-alarm-warning-fill" />
            <span>SOS</span>
          </button>
        </div>
        <p className="sos-label">Selecciona el tipo y presiona SOS</p>

        <div className="etypes">
          <button
            className={`etype medical ${eType === "medical" ? "sel" : ""}`}
            onClick={() => pickType("medical")}
          >
            <i className="ri-hospital-fill" />
            <span>Medica</span>
          </button>
          <button
            className={`etype security ${eType === "security" ? "sel" : ""}`}
            onClick={() => pickType("security")}
          >
            <i className="ri-shield-fill" />
            <span>Seguridad</span>
          </button>
          <button
            className={`etype fire ${eType === "fire" ? "sel" : ""}`}
            onClick={() => pickType("fire")}
          >
            <i className="ri-fire-fill" />
            <span>Incendio</span>
          </button>
          <button
            className={`etype accident ${eType === "accident" ? "sel" : ""}`}
            onClick={() => pickType("accident")}
          >
            <i className="ri-car-fill" />
            <span>Accidente</span>
          </button>
        </div>

        <div className="qactions">
          <button className="qact call" onClick={openLensCall}>
            <i className="ri-phone-fill" />
            <span>Llamar LENS</span>
          </button>
          <button className="qact msg" onClick={onGoChat}>
            <i className="ri-chat-1-fill" />
            <span>Chat SOS</span>
          </button>
          <button className="qact share" onClick={shareLoc}>
            <i className="ri-share-fill" />
            <span>Compartir</span>
          </button>
        </div>
      </div>

      {/* Mapa de zona — vista compacta para usuarios */}
      <div className="card">
        <div className="card-title">
          <div className="ic teal">
            <i className="ri-map-2-fill" />
          </div>
          <h3>Situacion en tu zona</h3>
        </div>
        <IncidentMap isAdmin={false} showWeather={true} compact={true} />
      </div>

      {/* Medicamentos */}
      <div className="card">
        <div className="card-title">
          <div className="ic teal">
            <i className="ri-capsule-fill" />
          </div>
          <h3>Mis Medicamentos</h3>
        </div>

        {notifPerm !== "granted" && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,.03)",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: ".9rem" }}>
                Activa notificaciones
              </p>
              <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: ".82rem" }}>
                Para recibir recordatorios exactos a la hora (AM/PM).
              </p>
            </div>
            <button
              className="btn btn-red"
              style={{ padding: "8px 10px", whiteSpace: "nowrap" }}
              onClick={() => requestSystemNotificationPermission(toast)}
            >
              Permitir
            </button>
          </div>
        )}

        {loadingMeds ? (
          <div className="empty">
            <i
              className="ri-loader-4-line"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <p>Cargando...</p>
          </div>
        ) : meds.length === 0 ? (
          <div className="empty">
            <i className="ri-capsule-fill" />
            <p>Sin medicamentos</p>
          </div>
        ) : (
          meds.map((m) => (
            <div key={m.id} className="li">
              <div className="li-icon green">
                <i className="ri-capsule-fill" />
              </div>
              <div className="li-body">
                <h4>{m.name}</h4>
                <p>
                  {m.dose} {m.freq}
                </p>
              </div>
              <span className="li-badge red">{m.time}</span>
              <div className="li-actions">
                <button className="ed" onClick={() => openEditMed(m)}>
                  <i className="ri-pencil-fill" />
                </button>
                <button className="del" onClick={() => deleteMed(m.id)}>
                  <i className="ri-delete-bin-fill" />
                </button>
              </div>
            </div>
          ))
        )}

        <button
          className="add-row"
          style={{ marginTop: 12 }}
          onClick={openAddMed}
        >
          <i className="ri-add-fill" /> Agregar Medicamento
        </button>
      </div>

      <style>{`
        @keyframes weatherPulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(1.5); opacity: .5; }
        }
      `}</style>
    </section>
  );
}

function MedModal({ initial = null, onSave, onClose }) {
  const isEdit = initial != null;
  const [name, setName] = useState(initial?.name || "");
  const [dose, setDose] = useState(initial?.dose || "");
  const [time, setTime] = useState(initial?.time || "");
  const [freq, setFreq] = useState(initial?.freq || "Una vez al dia");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save() {
    if (!name || !dose || !time) {
      toast("Completa todos los campos", "err");
      return;
    }
    setSaving(true);
    await requestSystemNotificationPermission(toast);
    await onSave({ name, dose, time, freq });
    setSaving(false);
  }

  return (
    <>
      <div className="m-head">
        <h3>{isEdit ? "Editar" : "Agregar"} Medicamento</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        <div className="field">
          <label>Nombre</label>
          <div className="field-input">
            <i className="ri-capsule-fill" />
            <input
              placeholder="Ej: Ibuprofeno"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Dosis</label>
          <div className="field-input">
            <i className="ri-scales-fill" />
            <input
              placeholder="Ej: 400mg"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Hora</label>
          <div className="field-input">
            <i className="ri-time-fill" />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Frecuencia</label>
          <div className="field-input">
            <i className="ri-repeat-fill" />
            <select value={freq} onChange={(e) => setFreq(e.target.value)}>
              {FREQS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="m-foot">
        <button className="btn btn-muted" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-red" onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </>
  );
}
