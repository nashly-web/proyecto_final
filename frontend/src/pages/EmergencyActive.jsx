// EmergencyActive: pantalla "en crisis" cuando el usuario activa SOS.
// Flujo general:
// - Captura/actualiza ubicacion y bateria (en vivo) hacia el backend.
// - Envia correos SOS a contactos + admin (via /api/emergency/email).
// - Permite adjuntar evidencia (foto/audio) y abrir llamada con LENS.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useToast, useModal } from "../components/Providers";
import CallSimulator from "./CallSimulator";
import LiveMap from "../components/LiveMap";
import { useBattery, BatteryIcon, BatteryBadge } from "../hooks/useBattery";

const ALERT_STATUS_META = {
  active: { label: "Activa", color: "var(--teal)" },
  monitoring: { label: "En seguimiento", color: "#7C3AED" },
  resolved: { label: "Resuelta", color: "#16a34a" },
  false_alarm: { label: "Falsa alarma", color: "var(--muted)" },
  cancelled: { label: "Cancelada", color: "var(--muted)" },
};

const NAMES = {
  medical: "Emergencia Médica",
  security: "Emergencia de Seguridad",
  fire: "Incendio",
  accident: "Accidente",
};

const UNIT_META = {
  ambulancia: {
    label: "Ambulancia",
    icon: "ri-heart-pulse-fill",
    color: "#E53935",
  },
  policia: { label: "Policía", icon: "ri-shield-fill", color: "#1565C0" },
  bomberos: { label: "Bomberos", icon: "ri-fire-fill", color: "#F97316" },
  rescate: {
    label: "Rescate",
    icon: "ri-first-aid-kit-fill",
    color: "#7C3AED",
  },
  multiple: { label: "Múltiples", icon: "ri-team-fill", color: "#0D1B2A" },
};

async function captureAutoPhoto() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 640, height: 480 },
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    await new Promise((res) => {
      video.onloadedmetadata = res;
    });
    await video.play();
    await new Promise((res) => setTimeout(res, 800));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0);
    stream.getTracks().forEach((t) => t.stop());
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch (e) {
    console.warn("[captureAutoPhoto]", e.message);
    return null;
  }
}

