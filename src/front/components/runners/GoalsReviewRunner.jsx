import React, { useEffect, useMemo, useState } from "react";
import goalTemplates from "../../data/goalTemplates.seed.json";

/**
 * GoalsReviewRunner (v2)
 * - Muestra SOLO goals pendientes (no completados) para avanzar.
 * - Si no hay pendientes: muestra creación (preset/custom).
 * - Si hay pendientes: muestra lista + opción de crear goal nuevo (colapsable).
 * - Completa actividad automáticamente al:
 *    a) añadir avance en un goal pendiente, o
 *    b) crear un goal nuevo.
 */

const API_BASE = String(import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
const getToken = () => localStorage.getItem("pb_token");

const authHeaders = () => {
    const token = getToken();
    if (!token) return null;
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
};

// ---------------- API (ajusta URLs si difieren) ----------------
async function apiGetGoals() {
    if (!API_BASE) throw new Error("VITE_BACKEND_URL no está configurado.");
    const headers = authHeaders();
    if (!headers) throw new Error("No hay token. Inicia sesión.");

    // Traemos goals en general; si tu backend soporta status=active puedes dejarlo,
    // pero filtraremos pendientes en frontend sí o sí.
    const res = await fetch(`${API_BASE}/api/goals?status=active`, { headers });
    const payload = await res.json().catch(() => null);

    if (!res.ok) throw new Error(payload?.message || payload?.msg || `Error ${res.status}`);

    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.goals)) return payload.goals;
    return [];
}

