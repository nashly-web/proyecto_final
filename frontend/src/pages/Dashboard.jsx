// Dashboard: "hub" principal despues de login.
// Contiene navegacion interna (secciones) y accesos a:
// - SOS / Emergencia
// - Perfil / Contactos / Info medica / Historial
// - Chat, Donaciones, Zona segura (geofence), Panel admin
import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import { useToast, useModal } from "../components/Providers";
import Home from "./Home";
import Profile from "./Profile";
import Contacts from "./Contacts";
import Medical from "./Medical";
import History from "./History";
import Chat from "./Chat";
import Donations from "./Donations";
import AdminAlerts from "./AdminAlerts";
import SafeZone from "./SafeZone"; // RF16
import NotifBell from "./Notifications";
import OperatorChat from "../components/OperatorChat";
import { useBattery, BatteryIcon } from "../hooks/useBattery";
import { useGeofence } from "../hooks/useGeofence"; // RF16
import { showSystemNotification } from "../lib/systemNotifications";

const ADMIN_EMAIL = "sosemergelens@gmail.com";

export default function Dashboard({ onLogout, onFireSOS }) {
  // Estado global (usuario, foto, etc.) + estado local (seccion visible).
  const { user, setUser, setEType, initials, loadData } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [section, setSection] = useState("home");
  const [showDD, setShowDD] = useState(false);
  const tipSentRef = useRef(false);
  const avatarRef = useRef(null);
  const dropdownRef = useRef(null);

  // Geofence alert state (para mostrar notificación visual)
  const [geoAlert, setGeoAlert] = useState(null); // { zone, eventType }
  const geoAlertRef = useRef(null);

  const {
    level: battLevel,
    charging: battCharging,
    supported: battSupported,
  } = useBattery();
  const battLow =
    battSupported && battLevel !== null && battLevel <= 20 && !battCharging;

  const isAdmin = user?.email === ADMIN_EMAIL;

  // ── RF16: Geofencing (solo para usuarios no-admin) ──────────────────────
  const handleGeofenceViolation = useCallback(
    ({ zone, eventType }) => {
      const isExit = eventType === "exit";
      const isDanger = zone.x_type === "danger";
      const msg = isExit
        ? `⚠️ Saliste de tu zona segura: ${zone.x_name}`
        : `🚨 Entraste a zona peligrosa: ${zone.x_name}`;

      setGeoAlert({ zone, eventType, msg });
      if (geoAlertRef.current) clearTimeout(geoAlertRef.current);
      geoAlertRef.current = setTimeout(() => setGeoAlert(null), 8000);

      // Toast visual adicional
      toast?.(msg, isExit || isDanger ? "err" : "warn");

      // Notificacion del navegador (si el permiso esta concedido).
      try {
        showSystemNotification(
          {
            title: isExit ? "Fuera de zona segura" : "Zona peligrosa",
            body: zone?.x_name ? `${zone.x_name}` : msg,
            tag: `geofence-${zone?.id || "x"}-${eventType}`,
            onClick: () => {
              // Si el usuario hace click en la notificacion del sistema, abrir SOS.
              if (!isExit && isDanger) {
                window.dispatchEvent(
                  new CustomEvent("emergelens:sos:start", {
                    detail: { eType: "security", autoCall: false },
                  }),
                );
              }
            },
          },
          toast,
        );
      } catch {}
    },
    [toast],
  );

  useGeofence({
    userEmail: user?.email,
    userId: user?.uid,
    onViolation: handleGeofenceViolation,
    enabled: !isAdmin && !!user?.uid,
  });

  useEffect(() => {
    loadData();
    fetch("/api/profile/", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          const nextPhoto = data.profile?.x_photo || null;
          setUser((u) => ({ ...u, photo: nextPhoto }));
        }
      })
      .catch(() => {});

    if (!tipSentRef.current) {
      tipSentRef.current = true;
      fetch("/api/notifications/daily-tip", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }
  }, []);

  // Permite disparar SOS desde notificaciones (SI/LLAMAR).
  useEffect(() => {
    function onStart(e) {
      const detail = e?.detail || {};
      const eType = (detail.eType || "security").toLowerCase();
      const autoCall = Boolean(detail.autoCall);
      try {
        setEType(eType);
        if (autoCall) sessionStorage.setItem("emergelens:auto_call", "1");
      } catch {}
      onFireSOS?.();
    }
    window.addEventListener("emergelens:sos:start", onStart);
    return () => window.removeEventListener("emergelens:sos:start", onStart);
  }, [onFireSOS, setEType]);

  useEffect(() => {
    function handler(e) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      if (avatarRef.current && avatarRef.current.contains(target)) return;
      setShowDD(false);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  useEffect(() => {
    const onAdminChatOpen = () => {
      if (isAdmin) go("admin");
    };
    window.addEventListener("adminOperatorChat:open", onAdminChatOpen);
    return () =>
      window.removeEventListener("adminOperatorChat:open", onAdminChatOpen);
  }, [isAdmin]);

  function go(s) {
    setSection(s);
    setShowDD(false);
  }

  const ini = initials(user.name);
  const avatar = user.photo || null;

  const AvatarImg = () =>
    avatar ? (
      <img
        src={avatar}
        alt="avatar"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "50%",
        }}
      />
    ) : (
      <span>{ini}</span>
    );

  const sections = {
    home: <Home onFireSOS={onFireSOS} onGoChat={() => go("chat")} />,
    profile: <Profile />,
    contacts: <Contacts />,
    medical: <Medical />,
    history: <History />,
    chat: <Chat onBack={() => go("home")} onFireSOS={onFireSOS} />,
    donations: <Donations />,
    admin: <AdminAlerts />,
    safezone: <SafeZone />, // RF16
  };

  return (
    <div className="dashboard">
      {/* TOP BAR */}
      <nav className="top-bar">
        <div className="tb-logo">
          <div className="tb-logo-icon">
            <img
              src="/src/assets/logo.png"
              alt="EmergeLens"
              className="tb-logo-img"
            />
          </div>
          <span>EmergeLens</span>
        </div>

        <div className="tb-actions">
          {battSupported && battLevel !== null && (
            <div
              className={`tb-battery ${battLow ? "tb-battery--low" : ""}`}
              title={`Bateria: ${battLevel}%${battCharging ? " - Cargando" : ""}`}
            >
              <BatteryIcon
                level={battLevel}
                charging={battCharging}
                size={17}
              />
              <span className="tb-battery-label">{battLevel}%</span>
            </div>
          )}
          <NotifBell isAdmin={user.email === ADMIN_EMAIL} />
          <div
            className="tb-avatar"
            ref={avatarRef}
            role="button"
            tabIndex={0}
            aria-label="Abrir menú de usuario"
            onClick={() => setShowDD((p) => !p)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setShowDD((p) => !p);
            }}
          >
            <AvatarImg />
          </div>
        </div>
      </nav>

      {/* DROPDOWN */}
      {showDD && (
        <div className="dropdown" ref={dropdownRef}>
          <div className="dd-head">
            <div className="dd-av">
              <AvatarImg />
            </div>
            <h4>{user.name}</h4>
            <p>{user.email}</p>
            {battSupported && battLevel !== null && (
              <div className={`dd-battery ${battLow ? "dd-battery--low" : ""}`}>
                <BatteryIcon
                  level={battLevel}
                  charging={battCharging}
                  size={15}
                />
                <span>
                  {battLevel}%{battCharging ? " - Cargando" : ""}
                  {battLow ? " - Carga pronto" : ""}
                </span>
              </div>
            )}
          </div>
          <div className="dd-menu">
            {user.email === ADMIN_EMAIL && (
              <button className="dd-item" onClick={() => go("admin")}>
                <i className="ri-dashboard-2-fill" /> Panel Admin
              </button>
            )}
            <button className="dd-item" onClick={() => go("profile")}>
              <i className="ri-user-fill" /> Mi Perfil
            </button>
            <button className="dd-item" onClick={() => go("contacts")}>
              <i className="ri-contacts-fill" /> Contactos
            </button>
            <button className="dd-item" onClick={() => go("medical")}>
              <i className="ri-medicine-bottle-fill" /> Info Medica
            </button>
            <button className="dd-item" onClick={() => go("history")}>
              <i className="ri-history-fill" /> Historial
            </button>
            {/* RF16: acceso zona segura solo para usuarios */}
            {!isAdmin && (
              <button className="dd-item" onClick={() => go("safezone")}>
                <i
                  className="ri-shield-check-fill"
                  style={{ color: "#22d3b7" }}
                />{" "}
                Zona Segura
              </button>
            )}
            <button className="dd-item danger" onClick={onLogout}>
              <i className="ri-logout-box-fill" /> Cerrar Sesion
            </button>
          </div>
        </div>
      )}

      <main className="main">{sections[section]}</main>

      {/* BOTTOM NAV */}
      <nav className="bnav">
        <button
          id="bnHome"
          className={`bnav-item ${section === "home" ? "on" : ""}`}
          onClick={() => go("home")}
        >
          <i className="ri-home-5-fill" />
          <span>Inicio</span>
        </button>
        <button
          id="bnChat"
          className={`bnav-item ${section === "chat" ? "on" : ""}`}
          onClick={() => go("chat")}
        >
          <i className="ri-chat-3-fill" />
          <span>Chat</span>
        </button>
        {/* RF16: botón zona segura en bottom nav (solo usuarios) */}
        {!isAdmin && (
          <button
            className={`bnav-item ${section === "safezone" ? "on" : ""}`}
            onClick={() => go("safezone")}
          >
            <i className="ri-shield-check-fill" />
            <span>Zona</span>
          </button>
        )}
        <button
          id="bnDon"
          className={`bnav-item ${section === "donations" ? "on" : ""}`}
          onClick={() => go("donations")}
        >
          <i className="ri-hand-heart-fill" />
          <span>Donar</span>
        </button>
        <button
          id="bnProf"
          className={`bnav-item ${["profile", "contacts", "medical", "history"].includes(section) ? "on" : ""}`}
          onClick={() => go("profile")}
        >
          <i className="ri-user-fill" />
          <span>Perfil</span>
        </button>
      </nav>

      {/* Chat flotante operador (solo para usuarios, no admin) */}
      <OperatorChat />

      {/* RF16: Notificacion visual de violacion de zona ─────────────────── */}
      {geoAlert && (
        <div
          style={{
            position: "fixed",
            top: 70,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9000,
            background:
              geoAlert.eventType === "exit" || geoAlert.zone.x_type === "danger"
                ? "linear-gradient(135deg,#b91c1c,#7f1d1d)"
                : "linear-gradient(135deg,#0f766e,#134e4a)",
            color: "#fff",
            borderRadius: 14,
            padding: "14px 20px",
            maxWidth: "calc(100vw - 40px)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            animation: "fadeUp 0.3s ease",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 22 }}>
            {geoAlert.eventType === "exit" ? "⚠️" : "🚨"}
          </span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              {geoAlert.eventType === "exit"
                ? "Saliste de tu zona segura"
                : "Zona peligrosa detectada"}
            </div>
            <div style={{ opacity: 0.85, fontSize: 12 }}>
              {geoAlert.zone.x_name}
            </div>
          </div>
          <button
            onClick={() => setGeoAlert(null)}
            style={{
              marginLeft: "auto",
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              width: 26,
              height: 26,
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
