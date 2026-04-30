const API = "/api";

async function call(endpoint, method = "GET", body = null) {
  // Helper unico para hablar con el backend Flask:
  // - Siempre usa /api/*
  // - Envia/recibe JSON
  // - Incluye cookies (credentials) para mantener la session (login)
  const opts = {
  method,
  headers: { "Content-Type": "application/json" },
  credentials: "include", // mantiene la sesion Flask
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${endpoint}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error del servidor");
  return data;
}

// --- AUTH ------------------------------------------------------------------
// Operaciones de autenticacion (login/registro/logout) contra el backend,
// que a su vez valida credenciales en Odoo y guarda uid/email en la session.

export async function odooLogin(email, password) {
  const data = await call("/auth/login", "POST", { email, password });
  return data.user;
}

export async function odooRegister(name, email, password) {
  const data = await call("/auth/register", "POST", { name, email, password });
  return data; // { uid, name, email }
}

export async function odooLogout() {
  await call("/auth/logout", "POST");
}

export async function getMe() {
  return await call("/auth/me");
}

// --- PERFIL MEDICO ---------------------------------------------------------
// Lectura/guardado del perfil medico (y contactos) que vive en Odoo
// (modelo custom x.emergelens.profile).

export async function odooSaveMedicalProfile(uid, data) {
  await call("/profile/", "POST", data);
}

export async function odooGetMedicalProfile() {
  const data = await call("/profile/");
  return data.profile;
}

// --- CONTACTOS DE EMERGENCIA -----------------------------------------------
// CRUD de contactos de emergencia (para el usuario autenticado).
// Nota: el backend valida uid desde la session; el frontend no manda uid real.

export async function odooGetContacts() {
  const data = await call("/contacts/");
  return data.contacts;
}

export async function odooCreateContact(parentId, contact) {
  const data = await call("/contacts/", "POST", contact);
  return data.id;
}

export async function odooUpdateContact(contactId, contact) {
  await call(`/contacts/${contactId}`, "PUT", contact);
}

export async function odooDeleteContact(contactId) {
  await call(`/contacts/${contactId}`, "DELETE");
}
