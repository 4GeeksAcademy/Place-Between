import React, { useEffect, useMemo, useState } from "react";
import "../styles/pb-goals.css";

import goalTemplates from "../data/goalTemplates.seed.json"; // tus presets locales

// ---------- Helpers ----------
const getBackendUrl = () => {
    const url = import.meta.env.VITE_BACKEND_URL;
    return (url || "").replace(/\/$/, "");
};

const getToken = () => localStorage.getItem("pb_token");

const authHeaders = () => {
    const token = getToken();
    if (!token) return null;
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
};

const clampInt = (n, min, max) => {
    const x = Number.isFinite(n) ? n : parseInt(n, 10);
    if (Number.isNaN(x)) return min;
    return Math.max(min, Math.min(max, x));
};

const safeJson = async (res) => {
    const txt = await res.text();
    try {
        return txt ? JSON.parse(txt) : null;
    } catch {
        return { msg: txt || "Respuesta no JSON" };
    }
};

const phaseLabel = (phase) => (phase === "night" ? "Noche" : "Día");

const detectPhase = () => {
    // Si más adelante quieres enlazarlo con tu lógica de Today, aquí lo cambias.
    // Por ahora: night si 19:00-05:59, day si 06:00-18:59.
    const h = new Date().getHours();
    return h >= 19 || h < 6 ? "night" : "day";
};

const getPhaseFromRoot = () =>
    document?.documentElement?.getAttribute("data-pb-phase") || "day";

// XP thresholds (ajústalos cuando quieras)
const XP_STEPS = [
    { lv: 1, xp: 0, name: "Despertar" },
    { lv: 2, xp: 30, name: "Constancia" },
    { lv: 3, xp: 70, name: "Ritmo" },
    { lv: 4, xp: 120, name: "Profundidad" },
    { lv: 5, xp: 180, name: "Integración" },
    { lv: 6, xp: 260, name: "Maestría" },
];

const getLevelFromXP = (xp) => {
    let current = XP_STEPS[0];
    for (const step of XP_STEPS) {
        if (xp >= step.xp) current = step;
    }
    const next = XP_STEPS.find((s) => s.xp > current.xp) || null;
    return { current, next };
};

const sizeLabel = (v) => (v === "large" ? "Grande" : v === "medium" ? "Medio" : "Pequeño");
const freqLabel = (v) => (v === "monthly" ? "Mensual" : v === "weekly" ? "Semanal" : "Diario");

