// src/front/pages/Goals.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
    addGoalProgress,
    completeGoal,
    createGoal,
    deleteGoal,
    listGoals,
} from "../services/goalsService";

import {
    goalTemplatesCatalog,
    getGoalTemplateCategories,
    GOAL_FREQUENCIES,
    GOAL_SIZES,
} from "../data/goalTemplates";

import "../styles/pb-goals.css";

function clampInt(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function pct(current, target) {
    const t = Math.max(0, Number(target) || 0);
    if (t === 0) return 0;
    const c = Math.max(0, Number(current) || 0);
    return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
}

function freqLabel(f) {
    if (f === "daily") return "Diario";
    if (f === "weekly") return "Semanal";
    if (f === "monthly") return "Mensual";
    return "Flexible";
}

function sizeLabel(s) {
    if (s === "small") return "Pequeño";
    if (s === "medium") return "Medio";
    if (s === "large") return "Grande";
    return s || "-";
}

export default function Goals() {
    const [tab, setTab] = useState("templates"); // templates | mygoals
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [goals, setGoals] = useState([]);

    // Filters (templates)
    const categories = useMemo(() => ["Todas", ...getGoalTemplateCategories()], []);
    const [fCategory, setFCategory] = useState("Todas");
    const [fFreq, setFFreq] = useState("all");
    const [fSize, setFSize] = useState("all");
    const [q, setQ] = useState("");

    // Create custom goal
    const [cTitle, setCTitle] = useState("");
    const [cDesc, setCDesc] = useState("");
    const [cCategory, setCCategory] = useState("Físico");
    const [cFreq, setCFreq] = useState("daily");
    const [cSize, setCSize] = useState("small");
    const [cTarget, setCTarget] = useState(5);
    const [cPoints, setCPoints] = useState(10);

    async function refreshGoals() {
        setError("");
        setLoading(true);
        try {
            const data = await listGoals();
            // asume que backend devuelve lista
            setGoals(Array.isArray(data) ? data : data.items || []);
        } catch (e) {
            setError(e.message || "No se pudo cargar Goals");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refreshGoals();
    }, []);

    const filteredTemplates = useMemo(() => {
        const qq = q.trim().toLowerCase();
        return goalTemplatesCatalog.filter((t) => {
            if (fCategory !== "Todas" && t.category !== fCategory) return false;
            if (fFreq !== "all" && t.frequency !== fFreq) return false;
            if (fSize !== "all" && t.size !== fSize) return false;

            if (!qq) return true;
            const hay = `${t.title} ${t.description || ""} ${t.category}`.toLowerCase();
            return hay.includes(qq);
        });
    }, [fCategory, fFreq, fSize, q]);

    async function onAddFromTemplate(tpl) {
        setError("");
        setLoading(true);
        try {
            await createGoal({
                title: tpl.title,
                description: tpl.description || null,
                frequency: tpl.frequency,
                size: tpl.size,
                target_value: tpl.target_value,
                points_reward: tpl.points_reward,
                goal_type: tpl.category, // V1: guardamos categoría aquí
            });
            await refreshGoals();
            setTab("mygoals");
        } catch (e) {
            setError(e.message || "No se pudo crear Goal");
        } finally {
            setLoading(false);
        }
    }

    async function onCreateCustom(e) {
        e.preventDefault();
        setError("");

        const title = cTitle.trim();
        if (!title) {
            setError("El título es obligatorio.");
            return;
        }

        const target_value = Math.max(0, clampInt(cTarget, 1));
        const points_reward = Math.max(0, clampInt(cPoints, 0));

        setLoading(true);
        try {
            await createGoal({
                title,
                description: cDesc.trim() || null,
                frequency: cFreq,
                size: cSize,
                target_value,
                points_reward,
                goal_type: cCategory, // V1: categoría
            });
            setCTitle("");
            setCDesc("");
            await refreshGoals();
            setTab("mygoals");
        } catch (e2) {
            setError(e2.message || "No se pudo crear Goal");
        } finally {
            setLoading(false);
        }
    }

    async function onProgress(goalId, delta) {
        setError("");
        setLoading(true);
        try {
            await addGoalProgress(goalId, delta);
            await refreshGoals();
        } catch (e) {
            setError(e.message || "No se pudo añadir progreso");
        } finally {
            setLoading(false);
        }
    }

    async function onComplete(goalId) {
        setError("");
        setLoading(true);
        try {
            await completeGoal(goalId);
            await refreshGoals();
        } catch (e) {
            setError(e.message || "No se pudo completar");
        } finally {
            setLoading(false);
        }
    }

    async function onDelete(goalId) {
        setError("");
        setLoading(true);
        try {
            await deleteGoal(goalId);
            await refreshGoals();
        } catch (e) {
            setError(e.message || "No se pudo eliminar");
        } finally {
            setLoading(false);
        }
    }

    const activeGoals = useMemo(() => {
        const list = Array.isArray(goals) ? goals : [];
        return list.slice().sort((a, b) => {
            const aDone = !!a.completed_at;
            const bDone = !!b.completed_at;
            if (aDone !== bDone) return aDone ? 1 : -1;
            return (b.id || 0) - (a.id || 0);
        });
    }, [goals]);

    return (
        <div className="pb-goals pb-page">
            <div className="pb-goals__header">
                <div>
                    <h1 className="pb-title">Objetivos</h1>
                    <p className="pb-subtitle">
                        Elige una plantilla o crea un objetivo propio. Suma puntos al completar.
                    </p>
                </div>

                <div className="pb-goals__actions">
                    <button
                        className="pb-btn pb-btn--ghost"
                        onClick={refreshGoals}
                        disabled={loading}
                    >
                        Actualizar
                    </button>
                </div>
            </div>

            {error ? <div className="pb-alert pb-alert--error">{error}</div> : null}

            <div className="pb-tabs">
                <button
                    className={`pb-tab ${tab === "templates" ? "is-active" : ""}`}
                    onClick={() => setTab("templates")}
                >
                    Plantillas
                </button>
                <button
                    className={`pb-tab ${tab === "mygoals" ? "is-active" : ""}`}
                    onClick={() => setTab("mygoals")}
                >
                    Mis objetivos
                </button>
            </div>

            <div className="pb-goals__grid">
                {/* LEFT */}
                <div className="pb-col">
                    {tab === "templates" ? (
                        <div className="pb-card">
                            <div className="pb-card__header">
                                <h2 className="pb-card__title">Plantillas</h2>
                                <div className="pb-chip">Presets</div>
                            </div>

                            <div className="pb-filters">
                                <div className="pb-field">
                                    <label>Categoría</label>
                                    <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
                                        {categories.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="pb-field">
                                    <label>Frecuencia</label>
                                    <select value={fFreq} onChange={(e) => setFFreq(e.target.value)}>
                                        <option value="all">Todas</option>
                                        {GOAL_FREQUENCIES.map((f) => (
                                            <option key={f} value={f}>
                                                {freqLabel(f)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="pb-field">
                                    <label>Tamaño</label>
                                    <select value={fSize} onChange={(e) => setFSize(e.target.value)}>
                                        <option value="all">Todos</option>
                                        {GOAL_SIZES.map((s) => (
                                            <option key={s} value={s}>
                                                {sizeLabel(s)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="pb-field pb-field--wide">
                                    <label>Buscar</label>
                                    <input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="agua, caminar, respiración…"
                                    />
                                </div>
                            </div>

                            <div className="pb-list">
                                {filteredTemplates.length === 0 ? (
                                    <div className="pb-empty">No hay plantillas con esos filtros.</div>
                                ) : (
                                    filteredTemplates.map((t) => (
                                        <div key={t.id} className="pb-item">
                                            <div className="pb-item__main">
                                                <div className="pb-item__title">{t.title}</div>
                                                <div className="pb-item__meta">
                                                    <span className="pb-tag">{t.category}</span>
                                                    <span className="pb-tag">{freqLabel(t.frequency)}</span>
                                                    <span className="pb-tag">{sizeLabel(t.size)}</span>
                                                    <span className="pb-tag">{t.points_reward} pts</span>
                                                </div>
                                                {t.description ? (
                                                    <div className="pb-item__desc">{t.description}</div>
                                                ) : null}
                                            </div>

                                            <div className="pb-item__actions">
                                                <button
                                                    className="pb-btn pb-btn--primary"
                                                    disabled={loading}
                                                    onClick={() => onAddFromTemplate(t)}
                                                >
                                                    Añadir
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="pb-card">
                            <div className="pb-card__header">
                                <h2 className="pb-card__title">Mis objetivos</h2>
                                <div className="pb-chip">{activeGoals.length}</div>
                            </div>

                            <div className="pb-list">
                                {activeGoals.length === 0 ? (
                                    <div className="pb-empty">
                                        No tienes objetivos todavía. Ve a Plantillas o crea uno.
                                    </div>
                                ) : (
                                    activeGoals.map((g) => {
                                        const percent = pct(g.current_value, g.target_value);
                                        const done = !!g.completed_at;
                                        return (
                                            <div key={g.id} className={`pb-goal ${done ? "is-done" : ""}`}>
                                                <div className="pb-goal__head">
                                                    <div>
                                                        <div className="pb-goal__title">
                                                            {g.title} {done ? <span className="pb-badge">Completado</span> : null}
                                                        </div>
                                                        <div className="pb-goal__meta">
                                                            <span className="pb-tag">{g.goal_type || "General"}</span>
                                                            <span className="pb-tag">{freqLabel(g.frequency)}</span>
                                                            <span className="pb-tag">{sizeLabel(g.size)}</span>
                                                            <span className="pb-tag">{g.points_reward} pts</span>
                                                        </div>
                                                        {g.description ? (
                                                            <div className="pb-goal__desc">{g.description}</div>
                                                        ) : null}
                                                    </div>

                                                    <div className="pb-goal__right">
                                                        <div className="pb-goal__progressline">
                                                            <span>Progreso</span>
                                                            <span>
                                                                {g.current_value} / {g.target_value} ({percent}%)
                                                            </span>
                                                        </div>
                                                        <div className="pb-bar">
                                                            <div className="pb-bar__fill" style={{ width: `${percent}%` }} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pb-goal__actions">
                                                    <div className="pb-btngroup">
                                                        <button
                                                            className="pb-btn pb-btn--ghost"
                                                            disabled={loading || done || g.current_value >= g.target_value}
                                                            onClick={() => onProgress(g.id, 1)}
                                                        >
                                                            +1
                                                        </button>
                                                        <button
                                                            className="pb-btn pb-btn--ghost"
                                                            disabled={loading || done || g.current_value >= g.target_value}
                                                            onClick={() => onProgress(g.id, 5)}
                                                        >
                                                            +5
                                                        </button>
                                                    </div>

                                                    <div className="pb-btngroup">
                                                        <button
                                                            className="pb-btn pb-btn--success"
                                                            disabled={loading || done}
                                                            onClick={() => onComplete(g.id)}
                                                        >
                                                            Completar
                                                        </button>
                                                        <button
                                                            className="pb-btn pb-btn--danger"
                                                            disabled={loading}
                                                            onClick={() => onDelete(g.id)}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                </div>

                                                {done ? (
                                                    <div className="pb-goal__foot">
                                                        Completed at: {g.completed_at}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT */}
                <div className="pb-col">
                    <div className="pb-card">
                        <div className="pb-card__header">
                            <h2 className="pb-card__title">Crear objetivo</h2>
                            <div className="pb-chip">Custom</div>
                        </div>

                        <form onSubmit={onCreateCustom} className="pb-form">
                            <div className="pb-field">
                                <label>Título</label>
                                <input
                                    value={cTitle}
                                    onChange={(e) => setCTitle(e.target.value)}
                                    placeholder="Ej: Caminar"
                                />
                            </div>

                            <div className="pb-field">
                                <label>Descripción</label>
                                <input
                                    value={cDesc}
                                    onChange={(e) => setCDesc(e.target.value)}
                                    placeholder="Opcional"
                                />
                            </div>

                            <div className="pb-form__row">
                                <div className="pb-field">
                                    <label>Categoría</label>
                                    <select value={cCategory} onChange={(e) => setCCategory(e.target.value)}>
                                        {getGoalTemplateCategories().map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="pb-field">
                                    <label>Frecuencia</label>
                                    <select value={cFreq} onChange={(e) => setCFreq(e.target.value)}>
                                        {GOAL_FREQUENCIES.map((f) => (
                                            <option key={f} value={f}>
                                                {freqLabel(f)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="pb-form__row">
                                <div className="pb-field">
                                    <label>Tamaño</label>
                                    <select value={cSize} onChange={(e) => setCSize(e.target.value)}>
                                        {GOAL_SIZES.map((s) => (
                                            <option key={s} value={s}>
                                                {sizeLabel(s)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="pb-field">
                                    <label>Target</label>
                                    <input
                                        type="number"
                                        value={cTarget}
                                        onChange={(e) => setCTarget(e.target.value)}
                                        min="0"
                                    />
                                </div>
                            </div>

                            <div className="pb-field">
                                <label>Recompensa (pts)</label>
                                <input
                                    type="number"
                                    value={cPoints}
                                    onChange={(e) => setCPoints(e.target.value)}
                                    min="0"
                                />
                                <div className="pb-hint">
                                    Recomendación: small ≤ 10 pts. (Ahora mismo lo dejamos manual.)
                                </div>
                            </div>

                            <button className="pb-btn pb-btn--primary" disabled={loading} type="submit">
                                Crear
                            </button>
                        </form>
                    </div>

                    <div className="pb-card pb-card--muted">
                        <div className="pb-card__header">
                            <h3 className="pb-card__title">Notas</h3>
                        </div>
                        <ul className="pb-notes">
                            <li>Puntos de Goals se muestran aquí (no se mezclan con Activities).</li>
                            <li>La limitación por frecuencia (daily/weekly/monthly) la afinamos después (front + backend).</li>
                            <li>Cuando haya categorías “reales” en DB, migramos desde goal_type sin perder datos.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
