// Notificaciones del sistema (Web Notifications API).
// Este modulo encapsula permisos y el show() para reutilizarlo en la app.
import logoUrl from "../assets/logo.png";

const ICON_URL = logoUrl;

export function canUseSystemNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getSystemNotificationPermission() {
  if (!canUseSystemNotifications()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function requestSystemNotificationPermission(toast) {
  if (!canUseSystemNotifications()) {
    toast?.("Tu navegador no soporta notificaciones", "err");
    return false;
  }
  if (!window.isSecureContext) {
    toast?.("Para notificaciones, abre la app en HTTPS (o localhost)", "err");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    toast?.("Activa las notificaciones en el navegador para recibir recordatorios", "err");
    return false;
  }

  try {
    const p = await Notification.requestPermission();
    if (p === "granted") return true;
    toast?.("Permiso de notificaciones no concedido", "err");
    return false;
  } catch {
    toast?.("No se pudo solicitar permiso de notificaciones", "err");
    return false;
  }
}

export function showSystemNotification({ title, body, tag, onClick } = {}, toast) {
  if (!canUseSystemNotifications()) {
    toast?.(body || title || "Notificacion", "ok");
    return false;
  }
  if (Notification.permission !== "granted") {
    toast?.(body || title || "Notificacion", "ok");
    return false;
  }

  try {
    // requireInteraction: intenta dejarla visible (Chrome/Edge); otros navegadores lo ignoran.
    // tag: evita duplicados si se re-dispara la misma notificacion.
    const n = new Notification(title || "EmergeLens", {
      body: body || "",
      icon: ICON_URL,
      badge: ICON_URL,
      tag: tag || undefined,
      renotify: Boolean(tag),
      requireInteraction: true,
    });
    if (typeof onClick === "function") {
      n.onclick = (ev) => {
        try {
          ev?.preventDefault?.();
        } catch {}
        try {
          window.focus?.();
        } catch {}
        try {
          onClick();
        } catch {}
        try {
          n.close?.();
        } catch {}
      };
    }
    return true;
  } catch {
    toast?.(body || title || "Notificacion", "ok");
    return false;
  }
}
