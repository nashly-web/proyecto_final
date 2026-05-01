// frontend/src/pages/Donations.jsx
//
// Página principal del módulo de Campañas de Ayuda (Donaciones) de EmergeLens.
//
// ARQUITECTURA GENERAL:
// ─────────────────────
// • Donations          → página principal: lista campañas, abre modales, muestra stats
// • CampaignCard       → tarjeta individual de campaña con ImageBanner + acciones
// • ImageBanner        → banner draggable para reposicionar la imagen (dueño/admin)
// • PhotoUploadField   → campo reutilizable para subir/cambiar/eliminar foto con drag-to-reposition
// • DonateModal        → flujo de donación en 2 pasos (datos → verificación OTP)
// • DonorsModal        → lista de donantes de una campaña (solo dueño/admin)
// • CampaignViewModal  → vista pública de una campaña con comentarios de apoyo
// • NewCampaignModal   → formulario para crear una campaña nueva
// • EditCampaignModal  → formulario para editar campaña existente (foto, título, desc, meta)
//
// SISTEMA DE POSICIONAMIENTO DE IMÁGENES:
// ────────────────────────────────────────
// La posición de recorte de la foto (objectPosition) se guarda por campaña en localStorage
// bajo la clave `don_img_pos_<campaignId>`. Esto permite que cada usuario ajuste cómo
// se muestra su foto sin necesidad de guardar la posición en el servidor.
//
// IMPORTANTE — FIX PRINCIPAL:
// ────────────────────────────
// Antes, PhotoUploadField (dentro del modal de edición) y ImageBanner (en la card)
// eran sistemas independientes que no se comunicaban. El drag en el modal no movía
// la posición que usaba la card, y la foto solo aparecía después de recargar desde
// el backend.
//
// La solución implementada:
// 1. PhotoUploadField ahora acepta `pos` / `onPosChange` como props y renderiza la
//    imagen con objectPosition controlada, permitiendo drag-to-reposition directamente
//    en el preview del modal ANTES de guardar.
// 2. EditCampaignModal mantiene `photoPos` en estado local, inicializado desde
//    localStorage (posición guardada de esa campaña). Al arrastrar en el preview,
//    actualiza el estado Y persiste en localStorage en tiempo real — así, cuando el
//    modal se cierra, la card ya refleja la nueva posición sin recargar.
// 3. Cuando se guarda la campaña (PATCH), `fetchCampaigns` recarga la lista y la
//    card muestra la foto actualizada con la posición correcta.

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import { useToast, useModal } from "../components/Providers";
import {
  requestSystemNotificationPermission,
  showSystemNotification,
} from "../lib/systemNotifications";

// Endpoint base de la API de donaciones
const API = "/api/donations";

// Email del administrador — determina permisos especiales en toda la UI
const ADMIN_EMAIL = "sosemergelens@gmail.com";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS GLOBALES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formatea un número como dinero dominicano (RD$).
 * Ejemplo: 50000 → "$50,000"
 */
function fmtMoney(n) {
  return (
    "$" + Number(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 0 })
  );
}

/**
 * Formatea un timestamp ISO como fecha legible en español.
 * Ejemplo: "2024-03-15T10:00:00Z" → "15 mar. 2024"
 */
function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Intenta detectar el tipo MIME de una cadena base64 sin prefijo data:...
 * Retorna null si la cadena ya tiene prefijo data: (no necesita detección).
 * Fallback: image/jpeg.
 */
function guessMimeFromBase64(b64) {
  const s = String(b64 || "").trim();
  if (!s) return "image/jpeg";
  if (s.startsWith("data:")) return null; // ya tiene prefijo
  if (s.startsWith("/9j/")) return "image/jpeg"; // JPEG
  if (s.startsWith("iVBORw0KGgo")) return "image/png"; // PNG
  if (s.startsWith("R0lGOD")) return "image/gif"; // GIF
  return "image/jpeg";
}

/**
 * Convierte una foto (base64 con o sin prefijo, o null) en una URL usable en <img src>.
 * Si la foto ya es un data URL, la devuelve tal cual.
 * Si es base64 puro, agrega el prefijo MIME detectado.
 * Retorna null si no hay foto.
 */
function toImageUrl(photo) {
  if (!photo) return null;
  const s = String(photo).trim();
  if (!s) return null;
  if (s.startsWith("data:")) return s;
  const mime = guessMimeFromBase64(s) || "image/jpeg";
  return `data:${mime};base64,${s}`;
}

