// Profile: perfil del usuario (datos personales, foto y configuraciones).
// Se guarda en Odoo y se usa en correos SOS y en el sistema en general.
import { useState, useEffect, useRef } from "react";
import { useStore } from "../store";
import { useToast, useModal } from "../components/Providers";

const API = "/api";

export default function Profile() {
  const { user, setUser, blood, setBlood } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [photo, setPhoto] = useState(null);
  const fileRef = useRef();
  const [view, setView] = useState("hub");

  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [bloodLocal, setBloodLocal] = useState(blood || "");
  const [allergy, setAllergy] = useState("");
  const [cond, setCond] = useState("");
  const [healthIssues, setHealthIssues] = useState("");
  const [ec1Name, setEc1Name] = useState("");
  const [ec1Phone, setEc1Phone] = useState("");
  const [ec1Email, setEc1Email] = useState("");
  const [ec1Rel, setEc1Rel] = useState("");
  const [ec2Name, setEc2Name] = useState("");
  const [ec2Phone, setEc2Phone] = useState("");
  const [ec2Email, setEc2Email] = useState("");
  const [ec2Rel, setEc2Rel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [emergelensId, setEmergelensId] = useState(""); // ← ID del usuario

  // ── Búsqueda de contacto por ID ──────────────────────────────────────────
  const [ec1SearchId, setEc1SearchId] = useState("");
  const [ec2SearchId, setEc2SearchId] = useState("");
  const [ec1Searching, setEc1Searching] = useState(false);
  const [ec2Searching, setEc2Searching] = useState(false);

  const BLOODS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const RELS = ["Madre", "Padre", "Hermano/a", "Esposo/a", "Amigo/a", "Otro"];

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch(`${API}/profile/`, { credentials: "include" });
        const data = await res.json();
        if (data.ok && data.profile && data.profile.id) {
          const p = data.profile;
          setPhone(p.x_phone || "");
          setAddr(p.x_address || "");
          setAge(p.x_age || "");
          setSex(p.x_sex || "");
          setBloodLocal(p.x_blood || "");
          setBlood(p.x_blood || "");
          setAllergy(p.x_allergies || "");
          setCond(p.x_conditions || "");
          setHealthIssues(p.x_health_issues || "");
          setEc1Name(p.x_ec1_name || "");
          setEc1Phone(p.x_ec1_phone || "");
          setEc1Email(p.x_ec1_email || "");
          setEc1Rel(p.x_ec1_rel || "");
          setEc2Name(p.x_ec2_name || "");
          setEc2Phone(p.x_ec2_phone || "");
          setEc2Email(p.x_ec2_email || "");
          setEc2Rel(p.x_ec2_rel || "");
          setInstructions(p.x_custom_instructions || "");
          setEmergelensId(p.x_emergelens_id || "");
          if (p.x_photo) setPhoto(p.x_photo);
        }
      } catch {
      } finally {
        setLoadingData(false);
      }
    }
    loadProfile();
  }, []);

  // ── Buscar contacto por ID EmergeLens ────────────────────────────────────
  async function searchByEmergelensId(eid, slot) {
    const id = eid.trim().toUpperCase();
    if (!id) return;
    if (!id.startsWith("EL-")) {
      toast("El ID debe tener formato EL-XXXX", "err");
      return;
    }
    if (slot === 1) setEc1Searching(true);
    else setEc2Searching(true);

    try {
      const res = await fetch(`${API}/profile/by-emergelens-id/${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        if (slot === 1) {
          setEc1Name(data.name || "");
          setEc1Phone(data.phone || "");
          setEc1Email(data.email || "");
          setEc1SearchId("");
          toast(`Contacto encontrado: ${data.name}`, "ok");
        } else {
          setEc2Name(data.name || "");
          setEc2Phone(data.phone || "");
          setEc2Email(data.email || "");
          setEc2SearchId("");
          toast(`Contacto encontrado: ${data.name}`, "ok");
        }
      } else {
        toast(data.error || "No encontrado", "err");
      }
    } catch {
      toast("Error al buscar", "err");
    } finally {
      if (slot === 1) setEc1Searching(false);
      else setEc2Searching(false);
    }
  }

  function copyId() {
    if (!emergelensId) return;
    navigator.clipboard.writeText(emergelensId);
    toast("ID copiado al portapapeles", "ok");
  }

  function go(nextView) {
    setView(nextView);
    setTimeout(() => {
      try {
        document
          .getElementById("secProfile")
          .scrollIntoView({ block: "start" });
      } catch {}
    }, 0);
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast("Maximo 3MB", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveInstructions(next) {
    const value = (next ?? instructions ?? "").trim();
    try {
      const res = await fetch(`${API}/profile/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ instructions: value }),
      });
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw || "{}");
      } catch {
        throw new Error("Error del servidor");
      }
      if (!data.ok) throw new Error(data.error || "Error al guardar");
      setInstructions(value);
      toast("Configuracion guardada ", "ok");
      return true;
    } catch (err) {
      toast(err.message || "Error al guardar", "err");
      return false;
    }
  }

  function openLensModal() {
    openModal(
      <LensModal
        initial={instructions || ""}
        onClose={closeModal}
        onSave={async (val) => {
          const ok = await saveInstructions(val);
          if (ok) closeModal();
        }}
      />,
    );
  }

  async function saveProfile(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/profile/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          age,
          sex,
          address: addr,
          phone,
          blood: bloodLocal,
          allergies: allergy,
          conditions: cond,
          healthIssues,
          ec1Name,
          ec1Phone,
          ec1Email,
          ec1Rel,
          ec2Name,
          ec2Phone,
          ec2Email,
          ec2Rel,
          photo: photo || "",
        }),
      });
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw || "{}");
      } catch {
        throw new Error("Error del servidor");
      }
      if (!data.ok) throw new Error(data.error);
      if (data.emergelens_id) setEmergelensId(data.emergelens_id);
      await saveInstructions(instructions);
      setUser((u) => ({ ...u, name, email, phone, photo: photo || null }));
      setBlood(bloodLocal);
      toast("Perfil guardado ", "ok");
    } catch (err) {
      toast(err.message || "Error al guardar", "err");
    } finally {
      setLoading(false);
    }
  }

  if (loadingData)
    return (
      <div className="empty" style={{ marginTop: 60 }}>
        <i
          className="ri-loader-4-line"
          style={{ animation: "spin 1s linear infinite" }}
        />
        <p>Cargando perfil...</p>
      </div>
    );

  const header =
    view === "hub"
      ? { title: "Mi Perfil", icon: "ri-user-fill", tone: "red" }
      : view === "personal"
        ? { title: "Datos personales", icon: "ri-id-card-fill", tone: "red" }
        : view === "health"
          ? { title: "Salud", icon: "ri-heart-pulse-fill", tone: "teal" }
          : view === "contacts"
            ? {
                title: "Contactos de emergencia",
                icon: "ri-contacts-fill",
                tone: "amber",
              }
            : {
                title: "Chat (LENS)",
                icon: "ri-chat-settings-fill",
                tone: "red",
              };

  return (
    <section id="secProfile">
      <div className="card profile-card">
        <div className="profile-head">
          {view !== "hub" ? (
            <button
              type="button"
              className="profile-back"
              onClick={() => go("hub")}
            >
              <i className="ri-arrow-left-line" />
            </button>
          ) : (
            <span className="profile-back-spacer" />
          )}
          <div className="profile-title">
            <div className={`profile-ic ${header.tone}`}>
              <i className={header.icon} />
            </div>
            <div>
              <h3>{header.title}</h3>
              <p className="profile-sub">
                {view === "hub"
                  ? "Elige una seccion para editarla"
                  : "Edita y guarda tus cambios"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="profile-circle"
            onClick={openLensModal}
          >
            <i className="ri-settings-3-line" />
          </button>
        </div>

        {/* ── ID EmergeLens — visible en hub y personal ── */}
        {(view === "hub" || view === "personal") && emergelensId && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(229,62,62,0.08)",
              border: "1px solid rgba(229,62,62,0.2)",
              borderRadius: "10px",
              padding: "10px 14px",
              margin: "0 0 16px",
            }}
          >
            <i
              className="ri-fingerprint-fill"
              style={{ color: "var(--red)", fontSize: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  marginBottom: "2px",
                }}
              >
                Tu ID EmergeLens
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "16px",
                  letterSpacing: "2px",
                  color: "var(--red)",
                }}
              >
                {emergelensId}
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                Compártelo para que otros te agreguen como contacto de
                emergencia
              </div>
            </div>
            <button
              type="button"
              onClick={copyId}
              style={{
                background: "var(--red)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <i className="ri-file-copy-line" /> Copiar
            </button>
          </div>
        )}

        <div className="profile-photo-wrap">
          <div
            className="profile-photo-circle"
            onClick={() => fileRef.current.click()}
          >
            {photo ? (
              <img src={photo} alt="Foto" className="profile-photo-img" />
            ) : (
              <i
                className="ri-user-fill"
                style={{ fontSize: 36, color: "var(--muted)" }}
              />
            )}
            <div className="profile-photo-overlay">
              <i className="ri-camera-fill" />
            </div>
          </div>
          <div className="profile-photo-actions">
            <button
              type="button"
              className="btn btn-muted btn-sm"
              onClick={() => fileRef.current.click()}
            >
              <i className="ri-upload-2-line" />{" "}
              {photo ? "Cambiar foto" : "Subir foto"}
            </button>
            {photo && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={removePhoto}
              >
                <i className="ri-delete-bin-fill" /> Eliminar
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handlePhotoChange}
          />
        </div>

        {view === "hub" ? (
          <div className="profile-hub">
            {[
              {
                v: "personal",
                ic: "ri-id-card-fill",
                tone: "red",
                title: "Datos personales",
                sub: "Nombre, edad, sexo, telefono y direccion",
              },
              {
                v: "health",
                ic: "ri-heart-pulse-fill",
                tone: "teal",
                title: "Salud",
                sub: "Alergias, condiciones y notas",
              },
              {
                v: "contacts",
                ic: "ri-contacts-fill",
                tone: "amber",
                title: "Contactos de emergencia",
                sub: "Principal y respaldo (con email)",
              },
              {
                v: "lens",
                ic: "ri-chat-settings-fill",
                tone: "red",
                title: "Chat (LENS)",
                sub: "Como quieres que te trate",
              },
            ].map((item) => (
              <button
                key={item.v}
                type="button"
                className="profile-nav"
                onClick={() => go(item.v)}
              >
                <div className={`profile-nav-ic ${item.tone}`}>
                  <i className={item.ic} />
                </div>
                <div className="profile-nav-body">
                  <strong>{item.title}</strong>
                  <span>{item.sub}</span>
                </div>
                <i className="ri-arrow-right-s-line" />
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={saveProfile} className="profile-form">
            {view === "personal" && (
              <div className="profile-panel">
                <div className="field">
                  <label>Nombre</label>
                  <div className="field-input">
                    <i className="ri-user-fill" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Correo</label>
                  <div className="field-input">
                    <i className="ri-mail-fill" />
                    <input type="email" value={email} readOnly />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Edad</label>
                    <div className="field-input">
                      <i className="ri-calendar-fill" />
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="28"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Sexo</label>
                    <div className="field-input">
                      <i className="ri-user-fill" />
                      <select
                        value={sex}
                        onChange={(e) => setSex(e.target.value)}
                      >
                        <option value="">Selecciona...</option>
                        <option>Masculino</option>
                        <option>Femenino</option>
                        <option>Otro</option>
                        <option>Prefiero no decir</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Telefono</label>
                  <div className="field-input">
                    <i className="ri-phone-fill" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 809 000 0000"
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Direccion</label>
                  <div className="field-input">
                    <i className="ri-map-pin-fill" />
                    <input
                      type="text"
                      value={addr}
                      onChange={(e) => setAddr(e.target.value)}
                      placeholder="Calle 123..."
                    />
                  </div>
                </div>
                <div className="profile-subhead">Tipo de sangre</div>
                <div className="blood-grid" style={{ marginBottom: 0 }}>
                  {BLOODS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`bl-btn ${bloodLocal === b ? "sel" : ""}`}
                      onClick={() => setBloodLocal(b)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {view === "health" && (
              <div className="profile-panel">
                <div className="field">
                  <label>Alergias</label>
                  <div className="field-input field-input--textarea">
                    <i className="ri-alert-fill" />
                    <textarea
                      rows={2}
                      value={allergy}
                      onChange={(e) => setAllergy(e.target.value)}
                      placeholder="Polen, Penicilina..."
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Condiciones medicas</label>
                  <div className="field-input field-input--textarea">
                    <i className="ri-file-list-fill" />
                    <textarea
                      rows={2}
                      value={cond}
                      onChange={(e) => setCond(e.target.value)}
                      placeholder="Diabetes, Hipertension..."
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Problemas de salud adicionales</label>
                  <div className="field-input field-input--textarea">
                    <i className="ri-heart-pulse-fill" />
                    <textarea
                      rows={2}
                      value={healthIssues}
                      onChange={(e) => setHealthIssues(e.target.value)}
                      placeholder="Cualquier informacion relevante..."
                    />
                  </div>
                </div>
              </div>
            )}

            {view === "contacts" && (
              <div className="profile-panel">
                {/* ── Contacto 1 ── */}
                <p className="profile-help">Contacto principal</p>

                {/* Búsqueda por ID EmergeLens */}
                <div className="field">
                  <label>
                    Buscar por ID EmergeLens{" "}
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                      (opcional)
                    </span>
                  </label>
                  <div className="field-input">
                    <i
                      className="ri-fingerprint-fill"
                      style={{ color: "var(--red)" }}
                    />
                    <input
                      type="text"
                      placeholder="EL-1234"
                      value={ec1SearchId}
                      onChange={(e) =>
                        setEc1SearchId(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(),
                        searchByEmergelensId(ec1SearchId, 1))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => searchByEmergelensId(ec1SearchId, 1)}
                      disabled={ec1Searching || !ec1SearchId.trim()}
                      style={{
                        background: ec1SearchId.trim()
                          ? "var(--red)"
                          : "#e2e8f0",
                        color: ec1SearchId.trim() ? "#fff" : "#aaa",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        cursor: ec1SearchId.trim() ? "pointer" : "default",
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ec1Searching ? "..." : "Buscar"}
                    </button>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Nombre</label>
                    <div className="field-input">
                      <i className="ri-user-fill" />
                      <input
                        type="text"
                        value={ec1Name}
                        onChange={(e) => setEc1Name(e.target.value)}
                        placeholder="Maria Garcia"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Telefono</label>
                    <div className="field-input">
                      <i className="ri-phone-fill" />
                      <input
                        type="tel"
                        value={ec1Phone}
                        onChange={(e) => setEc1Phone(e.target.value)}
                        placeholder="+1 809..."
                      />
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Correo electronico</label>
                  <div className="field-input">
                    <i className="ri-mail-fill" />
                    <input
                      type="email"
                      value={ec1Email}
                      onChange={(e) => setEc1Email(e.target.value)}
                      placeholder="maria@email.com"
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Relacion</label>
                  <div className="field-input">
                    <i className="ri-group-fill" />
                    <select
                      value={ec1Rel}
                      onChange={(e) => setEc1Rel(e.target.value)}
                    >
                      <option value="">Selecciona...</option>
                      {RELS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="profile-divider" />

                {/* ── Contacto 2 ── */}
                <p className="profile-help">Contacto de respaldo</p>

                <div className="field">
                  <label>
                    Buscar por ID EmergeLens{" "}
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                      (opcional)
                    </span>
                  </label>
                  <div className="field-input">
                    <i
                      className="ri-fingerprint-fill"
                      style={{ color: "var(--red)" }}
                    />
                    <input
                      type="text"
                      placeholder="EL-5678"
                      value={ec2SearchId}
                      onChange={(e) =>
                        setEc2SearchId(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(),
                        searchByEmergelensId(ec2SearchId, 2))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => searchByEmergelensId(ec2SearchId, 2)}
                      disabled={ec2Searching || !ec2SearchId.trim()}
                      style={{
                        background: ec2SearchId.trim()
                          ? "var(--red)"
                          : "#e2e8f0",
                        color: ec2SearchId.trim() ? "#fff" : "#aaa",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        cursor: ec2SearchId.trim() ? "pointer" : "default",
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ec2Searching ? "..." : "Buscar"}
                    </button>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Nombre</label>
                    <div className="field-input">
                      <i className="ri-user-fill" />
                      <input
                        type="text"
                        value={ec2Name}
                        onChange={(e) => setEc2Name(e.target.value)}
                        placeholder="Carlos Perez"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Telefono</label>
                    <div className="field-input">
                      <i className="ri-phone-fill" />
                      <input
                        type="tel"
                        value={ec2Phone}
                        onChange={(e) => setEc2Phone(e.target.value)}
                        placeholder="+1 809..."
                      />
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Correo electronico</label>
                  <div className="field-input">
                    <i className="ri-mail-fill" />
                    <input
                      type="email"
                      value={ec2Email}
                      onChange={(e) => setEc2Email(e.target.value)}
                      placeholder="carlos@email.com"
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Relacion</label>
                  <div className="field-input">
                    <i className="ri-group-fill" />
                    <select
                      value={ec2Rel}
                      onChange={(e) => setEc2Rel(e.target.value)}
                    >
                      <option value="">Selecciona...</option>
                      {RELS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {view === "lens" && (
              <div className="profile-panel">
                <p className="profile-help">
                  Dile a LENS como quieres que te trate.
                </p>
                <div className="profile-lens-preview">
                  <div className="profile-lens-chip">
                    <i className="ri-settings-3-line" />
                  </div>
                  <div className="profile-lens-text">
                    <strong>Tu configuracion</strong>
                    <span>
                      {instructions.trim() || "No has configurado nada aun."}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-muted btn-sm"
                    onClick={openLensModal}
                  >
                    Editar
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-teal profile-save"
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="ri-loader-4-line" /> Guardando...
                </>
              ) : (
                <>
                  <i className="ri-save-fill" /> Guardar
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function LensModal({ initial, onClose, onSave }) {
  const [val, setVal] = useState(initial || "");
  return (
    <>
      <div className="m-head">
        <h3>Configuracion de chat (LENS)</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>
      <div className="m-body">
        <p style={{ color: "var(--muted)", marginBottom: 14 }}>
          Escribe como quieres que el chat te trate.
        </p>
        <div className="field">
          <div className="field-input field-input--textarea">
            <i className="ri-chat-settings-fill" />
            <textarea
              rows={5}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder='Ej: "Llamame reina", "Habla formal", "Responde corto"'
            />
          </div>
        </div>
      </div>
      <div className="m-foot">
        <button className="btn btn-muted" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn btn-red"
          type="button"
          onClick={() => onSave(val)}
        >
          Guardar
        </button>
      </div>
    </>
  );
}
