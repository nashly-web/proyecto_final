// Medical: formulario de informacion medica del usuario.
// Estos datos se incluyen en el correo SOS para ayudar a los contactos/operadores.
import { useState, useEffect, useCallback } from "react";
import { useToast, useModal } from "../components/Providers";
import { refreshMedReminders } from "../lib/medReminders";
import { requestSystemNotificationPermission } from "../lib/systemNotifications";

const FREQS = [
  "Una vez al dia",
  "Cada 8 horas",
  "Cada 12 horas",
  "Segun necesidad",
];

export default function Medical() {
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMeds = useCallback(async () => {
  try {
  const r = await fetch("/api/meds/", { credentials: "include" });
  const d = await r.json();
  if (d.ok) setMeds(d.meds);
  } catch {
  } finally {
  setLoading(false);
  }
  }, []);

  useEffect(() => {
  loadMeds();
  }, [loadMeds]);

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
  toast("Medicamento agregado ", "ok");
  } else {
  toast(d.error || "Error al guardar", "err");
  }
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
  toast("Actualizado ", "ok");
  } else {
  toast(d.error || "Error al actualizar", "err");
  }
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
  } else {
  toast(d.error || "Error al eliminar", "err");
  }
  }

  return (
  <section id="secMedical">
  <div className="card">
  <div className="card-title">
  <div className="ic teal">
  <i className="ri-medicine-bottle-fill" />
  </div>
  <h3>Mis Medicamentos</h3>
  </div>

  {loading ? (
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
  {m.dose}  {m.freq}
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
