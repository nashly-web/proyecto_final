import { createContext, useContext, useState } from "react";

// Store global (React Context) para compartir estado entre pantallas.
// Vive en memoria del navegador (se reinicia al refrescar).
const Ctx = createContext(null);

export function StoreProvider({ children }) {
  // Estado base de la app (identidad, perfil, contactos, etc.).
  const [user, setUserRaw] = useState(null);
  const [meds, setMeds] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [donations, setDonations] = useState([]);
  const [eType, setEType] = useState(null);
  const [blood, setBlood] = useState(null);
  const [pin, setPin] = useState("1234");
  const [medicalProfile, setMedicalProfile] = useState({
    allergies: "",
    conditions: "",
    healthIssues: "",
  });
  const [onboardingDone, setOnboardingDone] = useState(false);
  // RF23 — consentimiento de ubicación
  const [locConsent, setLocConsent] = useState(false);

  function setUser(valOrFn) {
    // setUser(valor) o setUser(prev => nuevoValor)
    setUserRaw((prev) =>
      typeof valOrFn === "function" ? valOrFn(prev) : valOrFn,
    );
  }

  function loadData() {
    // Datos demo para UI (solo si alguna pagina los usa).
    setMeds([
      {
        id: 1,
        name: "Ibuprofeno",
        dose: "400mg",
        time: "08:00",
        freq: "Cada 8 horas",
      },
      {
        id: 2,
        name: "Omeprazol",
        dose: "20mg",
        time: "07:00",
        freq: "Una vez al día",
      },
    ]);
    setDonations([
      {
        id: 1,
        title: "Tratamiento médico urgente",
        desc: "Juan necesita ayuda para su tratamiento de quimioterapia.",
        goal: 5000000,
        raised: 3250000,
      },
      {
        id: 2,
        title: "Reconstrucción de vivienda",
        desc: "Familia perdió su hogar en un incendio. Necesitan apoyo.",
        goal: 8000000,
        raised: 2100000,
      },
    ]);
  }

  const initials = (name) =>
    // Utilidad para mostrar iniciales en un avatar cuando no hay foto.
    (name || "UD")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <Ctx.Provider
      // Un solo objeto value con estado + setters para que las paginas lo consuman.
      value={{
        user,
        setUser,
        meds,
        setMeds,
        contacts,
        setContacts,
        donations,
        setDonations,
        eType,
        setEType,
        blood,
        setBlood,
        pin,
        setPin,
        medicalProfile,
        setMedicalProfile,
        onboardingDone,
        setOnboardingDone,
        locConsent,
        setLocConsent, // ← RF23
        loadData,
        initials,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);