export default function EmergencyActive({ onCancel, remoteAlert }) {
  const { eType, setEType, pin, user } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [loc, setLoc] = useState(null);
  const [locText, setLocText] = useState("Obteniendo ubicación...");
  const [calling, setCalling] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [locationShared, setLocationShared] = useState(false);
  const [alertRegistered, setAlertRegistered] = useState(false);

  const [photo, setPhoto] = useState(null);
  const [photoStatus, setPhotoStatus] = useState("idle");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioB64, setAudioB64] = useState(null);
  const [recording, setRecording] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const [evidenceSent, setEvidenceSent] = useState(false);

  // ── RF20: Unidad asignada ─────────────────────────────────────────────────
  const [assignedUnit, setAssignedUnit] = useState(null);
  const unitPollRef = useRef(null);

  const sentRef = useRef(false);
  const lastLocPushRef = useRef(0);
  const lastBattPushRef = useRef(0);
  const mediaRecRef = useRef(null);
  const audioTimerRef = useRef(null);
  const audioChunks = useRef([]);

  const {
    level: battLevel,
    charging: battCharging,
    supported: battSupported,
  } = useBattery();

  useEffect(() => {
    const status = (remoteAlert?.status || "").toLowerCase();
    if (!status) return;

    if (status === "monitoring") {
      toast("Tu emergencia esta en seguimiento.", "ok");
      return;
    }

    if (["resolved", "false_alarm", "cancelled"].includes(status)) {
      toast("La emergencia fue cerrada.", "ok");
      const t = setTimeout(() => onCancel?.(), 1200);
      return () => clearTimeout(t);
    }
  }, [remoteAlert?.status, toast, onCancel]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleCoords(coords) {
      setLoc(coords);
      setLocText(`Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)}`);

      if (!sentRef.current) {
        sentRef.current = true;
        handleInitialSend(coords);
      }

      const now = Date.now();
      if (now - lastLocPushRef.current > 2000) {
        lastLocPushRef.current = now;
        pushLiveLocation(coords);
      }
    }

    if (!navigator.geolocation) {
      setLocText("Geolocalización no soportada");
      return;
    }

    const insecure = typeof window !== "undefined" && window.isSecureContext === false;
    if (insecure) {
      // On most browsers, geolocation is blocked on non-HTTPS origins (except localhost).
      setLocText("Ubicación requiere HTTPS o localhost");
    }

    const onGeoError = (err) => {
      // GeolocationPositionError: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
      const code = err?.code;
      if (code === 1) setLocText("Permiso de ubicación denegado");
      else if (code === 2) setLocText("Ubicación no disponible");
      else if (code === 3) setLocText("Tiempo de espera de ubicación");
      else setLocText("Error de ubicación");
      setLocationShared(false);
    };

    // Fast initial attempt so the admin map gets a point ASAP.
    navigator.geolocation.getCurrentPosition(
      (p) => handleCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      onGeoError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
    );

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        handleCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      onGeoError,
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [eType]);

  // ── Polling de unidad asignada (cada 5s) ──────────────────────────────────
  useEffect(() => {
    async function pollUnit() {
      try {
        const r = await fetch("/api/emergency/my-unit", {
          credentials: "include",
        });
        const d = await r.json();
        if (d.ok && d.unit) setAssignedUnit(d.unit);
      } catch {}
    }
    pollUnit();
    unitPollRef.current = setInterval(pollUnit, 5000);
    return () => clearInterval(unitPollRef.current);
  }, []);

  // ── Batería ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (battLevel === null) return;
    const now = Date.now();
    if (now - lastBattPushRef.current < 30000) return;
    lastBattPushRef.current = now;
    fetch("/api/emergency/battery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ battery: battLevel, charging: battCharging }),
    }).catch(() => {});
  }, [battLevel, battCharging]);

  // ── Envío inicial ─────────────────────────────────────────────────────────
  async function handleInitialSend(coords) {
    setPhotoStatus("capturing");
    const photoData = await captureAutoPhoto();
    if (photoData) {
      setPhoto(photoData);
      setPhotoStatus("ok");
    } else setPhotoStatus("error");
    await sendEmergencyEmail(coords, photoData);
  }

  async function sendEmergencyEmail(coords, photoData = null) {
    try {
      const res = await fetch("/api/emergency/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: eType,
          lat: coords.lat,
          lng: coords.lng,
          photo: photoData || undefined,
          battery: battLevel,
          charging: battCharging,
        }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setEmailSent(true);
        setAlertRegistered(true);
      }
      // La respuesta incluye la unidad sugerida
      if (d.unit) setAssignedUnit(d.unit);
    } catch {}
  }

  async function pushLiveLocation(coords) {
    try {
      const res = await fetch("/api/emergency/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: eType,
          lat: coords.lat,
          lng: coords.lng,
          battery: battLevel,
          charging: battCharging,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        setLocationShared(true);
        setAlertRegistered(true);
      } else {
        setLocationShared(false);
      }
    } catch {}
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const reader = new FileReader();
        reader.onloadend = () => setAudioB64(reader.result);
        reader.readAsDataURL(blob);
      };
      mr.start();
      setRecording(true);
      setAudioSeconds(0);
      audioTimerRef.current = setInterval(
        () => setAudioSeconds((s) => s + 1),
        1000,
      );
    } catch {
      toast("No se pudo acceder al micrófono", "err");
    }
  }

  function stopRecording() {
    if (mediaRecRef.current && recording) {
      mediaRecRef.current.stop();
      setRecording(false);
      clearInterval(audioTimerRef.current);
    }
  }

  async function sendEvidence() {
    if (!audioB64 && !photo) {
      toast("Sin evidencia para enviar", "err");
      return;
    }
    try {
      const res = await fetch("/api/emergency/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          photo: photo || undefined,
          audio: audioB64 || undefined,
          resend_email: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEvidenceSent(true);
        toast("Evidencia enviada ✓", "ok");
      } else toast(data.error || "Error", "err");
    } catch {
      toast("Error de conexión", "err");
    }
  }

  function openLensCall() {
    setCalling(true);
    openModal(
      <CallSimulator
        eType={eType}
        userName={user?.name || "Usuario"}
        loc={loc}
        onClose={() => {
          setCalling(false);
          closeModal();
        }}
      />,
    );
  }

  // Si el flujo viene desde una notificacion (LLAMAR), abrir LENS automaticamente.
  useEffect(() => {
    try {
      const flag = sessionStorage.getItem("emergelens:auto_call");
      if (flag === "1") {
        sessionStorage.removeItem("emergelens:auto_call");
        setTimeout(() => openLensCall(), 200);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCancelPin() {
    openModal(
      <CancelModal
        pin={pin}
        onConfirm={async () => {
          try {
            await fetch("/api/emergency/stop", {
              method: "POST",
              credentials: "include",
            });
          } catch {}
          setEType(null);
          closeModal();
          onCancel();
          toast("Emergencia cancelada", "ok");
        }}
        onClose={closeModal}
      />,
    );
  }

  const fmtSecs = (s) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const battLow =
    battSupported && battLevel !== null && battLevel <= 20 && !battCharging;
  const unitInfo = assignedUnit ? UNIT_META[assignedUnit] || null : null;

  return (
    <div className="emer-active">
      <div className="ea-pulse">
        <i className="ri-alarm-warning-fill" />
      </div>
      <h2 className="ea-title">🚨 Emergencia Activa</h2>
      <p className="ea-sub">{NAMES[eType] || "Enviando alerta..."}</p>

      {/* ── RF20: Unidad asignada ── */}
      {unitInfo && (
        <div
          className="ea-unit-card"
          style={{ borderColor: unitInfo.color + "55" }}
        >
          <div
            className="ea-unit-icon"
            style={{ background: unitInfo.color + "18", color: unitInfo.color }}
          >
            <i className={unitInfo.icon} />
          </div>
          <div className="ea-unit-info">
            <span className="ea-unit-label">Unidad asignada</span>
            <strong style={{ color: unitInfo.color }}>{unitInfo.label}</strong>
          </div>
          <span
            className="ea-unit-pulse"
            style={{ background: unitInfo.color }}
          />
        </div>
      )}

      <div className="ea-loc">
        <i className="ri-map-pin-fill" />
        <p>{locText}</p>
      </div>

      {loc && (
        <div className="map-card">
          <div className="map-head">
            <div>
              <strong>Mi ubicación en tiempo real</strong>
              <div className="map-sub">Solo tú ves tu punto exacto.</div>
            </div>
            <i className="ri-radar-fill" style={{ color: "var(--teal)" }} />
          </div>
          <div className="map-wrap">
            <LiveMap
              center={loc}
              zoom={16}
              markers={[
                {
                  id: "me",
                  kind: "me",
                  lat: loc.lat,
                  lng: loc.lng,
                  title: "Tú",
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* Status checks */}
      <div className="ea-checks">
        {remoteAlert?.status && (
          <p
            style={{
              color:
                ALERT_STATUS_META[(remoteAlert.status || "").toLowerCase()]
                  ?.color || "var(--muted)",
            }}
          >
            Estado:{" "}
            {ALERT_STATUS_META[(remoteAlert.status || "").toLowerCase()]
              ?.label || remoteAlert.status}
          </p>
        )}
        <p style={{ color: locationShared ? "var(--teal)" : "var(--muted)" }}>
          {locationShared
            ? "✓ Ubicación compartida en tiempo real"
            : "Enviando ubicación..."}
        </p>
        {/* No mostrar estado de correo en UI */}
        <p style={{ color: alertRegistered ? "var(--teal)" : "var(--muted)" }}>
          {alertRegistered
            ? "✓ Alerta registrada en sistema"
            : "Registrando alerta..."}
        </p>
        <p
          style={{
            color:
              photoStatus === "ok"
                ? "var(--teal)"
                : photoStatus === "error"
                  ? "var(--muted)"
                  : photoStatus === "capturing"
                    ? "#FFA000"
                    : "var(--muted)",
          }}
        >
          {photoStatus === "ok" && "✓ Foto de escena capturada"}
          {photoStatus === "capturing" && "📷 Capturando foto..."}
          {photoStatus === "error" && "⚠ Foto no disponible"}
        </p>
        {battSupported && battLevel !== null && (
          <p
            style={{
              color: battLow ? "#E53935" : "var(--teal)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <BatteryIcon level={battLevel} charging={battCharging} size={16} />
            {battLow
              ? `⚠ Batería baja: ${battLevel}%`
              : `✓ Batería: ${battLevel}%${battCharging ? " · Cargando" : ""}`}
          </p>
        )}
      </div>

      {battLow && (
        <div className="ea-battery-warn">
          <BatteryIcon level={battLevel} charging={battCharging} size={24} />
          <div>
            <strong>Batería baja: {battLevel}%</strong>
            <p>Tus contactos han sido notificados del nivel de batería.</p>
          </div>
        </div>
      )}

      {/* Panel evidencia */}
      <div className="ea-evidence-card">
        <div className="ea-evidence-head">
          <i className="ri-attachment-2" />
          <strong>Evidencia adjunta</strong>
          {evidenceSent && <span className="ea-evidence-badge">✓ Enviada</span>}
        </div>
        {photo && (
          <div className="ea-photo-preview">
            <img src={photo} alt="Foto de escena" />
            <span className="ea-photo-label">
              <i className="ri-camera-fill" /> Foto automática
            </span>
          </div>
        )}
        <div className="ea-audio-row">
          {!audioBlob ? (
            !recording ? (
              <button
                className="btn ea-audio-btn"
                onClick={startRecording}
                disabled={evidenceSent}
              >
                <i className="ri-mic-fill" /> Grabar audio
              </button>
            ) : (
              <button
                className="btn ea-audio-recording-btn"
                onClick={stopRecording}
              >
                <span className="ea-rec-dot" />
                Grabando {fmtSecs(audioSeconds)} — Detener
              </button>
            )
          ) : (
            <div className="ea-audio-ready">
              <i className="ri-mic-fill" style={{ color: "var(--teal)" }} />
              <span>Audio listo ({fmtSecs(audioSeconds)})</span>
              <audio
                controls
                src={URL.createObjectURL(audioBlob)}
                style={{ height: 32, flex: 1 }}
              />
              <button
                className="btn-icon"
                onClick={() => {
                  setAudioBlob(null);
                  setAudioB64(null);
                  setAudioSeconds(0);
                }}
              >
                <i className="ri-delete-bin-line" />
              </button>
            </div>
          )}
        </div>
        {(photo || audioB64) && !evidenceSent && (
          <button className="btn ea-send-evidence-btn" onClick={sendEvidence}>
            <i className="ri-send-plane-fill" /> Enviar evidencia a contactos
          </button>
        )}
        {!photo && photoStatus !== "capturing" && !audioBlob && (
          <p className="ea-evidence-hint">
            La foto se captura al activar el SOS. Puedes añadir audio
            manualmente.
          </p>
        )}
      </div>

      <div className="ea-btns">
        <button
          className="btn ea-lens-call-btn"
          onClick={openLensCall}
          disabled={calling}
        >
          <i className="ri-phone-fill" />
          {calling
            ? "En llamada con LENS..."
            : "Llamar a LENS"}
        </button>
        <button className="btn btn-danger" onClick={openCancelPin}>
          <i className="ri-shield-keyhole-fill" /> Cancelar Emergencia (PIN)
        </button>
      </div>
    </div>
  );
}

function CancelModal({ pin, onConfirm, onClose }) {
  const [val, setVal] = useState("");
  const toast = useToast();
  function check() {
    if (val === pin) onConfirm();
    else toast("PIN incorrecto", "err");
  }
  return (
    <>
      <div className="m-head">
        <h3>Cancelar Emergencia</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Ingresa tu PIN de seguridad:
        </p>
        <div className="field">
          <label>PIN</label>
          <div className="field-input">
            <i className="ri-shield-keyhole-fill" />
            <input
              type="password"
              maxLength={4}
              placeholder="••••"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && check()}
            />
          </div>
        </div>
      </div>
      <div className="m-foot">
        <button className="btn btn-muted" onClick={onClose}>
          Volver
        </button>
        <button className="btn btn-red" onClick={check}>
          Confirmar
        </button>
      </div>
    </>
  );
}