async function compressImageDataUrl(dataUrl, opts = {}) {
  const maxSize = typeof opts.maxSize === "number" ? opts.maxSize : 1600;
  const quality = typeof opts.quality === "number" ? opts.quality : 0.82;
  try {
    if (!dataUrl || !String(dataUrl).startsWith("data:image/")) return dataUrl;

    const img = new Image();
    img.decoding = "async";
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;

    const scale = Math.min(1, maxSize / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    if (scale === 1 && String(dataUrl).length < 900000) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    ctx.drawImage(img, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

/**
 * Parsea la respuesta de fetch intentando JSON primero, luego texto plano.
 * Siempre retorna { data, raw } — data es el objeto parseado o null.
 */
async function parseResponse(res) {
  let data = null;
  try {
    data = await res.clone().json();
  } catch {
    data = null;
  }
  if (data !== null) return { data, raw: "" };
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    raw = "";
  }
  return { data: null, raw };
}

// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE POSICIÓN DE IMAGEN EN LOCALSTORAGE
// ─────────────────────────────────────────────────────────────────────────────
// Persiste la posición de recorte (x%, y%) de la foto de cada campaña por separado.
// La clave es `don_img_pos_<campaignId>`.

/**
 * Carga la posición guardada para una campaña desde localStorage.
 * Retorna { x: 50, y: 50 } (centro) si no hay nada guardado.
 */
function loadPosition(campaignId) {
  try {
    const raw = localStorage.getItem(`don_img_pos_${campaignId}`);
    if (!raw) return { x: 50, y: 50 };
    const p = JSON.parse(raw);
    return { x: p.x ?? 50, y: p.y ?? 50 };
  } catch {
    return { x: 50, y: 50 };
  }
}

/**
 * Guarda la posición de recorte de una campaña en localStorage.
 * @param {string|number} campaignId
 * @param {{ x: number, y: number }} pos - porcentajes 0–100
 */
function savePosition(campaignId, pos) {
  try {
    localStorage.setItem(`don_img_pos_${campaignId}`, JSON.stringify(pos));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageBanner
// ─────────────────────────────────────────────────────────────────────────────
// Banner de imagen en la cabecera de cada CampaignCard.
// Si `editable` es true (dueño/admin y hay foto), permite arrastrar para reposicionar.
// La posición se lee/escribe en localStorage para persistir entre sesiones.
//
// Props:
//   campaignId  — id de la campaña (para clave localStorage)
//   photo       — base64 de la foto (con o sin prefijo data:)
//   done        — boolean: la campaña alcanzó su meta (muestra badge "Meta alcanzada")
//   editable    — boolean: si el usuario puede arrastrar para reposicionar

function ImageBanner({ campaignId, photo, done, editable = false }) {
  // Estado de posición: {x, y} en porcentajes (0–100)
  const [pos, setPos] = useState(() => loadPosition(campaignId));

  const dragging = useRef(false); // flag de arrastre activo
  const startMouse = useRef({ x: 0, y: 0 }); // posición del mouse al iniciar arrastre
  const startPos = useRef({ x: 50, y: 50 }); // posición de imagen al iniciar arrastre
  const containerRef = useRef(null); // ref al contenedor para calcular deltas
  const posRef = useRef(pos); // ref sincronizada para acceder en handlers sin stale closure

  // Cuando cambia la campaña (ej. al navegar), recargar posición desde localStorage
  useEffect(() => {
    const p = loadPosition(campaignId);
    setPos(p);
    posRef.current = p;
  }, [campaignId]);

  /** Inicia el arrastre guardando posición inicial del mouse y de la imagen */
  function beginDrag(clientX, clientY) {
    if (!editable) return;
    dragging.current = true;
    startMouse.current = { x: clientX, y: clientY };
    startPos.current = { ...posRef.current };
  }

  /** Actualiza posición mientras se arrastra. Invierte delta para movimiento intuitivo. */
  function moveDrag(clientX, clientY) {
    if (!dragging.current || !editable) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Invertimos el delta: arrastrar a la derecha mueve el punto focal a la izquierda
    const dx = ((clientX - startMouse.current.x) / rect.width) * 100;
    const dy = ((clientY - startMouse.current.y) / rect.height) * 100;
    const newPos = {
      x: Math.max(0, Math.min(100, startPos.current.x - dx)),
      y: Math.max(0, Math.min(100, startPos.current.y - dy)),
    };
    posRef.current = newPos;
    setPos(newPos);
  }

  /** Finaliza el arrastre y persiste la posición en localStorage */
  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    savePosition(campaignId, posRef.current);
  }

  const imgUrl = toImageUrl(photo);

  // Sin foto: mostrar fondo degradado con ícono corazón placeholder
  if (!imgUrl) {
    return (
      <div
        style={{
          height: 120,
          background: done
            ? "linear-gradient(135deg,#0d4f47,#0a3d36)"
            : "linear-gradient(135deg,#1e3a5f,#0b2340)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <i
          className="ri-heart-fill"
          style={{ fontSize: 36, color: "rgba(255,255,255,0.2)" }}
        />
        {done && <MetaBadge />}
      </div>
    );
  }

  // Con foto: banner draggable con objectPosition controlada por `pos`
  return (
    <div
      ref={containerRef}
      // Mouse events
      onMouseDown={(e) => {
        e.preventDefault();
        beginDrag(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      // Touch events (mobile)
      onTouchStart={(e) => {
        const t = e.touches[0];
        beginDrag(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY);
      }}
      onTouchEnd={endDrag}
      style={{
        height: 160,
        overflow: "hidden",
        position: "relative",
        cursor: editable ? "grab" : "default",
        userSelect: "none",
      }}
    >
      <img
        src={imgUrl}
        alt="Campaña"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${pos.x}% ${pos.y}%`,
          pointerEvents: "none",
        }}
      />
      {done && <MetaBadge />}
      {/* Hint de drag visible solo cuando es editable */}
      {editable && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 20,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          <i className="ri-drag-move-fill" /> Arrastra para reposicionar
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetaBadge
// ─────────────────────────────────────────────────────────────────────────────
// Badge superpuesto en la esquina superior derecha del banner cuando la campaña
// alcanzó su meta (state === "done").

function MetaBadge() {
  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        background: "#22d3b7",
        color: "#0b1628",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      Meta alcanzada
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressBar
// ─────────────────────────────────────────────────────────────────────────────
// Barra de progreso visual para el porcentaje recaudado.
// Color: teal (meta alcanzada), ámbar (≥75%), rojo (<75%).
//
// Props:
//   pct  — número 0–100+ (se clampea a 100 visualmente)
//   done — boolean: campaña completada (color teal)

function ProgressBar({ pct, done }) {
  const color = done
    ? "#22d3b7"
    : pct >= 75
      ? "#f59e0b"
      : "var(--red, #e53e3e)";
  return (
    <div
      style={{
        height: 7,
        background: "rgba(255,255,255,0.1)",
        borderRadius: 4,
        overflow: "hidden",
        margin: "10px 0 6px",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: 4,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PhotoUploadField
// ─────────────────────────────────────────────────────────────────────────────
// Campo reutilizable para subir, previsualizar, reposicionar y eliminar la foto
// de una campaña. Se usa en NewCampaignModal y EditCampaignModal.
//
// FUNCIONALIDAD DE REPOSICIONAMIENTO (FIX PRINCIPAL):
// ────────────────────────────────────────────────────
// Cuando hay foto, el preview acepta arrastre para ajustar el punto focal
// (objectPosition). La posición se comunica al padre a través de `onPosChange`.
// Esto permite que EditCampaignModal persista la posición en localStorage en
// tiempo real, de modo que la CampaignCard ya refleje la posición correcta
// cuando el modal se cierra — sin esperar a que el backend devuelva la foto.
//
// Props:
//   photo         — data URL o base64 de la foto actual (null = sin foto)
//   onPhotoChange — callback(dataUrl) cuando el usuario sube/cambia la foto
//   onPhotoRemove — callback() cuando el usuario elimina la foto
//   pos           — { x, y } posición actual del recorte (porcentajes 0–100)
//   onPosChange   — callback({ x, y }) cuando el usuario arrastra el recorte
//   campaignId    — id de campaña (opcional, no usado internamente aquí)
//   showDragHint  — boolean: mostrar hint "Arrastra para reposicionar"

function PhotoUploadField({
  photo,
  onPhotoChange,
  onPhotoRemove,
  pos,
  onPosChange,
  campaignId = null,
  showDragHint = false,
}) {
  const fileRef = useRef();
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false); // drag-and-drop de archivo sobre el preview

  // ── Estado interno de arrastre para reposicionar ──
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 50, y: 50 });
  const containerRef = useRef(null);
  // Fallback: si el padre no provee pos, usamos estado interno (para NewCampaignModal)
  const [internalPos, setInternalPos] = useState({ x: 50, y: 50 });

  // La posición efectiva: la del padre si viene, sino la interna
  const effectivePos = pos ?? internalPos;

  /** Inicia arrastre de reposicionamiento */
  function beginPosDrag(clientX, clientY) {
    dragging.current = true;
    startMouse.current = { x: clientX, y: clientY };
    startPos.current = { ...effectivePos };
  }

  /** Actualiza posición mientras se arrastra el recorte */
  function movePosDrag(clientX, clientY) {
    if (!dragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((clientX - startMouse.current.x) / rect.width) * 100;
    const dy = ((clientY - startMouse.current.y) / rect.height) * 100;
    const newPos = {
      x: Math.max(0, Math.min(100, startPos.current.x - dx)),
      y: Math.max(0, Math.min(100, startPos.current.y - dy)),
    };
    if (onPosChange) onPosChange(newPos);
    else setInternalPos(newPos);
  }

  /** Finaliza arrastre de reposicionamiento */
  function endPosDrag() {
    dragging.current = false;
  }

  /**
   * Valida y procesa un archivo de imagen seleccionado o soltado.
   * Límite: solo imágenes, máximo 4MB.
   * Convierte a data URL y llama onPhotoChange.
   */
  function handleFile(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      toast("Solo imagenes", "err");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast("Máximo 4MB", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target.result;
      const compressed = await compressImageDataUrl(raw, {
        maxSize: 1600,
        quality: 0.82,
      });
      onPhotoChange(compressed);
    };
    reader.readAsDataURL(file);
  }

  /** Handler para drag-and-drop de archivo sobre el preview de la foto */
  function onDropFile(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  }

  /** Handler para el input[type=file] */
  function handleImg(e) {
    const file = e.target.files[0];
    handleFile(file);
  }

  // URL de la imagen para el preview (acepta data URL o base64 puro)
  const imgUrl = photo
    ? photo.startsWith("data:")
      ? photo
      : toImageUrl(photo)
    : null;

  return (
    <div className="don-photo-upload" style={{ marginBottom: 12 }}>
      {imgUrl ? (
        // ── Preview de la foto con drag-to-reposition ──
        <div
          ref={containerRef}
          style={{
            position: "relative",
            marginBottom: 8,
            cursor: "grab",
            userSelect: "none",
          }}
          // Drag-and-drop de archivo (cambiar foto)
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDropFile}
          // Arrastre de reposicionamiento — mouse
          onMouseDown={(e) => {
            // Solo iniciar reposicionamiento si NO es el botón ✕ (que tiene su propio onClick)
            if (e.target.closest("button")) return;
            e.preventDefault();
            beginPosDrag(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => movePosDrag(e.clientX, e.clientY)}
          onMouseUp={endPosDrag}
          onMouseLeave={endPosDrag}
          // Arrastre de reposicionamiento — touch
          onTouchStart={(e) => {
            if (e.target.closest("button")) return;
            const t = e.touches[0];
            beginPosDrag(t.clientX, t.clientY);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            movePosDrag(t.clientX, t.clientY);
          }}
          onTouchEnd={endPosDrag}
        >
          <img
            src={imgUrl}
            alt="Campaña"
            draggable={false}
            style={{
              width: "100%",
              height: 160,
              objectFit: "cover",
              objectPosition: `${effectivePos.x}% ${effectivePos.y}%`,
              borderRadius: 10,
              display: "block",
              pointerEvents: "none",
            }}
          />
          {/* Overlay de drag-and-drop de archivo */}
          {dragOver && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 10,
                background: "rgba(0,0,0,0.35)",
                border: "2px dashed rgba(255,255,255,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "#fff",
                fontWeight: 700,
                pointerEvents: "none",
              }}
            >
              Suelta la foto para cambiarla
            </div>
          )}
          {/* Botón ✕ para eliminar la foto */}
          <button
            type="button"
            onClick={onPhotoRemove}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(0,0,0,0.65)",
              border: "none",
              color: "#fff",
              borderRadius: "50%",
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 17,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              zIndex: 2,
            }}
            title="Eliminar foto"
          >
            <i className="ri-close-circle-fill" />
          </button>
          {/* Hint de arrastre para reposicionar — siempre visible cuando hay foto */}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 20,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: 5,
              whiteSpace: "nowrap",
            }}
          >
            <i className="ri-drag-move-fill" /> Arrastra para reposicionar
          </div>
        </div>
      ) : (
        // ── Placeholder cuando no hay foto: zona de drag-and-drop ──
        <div
          className="don-photo-placeholder"
          onClick={() => fileRef.current.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDropFile}
          style={{
            border: "2px dashed var(--border)",
            borderRadius: 10,
            padding: "24px 16px",
            textAlign: "center",
            cursor: "pointer",
            color: "var(--muted)",
            marginBottom: 8,
            background: dragOver ? "rgba(229,62,62,0.08)" : "transparent",
          }}
        >
          <i
            className="ri-image-add-fill"
            style={{ fontSize: 28, display: "block", marginBottom: 6 }}
          />
          <span>Agregar foto (opcional)</span>
          <small style={{ display: "block", marginTop: 4 }}>
            Arrastra y suelta o haz click — Máximo 4MB
          </small>
        </div>
      )}
      {/* Input de archivo oculto — se activa por click en botón o placeholder */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImg}
      />
      <button
        type="button"
        className="btn btn-muted"
        style={{ width: "100%" }}
        onClick={() => fileRef.current.click()}
      >
        <i className="ri-image-edit-fill" />{" "}
        {imgUrl ? "Cambiar foto" : "Agregar foto"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CampaignViewModal
// ─────────────────────────────────────────────────────────────────────────────
// Modal de vista pública de una campaña.
// Carga los detalles completos (GET /api/donations/<id>) y los contribuyentes
// (GET /api/donations/<id>/contributors).
// Los comentarios de apoyo solo son visibles para el dueño o el admin.
//
// Props:
//   campaign — objeto básico de campaña (de la lista)
//   onClose  — callback para cerrar el modal

function CampaignViewModal({ campaign, onClose }) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null); // detalles completos del backend
  const [contributors, setContributors] = useState([]); // lista de donantes
  const { user } = useStore();
  const isAdmin = user?.email === ADMIN_EMAIL;
  // is_mine: usar datos del backend si ya cargaron, sino el valor de la lista
  const isOwner = loading ? false : (details?.is_mine ?? campaign?.is_mine);
  const showComments = isOwner || isAdmin;

  // Cargar detalles y contribuyentes en paralelo al montar
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/${campaign.id}`, {
          credentials: "include",
        });
        const { data } = await parseResponse(res);
        if (!alive) return;
        if (res.ok && data?.ok) setDetails(data.campaign);
      } catch {}
      try {
        const res = await fetch(`${API}/${campaign.id}/contributors`, {
          credentials: "include",
        });
        const { data } = await parseResponse(res);
        if (!alive) return;
        if (res.ok && data?.ok) setContributors(data.contributors || []);
      } catch {}
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [campaign?.id]);

  const photo = details?.photo || campaign?.photo || null;
  const title = details?.title || campaign?.title || "";
  const description = details?.description || campaign?.description || "";
  // Filtrar solo contribuyentes con mensaje de apoyo
  const comments = (contributors || []).filter((c) => (c.note || "").trim());

  return (
    <>
      <div className="m-head">
        <h3>Campaña</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        {loading ? (
          <div className="empty">
            <i
              className="ri-loader-4-line"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <p>Cargando...</p>
          </div>
        ) : (
          <>
            {/* Banner de foto con posición guardada */}
            {photo && (
              <div
                style={{
                  height: 180,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  marginBottom: 12,
                }}
              >
                <img
                  src={toImageUrl(photo)}
                  alt={title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: (() => {
                      const p = loadPosition(campaign.id);
                      return `${p.x}% ${p.y}%`;
                    })(),
                  }}
                />
              </div>
            )}
            <h4 style={{ margin: "4px 0 6px", fontWeight: 900 }}>{title}</h4>
            {campaign?.owner_name && (
              <div
                style={{
                  color: "var(--muted)",
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                por{" "}
                <strong style={{ color: "var(--text)" }}>
                  {campaign.owner_name}
                </strong>
              </div>
            )}
            {description && (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  color: "var(--muted)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}
              >
                {description}
              </div>
            )}
            {/* Sección de comentarios — visible solo para dueño/admin */}
            {showComments && (
              <div
                style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
              >
                <strong style={{ fontSize: 13 }}>Mensajes de apoyo</strong>
                {comments.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Aun no hay comentarios.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    {comments.slice(0, 20).map((c) => (
                      <div
                        key={c.id}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800 }}>
                          {c.donor_name || "Anonimo"}{" "}
                          <span
                            style={{ fontWeight: 600, color: "var(--muted)" }}
                          >
                            · {c.date ? String(c.date).slice(0, 16) : ""}
                          </span>
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            color: "var(--muted)",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {c.note}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="m-foot">
        <button className="btn btn-muted" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CampaignCard
// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta de campaña individual en la lista principal.
// Muestra: banner de foto (con drag-to-reposition si es dueño/admin), título,
// descripción truncada, progreso, stats, y botones de acción.
//
// NOTA: El monto recaudado solo es visible para el dueño o el admin ("---" para el resto).
//
// Props:
//   campaign      — objeto de campaña (de la lista del backend)
//   currentUid    — uid del usuario actual
//   isAdmin       — boolean
//   onDonate      — callback(campaign)
//   onDelete      — callback(campaign)
//   onViewDonors  — callback(campaign)
//   onEdit        — callback(campaign)
//   onView        — callback(campaign)

function CampaignCard({
  campaign,
  currentUid,
  isAdmin,
  onDonate,
  onDelete,
  onViewDonors,
  onEdit,
  onView,
}) {
  const done = campaign.state === "done";
  const isMine = campaign.is_mine;
  const canDel = isMine || isAdmin;
  const canEdit = isMine || isAdmin;
  const canViewDonors = isMine || isAdmin;

  return (
    <div
      style={{
        background: "var(--card-solid, #152238)",
        border: "1px solid var(--border, rgba(255,255,255,0.08))",
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 14,
        transition: "transform 0.15s",
      }}
    >
      {/* Banner draggable — editable solo para dueño/admin cuando hay foto */}
      <ImageBanner
        campaignId={campaign.id}
        photo={campaign.photo}
        done={done}
        editable={canEdit && !!campaign.photo}
      />

      <div style={{ padding: "14px 16px 16px" }}>
        {/* Encabezado: título + botones editar/eliminar */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "var(--white, #f0f4f8)",
              }}
            >
              {campaign.title}
            </h4>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 11,
                color: "var(--muted, #7b8fa8)",
              }}
            >
              por{" "}
              <strong style={{ color: "var(--teal, #22d3b7)" }}>
                {campaign.owner_name}
              </strong>
              {isMine && (
                <span
                  style={{
                    marginLeft: 6,
                    background: "rgba(34,211,183,0.15)",
                    color: "#22d3b7",
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontSize: 10,
                  }}
                >
                  Tu campaña
                </span>
              )}
            </p>
          </div>
          {(canEdit || canDel) && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {canEdit && (
                <button
                  onClick={() => onEdit?.(campaign)}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--border)",
                    color: "var(--white, #f0f4f8)",
                    borderRadius: 8,
                    width: 30,
                    height: 30,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                  title="Editar"
                >
                  <i className="ri-pencil-fill" />
                </button>
              )}
              {canDel && (
                <button
                  onClick={() => onDelete(campaign)}
                  style={{
                    background: "rgba(229,57,53,0.12)",
                    border: "none",
                    color: "var(--red, #e53e3e)",
                    borderRadius: 8,
                    width: 30,
                    height: 30,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                  title="Eliminar campaña"
                >
                  <i className="ri-delete-bin-fill" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Descripción truncada a 2 líneas */}
        {campaign.description && (
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              color: "var(--muted, #7b8fa8)",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {campaign.description}
          </p>
        )}

        <ProgressBar pct={campaign.pct} done={done} />

        {/* Stats: recaudado (oculto para terceros) y meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          <span style={{ color: "var(--white, #f0f4f8)" }}>
            <strong style={{ color: done ? "#22d3b7" : "var(--red, #e53e3e)" }}>
              {isMine || isAdmin ? fmtMoney(campaign.raised) : "---"}
            </strong>
            <span style={{ color: "var(--muted)", marginLeft: 4 }}>
              recaudados
            </span>
          </span>
          <span style={{ color: "var(--muted)" }}>
            Meta:{" "}
            <strong style={{ color: "var(--white)" }}>
              {fmtMoney(campaign.goal)}
            </strong>
          </span>
        </div>

        {/* Badges: porcentaje, donantes, "Ya donaste" */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              background: done
                ? "rgba(34,211,183,0.12)"
                : "rgba(229,57,53,0.1)",
              color: done ? "#22d3b7" : "var(--red, #e53e3e)",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {campaign.pct}%
          </span>
          <button
            onClick={() => canViewDonors && onViewDonors(campaign)}
            disabled={!canViewDonors}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 11,
              cursor: canViewDonors ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              opacity: canViewDonors ? 1 : 0.65,
            }}
            title={
              canViewDonors
                ? "Ver donantes y mensajes"
                : "Solo el dueño puede ver los donantes"
            }
          >
            <i className="ri-group-fill" style={{ marginRight: 6 }} />
            {campaign.donors} donante{campaign.donors !== 1 ? "s" : ""}
          </button>
          {campaign.i_contributed && (
            <span
              style={{
                background: "rgba(34,211,183,0.1)",
                color: "#22d3b7",
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Ya donaste
            </span>
          )}
        </div>

        {/* Botones de acción: Ver + Donar (Donar oculto si campaña completada) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => onView?.(campaign)}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "11px",
              border: "1px solid var(--border, rgba(255,255,255,0.08))",
              background: "rgba(255,255,255,0.04)",
              color: "var(--text)",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <i className="ri-eye-fill" /> Ver
          </button>
          {!done && (
            <button
              onClick={() => onDonate(campaign)}
              style={{
                flex: 2,
                minWidth: 160,
                padding: "11px",
                border: "none",
                background:
                  "linear-gradient(135deg, var(--red, #e53e3e), #c53030)",
                color: "#fff",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 16px rgba(229,57,53,0.3)",
              }}
            >
              <i className="ri-heart-fill" /> Donar
            </button>
          )}
        </div>
        {done && (
          <div
            style={{
              textAlign: "center",
              padding: "10px",
              color: "#22d3b7",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Meta alcanzada. Gracias a todos los donantes.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DonateModal
// ─────────────────────────────────────────────────────────────────────────────
// Modal de donación en 2 pasos:
//   1. "details" — el usuario ingresa monto, método de pago y mensaje opcional.
//   2. "verify"  — se muestra un código OTP (demo) que el usuario debe ingresar.
//
// El pago es simulado: no se procesan fondos reales. El código OTP se envía como
// notificación del sistema (System Notification API).
//
// Props:
//   campaign  — objeto de campaña destino
//   userEmail — email del usuario autenticado
//   onSuccess — callback al completar la donación (recarga la lista)
//   onClose   — callback para cerrar el modal

function DonateModal({ campaign, userEmail, onSuccess, onClose }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("card"); // "card" | "transfer" | "wallet"
  const [step, setStep] = useState("details"); // "details" | "verify"
  const [verifyCode, setVerifyCode] = useState(""); // código ingresado por el usuario
  const [issuedCode, setIssuedCode] = useState(""); // código OTP generado
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [bankName, setBankName] = useState("Banco Popular");
  const [accountRef, setAccountRef] = useState("");
  const [walletProvider, setWalletProvider] = useState("Paypal");
  const [walletId, setWalletId] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const PRESETS = [500, 1000, 2000, 5000]; // montos rápidos en RD$

  /** Retorna solo los dígitos de una cadena */
  function digitsOnly(s) {
    return String(s || "").replace(/\D+/g, "");
  }

  /** Solicita permiso y muestra la notificación del sistema con el código OTP */
  async function notifyVerificationCode(code) {
    const ok = await requestSystemNotificationPermission(toast);
    if (!ok) return;
    showSystemNotification(
      {
        title: "Codigo de verificacion",
        body: `Tu codigo para confirmar la donacion es: ${code}`,
        tag: `donation_verify_${campaign?.id || "x"}`,
      },
      toast,
    );
  }

  /**
   * Validación Luhn para números de tarjeta.
   * Retorna true si el número es matemáticamente válido.
   */
  function luhnOk(num) {
    const s = digitsOnly(num);
    if (s.length < 13 || s.length > 19) return false;
    let sum = 0,
      alt = false;
    for (let i = s.length - 1; i >= 0; i--) {
      let n = Number(s[i]);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  /**
   * Valida el formato de expiración MM/YY.
   * Retorna true si el mes es válido y la fecha no está vencida.
   */
  function expOk(v) {
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(v || "").trim());
    if (!m) return false;
    const mm = Number(m[1]),
      yy = Number(m[2]);
    if (!mm || mm < 1 || mm > 12) return false;
    const now = new Date(),
      curYY = now.getFullYear() % 100,
      curMM = now.getMonth() + 1;
    if (yy < curYY) return false;
    if (yy === curYY && mm < curMM) return false;
    return true;
  }

  /**
   * Valida los campos del paso "details" según el método de pago seleccionado.
   * Retorna un string de error o null si todo es válido.
   */
  function validateDetails() {
    const n = parseFloat(amount);
    if (!n || n <= 0) return "Ingresa un monto válido";
    if (method === "card") {
      if (!cardName.trim()) return "Nombre en tarjeta requerido";
      if (!expOk(cardExp)) return "Expiracion invalida (MM/YY)";
      const cvv = digitsOnly(cardCvv);
      if (!(cvv.length === 3 || cvv.length === 4)) return "CVV invalido";
    } else if (method === "transfer") {
      if (!bankName.trim()) return "Selecciona un banco";
      if (digitsOnly(accountRef).length < 6)
        return "Referencia/cuenta invalida";
    } else if (method === "wallet") {
      if (!walletProvider.trim()) return "Selecciona proveedor";
      if (!walletId.trim()) return "Cuenta/telefono requerido";
    }
    return null;
  }

  /** Construye el payload de pago para enviar al backend */
  function buildPaymentPayload() {
    if (method === "card")
      return {
        method,
        last4: digitsOnly(cardNumber).slice(-4),
        auth_code: verifyCode,
      };
    if (method === "transfer")
      return {
        method,
        last4: "",
        auth_code: verifyCode,
        ref: digitsOnly(accountRef).slice(-8),
      };
    return {
      method,
      last4: "",
      auth_code: verifyCode,
      ref: walletId.trim().slice(0, 40),
    };
  }

  /** Valida el paso "details", genera el OTP y avanza al paso "verify" */
  async function submit() {
    const err = validateDetails();
    if (err) return toast(err, "err");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setIssuedCode(code);
    setVerifyCode("");
    setStep("verify");
    await notifyVerificationCode(code);
  }

  /** Verifica el código OTP y envía la donación al backend */
  async function confirmPayment() {
    const n = parseFloat(amount);
    if (!issuedCode) return;
    if (verifyCode !== issuedCode) return toast("Codigo incorrecto", "err");
    setSaving(true);
    try {
      const res = await fetch(`${API}/${campaign.id}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: n,
          note,
          payment: buildPaymentPayload(),
        }),
      });
      const { data } = await parseResponse(res);
      if (res.ok && data?.ok) {
        onSuccess();
        onClose();
        toast(`Gracias por donar ${fmtMoney(n)}!`, "ok");
      } else toast(data?.error || `Error del servidor (${res.status})`, "err");
    } catch {
      toast("Error de conexión", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="m-head">
        <h3>{step === "verify" ? "Verificar pago" : "Donar a campaña"}</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        <p style={{ color: "var(--muted)", marginBottom: 16, fontSize: 13 }}>
          Donando a:{" "}
          <strong style={{ color: "var(--white)" }}>{campaign.title}</strong>
        </p>

        {step === "details" ? (
          <>
            {/* Montos rápidos preset */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 6,
                marginBottom: 14,
              }}
            >
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(String(p))}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    border:
                      amount === String(p)
                        ? "2px solid var(--red, #e53e3e)"
                        : "1.5px solid var(--border)",
                    background:
                      amount === String(p) ? "var(--red-soft)" : "transparent",
                    color: amount === String(p) ? "var(--red)" : "var(--muted)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {fmtMoney(p)}
                </button>
              ))}
            </div>
            <div className="field">
              <label>Monto (RD$)</label>
              <div className="field-input">
                <i className="ri-money-dollar-circle-fill" />
                <input
                  type="number"
                  placeholder="Ej: 1000"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Metodo de pago</label>
              <div className="field-input">
                <i className="ri-secure-payment-fill" />
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="card">Tarjeta de credito/debito</option>
                  <option value="transfer">Transferencia bancaria</option>
                  <option value="wallet">Billetera / cuenta</option>
                </select>
              </div>
            </div>

            {/* Campos específicos por método */}
            {method === "card" && (
              <>
                <div className="field">
                  <label>Nombre en la tarjeta</label>
                  <div className="field-input">
                    <i className="ri-user-3-fill" />
                    <input
                      placeholder="Ej: Juan Perez"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Numero de tarjeta</label>
                  <div className="field-input">
                    <i className="ri-bank-card-fill" />
                    <input
                      inputMode="numeric"
                      placeholder="#### #### #### ####"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <div className="field" style={{ margin: 0 }}>
                    <label>Expira (MM/YY)</label>
                    <div className="field-input">
                      <i className="ri-calendar-2-fill" />
                      <input
                        placeholder="08/28"
                        value={cardExp}
                        onChange={(e) => setCardExp(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>CVV</label>
                    <div className="field-input">
                      <i className="ri-key-fill" />
                      <input
                        inputMode="numeric"
                        placeholder="123"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
            {method === "transfer" && (
              <>
                <div className="field">
                  <label>Banco</label>
                  <div className="field-input">
                    <i className="ri-building-4-fill" />
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    >
                      <option>Banco Popular</option>
                      <option>Banreservas</option>
                      <option>BHD</option>
                      <option>Scotiabank</option>
                      <option>Otro</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Referencia / cuenta</label>
                  <div className="field-input">
                    <i className="ri-hashtag" />
                    <input
                      inputMode="numeric"
                      placeholder="Ej: 001234567890"
                      value={accountRef}
                      onChange={(e) => setAccountRef(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
            {method === "wallet" && (
              <>
                <div className="field">
                  <label>Proveedor</label>
                  <div className="field-input">
                    <i className="ri-wallet-3-fill" />
                    <select
                      value={walletProvider}
                      onChange={(e) => setWalletProvider(e.target.value)}
                    >
                      <option>Paypal</option>
                      <option>Cash App</option>
                      <option>Apple Pay</option>
                      <option>Google Pay</option>
                      <option>Otro</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Cuenta / telefono / email</label>
                  <div className="field-input">
                    <i className="ri-at-line" />
                    <input
                      placeholder="Ej: usuario@email.com"
                      value={walletId}
                      onChange={(e) => setWalletId(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <label>Mensaje (opcional)</label>
              <div className="field-input" style={{ alignItems: "flex-start" }}>
                <i className="ri-chat-quote-fill" style={{ marginTop: 14 }} />
                <textarea
                  rows={2}
                  placeholder="Deja un mensaje de apoyo..."
                  style={{ paddingTop: 14, resize: "none" }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : (
          // Paso 2: verificación OTP
          <>
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Codigo de verificacion (demo)
              </div>
              <div
                style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}
              >
                Te enviamos el codigo por notificacion del sistema. Si no la
                ves, permite notificaciones y toca "Reenviar".
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="btn btn-muted"
                  style={{ padding: "8px 10px" }}
                  onClick={() =>
                    issuedCode && notifyVerificationCode(issuedCode)
                  }
                >
                  Reenviar
                </button>
              </div>
            </div>
            <div className="field">
              <label>Codigo</label>
              <div className="field-input">
                <i className="ri-shield-keyhole-fill" />
                <input
                  inputMode="numeric"
                  placeholder="Ej: 123456"
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(digitsOnly(e.target.value).slice(0, 6))
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="m-foot">
        {step === "verify" ? (
          <>
            <button
              className="btn btn-muted"
              onClick={() => {
                setStep("details");
                setVerifyCode("");
              }}
              disabled={saving}
            >
              Atrás
            </button>
            <button
              className="btn btn-red"
              onClick={confirmPayment}
              disabled={saving || verifyCode.length !== 6}
            >
              {saving ? "Procesando..." : "Confirmar donacion"}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-muted"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button className="btn btn-red" onClick={submit} disabled={saving}>
              Continuar
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DonorsModal
// ─────────────────────────────────────────────────────────────────────────────
// Modal con la lista detallada de donantes de una campaña.
// Visible solo para el dueño o el admin (el backend lo verifica también).
// Muestra: resumen de stats, barra de progreso, lista de donantes con avatar,
// nombre, mensaje y monto. El primer donante recibe la etiqueta "Top".
//
// Props:
//   campaign  — objeto de campaña
//   userEmail — email del usuario autenticado
//   onClose   — callback para cerrar

function DonorsModal({ campaign, userEmail, onClose }) {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/${campaign.id}/contributors`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.contributors) setContributors(d.contributors);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaign.id, userEmail]);

  return (
    <>
      <div className="m-head">
        <h3>Donantes - {campaign.title}</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        {/* Stats rápidas: recaudado, meta, donantes */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {[
            {
              label: "Recaudado",
              val: fmtMoney(campaign.raised),
              color: "var(--red)",
            },
            {
              label: "Meta",
              val: fmtMoney(campaign.goal),
              color: "var(--teal)",
            },
            { label: "Donantes", val: campaign.donors, color: "var(--amber)" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "var(--navy)",
                borderRadius: 10,
                padding: "10px",
                textAlign: "center",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>
                {s.val}
              </div>
              <div
                style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <ProgressBar pct={campaign.pct} done={campaign.state === "done"} />
        <p
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginBottom: 16,
            textAlign: "right",
          }}
        >
          {campaign.pct}% de la meta
        </p>

        {/* Lista de donantes */}
        {loading ? (
          <div
            style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}
          >
            Cargando...
          </div>
        ) : contributors.length === 0 ? (
          <div
            style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}
          >
            <i
              className="ri-heart-line"
              style={{ fontSize: 28, display: "block", marginBottom: 8 }}
            />
            Aún no hay donaciones
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {contributors.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "var(--navy)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Avatar con inicial */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--red), #c53030)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {c.donor_name?.[0]?.toUpperCase() || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--white)",
                    }}
                  >
                    {c.donor_name}
                  </div>
                  {c.note && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        marginTop: 1,
                      }}
                    >
                      "{c.note}"
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginTop: 1,
                    }}
                  >
                    {fmtDate(c.date)}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--teal)",
                    flexShrink: 0,
                  }}
                >
                  {fmtMoney(c.amount)}
                </div>
                {/* Badge "Top" para el mayor donante (primero en la lista ordenada por monto desc) */}
                {i === 0 && (
                  <span style={{ fontSize: 12 }} title="Mayor donacion">
                    Top
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="m-foot">
        <button className="btn btn-muted" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NewCampaignModal
// ─────────────────────────────────────────────────────────────────────────────
// Formulario para crear una nueva campaña de ayuda.
// Campos: foto (opcional), título, descripción, meta (RD$).
// Envía POST /api/donations/ con el cuerpo JSON.
//
// Props:
//   userEmail — email del usuario autenticado
//   onSuccess — callback al crear exitosamente (recarga lista)
//   onClose   — callback para cerrar

function NewCampaignModal({ userEmail, onSuccess, onClose }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [goal, setGoal] = useState("");
  const [photo, setPhoto] = useState(null); // data URL o null
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!title.trim()) return toast("El título es obligatorio", "err");
    if (!goal || parseFloat(goal) <= 0)
      return toast("Ingresa una meta válida", "err");
    setSaving(true);
    try {
      const res = await fetch(`${API}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim(),
          goal: parseFloat(goal),
          photo, // null si no hay foto; data URL si la hay
        }),
      });
      const { data } = await parseResponse(res);
      if (res.ok && data?.ok) {
        onSuccess();
        onClose();
        toast("Campaña creada con éxito", "ok");
      } else toast(data?.error || `Error del servidor (${res.status})`, "err");
    } catch {
      toast("Error de conexión", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="m-head">
        <h3>Nueva campaña de ayuda</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        {/* PhotoUploadField sin pos/onPosChange — usa estado interno para nuevas campañas */}
        <PhotoUploadField
          photo={photo}
          onPhotoChange={setPhoto}
          onPhotoRemove={() => setPhoto(null)}
        />
        <div className="field">
          <label>Título</label>
          <div className="field-input">
            <i className="ri-file-text-fill" />
            <input
              placeholder="Describe tu necesidad"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Descripción</label>
          <div className="field-input" style={{ alignItems: "flex-start" }}>
            <i className="ri-chat-quote-fill" style={{ marginTop: 14 }} />
            <textarea
              rows={3}
              placeholder="Cuéntanos más sobre tu situación..."
              style={{ paddingTop: 14, resize: "none" }}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Meta (RD$)</label>
          <div className="field-input">
            <i className="ri-money-dollar-circle-fill" />
            <input
              type="number"
              placeholder="Ej: 50000"
              min="1"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="m-foot">
        <button className="btn btn-muted" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-red" onClick={submit} disabled={saving}>
          {saving ? "Creando..." : "Crear campaña"}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditCampaignModal
// ─────────────────────────────────────────────────────────────────────────────
// Formulario para editar una campaña existente.
// Campos: foto (con drag-to-reposition conectado a localStorage), título, desc, meta.
// Envía PATCH /api/donations/<id>.
//
// FIX PRINCIPAL — SISTEMA DE POSICIONAMIENTO UNIFICADO:
// ──────────────────────────────────────────────────────
// • `photoPos` se inicializa desde loadPosition(campaign.id) para mostrar la
//   posición ya guardada desde el momento en que se abre el modal.
// • Cuando el usuario arrastra la foto en PhotoUploadField, onPosChange actualiza
//   `photoPos` en estado Y llama a savePosition() para persistir en localStorage.
// • Esto significa que cuando el modal se cierra (sin necesidad de guardar el PATCH),
//   la CampaignCard ya refleja la nueva posición de recorte inmediatamente.
// • Cuando se guarda el PATCH, fetchCampaigns() recarga la lista y la card muestra
//   la foto actualizada del backend con la posición de localStorage.
//
// Estado de la foto (photoState):
//   null     → no hubo cambio de foto (se usa la existente en el servidor)
//   "REMOVE" → el usuario eliminó la foto (se enviará photo: null al PATCH)
//   dataURL  → el usuario subió una foto nueva (se enviará el base64 al PATCH)
//
// Props:
//   campaign  — objeto de campaña a editar
//   userEmail — email del usuario autenticado
//   onSuccess — callback al guardar exitosamente (recarga lista)
//   onClose   — callback para cerrar

function EditCampaignModal({ campaign, userEmail, onSuccess, onClose }) {
  const toast = useToast();
  const [title, setTitle] = useState(campaign?.title || "");
  const [desc, setDesc] = useState(campaign?.description || "");
  const [goal, setGoal] = useState(String(campaign?.goal || ""));

  // Estado de cambio de foto:
  //   null     = sin cambio (usar la del servidor)
  //   "REMOVE" = eliminar foto
  //   dataURL  = nueva foto subida por el usuario
  const [photoState, setPhotoState] = useState(null);

  // Estado de posición del recorte — se inicializa desde localStorage para esta campaña
  const [photoPos, setPhotoPos] = useState(() => loadPosition(campaign?.id));

  const [saving, setSaving] = useState(false);

  /**
   * Foto a mostrar en el preview:
   * - Si el usuario eliminó: null
   * - Si el usuario subió una nueva: esa data URL
   * - Si no hay cambio: la foto existente de la campaña (convertida a URL)
   */
  const previewPhoto =
    photoState === "REMOVE"
      ? null
      : photoState !== null
        ? photoState
        : campaign?.photo
          ? toImageUrl(campaign.photo)
          : null;

  /**
   * Handler para cambios de posición desde PhotoUploadField.
   * Actualiza el estado local Y persiste en localStorage de inmediato.
   * Esto garantiza que la CampaignCard refleje la posición correcta
   * tan pronto el usuario suelta el drag — sin necesidad de guardar.
   */
  function handlePosChange(newPos) {
    setPhotoPos(newPos);
    if (campaign?.id) savePosition(campaign.id, newPos);
  }

  async function submit() {
    if (!title.trim()) return toast("El título es obligatorio", "err");
    if (!goal || parseFloat(goal) <= 0)
      return toast("Ingresa una meta válida", "err");
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: desc.trim(),
        goal: parseFloat(goal),
      };
      // Solo incluir `photo` en el body si hubo cambio
      if (photoState === "REMOVE") body.photo = null;
      else if (photoState !== null) body.photo = photoState;

      const res = await fetch(`${API}/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const { data } = await parseResponse(res);
      if (res.ok && data?.ok) {
        toast("Campaña actualizada", "ok");
        onSuccess?.();
        onClose?.();
      } else toast(data?.error || `Error del servidor (${res.status})`, "err");
    } catch {
      toast("Error de conexión", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="m-head">
        <h3>Editar campaña</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        {/*
          PhotoUploadField con pos/onPosChange conectados:
          - `pos` = posición actual del recorte (desde localStorage o estado)
          - `onPosChange` = persiste en localStorage Y actualiza estado local
          El drag en el preview aquí es el drag-to-reposition real y funcional.
        */}
        <PhotoUploadField
          photo={previewPhoto}
          onPhotoChange={(dataUrl) => setPhotoState(dataUrl)}
          onPhotoRemove={() => setPhotoState("REMOVE")}
          pos={photoPos}
          onPosChange={handlePosChange}
          campaignId={campaign?.id}
        />
        <div className="field">
          <label>Título</label>
          <div className="field-input">
            <i className="ri-file-text-fill" />
            <input
              placeholder="Describe tu necesidad"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Descripción</label>
          <div className="field-input" style={{ alignItems: "flex-start" }}>
            <i className="ri-chat-quote-fill" style={{ marginTop: 14 }} />
            <textarea
              rows={3}
              placeholder="Cuéntanos más sobre tu situación..."
              style={{ paddingTop: 14, resize: "none" }}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Meta (RD$)</label>
          <div className="field-input">
            <i className="ri-money-dollar-circle-fill" />
            <input
              type="number"
              placeholder="Ej: 50000"
              min="1"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="m-foot">
        <button className="btn btn-muted" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-red" onClick={submit} disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Donations — Página principal
// ─────────────────────────────────────────────────────────────────────────────
// Orquesta toda la UI del módulo:
// • Stats personales (campañas activas, total recaudado, donantes) — solo de las propias
// • Lista de campañas filtrable (Todas / Mis campañas / Completadas)
// • Abre los modales según la acción del usuario
// • FAB "Crear campaña" fijo en la esquina inferior derecha
//
// Carga inicial: GET /api/donations/ → lista de campañas
// Permisos: admin puede ver todo; usuario regular ve campañas abiertas/completadas

export default function Donations() {
  const { user } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // "all" | "mine" | "done"
  const isAdmin = user?.email === ADMIN_EMAIL;

  /** Carga (o recarga) la lista de campañas desde el backend */
  const fetchCampaigns = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/`, { credentials: "include" });
      const { data } = await parseResponse(res);
      if (res.ok && Array.isArray(data?.campaigns))
        setCampaigns(data.campaigns || []);
      else {
        setCampaigns([]);
        toast(data?.error || "No se pudieron cargar las campañas", "err");
      }
    } catch {
      setCampaigns([]);
      toast("Error de conexión al cargar campañas", "err");
    } finally {
      setLoading(false);
    }
  }, [user?.email, toast]);

  // Cargar al montar y cuando cambia el usuario
  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Si el usuario pierde privilegios de admin, resetear el filtro
  useEffect(() => {
    if (!isAdmin) setFilter("all");
  }, [isAdmin]);

  // Campañas filtradas según el tab seleccionado
  const filtered = campaigns.filter((c) => {
    if (filter === "mine") return c.is_mine;
    if (filter === "done") return c.state === "done";
    return true;
  });

  // Stats personales: solo las campañas del usuario actual
  const mineCampaigns = campaigns.filter((c) => c.is_mine);
  const totalRaised = mineCampaigns.reduce((a, c) => a + (c.raised || 0), 0);
  const totalDonors = mineCampaigns.reduce((a, c) => a + (c.donors || 0), 0);
  const totalActive = mineCampaigns.filter((c) => c.state === "open").length;

  // ── Handlers de apertura de modales ──

  function openDonate(campaign) {
    openModal(
      <DonateModal
        campaign={campaign}
        userEmail={user.email}
        onSuccess={fetchCampaigns}
        onClose={closeModal}
      />,
    );
  }

  function openDonors(campaign) {
    openModal(
      <DonorsModal
        campaign={campaign}
        userEmail={user.email}
        onClose={closeModal}
      />,
    );
  }

  function openView(campaign) {
    openModal(<CampaignViewModal campaign={campaign} onClose={closeModal} />);
  }

  function openEdit(campaign) {
    openModal(
      <EditCampaignModal
        campaign={campaign}
        userEmail={user.email}
        onSuccess={fetchCampaigns}
        onClose={closeModal}
      />,
    );
  }

  /** Elimina una campaña (marca como cancelled en el backend) */
  async function handleDelete(campaign) {
    if (!window.confirm(`Eliminar la campaña "${campaign.title}"?`)) return;
    try {
      const res = await fetch(`${API}/${campaign.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const { data } = await parseResponse(res);
      if (res.ok && data?.ok) {
        toast("Campaña eliminada", "ok");
        fetchCampaigns();
      } else toast(data?.error || `Error del servidor (${res.status})`, "err");
    } catch {
      toast("Error de conexión", "err");
    }
  }

  function openNew() {
    openModal(
      <NewCampaignModal
        userEmail={user.email}
        onSuccess={fetchCampaigns}
        onClose={closeModal}
      />,
    );
  }

  return (
    <section id="secDonations">
      {/* ── Stats personales (3 columnas) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: "Campañas activas",
            val: totalActive,
            color: "var(--red, #e53e3e)",
            icon: "ri-heart-fill",
          },
          {
            label: "Total recaudado",
            val: fmtMoney(totalRaised),
            color: "var(--teal, #22d3b7)",
            icon: "ri-money-dollar-circle-fill",
          },
          {
            label: "Donantes totales",
            val: totalDonors,
            color: "var(--amber, #f5a623)",
            icon: "ri-group-fill",
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--card-solid, #152238)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "14px 10px",
              textAlign: "center",
            }}
          >
            <i
              className={s.icon}
              style={{
                fontSize: 20,
                color: s.color,
                display: "block",
                marginBottom: 4,
              }}
            />
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>
              {s.val}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sección principal de campañas ── */}
      <div className="card">
        <div className="card-title">
          <div className="ic amber">
            <i className="ri-hand-heart-fill" />
          </div>
          <h3>Campañas de Ayuda</h3>
        </div>
        <p
          style={{
            color: "var(--muted)",
            fontSize: ".88rem",
            marginBottom: 14,
          }}
        >
          Apoya a personas que necesitan ayuda. Todas las donaciones quedan
          registradas.
        </p>

        {/* Filtros de tab */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {[
            { key: "all", label: "Todas" },
            { key: "mine", label: "Mis campañas" },
            { key: "done", label: "Completadas" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                background:
                  filter === f.key
                    ? "var(--red, #e53e3e)"
                    : "var(--navy-light, #192e4f)",
                color: filter === f.key ? "#fff" : "var(--muted)",
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista de campañas o estados vacío/cargando */}
        {loading ? (
          <div className="empty">
            <i
              className="ri-loader-4-line"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <p>Cargando campañas...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <i className="ri-hand-heart-fill" />
            <p>
              {filter === "mine"
                ? "No tienes campañas activas"
                : "Sin campañas disponibles"}
            </p>
          </div>
        ) : (
          filtered.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              currentUid={user?.uid}
              isAdmin={isAdmin}
              onDonate={openDonate}
              onDelete={handleDelete}
              onViewDonors={openDonors}
              onEdit={openEdit}
              onView={openView}
            />
          ))
        )}

        {/* FAB "Crear campaña" — fijo en esquina inferior derecha */}
        <button
          onClick={openNew}
          style={{
            position: "fixed",
            right: 18,
            bottom: 84,
            zIndex: 50,
            border: "none",
            borderRadius: 999,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--red, #e53e3e)",
            color: "#fff",
            fontWeight: 800,
            boxShadow: "0 10px 24px rgba(0,0,0,.35)",
            cursor: "pointer",
          }}
          title="Crear campana"
        >
          <i className="ri-add-fill" /> Crear campana
        </button>
      </div>
    </section>
  );
}
