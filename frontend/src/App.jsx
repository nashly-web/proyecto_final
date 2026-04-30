import { useState, useEffect, useRef } from "react";
import { StoreProvider, useStore } from "./store";
import { ToastProvider, ModalProvider, useToast } from "./components/Providers";
import Welcome from "./pages/Welcome";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import EmergencyActive from "./pages/EmergencyActive";
import OnboardingForm from "./pages/Onboardingform";
import {
  configureMedReminders,
  refreshMedReminders,
  clearMedReminders,
} from "./lib/medReminders";
import "./index.css";
import "leaflet/dist/leaflet.css";

function AppInner() {
  // AppInner: controla el flujo de pantallas y jobs del lado del cliente
  // (recordatorios, polling de estado de emergencia, etc.).
  const { user, setUser, onboardingDone, setOnboardingDone } = useStore();
  const toast = useToast();
  const [page, setPage] = useState("welcome");
  const [authTab, setAuthTab] = useState("login");
  const [myAlert, setMyAlert] = useState(null);
  const lastAlertRef = useRef({ id: null, status: null });

  useEffect(() => {
    // Configura recordatorios de meds (notificaciones / timers locales).
    configureMedReminders({ toast });
  }, [toast]);

  useEffect(() => {
  // Tema automatico segun preferencia del sistema.
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const apply = (e) =>
  document.documentElement.classList.toggle("light", e.matches);
  apply(mq);
  mq.addEventListener("change", apply);
  return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    // Cuando hay usuario autenticado: refresca meds periodicamente.
    // Cuando no hay usuario: limpia timers/estado sensible.
    if (!user?.email) {
      clearMedReminders();
      setMyAlert(null);
      lastAlertRef.current = { id: null, status: null };
      return;
    }

    refreshMedReminders();
    const t = setInterval(refreshMedReminders, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [user?.email]);

  // Poll de estado de la alerta activa para que el usuario vea "seguimiento/resuelta"
  // sin tener que refrescar la pagina (y para cerrar el modo emergencia al resolverse).
  useEffect(() => {
    // Polling liviano contra /api/emergency/my-alert:
    // - si admin cambia estado (monitoring/resolved), el usuario se entera en vivo.
    if (!user?.email) return;
    let alive = true;

    async function poll() {
      try {
        const r = await fetch("/api/emergency/my-alert", {
          credentials: "include",
        });
        const d = await r.json();
        if (!alive) return;

        if (!r.ok || !d.ok || !d.has_alert) {
          setMyAlert(null);
          lastAlertRef.current = { id: null, status: null };
          return;
        }

        const next = {
          id: d.id,
          status: (d.status || "active").toLowerCase(),
          ts: d.ts,
          unit: d.unit || null,
        };
        setMyAlert(next);

        const prev = lastAlertRef.current;
        if (prev.id !== next.id) {
          lastAlertRef.current = { id: next.id, status: next.status };
          return;
        }

        if (prev.status && prev.status !== next.status) {
          lastAlertRef.current = { id: next.id, status: next.status };
          if (next.status === "monitoring") {
            toast("Tu emergencia esta en seguimiento.", "ok");
          } else if (next.status === "resolved") {
            toast("Tu emergencia fue marcada como resuelta.", "ok");
            if (page === "emergency") setPage("dash");
          }
        } else if (!prev.status) {
          lastAlertRef.current = { id: next.id, status: next.status };
        }
      } catch {}
    }

    poll();
    const t = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user?.email, toast, page]);

  useEffect(() => {
  // Auditoria simple de navegacion (best effort).
  // El backend decide si lo guarda/ignora segun session/roles.
  if (!user?.email) return;
  fetch("/api/audit/log", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
  email: user.email,
  action: "page_view",
  detail: `page=${page}`,
  }),
  }).catch(() => {});
  }, [page, user?.email]);

  function goAuth(tab) {
  // Navegacion: Welcome -> Auth (login/register)
  setAuthTab(tab);
  setPage("auth");
  }
  function goWelcome() {
  setPage("welcome");
  }

  function enterDash(isNewUser = false) {
  // Entrada a dashboard:
  // - si es usuario nuevo y falta onboarding, manda al formulario.
  if (isNewUser && !onboardingDone) {
  setPage("onboarding");
  } else {
  setPage("dash");
  toast("Bienvenido a EmergeLens!", "ok");
  }
  }

  function finishOnboarding() {
  // Marca onboarding como completo y entra al dashboard.
  setOnboardingDone(true);
  setPage("dash");
  toast("Bienvenido a EmergeLens!", "ok");
  }

  function logout() {
  // Cierra sesion local (el backend se encarga del logout real en /api/auth/logout).
  setUser(null);
  clearMedReminders();
  setPage("welcome");
  toast("Sesion cerrada", "ok");
  }

  function fireSOS() {
  // Cambia a la pantalla de emergencia activa.
  setPage("emergency");
  }
  function cancelEmergency() {
  setPage("dash");
  }

  return (
  <>
  {page === "welcome" && <Welcome onGoAuth={goAuth} />}
  {page === "auth" && (
  <Auth initialTab={authTab} onBack={goWelcome} onEnterDash={enterDash} />
  )}
  {page === "onboarding" && <OnboardingForm onDone={finishOnboarding} />}
  {page === "dash" && <Dashboard onLogout={logout} onFireSOS={fireSOS} />}
  {page === "emergency" && (
    <EmergencyActive onCancel={cancelEmergency} remoteAlert={myAlert} />
  )}
  </>
  );
}

export default function App() {
  // Providers globales:
  // - StoreProvider: estado compartido entre pantallas.
  // - ToastProvider/ModalProvider: UI helpers (notificaciones y modales).
  return (
  <StoreProvider>
  <ToastProvider>
  <ModalProvider>
  <AppInner />
  </ModalProvider>
  </ToastProvider>
  </StoreProvider>
  );
}
