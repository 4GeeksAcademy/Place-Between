import { getToken } from "./authService";

const API_BASE = import.meta.env.VITE_BACKEND_URL || "";

async function parseError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {}

  return (
    payload?.msg ||
    payload?.message ||
    payload?.error ||
    (res.status === 401 ? "No autorizado." : null) ||
    "Error de servidor."
  );
}

function authHeaders() {
  const token = getToken();
  if (!token) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function listGoals() {
  const res = await fetch(`${API_BASE}/api/goals`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

export async function createGoal(payload) {
  const res = await fetch(`${API_BASE}/api/goals`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

export async function updateGoal(id, payload) {
  const res = await fetch(`${API_BASE}/api/goals/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

export async function deleteGoal(id) {
  const res = await fetch(`${API_BASE}/api/goals/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

export async function addGoalProgress(
  id,
  { delta_value, note, daily_session_id } = {},
) {
  const res = await fetch(`${API_BASE}/api/goals/${id}/progress`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ delta_value, note, daily_session_id }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

export async function completeGoal(id, { daily_session_id } = {}) {
  const res = await fetch(`${API_BASE}/api/goals/${id}/complete`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ daily_session_id }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}
