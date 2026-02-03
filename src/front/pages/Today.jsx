import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ActivityCard } from "../components/ActivityCard";
import { ProgressRing } from "../components/ProgressRing";
import { ActivityModal } from "../components/ActivityModal";
import { useToasts } from "../components/toasts/ToastContext";

import { buildTodaySet } from "../data/todaySelector";
import { weekdayLabelES } from "../data/weeklyPlan";
import { activitiesCatalog } from "../data/activities";

import { getUserScope } from "../services/authService";

// puntos (local)
import { loadPointsState, awardPointsOnce, normalizePointsResult } from "../services/pointsService";

/*-------------
 *
 * Helper functions
 *
 ------------*/

const getDateKey = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};

const getPhaseFromRoot = () => {
    const p = document?.documentElement?.getAttribute("data-pb-phase");
    if (p === "night") return "Noche";
    if (p === "day") return "Día";
    return null;
};

const getPhaseByHour = () => {
    const root = getPhaseFromRoot();
    if (root) return root;
    const h = new Date().getHours();
    return h >= 19 || h < 6 ? "Noche" : "Día";
};

const getForcedPhase = (search) => {
    const p = new URLSearchParams(search).get("phase");
    if (p === "night") return "Noche";
    if (p === "day") return "Día";
    return null;
};

const phaseToKey = (phaseLabel) => (phaseLabel === "Noche" ? "night" : "day");

// Namespaced key (por usuario + fecha + fase)
const storageKey = (userScope, dateKey, phaseKey) =>
    `pb_${userScope}_today_${dateKey}_${phaseKey}`;

// Key legacy (si existió en algún momento sin namespace)
const legacyKey = (dateKey, phaseKey) => `pb_today_${dateKey}_${phaseKey}`;

// TodaySet key (para congelar recommended + 3 y evitar stacking)
const todaySetKey = (userScope, dateKey, phaseKey) =>
    `pb_${userScope}_todayset_${dateKey}_${phaseKey}`;

// Persistimos completedIds por día y fase
const loadState = (userScope, dateKey, phaseLabel) => {
    const pKey = phaseToKey(phaseLabel);
    const key = storageKey(userScope, dateKey, pKey);

    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { completed: [] };

        const parsed = JSON.parse(raw);
        return {
            completed: Array.isArray(parsed?.completed) ? parsed.completed : [],
        };
    } catch {
        return { completed: [] };
    }
};

const saveState = (userScope, dateKey, phaseLabel, state) => {
    const pKey = phaseToKey(phaseLabel);
    localStorage.setItem(storageKey(userScope, dateKey, pKey), JSON.stringify(state));
};

const migrateLegacyIfNeeded = (userScope, dateKey, phaseLabel) => {
    const pKey = phaseToKey(phaseLabel);
    const newK = storageKey(userScope, dateKey, pKey);
    const oldK = legacyKey(dateKey, pKey);

    const hasNew = localStorage.getItem(newK) != null;
    if (hasNew) return;

    const legacy = localStorage.getItem(oldK);
    if (legacy != null) {
        localStorage.setItem(newK, legacy);
        localStorage.removeItem(oldK);
    }
};

const loadTodaySet = (userScope, dateKey, phaseKey) => {
    try {
        const raw = localStorage.getItem(todaySetKey(userScope, dateKey, phaseKey));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const recommendedId = parsed?.recommendedId || null;
        const pillarIds = Array.isArray(parsed?.pillarIds) ? parsed.pillarIds : [];
        if (!recommendedId || pillarIds.length !== 3) return null;
        return { recommendedId, pillarIds };
    } catch {
        return null;
    }
};

const saveTodaySet = (userScope, dateKey, phaseKey, set) => {
    localStorage.setItem(todaySetKey(userScope, dateKey, phaseKey), JSON.stringify(set));
};

const getBackendUrl = () => {
    const url = import.meta.env.VITE_BACKEND_URL;
    return (url || "").replace(/\/$/, "");
};

