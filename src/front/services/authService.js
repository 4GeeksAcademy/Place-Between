// src/front/services/authService.js
// Compatible con tu backend:
// POST /api/register y POST /api/login
// Token: access_token
// Mensajes: { msg: "..." }

const API_BASE = import.meta.env.VITE_BACKEND_URL || "";

async function parseError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {}

  const msg =
    payload?.msg ||
    payload?.message ||
    payload?.error ||
    (res.status === 401 ? "Credenciales inválidas." : null) ||
    "Ha ocurrido un error. Inténtalo de nuevo.";

  return msg;
}

export async function login({ email, password, remember_me }) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      remember_me: !!remember_me,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res));

  const data = await res.json();
  const token = data.access_token;

  if (!token)
    throw new Error("Respuesta inválida del servidor (token no encontrado).");

  localStorage.setItem("pb_token", token);
  // Guardamos user si viene (útil para UI)
  if (data.user) localStorage.setItem("pb_user", JSON.stringify(data.user));

  return data;
}

export async function register({
  email,
  username,
  password,
  timezone = "UTC",
}) {
  const res = await fetch(`${API_BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password, timezone }),
  });

  if (!res.ok) throw new Error(await parseError(res));

  // Devuelve { msg, user } en backend
  return await res.json().catch(() => ({}));
}

export function logout() {
  localStorage.removeItem("pb_token");
  localStorage.removeItem("pb_user");
}

export function getToken() {
  return localStorage.getItem("pb_token");
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("pb_user") || "null");
  } catch {
    return null;
  }
}

export function getUserScope() {
  try {
    const u = JSON.parse(localStorage.getItem("pb_user") || "null");
    return u?.id ? `u${u.id}` : "anon";
  } catch {
    return "anon";
  }
}