// ---------- Component ----------
export default function Goals() {
    const BACKEND_URL = useMemo(() => getBackendUrl(), []);
    const [phase, setPhase] = useState(getPhaseFromRoot());

    useEffect(() => {
        const handler = (e) => {
            const next = e?.detail?.phase || getPhaseFromRoot();
            setPhase(next);
        };
        window.addEventListener("pb:phase-updated", handler);
        return () => window.removeEventListener("pb:phase-updated", handler);
    }, []);

    const isNight = phase === "night";

    const [tab, setTab] = useState("mine"); // mine | presets
    const [loading, setLoading] = useState(false);

    const [goals, setGoals] = useState([]);
    const [err, setErr] = useState("");
    const [banner, setBanner] = useState("");

    // Create form
    const [form, setForm] = useState({
        title: "",
        description: "",
        size: "small",
        frequency: "daily",
        target_value: 1,
        points_reward: 5,
    });

    // Progress modal-lite (inline)
    const [deltaById, setDeltaById] = useState({}); // { [goalId]: number }

    const token = getToken();
    const hasToken = !!token;

    // XP: suma puntos_reward de goals completados (simple y visible solo aquí)
    const xp = useMemo(() => {
        const sum = goals
            .filter((g) => !!g.completed_at)
            .reduce((acc, g) => acc + (Number(g.points_reward) || 0), 0);
        return sum;
    }, [goals]);

    const lvl = useMemo(() => getLevelFromXP(xp), [xp]);

    const refresh = async () => {
        setErr("");
        setBanner("");

        if (!BACKEND_URL) {
            setErr("VITE_BACKEND_URL no está configurado.");
            return;
        }
        if (!hasToken) {
            // No llamamos al backend si no hay token → evitamos “Not enough segments”
            setGoals([]);
            setErr("No hay token. Inicia sesión para ver tus objetivos.");
            return;
        }

        const headers = authHeaders();
        if (!headers) {
            setGoals([]);
            setErr("No hay token. Inicia sesión para ver tus objetivos.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/goals`, { headers });
            const data = await safeJson(res);

            if (!res.ok) {
                const msg = data?.msg || data?.message || `Error ${res.status}`;
                // 422 típico de JWT malformado: "Not enough segments"
                if (res.status === 422) {
                    setErr("Sesión inválida o caducada. Vuelve a iniciar sesión.");
                } else {
                    setErr(msg);
                }
                setGoals([]);
                return;
            }

            setGoals(Array.isArray(data) ? data : data?.items || []);
        } catch (e) {
            setErr(e?.message || "Failed to fetch");
            setGoals([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // refresca al entrar
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [BACKEND_URL, hasToken]);

    // --- Actions ---
    const createGoal = async (payload) => {
        setErr("");
        setBanner("");

        if (!BACKEND_URL) return setErr("VITE_BACKEND_URL no está configurado.");
        const headers = authHeaders();
        if (!headers) return setErr("No hay token. Inicia sesión para crear objetivos.");

        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/goals`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });
            const data = await safeJson(res);

            if (!res.ok) {
                const msg = data?.msg || data?.message || `Error ${res.status}`;
                if (res.status === 422) setErr("Sesión inválida o caducada. Vuelve a iniciar sesión.");
                else setErr(msg);
                return;
            }

            setBanner("Objetivo creado.");
            await refresh();
        } catch (e) {
            setErr(e?.message || "Error creando objetivo");
        } finally {
            setLoading(false);
        }
    };

    const addProgress = async (goalId, delta) => {
        setErr("");
        setBanner("");

        if (!BACKEND_URL) return setErr("VITE_BACKEND_URL no está configurado.");
        const headers = authHeaders();
        if (!headers) return setErr("No hay token. Inicia sesión para registrar progreso.");

        const d = clampInt(delta, 1, 999);

        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/goals/${goalId}/progress`, {
                method: "POST",
                headers,
                body: JSON.stringify({ delta_value: d }),
            });
            const data = await safeJson(res);

            if (!res.ok) {
                const msg = data?.msg || data?.message || `Error ${res.status}`;
                if (res.status === 422) setErr("Sesión inválida o caducada. Vuelve a iniciar sesión.");
                else setErr(msg);
                return;
            }

            setBanner(`+${d} progreso`);
            await refresh();
        } catch (e) {
            setErr(e?.message || "Error registrando progreso");
        } finally {
            setLoading(false);
        }
    };

    const completeGoal = async (goalId) => {
        setErr("");
        setBanner("");

        if (!BACKEND_URL) return setErr("VITE_BACKEND_URL no está configurado.");
        const headers = authHeaders();
        if (!headers) return setErr("No hay token. Inicia sesión para completar objetivos.");

        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/goals/${goalId}/complete`, {
                method: "POST",
                headers,
                body: JSON.stringify({}),
            });
            const data = await safeJson(res);

            if (!res.ok) {
                const msg = data?.msg || data?.message || `Error ${res.status}`;
                if (res.status === 422) setErr("Sesión inválida o caducada. Vuelve a iniciar sesión.");
                else setErr(msg);
                return;
            }

            setBanner("Objetivo completado.");
            await refresh();
        } catch (e) {
            setErr(e?.message || "Error completando objetivo");
        } finally {
            setLoading(false);
        }
    };

    const deleteGoal = async (goalId) => {
        setErr("");
        setBanner("");

        if (!BACKEND_URL) return setErr("VITE_BACKEND_URL no está configurado.");
        const headers = authHeaders();
        if (!headers) return setErr("No hay token. Inicia sesión para eliminar objetivos.");

        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/goals/${goalId}`, {
                method: "DELETE",
                headers,
            });
            const data = await safeJson(res);

            if (!res.ok) {
                const msg = data?.msg || data?.message || `Error ${res.status}`;
                if (res.status === 422) setErr("Sesión inválida o caducada. Vuelve a iniciar sesión.");
                else setErr(msg);
                return;
            }

            setBanner("Objetivo eliminado.");
            await refresh();
        } catch (e) {
            setErr(e?.message || "Error eliminando objetivo");
        } finally {
            setLoading(false);
        }
    };

    // --- UI helpers ---
    const pct = (g) => {
        const t = Math.max(1, Number(g.target_value) || 1);
        const c = Math.max(0, Number(g.current_value) || 0);
        return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
    };

    const xpProgressPct = useMemo(() => {
        const { current, next } = lvl;
        if (!next) return 100;
        const span = next.xp - current.xp;
        const into = xp - current.xp;
        if (span <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((into / span) * 100)));
    }, [lvl, xp]);

    // --- Render ---
    return (
        <div className={`pb-goals-shell pb-${phase}`}>
            {/* Header / Hero */}
            <div className="pb-goals-hero">
                <div>
                    <div className="pb-goals-kicker">OBJETIVOS · {phaseLabel(phase)}</div>
                    <h1 className="pb-goals-title">Goals</h1>
                    <div className="pb-goals-subtitle">
                        Elige un preset o crea uno propio. Registra progreso y completa (suma XP de goals).
                    </div>
                </div>

            </div>

            {/* XP / Roadmap */}
            <div className="pb-goals-card pb-goals-xp">
                <div className="pb-goals-xp-top">
                    <div>
                        <div className="pb-goals-card-kicker">Progreso de objetivos</div>
                        <div className="pb-goals-xp-level">
                            Nivel {lvl.current.lv} · {lvl.current.name}
                        </div>
                        <div className="pb-goals-xp-next">
                            {lvl.next ? `Próximo nivel en ${Math.max(0, lvl.next.xp - xp)} XP` : "Nivel máximo alcanzado"}
                        </div>
                    </div>

                    <div className="pb-goals-xp-right">
                        <div className="pb-goals-xp-value">{xp}</div>
                        <div className="pb-goals-xp-label">XP</div>
                    </div>
                </div>

                <div className="pb-goals-progress">
                    <div className="pb-goals-progress-bar" style={{ width: `${xpProgressPct}%` }} />
                </div>

                <div className="pb-goals-roadmap">
                    {XP_STEPS.map((s) => {
                        const active = xp >= s.xp;
                        const current = lvl.current.lv === s.lv;
                        return (
                            <div key={s.lv} className={`pb-goals-node ${active ? "is-active" : ""} ${current ? "is-current" : ""}`}>
                                <div className="pb-goals-dot" />
                                <div className="pb-goals-node-text">
                                    <div className="pb-goals-node-lv">Lv {s.lv}</div>
                                    <div className="pb-goals-node-xp">{s.xp} XP</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Alerts */}
            {!!banner && (
                <div className="pb-goals-alert pb-goals-alert-ok">
                    <div>{banner}</div>
                    <button className="btn btn-sm btn-outline-light" onClick={() => setBanner("")} type="button">
                        Cerrar
                    </button>
                </div>
            )}

            {!!err && (
                <div className="pb-goals-alert pb-goals-alert-err">
                    <div>{err}</div>
                    <button className="btn btn-sm btn-outline-light" onClick={() => setErr("")} type="button">
                        Cerrar
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="pb-goals-tabs">
                <button
                    type="button"
                    className={`pb-goals-tab ${tab === "mine" ? "is-active" : ""}`}
                    onClick={() => setTab("mine")}
                >
                    Mis goals
                </button>
                <button
                    type="button"
                    className={`pb-goals-tab ${tab === "presets" ? "is-active" : ""}`}
                    onClick={() => setTab("presets")}
                >
                    Presets
                </button>
            </div>

            {/* Body */}
            <div className="pb-goals-grid">
                {/* Left column */}
                <div className="pb-goals-col">
                    {/* Create */}
                    <div className="pb-goals-card">
                        <div className="pb-goals-card-title">Crear objetivo</div>
                        <div className="pb-goals-card-hint">Si no encaja un preset, crea uno propio.</div>

                        <div className="row g-3 mt-1">
                            <div className="col-12 col-lg-6">
                                <label className="form-label pb-goals-label">Título</label>
                                <input
                                    className="form-control pb-goals-input"
                                    placeholder="Ej: Caminar"
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    disabled={!hasToken}
                                />
                            </div>

                            <div className="col-12 col-lg-6">
                                <label className="form-label pb-goals-label">Descripción</label>
                                <input
                                    className="form-control pb-goals-input"
                                    placeholder="Opcional"
                                    value={form.description}
                                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                    disabled={!hasToken}
                                />
                            </div>

                            <div className="col-12 col-lg-4">
                                <label className="form-label pb-goals-label">Frecuencia</label>
                                <select
                                    className="form-select pb-goals-input"
                                    value={form.frequency}
                                    onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                                    disabled={!hasToken}
                                >
                                    <option value="daily">Diario</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="monthly">Mensual</option>
                                </select>
                            </div>

                            <div className="col-12 col-lg-4">
                                <label className="form-label pb-goals-label">Tamaño</label>
                                <select
                                    className="form-select pb-goals-input"
                                    value={form.size}
                                    onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                                    disabled={!hasToken}
                                >
                                    <option value="small">Pequeño</option>
                                    <option value="medium">Medio</option>
                                    <option value="large">Grande</option>
                                </select>
                            </div>

                            <div className="col-6 col-lg-2">
                                <label className="form-label pb-goals-label">Target</label>
                                <input
                                    className="form-control pb-goals-input"
                                    type="number"
                                    min={1}
                                    value={form.target_value}
                                    onChange={(e) => setForm((f) => ({ ...f, target_value: clampInt(e.target.value, 1, 999) }))}
                                    disabled={!hasToken}
                                />
                            </div>

                            <div className="col-6 col-lg-2">
                                <label className="form-label pb-goals-label">Recompensa</label>
                                <input
                                    className="form-control pb-goals-input"
                                    type="number"
                                    min={0}
                                    value={form.points_reward}
                                    onChange={(e) => setForm((f) => ({ ...f, points_reward: clampInt(e.target.value, 0, 999) }))}
                                    disabled={!hasToken}
                                />
                            </div>

                            <div className="col-12">
                                <button
                                    className="btn btn-primary w-100 pb-goals-btn"
                                    type="button"
                                    disabled={!hasToken || loading || !form.title.trim()}
                                    onClick={() =>
                                        createGoal({
                                            title: form.title.trim(),
                                            description: form.description.trim() || null,
                                            goal_type: "custom",
                                            frequency: form.frequency,
                                            size: form.size,
                                            target_value: clampInt(form.target_value, 1, 999),
                                            points_reward: clampInt(form.points_reward, 0, 999),
                                        })
                                    }
                                >
                                    Crear
                                </button>
                                {!hasToken && <div className="pb-goals-muted mt-2">Inicia sesión para crear objetivos.</div>}
                            </div>
                        </div>
                    </div>

                    {/* List */}
                    <div className="pb-goals-card mt-3">
                        <div className="pb-goals-card-row">
                            <div className="pb-goals-card-title">Listado</div>
                            <div className="pb-goals-muted">{goals.length} objetivos</div>
                        </div>

                        {!hasToken ? (
                            <div className="pb-goals-empty">Aún no puedes ver goals sin iniciar sesión.</div>
                        ) : goals.length === 0 ? (
                            <div className="pb-goals-empty">Aún no tienes goals. Usa presets o crea uno.</div>
                        ) : (
                            <div className="pb-goals-list">
                                {goals.map((g) => {
                                    const p = pct(g);
                                    const done = !!g.completed_at;

                                    return (
                                        <div key={g.id} className={`pb-goals-item ${done ? "is-done" : ""}`}>
                                            <div className="pb-goals-item-head">
                                                <div>
                                                    <div className="pb-goals-item-title">
                                                        {g.title}{" "}
                                                        {done && <span className="pb-goals-pill pb-goals-pill-done">Completado</span>}
                                                    </div>
                                                    {!!g.description && <div className="pb-goals-item-desc">{g.description}</div>}
                                                </div>

                                                <div className="pb-goals-item-meta">
                                                    <span className="pb-goals-pill">{freqLabel(g.frequency)}</span>
                                                    <span className="pb-goals-pill">{sizeLabel(g.size)}</span>
                                                    <span className="pb-goals-pill">+{g.points_reward} XP</span>
                                                </div>
                                            </div>

                                            <div className="pb-goals-item-progress">
                                                <div className="pb-goals-bar">
                                                    <div className="pb-goals-bar-fill" style={{ width: `${p}%` }} />
                                                </div>
                                                <div className="pb-goals-item-numbers">
                                                    <span>
                                                        {g.current_value} / {g.target_value}
                                                    </span>
                                                    <span>{p}%</span>
                                                </div>
                                            </div>

                                            <div className="pb-goals-item-actions">
                                                <div className="pb-goals-inline">
                                                    <input
                                                        className="form-control form-control-sm pb-goals-input"
                                                        type="number"
                                                        min={1}
                                                        placeholder="+1"
                                                        value={deltaById[g.id] ?? ""}
                                                        onChange={(e) =>
                                                            setDeltaById((m) => ({ ...m, [g.id]: clampInt(e.target.value, 1, 999) }))
                                                        }
                                                        disabled={loading || done}
                                                        style={{ width: 100 }}
                                                    />
                                                    <button
                                                        className="btn btn-sm btn-outline-light"
                                                        type="button"
                                                        disabled={loading || done}
                                                        onClick={() => addProgress(g.id, deltaById[g.id] ?? 1)}
                                                    >
                                                        + progreso
                                                    </button>
                                                </div>

                                                <div className="pb-goals-inline">
                                                    <button
                                                        className="btn btn-sm btn-success"
                                                        type="button"
                                                        disabled={loading || done}
                                                        onClick={() => completeGoal(g.id)}
                                                    >
                                                        Completar
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-outline-danger"
                                                        type="button"
                                                        disabled={loading}
                                                        onClick={() => deleteGoal(g.id)}
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </div>

                                            {!!g.completed_at && (
                                                <div className="pb-goals-muted mt-2">
                                                    Completed at: <span className="pb-goals-mono">{g.completed_at}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right column */}
                <div className="pb-goals-col">
                    {tab === "presets" ? (
                        <div className="pb-goals-card">
                            <div className="pb-goals-card-title">Presets</div>
                            <div className="pb-goals-card-hint">
                                Objetivos sugeridos para “apuntarte” sin escribirlos desde cero.
                            </div>

                            <div className="pb-goals-presets">
                                {(Array.isArray(goalTemplates) ? goalTemplates : []).map((t) => (
                                    <div key={t.id} className="pb-goals-preset">
                                        <div className="pb-goals-preset-head">
                                            <div className="pb-goals-preset-title">{t.title}</div>
                                            <div className="pb-goals-preset-meta">
                                                <span className="pb-goals-pill">{t.category}</span>
                                                <span className="pb-goals-pill">{freqLabel(t.frequency)}</span>
                                                <span className="pb-goals-pill">{sizeLabel(t.size)}</span>
                                                <span className="pb-goals-pill">+{t.points_reward} XP</span>
                                            </div>
                                        </div>

                                        {!!t.description && <div className="pb-goals-preset-desc">{t.description}</div>}

                                        <div className="pb-goals-preset-foot">
                                            <div className="pb-goals-muted">
                                                Target: <span className="pb-goals-mono">{t.target_value}</span>
                                            </div>

                                            <button
                                                className="btn btn-sm btn-primary"
                                                type="button"
                                                disabled={!hasToken || loading}
                                                onClick={() =>
                                                    createGoal({
                                                        title: t.title,
                                                        description: t.description || null,
                                                        goal_type: "preset",
                                                        frequency: t.frequency,
                                                        size: t.size,
                                                        target_value: clampInt(t.target_value, 0, 999),
                                                        points_reward: clampInt(t.points_reward, 0, 999),
                                                    })
                                                }
                                            >
                                                Añadir
                                            </button>
                                        </div>

                                        {!hasToken && <div className="pb-goals-muted mt-2">Inicia sesión para añadir presets.</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="pb-goals-card">
                            <div className="pb-goals-card-title">Guía rápida</div>
                            <div className="pb-goals-card-hint">
                                Una forma simple de usar Goals sin que se vuelva “técnico”.
                            </div>

                            <ol className="pb-goals-steps">
                                <li>Elige 1–2 presets para hoy.</li>
                                <li>Registra progreso solo cuando realmente ocurra (evita spamear).</li>
                                <li>Completa al llegar al target: ganas XP de goals.</li>
                                <li>Usa “custom” para objetivos personales (máx. 10–15 XP recomendado).</li>
                            </ol>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