export const Today = () => {
    const location = useLocation();

    // Fecha / día de semana (estables para la sesión)
    const dateKey = useMemo(() => getDateKey(), []);
    const dayIndex = useMemo(() => new Date().getDay(), []); // 0..6 (Dom..Sáb)

    // Toast global (montado en AppLayout)
    const { pushPointsToast } = useToasts();

    // userScope en state para permitir rehidratación al cambiar usuario en SPA
    const [userScope, setUserScope] = useState(() => getUserScope());

    const [phase, setPhase] = useState(getPhaseByHour());
    const [completed, setCompleted] = useState(() => {
        const scope = getUserScope();
        migrateLegacyIfNeeded(scope, dateKey, getPhaseByHour());
        return loadState(scope, dateKey, getPhaseByHour()).completed;
    });

    // Modal/actividad activa
    const [activeActivity, setActiveActivity] = useState(null);

    // puntos de hoy (local)
    const [pointsToday, setPointsToday] = useState(() => loadPointsState(dateKey).total);


    // Set congelado (recommendedId + pillarIds)
    const [todaySetIds, setTodaySetIds] = useState(null);

    // 1) Forzar fase por query param (para test)
    useEffect(() => {
        const forced = getForcedPhase(location.search);
        const nextPhase = forced || getPhaseByHour();
        setPhase(nextPhase);
    }, [location.search]);

    // 1.1) Escuchar cambios globales de fase (AppLayout)
    useEffect(() => {
        const handler = (e) => {
            const forced = getForcedPhase(location.search);
            if (forced) return;

            const next = e?.detail?.phase === "night" ? "Noche" : "Día";
            setPhase(next);
        };
        window.addEventListener("pb:phase-updated", handler);
        return () => window.removeEventListener("pb:phase-updated", handler);
    }, [location.search]);

    // 2) Detectar cambios de usuario (login/logout) y rehidratar
    useEffect(() => {
        const nextScope = getUserScope();
        setUserScope(nextScope);
    }, [location.pathname, location.search]);

    const phaseKey = phaseToKey(phase);
    const isNight = phaseKey === "night";

    // 3) Migración legacy + carga completadas/puntos al cambiar user/phase/date
    useEffect(() => {
        migrateLegacyIfNeeded(userScope, dateKey, phase);
        const saved = loadState(userScope, dateKey, phase);
        setCompleted(saved.completed);
        setActiveActivity(null);

        // refresco puntos (si pointsService ya está namespaced, perfecto; si no, lo haremos luego)
        setPointsToday(loadPointsState(dateKey).total);
    }, [userScope, phase, dateKey]);

    // 4) Persistencia completadas
    useEffect(() => {
        saveState(userScope, dateKey, phase, { completed });
    }, [completed, userScope, dateKey, phase]);

    const toggleComplete = (activity) => {
        setCompleted((prev) => {
            const has = prev.includes(activity.id);
            return has ? prev.filter((x) => x !== activity.id) : [...prev, activity.id];
        });
    };

    const onStart = (activity) => setActiveActivity(activity);

    // Mapa id -> actividad (fuente única)
    const activityMap = useMemo(() => {
        const day = activitiesCatalog?.day || [];
        const night = activitiesCatalog?.night || [];
        const all = [...day, ...night];
        const m = new Map();
        for (const a of all) m.set(a.id, a);
        return m;
    }, []);

    // 5) Congelar set: se genera SOLO cuando cambia user/date/phase (NO al completar)
    useEffect(() => {
        const existing = loadTodaySet(userScope, dateKey, phaseKey);
        if (existing) {
            setTodaySetIds(existing);
            return;
        }

        // Generamos una sola vez usando el estado actual (puede filtrar completadas si tu selector lo hace)
        const generated = buildTodaySet({
            phaseKey,
            dayIndex,
            completedIds: completed,
        });

        const recommendedId = generated?.recommended?.id || null;
        const pillarIds = (generated?.pillars || []).map((x) => x.id).slice(0, 3);

        // Si por cualquier motivo no hay 3, completamos determinísticamente desde el catálogo de la fase
        if (recommendedId && pillarIds.length < 3) {
            const pool = (activitiesCatalog?.[phaseKey] || [])
                .map((a) => a.id)
                .filter((id) => id !== recommendedId && !pillarIds.includes(id));
            for (const id of pool) {
                if (pillarIds.length >= 3) break;
                pillarIds.push(id);
            }
        }

        const newSet = {
            recommendedId,
            pillarIds,
        };

        saveTodaySet(userScope, dateKey, phaseKey, newSet);
        setTodaySetIds(newSet);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userScope, dateKey, phaseKey, dayIndex]);

    const recommended = useMemo(() => {
        if (!todaySetIds?.recommendedId) return null;

        const r = activityMap.get(todaySetIds.recommendedId) || null;

        // Si el set congelado apunta a un ID que ya no existe en el catálogo,
        // lo consideramos corrupto/obsoleto (p.ej. cambiaste activities.js).
        return r;
    }, [todaySetIds, activityMap]);

    const pillars = useMemo(() => {
        const ids = todaySetIds?.pillarIds || [];
        return ids.map((id) => activityMap.get(id)).filter(Boolean);
    }, [todaySetIds, activityMap]);

    useEffect(() => {
        // Si todaySetIds existe pero recommended no se puede resolver en catálogo, regeneramos.
        if (!todaySetIds) return;
        if (todaySetIds.recommendedId && !activityMap.get(todaySetIds.recommendedId)) {
            // regenerar set usando buildTodaySet y persistirlo
            const { recommended: rec, pillars: ps } = buildTodaySet({
                phaseKey,
                dayIndex,
                completedIds: completed,
            });

            const recommendedId = rec?.id || null;
            const pillarIds = (ps || []).map((x) => x.id).filter(Boolean);

            // fallback: si faltan pilares, rellenamos determinísticamente desde catálogo
            if (recommendedId && pillarIds.length < 3) {
                const pool = (activitiesCatalog?.[phaseKey] || [])
                    .map((a) => a.id)
                    .filter((id) => id !== recommendedId && !pillarIds.includes(id));
                for (const id of pool) {
                    if (pillarIds.length >= 3) break;
                    pillarIds.push(id);
                }
            }

            const newSet = { recommendedId, pillarIds };
            saveTodaySet(userScope, dateKey, phaseKey, newSet);
            setTodaySetIds(newSet);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todaySetIds, activityMap, phaseKey, dayIndex, completed, userScope, dateKey]);

    // Progreso (solo sobre set visible: recommended + 3)
    const totalCount = useMemo(() => {
        const ids = new Set();
        if (recommended?.id) ids.add(recommended.id);
        for (const p of pillars) ids.add(p.id);
        return Math.max(1, ids.size);
    }, [recommended, pillars]);

    const completedCount = useMemo(() => {
        const shownIds = new Set();
        if (recommended?.id) shownIds.add(recommended.id);
        for (const p of pillars) shownIds.add(p.id);

        let c = 0;
        for (const id of completed) if (shownIds.has(id)) c += 1;
        return c;
    }, [completed, recommended, pillars]);

    const progress = useMemo(
        () => Math.round((completedCount / totalCount) * 100),
        [completedCount, totalCount]
    );

    const diaLabel = weekdayLabelES?.[dayIndex] || "Hoy";

    const allowedTodayIds = useMemo(() => {
        const s = new Set();
        if (todaySetIds?.recommendedId) s.add(todaySetIds.recommendedId);
        for (const id of todaySetIds?.pillarIds || []) s.add(id);
        return s;
    }, [todaySetIds]);

    // otorgar puntos (1 vez por actividad/día)
    const awardPointsFor = (activity, { source = "today", overridePoints = null } = {}) => {
        if (!activity?.id) return;

        const isCorrectPhase = activity.phase === phaseKey;
        const isRecommended = todaySetIds?.recommendedId === activity.id;

        const res = awardPointsOnce({
            dateKey,
            activityId: activity.id,
            source,
            isCorrectPhase,
            isRecommended,
            overridePoints,
        });

        if (res.awarded) {
            // Actualiza contador local
            setPointsToday(res.total);

            // Normaliza y dispara toast global
            const toast = normalizePointsResult(
                // shape local: {awarded, points, total, ...}
                { ...res },
                { source, isCorrectPhase, isRecommended }
            );

            if (toast) pushPointsToast(toast);
        }
    };

    // Completar en backend (para Mirror)
    const completeActivityBackend = async (activity, { isRecommended, source }) => {
        const token = localStorage.getItem("pb_token");
        if (!token) return null;

        const BACKEND_URL = getBackendUrl();
        if (!BACKEND_URL) return null;

        try {
            const res = await fetch(`${BACKEND_URL}/api/activities/complete`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    external_id: activity.id,
                    session_type: phaseKey,
                    is_recommended: !!isRecommended,
                    source, // "today" | "catalog"
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.msg || "Error backend");
            return data;
        } catch (e) {
            console.warn("Backend completion failed, fallback to local:", e);
            return null;
        }
    };

    const handleComplete = async (activity) => {
        // Seguridad: Today solo puntúa como "today" si la actividad pertenece al set congelado
        const inTodaySet = allowedTodayIds.has(activity.id);
        const source = inTodaySet ? "today" : "catalog"; // fallback seguro

        // UI local (siempre)
        if (!completed.includes(activity.id)) toggleComplete(activity);

        // backend (para espejo)
        const backendResult = await completeActivityBackend(activity, {
            isRecommended: todaySetIds?.recommendedId === activity.id,
            source,
        });

        // puntos: si backend devuelve puntos, úsalo; si no, calcula local según source
        if (backendResult && backendResult.points_awarded != null) {
            awardPointsFor(activity, { source, overridePoints: backendResult.points_awarded });
        } else {
            awardPointsFor(activity, { source });
        }
    };

    return (
        <div className={`pb-today ${isNight ? "pb-today-night" : "pb-today-day"}`}>
            <div className="container py-4 py-lg-5">
                {/* Header */}
                <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-4 mb-4 mb-lg-5">
                    <div>
                        <div className="text-uppercase small fw-bold pb-phase mb-2">
                            {phase === "Día" ? "Ciclo de día" : "Ciclo de noche"}
                        </div>

                        <h1 className="display-6 fw-bold mb-2">{diaLabel}</h1>

                        <p className="pb-sub mb-0 pb-maxw">
                            {phase === "Día"
                                ? "Elige una acción útil. No tienes que decidir demasiado."
                                : "Cierre breve: emoción + regulación. Luego, Espejo."}
                        </p>

                    </div>

                    <div className="pb-progress card shadow-sm">
                        <div className="card-body p-3 p-md-4 d-flex align-items-center gap-3">
                            <ProgressRing value={progress} />
                            <div>
                                <div className="fw-bold">Progreso diario</div>
                                <div className="pb-sub small">
                                    {Math.max(0, totalCount - completedCount)} restantes hoy
                                </div>

                                <div className="small mt-2">
                                    <span className="fw-semibold">Puntos hoy:</span>{" "}
                                    <span className="pb-mono">{pointsToday}</span>
                                </div>

                                <div className="small mt-1">
                                    <a className="text-decoration-none" href="/mirror">
                                        Ver en Espejo →
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recommended */}
                {recommended ? (
                    <div className="mb-4 mb-lg-5">
                        <ActivityCard
                            activity={recommended}
                            variant="hero"
                            completed={completed.includes(recommended.id)}
                            onStart={onStart}
                            // Nota: si ya quitaste botón de completar en card, esto no se usa.
                            onComplete={handleComplete}
                            showCompleteButton={false}
                        />
                    </div>
                ) : (
                    <div className="alert alert-secondary">No hay actividades configuradas para esta fase.</div>
                )}

                {/* Pillars */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="h4 fw-bold mb-0">
                        {isNight ? "Tus 3 acciones nocturnas" : "Tus 3 actividades de hoy"}
                    </h2>
                    <a className="small text-decoration-none" href="/activities">
                        Ver catálogo →
                    </a>
                </div>

                <div className="row g-4">
                    {pillars.map((a) => (
                        <div className="col-12 col-md-6 col-lg-4" key={a.id}>
                            <ActivityCard
                                activity={a}
                                completed={completed.includes(a.id)}
                                onStart={onStart}
                                onComplete={handleComplete}
                                showCompleteButton={false}
                            />
                        </div>
                    ))}
                </div>

                {/* Noche: bloque informativo extra (opcional para más adelante) */}
                {false && (
                    <div className="mt-4 mt-lg-5">
                        <div className="card shadow-sm pb-night">
                            <div className="card-body p-4 d-flex flex-column flex-md-row justify-content-between align-items-start gap-3">
                                <div>
                                    <div className="fw-bold">Cierre nocturno</div>
                                    <div className="pb-sub">
                                        Selecciona emoción + una frase. Esto alimenta el Espejo y te ayuda a ver patrones.
                                    </div>
                                </div>
                                <button className="btn btn-outline-light" onClick={() => alert("Módulo Noche (placeholder)")}>
                                    Registrar emoción
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal / Runner */}
                {activeActivity && (
                    <ActivityModal
                        activity={activeActivity}
                        onClose={() => setActiveActivity(null)}
                        onComplete={async () => {
                            await handleComplete(activeActivity);
                            setActiveActivity(null);
                        }}
                        onSaved={async () => {
                            await handleComplete(activeActivity);
                            setActiveActivity(null);
                        }}
                    />
                )}
            </div>
        </div>
    );
};
