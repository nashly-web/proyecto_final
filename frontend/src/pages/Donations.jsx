// frontend/src/pages/Donations.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import { useToast, useModal } from "../components/Providers";

const API = "/api/donations";
const ADMIN_EMAIL = "sosemergelens@gmail.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n) {
  return (
    "$" + Number(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 0 })
  );
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function guessMimeFromBase64(b64) {
  const s = String(b64 || "").trim();
  if (!s) return "image/jpeg";
  if (s.startsWith("data:")) return null;
  if (s.startsWith("/9j/")) return "image/jpeg";
  if (s.startsWith("iVBORw0KGgo")) return "image/png";
  if (s.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
}

function toImageUrl(photo) {
  if (!photo) return null;
  const s = String(photo).trim();
  if (!s) return null;
  if (s.startsWith("data:")) return s;
  const mime = guessMimeFromBase64(s) || "image/jpeg";
  return `data:${mime};base64,${s}`;
}

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

// ── Posición guardada en localStorage por campaña ─────────────────────────────

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

function savePosition(campaignId, pos) {
  try {
    localStorage.setItem(`don_img_pos_${campaignId}`, JSON.stringify(pos));
  } catch {}
}

// ── ImageBanner — arrastra para reposicionar (solo dueño/admin) ───────────────

function ImageBanner({ campaignId, photo, done, editable = false }) {
  const [pos, setPos] = useState(() => loadPosition(campaignId));
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 50, y: 50 });
  const containerRef = useRef(null);
  const posRef = useRef(pos);

  useEffect(() => {
    const p = loadPosition(campaignId);
    setPos(p);
    posRef.current = p;
  }, [campaignId]);

  function beginDrag(clientX, clientY) {
    if (!editable) return;
    dragging.current = true;
    startMouse.current = { x: clientX, y: clientY };
    startPos.current = { ...posRef.current };
  }

  function moveDrag(clientX, clientY) {
    if (!dragging.current || !editable) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((clientX - startMouse.current.x) / rect.width) * 100;
    const dy = ((clientY - startMouse.current.y) / rect.height) * 100;
    const newPos = {
      x: Math.max(0, Math.min(100, startPos.current.x - dx)),
      y: Math.max(0, Math.min(100, startPos.current.y - dy)),
    };
    posRef.current = newPos;
    setPos(newPos);
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    savePosition(campaignId, posRef.current);
  }

  const imgUrl = toImageUrl(photo);

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

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => {
        e.preventDefault();
        beginDrag(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
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

// ── ProgressBar ───────────────────────────────────────────────────────────────

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

// ── PhotoUploadField — campo reutilizable con preview + botón ✕ + drag hint ──

function PhotoUploadField({
  photo,
  onPhotoChange,
  onPhotoRemove,
  campaignId = null,
  showDragHint = false,
}) {
  const fileRef = useRef();
  const toast = useToast();

  function handleImg(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast("Máximo 4MB", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => onPhotoChange(ev.target.result);
    reader.readAsDataURL(file);
  }

  const imgUrl = photo
    ? photo.startsWith("data:")
      ? photo
      : toImageUrl(photo)
    : null;

  return (
    <div className="don-photo-upload" style={{ marginBottom: 12 }}>
      {imgUrl ? (
        <div style={{ position: "relative", marginBottom: 8 }}>
          <img
            src={imgUrl}
            alt="Campaña"
            style={{
              width: "100%",
              height: 160,
              objectFit: "cover",
              borderRadius: 10,
              display: "block",
            }}
          />
          {/* Botón ✕ eliminar */}
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
          {/* Hint drag-to-reposition (solo cuando corresponde) */}
          {showDragHint && (
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
              <i className="ri-drag-move-fill" /> Arrastra la foto en la tarjeta
              para reposicionar
            </div>
          )}
        </div>
      ) : (
        <div
          className="don-photo-placeholder"
          onClick={() => fileRef.current.click()}
          style={{
            border: "2px dashed var(--border)",
            borderRadius: 10,
            padding: "24px 16px",
            textAlign: "center",
            cursor: "pointer",
            color: "var(--muted)",
            marginBottom: 8,
          }}
        >
          <i
            className="ri-image-add-fill"
            style={{ fontSize: 28, display: "block", marginBottom: 6 }}
          />
          <span>Agregar foto (opcional)</span>
          <small style={{ display: "block", marginTop: 4 }}>Máximo 4MB</small>
        </div>
      )}
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

// ── CampaignViewModal ─────────────────────────────────────────────────────────

function CampaignViewModal({ campaign, onClose }) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [contributors, setContributors] = useState([]);
  const { user } = useStore();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const isOwner = loading ? false : (details?.is_mine ?? campaign?.is_mine);
  const showComments = isOwner || isAdmin;

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

// ── CampaignCard ──────────────────────────────────────────────────────────────

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
      {/* Banner con drag-to-reposition solo para dueño/admin */}
      <ImageBanner
        campaignId={campaign.id}
        photo={campaign.photo}
        done={done}
        editable={canEdit && !!campaign.photo}
      />

      <div style={{ padding: "14px 16px 16px" }}>
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

// ── DonateModal ───────────────────────────────────────────────────────────────

function DonateModal({ campaign, userEmail, onSuccess, onClose }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("card");
  const [step, setStep] = useState("details");
  const [verifyCode, setVerifyCode] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
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
  const PRESETS = [500, 1000, 2000, 5000];

  function digitsOnly(s) {
    return String(s || "").replace(/\D+/g, "");
  }

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

  function validateDetails() {
    const n = parseFloat(amount);
    if (!n || n <= 0) return "Ingresa un monto válido";
    if (method === "card") {
      if (!cardName.trim()) return "Nombre en tarjeta requerido";
      if (!luhnOk(cardNumber)) return "Numero de tarjeta invalido";
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

  async function submit() {
    const err = validateDetails();
    if (err) return toast(err, "err");
    setIssuedCode(String(Math.floor(100000 + Math.random() * 900000)));
    setVerifyCode("");
    setStep("verify");
  }

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
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>
                {issuedCode || "------"}
              </div>
              <div
                style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}
              >
                Ingresa el codigo para confirmar el pago simulado.
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

// ── DonorsModal ───────────────────────────────────────────────────────────────

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

// ── NewCampaignModal ──────────────────────────────────────────────────────────

function NewCampaignModal({ userEmail, onSuccess, onClose }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [goal, setGoal] = useState("");
  const [photo, setPhoto] = useState(null);
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
          photo,
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
        {/* Campo de foto unificado con preview + ✕ + botón cambiar */}
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

// ── EditCampaignModal ─────────────────────────────────────────────────────────

function EditCampaignModal({ campaign, userEmail, onSuccess, onClose }) {
  const toast = useToast();
  const [title, setTitle] = useState(campaign?.title || "");
  const [desc, setDesc] = useState(campaign?.description || "");
  const [goal, setGoal] = useState(String(campaign?.goal || ""));
  // null = no cambia, "REMOVE" = eliminar, dataURL = nueva foto
  const [photoState, setPhotoState] = useState(null);
  const [saving, setSaving] = useState(false);

  // La foto a mostrar en preview: nueva si existe, si no la existente de la campaña
  const previewPhoto =
    photoState === "REMOVE"
      ? null
      : photoState !== null
        ? photoState
        : campaign?.photo
          ? toImageUrl(campaign.photo)
          : null;

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
        {/* Campo de foto unificado con preview + ✕ + hint drag + botón cambiar */}
        <PhotoUploadField
          photo={previewPhoto}
          onPhotoChange={(dataUrl) => setPhotoState(dataUrl)}
          onPhotoRemove={() => setPhotoState("REMOVE")}
          campaignId={campaign?.id}
          showDragHint={!!previewPhoto}
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

// ── Donations (página principal) ──────────────────────────────────────────────

export default function Donations() {
  const { user } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const isAdmin = user?.email === ADMIN_EMAIL;

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

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);
  useEffect(() => {
    if (!isAdmin) setFilter("all");
  }, [isAdmin]);

  const filtered = campaigns.filter((c) => {
    if (filter === "mine") return c.is_mine;
    if (filter === "done") return c.state === "done";
    return true;
  });

  const mineCampaigns = campaigns.filter((c) => c.is_mine);
  const totalRaised = mineCampaigns.reduce((a, c) => a + (c.raised || 0), 0);
  const totalDonors = mineCampaigns.reduce((a, c) => a + (c.donors || 0), 0);
  const totalActive = mineCampaigns.filter((c) => c.state === "open").length;

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
