// Recordatorios de medicamentos (lado cliente).
// Maneja timers locales y opcionalmente notificaciones del sistema.
import { showSystemNotification, getSystemNotificationPermission } from "./systemNotifications";

const timers = new Map(); // medId -> timeoutId
let toastFn = null;
const CATCH_UP_WINDOW_MS = 60 * 60 * 1000; // si la app estuvo en background/suspensa, recordarlo al volver (hasta 1h)
const RESUME_IMMEDIATE_MS = 500;
const LS_KEY_PREFIX = "emergelens_medrem_last_";
let listenersReady = false;
let lastRefreshAt = 0;

function _todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function _loadLastFired(medId) {
  try {
    const raw = localStorage.getItem(`${LS_KEY_PREFIX}${medId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.day !== "string") return null;
    return { day: parsed.day, at: Number(parsed.at || 0) };
  } catch {
    return null;
  }
}

function _saveLastFired(medId, when = new Date()) {
  try {
    localStorage.setItem(
      `${LS_KEY_PREFIX}${medId}`,
      JSON.stringify({ day: _todayKey(when), at: when.getTime() }),
    );
  } catch {
    // ignore
  }
}

function parseMedTime(timeStr) {
  const s = String(timeStr || "").trim();
  if (!s) return null;

  // HH:MM (o H:MM)
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hh, mm };
  }

  // H:MM AM/PM
  m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(s);
  if (m) {
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ap = String(m[3] || "").toLowerCase();
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
    hh = hh % 12;
    if (ap === "pm") hh += 12;
    return { hh, mm };
  }

  return null;
}

function nextDueAt(med, { hh, mm }) {
  const now = new Date();
  const due = new Date(now);
  due.setHours(hh, mm, 0, 0);
  if (due.getTime() <= now.getTime()) {
    const last = _loadLastFired(med?.id);
    const today = _todayKey(now);
    // Si hoy ya disparo, no repetir: agendar para mañana.
    if (last?.day === today) {
      due.setDate(due.getDate() + 1);
      return due;
    }
    // Si ya paso y la app estuvo en pausa/background, recordarlo al volver (ventana limitada).
    if (now.getTime() - due.getTime() <= CATCH_UP_WINDOW_MS) {
      return new Date(now.getTime() + RESUME_IMMEDIATE_MS);
    }
    due.setDate(due.getDate() + 1);
  }
  return due;
}

function clearAll() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

function notifyForMed(med, due) {
  _saveLastFired(med.id, new Date());
  const title = "Recordatorio de medicamento";
  const body = `Es hora de tomar ${med.name || "tu medicamento"}${med.dose ? ` (${med.dose})` : ""}.`;
  const tag = `med-${med.id || med.name || "x"}-${String(med.time || "")}`;

  const ok = showSystemNotification({ title, body, tag }, toastFn);
  if (!ok && getSystemNotificationPermission() !== "granted") {
    toastFn?.("Activa notificaciones para ver recordatorios del sistema", "err");
  }

  // Persistir en "Notificaciones" (campana) para que aparezca en la lista.
  try {
    fetch("/api/notifications/mine/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: "med_reminder",
        name: `Recordatorio ${med.name || "medicamento"} - ${String(med.time || "").trim()}`,
        message: body,
      }),
    }).catch(() => {});
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("emergelens:notif:refresh"));
    }
  } catch {
    // ignore
  }

  // Reprogramar para el siguiente ciclo (mantiene recordatorios diarios mientras la app este abierta)
  scheduleOne(med, new Date(due.getTime() + 24 * 60 * 60 * 1000));
}

function scheduleOne(med, dueOverride = null) {
  if (!med || !med.time || !med.id) return;
  if (String(med.freq || "").toLowerCase().includes("necesidad")) return;

  const parsed = parseMedTime(med.time);
  if (!parsed) return;

  const due = dueOverride || nextDueAt(med, parsed);
  const delay = Math.max(0, due.getTime() - Date.now());
  const id = med.id;

  if (timers.has(id)) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }

  const t = setTimeout(() => notifyForMed(med, due), delay);
  timers.set(id, t);
}

export function configureMedReminders({ toast } = {}) {
  toastFn = toast || null;

  if (listenersReady || typeof window === "undefined") return;
  listenersReady = true;

  const maybeRefresh = () => {
    const now = Date.now();
    if (now - lastRefreshAt < 15 * 1000) return; // simple throttle
    lastRefreshAt = now;
    refreshMedReminders();
  };

  window.addEventListener("focus", maybeRefresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) maybeRefresh();
  });
}

export function rescheduleMedReminders(meds = []) {
  clearAll();
  for (const m of meds || []) scheduleOne(m);
}

export function clearMedReminders() {
  clearAll();
}

export async function refreshMedReminders() {
  try {
    const r = await fetch("/api/meds/", { credentials: "include" });
    const d = await r.json();
    if (d?.ok) rescheduleMedReminders(d.meds || []);
  } catch {
    // silent
  }
}
