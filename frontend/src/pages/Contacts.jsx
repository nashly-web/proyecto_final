// Contacts: pantalla para administrar contactos de emergencia.
// Los contactos se guardan en Odoo y se usan para enviar correos SOS.
import { useStore } from "../store";
import { useToast, useModal, ConfirmModal } from "../components/Providers";
import { useEffect, useState } from "react";
import {
  odooGetContacts,
  odooCreateContact,
  odooUpdateContact,
  odooDeleteContact,
} from "../api";

export default function Contacts() {
  const { user, contacts, setContacts } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  // Cargar contactos reales desde backend (Odoo).
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const list = await odooGetContacts();
        setContacts(Array.isArray(list) ? list : []);
      } catch (e) {
        toast(e?.message || "No se pudieron cargar contactos", "err");
      }
    })();
  }, [user?.email, setContacts, toast]);

  function openAddCt() {
    openModal(
      <CtModal
        initial={{}}
        onSave={(c) => {
          (async () => {
            try {
              const id = await odooCreateContact(user?.uid, c);
              setContacts((p) => [...p, { id, ...c }]);
              closeModal();
              toast("Contacto agregado", "ok");
            } catch (e) {
              toast(e?.message || "No se pudo guardar", "err");
            }
          })();
        }}
        onClose={closeModal}
      />,
    );
  }

  function editCt(ct) {
    openModal(
      <CtModal
        initial={ct}
        onSave={(c) => {
          (async () => {
            try {
              await odooUpdateContact(ct.id, c);
              setContacts((p) =>
                p.map((x) => (x.id === ct.id ? { ...x, ...c } : x)),
              );
              closeModal();
              toast("Actualizado", "ok");
            } catch (e) {
              toast(e?.message || "No se pudo actualizar", "err");
            }
          })();
        }}
        onClose={closeModal}
      />,
    );
  }

  function delCt(id) {
    openModal(
      <ConfirmModal
        title="Eliminar contacto"
        msg="No se puede deshacer."
        onConfirm={() => {
          (async () => {
            try {
              await odooDeleteContact(id);
              setContacts((p) => p.filter((x) => x.id !== id));
              toast("Eliminado", "ok");
            } catch (e) {
              toast(e?.message || "No se pudo eliminar", "err");
            }
          })();
        }}
        onClose={closeModal}
      />,
    );
  }

  return (
    <section id="secContacts">
      <div className="card">
        <div className="card-title">
          <div className="ic amber">
            <i className="ri-contacts-fill" />
          </div>
          <h3>Contactos de Emergencia</h3>
        </div>

        {contacts.length === 0 ? (
          <div className="empty">
            <i className="ri-contacts-fill" />
            <p>Sin contactos</p>
          </div>
        ) : (
          contacts.map((c) => {
            const ini = (c.name || "?")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <div key={c.id} className="li">
                <div
                  className="li-icon blue"
                  style={{
                    borderRadius: "50%",
                    fontWeight: 700,
                    fontSize: ".85rem",
                  }}
                >
                  {ini}
                </div>
                <div className="li-body">
                  <h4>{c.name}</h4>
                  <p>
                    {c.phone} · {c.rel}
                  </p>
                  {c.email && (
                    <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {c.email}
                    </p>
                  )}
                  {c.emergelens_id && (
                    <p
                      style={{
                        fontSize: "11px",
                        color: "var(--red)",
                        fontWeight: 600,
                      }}
                    >
                      <i className="ri-fingerprint-fill" /> {c.emergelens_id}
                    </p>
                  )}
                </div>
                {c.primary && <span className="li-badge amber">Principal</span>}
                <div className="li-actions">
                  <button className="ed" onClick={() => editCt(c)}>
                    <i className="ri-pencil-fill" />
                  </button>
                  <button className="del" onClick={() => delCt(c.id)}>
                    <i className="ri-delete-bin-fill" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        <button
          className="add-row"
          style={{ marginTop: 12 }}
          onClick={openAddCt}
        >
          <i className="ri-add-fill" /> Agregar Contacto
        </button>
      </div>
    </section>
  );
}

function CtModal({ initial, onSave, onClose }) {
  const { setContacts } = useStore();
  const toast = useToast();

  const [searchId, setSearchId] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundId, setFoundId] = useState(initial.emergelens_id || "");

  const [name, setName] = useState(initial.name || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [email, setEmail] = useState(initial.email || "");
  const [rel, setRel] = useState(initial.rel || "Madre");
  const [pri, setPri] = useState(initial.primary || false);

  // ── Buscar por ID EmergeLens ──────────────────────────────────────────────
  async function searchByEmergelensId() {
    const id = searchId.trim().toUpperCase();
    if (!id) return;

    if (!id.startsWith("EL-")) {
      toast("El ID debe tener formato EL-XXXX", "err");
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/profile/by-emergelens-id/${id}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (data.ok) {
        setName(data.name || "");
        setPhone(data.phone || "");
        setEmail(data.email || "");
        setFoundId(id);
        setSearchId("");
        toast(`✅ Contacto encontrado: ${data.name}`, "ok");
      } else {
        toast(data.error || "No se encontró ningún usuario con ese ID", "err");
      }
    } catch {
      toast("Error al buscar. Verifica tu conexión.", "err");
    } finally {
      setSearching(false);
    }
  }

  function handleSearchKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      searchByEmergelensId();
    }
  }

  function save() {
    if (!name || !phone) {
      toast("Completa nombre y teléfono", "err");
      return;
    }
    if (pri) setContacts((p) => p.map((c) => ({ ...c, primary: false })));
    onSave({ name, phone, email, rel, primary: pri, emergelens_id: foundId });
  }

  return (
    <>
      <div className="m-head">
        <h3>{initial.name ? "Editar" : "Agregar"} Contacto</h3>
        <button className="m-close" onClick={onClose}>
          <i className="ri-close-line" />
        </button>
      </div>

      <div className="m-body">
        {/* ── Búsqueda por ID EmergeLens ── */}
        <div
          style={{
            background: "rgba(229,62,62,0.06)",
            border: "1px solid rgba(229,62,62,0.15)",
            borderRadius: "10px",
            padding: "12px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "8px",
            }}
          >
            <i
              className="ri-fingerprint-fill"
              style={{ color: "var(--red)", fontSize: "16px" }}
            />
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              Buscar por ID EmergeLens
            </span>
            <span
              style={{
                fontSize: "11px",
                color: "var(--muted)",
                marginLeft: "4px",
              }}
            >
              (opcional)
            </span>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              margin: "0 0 10px",
            }}
          >
            Si el contacto usa EmergeLens, ingresa su ID (ej: EL-1234) para
            llenar los campos automáticamente.
          </p>

          {foundId && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "#f0fdf4",
                border: "1px solid #16a34a44",
                borderRadius: "8px",
                padding: "6px 10px",
                marginBottom: "8px",
                fontSize: "12px",
                color: "#16a34a",
              }}
            >
              <i className="ri-checkbox-circle-fill" />
              <span>
                Vinculado a <strong>{foundId}</strong>
              </span>
              <button
                type="button"
                onClick={() => setFoundId("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#16a34a",
                  cursor: "pointer",
                  marginLeft: "auto",
                  fontSize: "14px",
                }}
              >
                ✕
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <div className="field-input" style={{ flex: 1, margin: 0 }}>
              <i className="ri-search-line" />
              <input
                type="text"
                placeholder="EL-1234"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value.toUpperCase())}
                onKeyDown={handleSearchKey}
                style={{ textTransform: "uppercase", letterSpacing: "1px" }}
              />
            </div>
            <button
              type="button"
              onClick={searchByEmergelensId}
              disabled={searching || !searchId.trim()}
              style={{
                background: searchId.trim() ? "var(--red)" : "#e2e8f0",
                color: searchId.trim() ? "#fff" : "#a0aec0",
                border: "none",
                borderRadius: "8px",
                padding: "0 16px",
                cursor: searchId.trim() ? "pointer" : "default",
                fontSize: "13px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                minHeight: "40px",
              }}
            >
              {searching ? (
                <i
                  className="ri-loader-4-line"
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                "Buscar"
              )}
            </button>
          </div>
        </div>

        {/* ── Campos del contacto ── */}
        <div className="field">
          <label>
            Nombre <span style={{ color: "#e53e3e" }}>*</span>
          </label>
          <div className="field-input">
            <i className="ri-user-fill" />
            <input
              placeholder="María García"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>
            Teléfono <span style={{ color: "#e53e3e" }}>*</span>
          </label>
          <div className="field-input">
            <i className="ri-phone-fill" />
            <input
              type="tel"
              placeholder="+1 809 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>Correo electrónico</label>
          <div className="field-input">
            <i className="ri-mail-fill" />
            <input
              type="email"
              placeholder="maria@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>Relación</label>
          <div className="field-input">
            <i className="ri-group-fill" />
            <select value={rel} onChange={(e) => setRel(e.target.value)}>
              <option>Madre</option>
              <option>Padre</option>
              <option>Hermano/a</option>
              <option>Esposo/a</option>
              <option>Amigo/a</option>
              <option>Otro</option>
            </select>
          </div>
        </div>

        <div className="check-row">
          <input
            type="checkbox"
            id="cPri"
            checked={pri}
            onChange={(e) => setPri(e.target.checked)}
          />
          <label htmlFor="cPri">Contacto principal</label>
        </div>
      </div>

      <div className="m-foot">
        <button className="btn btn-muted" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-red" onClick={save}>
          Guardar
        </button>
      </div>
    </>
  );
}
