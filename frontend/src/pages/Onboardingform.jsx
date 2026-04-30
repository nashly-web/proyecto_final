// Onboardingform: formulario inicial para nuevos usuarios.
// Se usa antes del dashboard para completar datos basicos.
import { useState } from "react";
import { useStore } from "../store";
import { useToast } from "../components/Providers";

const API = "/api";

export default function OnboardingForm({ onDone }) {
  const { setUser, setBlood, setMedicalProfile, setContacts, user } = useStore();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const TOTAL = 4;

  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(user.phone || "");
  const [email, setEmail] = useState(user.email || "");

  const [blood, setBloodLocal] = useState("");
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");
  const [healthIssues, setHealthIssues] = useState("");

  const [ec1Name,  setEc1Name]  = useState("");
  const [ec1Phone, setEc1Phone] = useState("");
  const [ec1Email, setEc1Email] = useState("");
  const [ec1Rel,  setEc1Rel]  = useState("Madre");

  const [ec2Name,  setEc2Name]  = useState("");
  const [ec2Phone, setEc2Phone] = useState("");
  const [ec2Email, setEc2Email] = useState("");
  const [ec2Rel,  setEc2Rel]  = useState("Padre");

  function nextStep() {
  if (step === 1 && (!age || !sex || !address || !phone || !email)) {
  toast("Completa todos los campos", "err"); return;
  }
  if (step === 2 && !blood) {
  toast("Selecciona tu tipo de sangre", "err"); return;
  }
  if (step === 3 && (!ec1Name || !ec1Phone || !ec1Email)) {
  toast("Completa el primer contacto (nombre, telefono y email)", "err"); return;
  }
  setStep(s => s + 1);
  }

  function prevStep() { setStep(s => s - 1); }

  async function finish(e) {
  e.preventDefault();
  if (!ec2Name || !ec2Phone || !ec2Email) {
  toast("Completa el segundo contacto (nombre, telefono y email)", "err"); return;
  }
  setLoading(true);
  try {
  const res = await fetch(`${API}/profile/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
  name: user.name || "Perfil",
  age, sex, address, phone, blood,
  allergies, conditions, healthIssues,
  ec1Name, ec1Phone, ec1Email, ec1Rel,
  ec2Name, ec2Phone, ec2Email, ec2Rel,
  }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error al guardar");

  setUser(u => ({ ...u, phone, email, address, age, sex }));
  setBlood(blood);
  setMedicalProfile({ allergies, conditions, healthIssues });
  setContacts([
  { id: 1, name: ec1Name, phone: ec1Phone, email: ec1Email, rel: ec1Rel, primary: true },
  { id: 2, name: ec2Name, phone: ec2Phone, email: ec2Email, rel: ec2Rel, primary: false },
  ]);

  toast("Perfil completado!", "ok");
  onDone();
  } catch (err) {
  toast(err.message || "Error al guardar perfil", "err");
  } finally {
  setLoading(false);
  }
  }

  const RELS  = ["Madre", "Padre", "Hermano/a", "Esposo/a", "Amigo/a", "Otro"];
  const BLOODS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  return (
  <div className="auth-page">
  <div className="auth-visual">
  <div className="auth-visual-inner">
  <div className="av-rings">
  <div className="av-ring" /><div className="av-ring" /><div className="av-ring" />
  <div className="av-center"><i className="ri-heart-pulse-fill" /></div>
  </div>
  <h2 className="av-title">Completa tu <span>Perfil</span></h2>
  <p className="av-desc">Esta informacion es clave para ayudarte mejor en caso de emergencia.</p>
  <div className="av-stats">
  <div className="av-stat"><strong>{step}/{TOTAL}</strong><span>Pasos</span></div>
  <div className="av-stat"><strong>100%</strong><span>Seguro</span></div>
  <div className="av-stat"><strong>1 vez</strong><span>Solo ahora</span></div>
  </div>
  </div>
  </div>

  <div className="auth-form-panel">
  <div className="auth-form-wrap">
  <div className="auth-logo-sm">
  <img
  src="/src/assets/logo.png"
  alt="EmergeLens"
  style={{ width: "110px", height: "110px", objectFit: "contain" }}
  />
  </div>
  <h2 className="auth-heading">
  {step === 1 && "Datos Personales"}
  {step === 2 && "Informacion Medica"}
  {step === 3 && "Contacto de Emergencia 1"}
  {step === 4 && "Contacto de Emergencia 2"}
  </h2>
  <p className="auth-sub">Paso {step} de {TOTAL}</p>

  <div className="stepper">
  {[1,2,3,4].map((s,i) => (
  <span key={s}>
  <div className={`step-dot ${step===s ? "active" : ""} ${step>s ? "done" : ""}`} />
  {i < 3 && <div className="step-line" />}
  </span>
  ))}
  </div>

  <form onSubmit={finish}>
  {step === 1 && (
  <div>
  <div className="field"><label>Edad</label>
  <div className="field-input"><i className="ri-calendar-fill" />
  <input type="number" min="1" max="120" placeholder="Ej: 28" value={age} onChange={e => setAge(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Sexo</label>
  <div className="field-input"><i className="ri-user-fill" />
  <select value={sex} onChange={e => setSex(e.target.value)}>
  <option value="">Selecciona...</option>
  <option>Masculino</option><option>Femenino</option>
  <option>Otro</option><option>Prefiero no decir</option>
  </select>
  </div>
  </div>
  <div className="field"><label>Direccion</label>
  <div className="field-input"><i className="ri-map-pin-fill" />
  <input type="text" placeholder="Calle 123 #45-67" value={address} onChange={e => setAddress(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Telefono</label>
  <div className="field-input"><i className="ri-phone-fill" />
  <input type="tel" placeholder="+1 809 000 0000" value={phone} onChange={e => setPhone(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Correo electronico</label>
  <div className="field-input"><i className="ri-mail-fill" />
  <input type="email" placeholder="tucorreo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} />
  </div>
  </div>
  <button type="button" className="btn btn-red auth-submit" onClick={nextStep}>
  Siguiente <i className="ri-arrow-right-line" />
  </button>
  </div>
  )}

  {step === 2 && (
  <div>
  <div className="profile-sec" style={{ marginBottom: 16 }}>
  <h4>Tipo de Sangre</h4>
  <div className="blood-grid">
  {BLOODS.map(b => (
  <button key={b} type="button" className={`bl-btn ${blood===b ? "sel" : ""}`} onClick={() => setBloodLocal(b)}>{b}</button>
  ))}
  </div>
  </div>
  <div className="field"><label>Alergias</label>
  <div className="field-input"><i className="ri-alert-fill" />
  <textarea rows={2} style={{ paddingTop:14 }} placeholder="Ej: Polen, Penicilina..." value={allergies} onChange={e => setAllergies(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Condiciones medicas</label>
  <div className="field-input"><i className="ri-file-list-fill" />
  <textarea rows={2} style={{ paddingTop:14 }} placeholder="Ej: Diabetes, Hipertension..." value={conditions} onChange={e => setConditions(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Problemas de salud adicionales</label>
  <div className="field-input"><i className="ri-heart-pulse-fill" />
  <textarea rows={2} style={{ paddingTop:14 }} placeholder="Cualquier otra informacion relevante..." value={healthIssues} onChange={e => setHealthIssues(e.target.value)} />
  </div>
  </div>
  <div style={{ display:"flex", gap:10 }}>
  <button type="button" className="btn btn-muted" style={{ flex:1, justifyContent:"center" }} onClick={prevStep}>
  <i className="ri-arrow-left-line" /> Atras
  </button>
  <button type="button" className="btn btn-red" style={{ flex:1, justifyContent:"center" }} onClick={nextStep}>
  Siguiente <i className="ri-arrow-right-line" />
  </button>
  </div>
  </div>
  )}

  {step === 3 && (
  <div>
  <p style={{ color:"var(--muted)", fontSize:".88rem", marginBottom:16 }}>
  Contacto <strong>principal</strong> de emergencia.
  </p>
  <div className="field"><label>Nombre completo</label>
  <div className="field-input"><i className="ri-user-fill" />
  <input type="text" placeholder="Maria Garcia" value={ec1Name} onChange={e => setEc1Name(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Telefono</label>
  <div className="field-input"><i className="ri-phone-fill" />
  <input type="tel" placeholder="+1 809 000 0000" value={ec1Phone} onChange={e => setEc1Phone(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Correo electronico</label>
  <div className="field-input"><i className="ri-mail-fill" />
  <input type="email" placeholder="maria@email.com" value={ec1Email} onChange={e => setEc1Email(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Relacion</label>
  <div className="field-input"><i className="ri-group-fill" />
  <select value={ec1Rel} onChange={e => setEc1Rel(e.target.value)}>
  {RELS.map(r => <option key={r}>{r}</option>)}
  </select>
  </div>
  </div>
  <div style={{ display:"flex", gap:10 }}>
  <button type="button" className="btn btn-muted" style={{ flex:1, justifyContent:"center" }} onClick={prevStep}>
  <i className="ri-arrow-left-line" /> Atras
  </button>
  <button type="button" className="btn btn-red" style={{ flex:1, justifyContent:"center" }} onClick={nextStep}>
  Siguiente <i className="ri-arrow-right-line" />
  </button>
  </div>
  </div>
  )}

  {step === 4 && (
  <div>
  <p style={{ color:"var(--muted)", fontSize:".88rem", marginBottom:16 }}>
  Segundo contacto de emergencia como respaldo.
  </p>
  <div className="field"><label>Nombre completo</label>
  <div className="field-input"><i className="ri-user-fill" />
  <input type="text" placeholder="Carlos Perez" value={ec2Name} onChange={e => setEc2Name(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Telefono</label>
  <div className="field-input"><i className="ri-phone-fill" />
  <input type="tel" placeholder="+1 809 000 0000" value={ec2Phone} onChange={e => setEc2Phone(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Correo electronico</label>
  <div className="field-input"><i className="ri-mail-fill" />
  <input type="email" placeholder="carlos@email.com" value={ec2Email} onChange={e => setEc2Email(e.target.value)} />
  </div>
  </div>
  <div className="field"><label>Relacion</label>
  <div className="field-input"><i className="ri-group-fill" />
  <select value={ec2Rel} onChange={e => setEc2Rel(e.target.value)}>
  {RELS.map(r => <option key={r}>{r}</option>)}
  </select>
  </div>
  </div>
  <div style={{ display:"flex", gap:10 }}>
  <button type="button" className="btn btn-muted" style={{ flex:1, justifyContent:"center" }} onClick={prevStep}>
  <i className="ri-arrow-left-line" /> Atras
  </button>
  <button type="submit" className="btn btn-red" style={{ flex:1, justifyContent:"center" }} disabled={loading}>
  {loading ? <><i className="ri-loader-4-line" /> Guardando...</> : <><i className="ri-check-fill" /> Finalizar</>}
  </button>
  </div>
  </div>
  )}
  </form>
  </div>
  </div>
  </div>
  );
}