async function apiCreateGoal(goalPayload) {
    if (!API_BASE) throw new Error("VITE_BACKEND_URL no está configurado.");
    const headers = authHeaders();
    if (!headers) throw new Error("No hay token. Inicia sesión.");

    const res = await fetch(`${API_BASE}/api/goals`, {
        method: "POST",
        headers,
        body: JSON.stringify(goalPayload),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.message || payload?.msg || `Error ${res.status}`);
    return payload;
}

async function apiAddGoalProgress(goalId, delta = 1) {
  if (!API_BASE) throw new Error("VITE_BACKEND_URL no está configurado.");
  const headers = authHeaders();
  if (!headers) throw new Error("No hay token. Inicia sesión.");

  const deltaInt = Number.parseInt(delta, 10);

  // Intento A: PATCH /api/goals/:id 
  try {
    const resA = await fetch(`${API_BASE}/api/goals/${goalId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        delta_value: deltaInt,

        // (opcional) compat por si luego cambia backend o hay variantes
        delta: deltaInt,
        progress_delta: deltaInt,
      }),
    });

    const payloadA = await resA.json().catch(() => null);
    if (resA.ok) return payloadA;
  } catch (_e) {
    // seguimos al fallback
  }

  // Intento B: POST /api/goals/:id/progress (igual: delta_value)
  const resB = await fetch(`${API_BASE}/api/goals/${goalId}/progress`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      delta_value: deltaInt,
      delta: deltaInt,
      progress_delta: deltaInt,
    }),
  });

  const payloadB = await resB.json().catch(() => null);
  if (!resB.ok) {
    throw new Error(payloadB?.message || payloadB?.msg || `Error ${resB.status}`);
  }
  return payloadB;
}


// ---------------- Helpers ----------------
const clampNum = (v, min, max) => Math.max(min, Math.min(max, v));
const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const formatProgress = (g) => {
    const current =
        safeNum(g.progress_value, NaN) ??
        safeNum(g.progress, NaN) ??
        safeNum(g.current_value, NaN) ??
        0;

    const target =
        safeNum(g.target_value, NaN) ??
        safeNum(g.target, NaN) ??
        safeNum(g.goal_value, NaN) ??
        1;

    return { current: Number.isFinite(current) ? current : 0, target: Number.isFinite(target) ? target : 1 };
};

/**
 * Detecta si un goal está completado usando múltiples campos posibles.
 * (esto evita depender de un único schema)
 */
const isGoalCompleted = (g) => {
    // muy común: completed_at string/Date
    if (g?.completed_at) return true;

    // flags típicos
    if (g?.is_completed === true) return true;
    if (g?.completed === true) return true;

    // status típico
    if (typeof g?.status === "string" && g.status.toLowerCase() === "completed") return true;

    // fallback por progreso >= target (solo si ambos son válidos)
    const { current, target } = formatProgress(g);
    if (Number.isFinite(current) && Number.isFinite(target) && target > 0 && current >= target) {
        // OJO: si tu sistema permite sobrepasar target y aún así no marcar completed,
        // este fallback puede ser demasiado agresivo. Si te molesta, quítalo.
        return true;
    }

    return false;
};

export const GoalsReviewRunner = ({ activity, onSaved }) => {
    const templates = useMemo(() => (Array.isArray(goalTemplates) ? goalTemplates : []), []);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [goals, setGoals] = useState([]);

    // create UI
    const [showCreate, setShowCreate] = useState(false);
    const [mode, setMode] = useState("preset"); // preset | custom
    const [templateId, setTemplateId] = useState(templates?.[0]?.id || "");

    // custom fields
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [frequency, setFrequency] = useState("daily");
    const [size, setSize] = useState("small");
    const [targetValue, setTargetValue] = useState(1);
    const [pointsReward, setPointsReward] = useState(5);

    const [actionBusyId, setActionBusyId] = useState(null);
    const [activityCompleted, setActivityCompleted] = useState(false);

    // load goals
    useEffect(() => {
        const load = async () => {
            setErr("");
            setLoading(true);
            try {
                const list = await apiGetGoals();
                setGoals(Array.isArray(list) ? list : []);
            } catch (e) {
                setErr(e?.message || "Error cargando goals.");
                setGoals([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // pendientes = no completados
    const pendingGoals = useMemo(() => {
        return (Array.isArray(goals) ? goals : []).filter((g) => !isGoalCompleted(g));
    }, [goals]);

    // Si no hay pendientes, mostramos creación por defecto (y no hace falta colapsar)
    useEffect(() => {
        if (!loading && pendingGoals.length === 0) setShowCreate(true);
    }, [loading, pendingGoals.length]);

    const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);

    const completeOnce = (payload) => {
        if (activityCompleted) return;
        setActivityCompleted(true);
        onSaved?.(payload || {});
    };

    const handleAddProgress = async (goal) => {
        setErr("");
        const goalId = goal?.id;
        if (!goalId) {
            setErr("Goal inválido (sin id).");
            return;
        }

        setActionBusyId(goalId);
        try {
            const updated = await apiAddGoalProgress(goalId, 1);

            // refresco local (si el backend devuelve el goal actualizado)
            setGoals((prev) => {
                const arr = Array.isArray(prev) ? prev : [];
                return arr.map((g) => (g.id === goalId ? (updated?.id ? updated : g) : g));
            });

            // ✅ completar actividad automáticamente
            completeOnce({
                action: "progress_added",
                goal_id: goalId,
                goal_title: goal?.title || null,
                delta: 1,
            });
        } catch (e) {
            setErr(e?.message || "Error añadiendo progreso.");
        } finally {
            setActionBusyId(null);
        }
    };

    const buildPayloadFromPreset = () => {
        const t = selectedTemplate;
        if (!t) return null;

        return {
            title: t.title,
            description: t.description || "",
            frequency: t.frequency || "daily",
            size: t.size || "small",
            target_value: safeNum(t.target_value, 1),
            points_reward: safeNum(t.points_reward, 5),
        };
    };

    const buildPayloadFromCustom = () => {
        const cleanTitle = title.trim();
        if (!cleanTitle) return null;

        return {
            title: cleanTitle,
            description: description.trim() || "",
            frequency,
            size,
            target_value: clampNum(safeNum(targetValue, 1), 1, 9999),
            points_reward: clampNum(safeNum(pointsReward, 0), 0, 9999),
        };
    };

    const handleCreateGoal = async () => {
        setErr("");
        const payload = mode === "preset" ? buildPayloadFromPreset() : buildPayloadFromCustom();
        if (!payload) {
            setErr(mode === "preset" ? "Selecciona un preset." : "Pon un título para el objetivo.");
            return;
        }

        setActionBusyId("create");
        try {
            const created = await apiCreateGoal(payload);

            // lo añadimos a lista
            setGoals((prev) => {
                const arr = Array.isArray(prev) ? prev : [];
                return [created, ...arr];
            });

            // ✅ completar actividad automáticamente
            completeOnce({
                action: "goal_created",
                created_goal_id: created?.id || null,
                created_goal_title: created?.title || payload?.title || null,
            });
        } catch (e) {
            setErr(e?.message || "Error creando objetivo.");
        } finally {
            setActionBusyId(null);
        }
    };

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Revisar objetivos"}</div>
            <div className="small text-secondary mb-3">
                Si tienes objetivos pendientes, añade avance a uno. Si no, crea uno pequeño.
            </div>

            {loading && <div className="small text-secondary">Cargando goals…</div>}
            {!loading && err && <div className="alert alert-danger py-2 mb-3">{err}</div>}

            {/* ---------- GOALS PENDIENTES ---------- */}
            {!loading && pendingGoals.length > 0 && (
                <div className="border rounded p-3 mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-semibold">Goals para avanzar</div>

                        <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => setShowCreate((v) => !v)}
                            disabled={activityCompleted || actionBusyId === "create"}
                        >
                            {showCreate ? "Ocultar creación" : "Crear nuevo"}
                        </button>
                    </div>

                    <div className="d-flex flex-column gap-2">
                        {pendingGoals.map((g) => {
                            const { current, target } = formatProgress(g);
                            const pct = clampNum((current / Math.max(target, 1)) * 100, 0, 100);

                            return (
                                <div key={g.id} className="border rounded p-2">
                                    <div className="d-flex justify-content-between align-items-start gap-2">
                                        <div>
                                            <div className="fw-semibold">{g.title || "Objetivo"}</div>
                                            {g.description && <div className="small text-secondary">{g.description}</div>}
                                            <div className="small text-secondary mt-1">
                                                Progreso: <span className="fw-semibold">{current}</span> / {target}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleAddProgress(g)}
                                            disabled={actionBusyId === g.id || activityCompleted}
                                            title="Añadir +1 de progreso"
                                        >
                                            {actionBusyId === g.id ? "…" : "+1"}
                                        </button>
                                    </div>

                                    <div className="progress mt-2" style={{ height: 8 }}>
                                        <div className="progress-bar" role="progressbar" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {activityCompleted && (
                        <div className="small text-success mt-2">Actividad completada al registrar avance.</div>
                    )}
                </div>
            )}

            {/* ---------- CREACIÓN (SIEMPRE POSIBLE, PERO POR DEFECTO SI NO HAY PENDIENTES) ---------- */}
            {!loading && showCreate && (
                <div className="border rounded p-3">
                    <div className="fw-semibold mb-2">
                        {pendingGoals.length > 0 ? "Crear un goal nuevo" : "No tienes goals pendientes"}
                    </div>
                    <div className="small text-secondary mb-3">
                        Crea uno rápido (preset) o define uno nuevo. Se guardará en tu sistema de Goals.
                    </div>

                    <div className="btn-group w-100 mb-3" role="group" aria-label="Modo">
                        <button
                            type="button"
                            className={`btn ${mode === "preset" ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setMode("preset")}
                            disabled={actionBusyId === "create" || activityCompleted}
                        >
                            Preset
                        </button>
                        <button
                            type="button"
                            className={`btn ${mode === "custom" ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setMode("custom")}
                            disabled={actionBusyId === "create" || activityCompleted}
                        >
                            Custom
                        </button>
                    </div>

                    {mode === "preset" && (
                        <div className="mb-3">
                            <label className="form-label fw-semibold">Elige un preset</label>
                            <select
                                className="form-select"
                                value={templateId}
                                onChange={(e) => setTemplateId(e.target.value)}
                                disabled={actionBusyId === "create" || activityCompleted}
                            >
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.title} ({t.frequency})
                                    </option>
                                ))}
                            </select>

                            {selectedTemplate?.description && (
                                <div className="small text-secondary mt-2">{selectedTemplate.description}</div>
                            )}
                        </div>
                    )}

                    {mode === "custom" && (
                        <div className="mb-3">
                            <label className="form-label fw-semibold">Título</label>
                            <input
                                className="form-control mb-2"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ej: caminar 10 min"
                                disabled={actionBusyId === "create" || activityCompleted}
                            />

                            <label className="form-label fw-semibold">Descripción (opcional)</label>
                            <textarea
                                className="form-control mb-2"
                                rows={2}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Un detalle para hacerlo más fácil…"
                                disabled={actionBusyId === "create" || activityCompleted}
                            />

                            <div className="row g-2">
                                <div className="col-6">
                                    <label className="form-label fw-semibold">Frecuencia</label>
                                    <select
                                        className="form-select"
                                        value={frequency}
                                        onChange={(e) => setFrequency(e.target.value)}
                                        disabled={actionBusyId === "create" || activityCompleted}
                                    >
                                        <option value="daily">Diario</option>
                                        <option value="weekly">Semanal</option>
                                        <option value="monthly">Mensual</option>
                                    </select>
                                </div>

                                <div className="col-6">
                                    <label className="form-label fw-semibold">Tamaño</label>
                                    <select
                                        className="form-select"
                                        value={size}
                                        onChange={(e) => setSize(e.target.value)}
                                        disabled={actionBusyId === "create" || activityCompleted}
                                    >
                                        <option value="small">Pequeño</option>
                                        <option value="medium">Medio</option>
                                        <option value="large">Grande</option>
                                    </select>
                                </div>

                                <div className="col-6">
                                    <label className="form-label fw-semibold">Meta</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={targetValue}
                                        onChange={(e) => setTargetValue(e.target.value)}
                                        min={1}
                                        disabled={actionBusyId === "create" || activityCompleted}
                                    />
                                </div>

                                <div className="col-6">
                                    <label className="form-label fw-semibold">Puntos</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={pointsReward}
                                        onChange={(e) => setPointsReward(e.target.value)}
                                        min={0}
                                        disabled={actionBusyId === "create" || activityCompleted}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        className="btn btn-primary w-100"
                        onClick={handleCreateGoal}
                        disabled={actionBusyId === "create" || activityCompleted}
                    >
                        {actionBusyId === "create" ? "Creando…" : "Crear objetivo"}
                    </button>

                    {activityCompleted && <div className="small text-success mt-2">Actividad completada.</div>}
                </div>
            )}
        </div>
    );
};
