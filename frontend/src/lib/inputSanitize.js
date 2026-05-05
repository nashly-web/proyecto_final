export const PHONE_DIGITS = 10;

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

// Keeps the last 10 digits so inputs like "+1 809 555 1234" become "8095551234".
export function sanitizePhone10(value) {
  const d = digitsOnly(value);
  if (d.length <= PHONE_DIGITS) return d;
  return d.slice(-PHONE_DIGITS);
}

export function isPhone10(value) {
  return digitsOnly(value).length === PHONE_DIGITS;
}

export function sanitizePin4(value) {
  return digitsOnly(value).slice(0, 4);
}

export function trimMax(value, maxLen) {
  return String(value || "").slice(0, maxLen);
}

export function clampIntString(value, min, max) {
  const raw = String(value ?? "");
  if (raw.trim() === "") return "";
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return "";
  return String(Math.max(min, Math.min(max, n)));
}

