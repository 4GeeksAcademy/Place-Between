import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ActivityCard } from "../components/ActivityCard";
import { ProgressRing } from "../components/ProgressRing";

// NUEVO: selector híbrido + labels
import { buildTodaySet } from "../data/todaySelector";
import { weekdayLabelES } from "../data/weeklyPlan";

const getDateKey = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};

const storageKey = (dateKey, phase) => `pb_today_${dateKey}_${phase}`;

const getPhaseByHour = () => {
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

// Persistimos completedIds por día y fase
const loadState = (dateKey, phaseLabel) => {
    try {
        const raw = localStorage.getItem(storageKey(dateKey, phaseToKey(phaseLabel)));
        if (!raw) return { completed: [] };
        const parsed = JSON.parse(raw);
        return {
            completed: Array.isArray(parsed?.completed) ? parsed.completed : [],
        };
    } catch {
        return { completed: [] };
    }
};

const saveState = (dateKey, phaseLabel, state) => {
    localStorage.setItem(storageKey(dateKey, phaseToKey(phaseLabel)), JSON.stringify(state));
};

export const Today = () => {
    const location = useLocation();

    const dateKey = useMemo(() => getDateKey(), []);
    const dayIndex = useMemo(() => new Date().getDay(), []); // 0..6 (Dom..Sáb)

    const [phase, setPhase] = useState(getPhaseByHour());
    const [completed, setCompleted] = useState(() => loadState(dateKey, phase).completed);

    // Modal/actividad activa
    const [activeActivity, setActiveActivity] = useState(null);

    // 1) Forzar fase por query param (para test)
    useEffect(() => {
        const forced = getForcedPhase(location.search);
        const nextPhase = forced || getPhaseByHour();
        setPhase(nextPhase);
    }, [location.search]);

    // 2) Al cambiar fase, recargamos el estado persistido por fase
    useEffect(() => {
        const saved = loadState(dateKey, phase);
        setCompleted(saved.completed);
        setActiveActivity(null);
    }, [phase, dateKey]);

    // 3) Persistencia al completar
    useEffect(() => {
        saveState(dateKey, phase, { completed });
    }, [completed, dateKey, phase]);

    const toggleComplete = (activity) => {
        setCompleted((prev) => {
            const has = prev.includes(activity.id);
            return has ? prev.filter((x) => x !== activity.id) : [...prev, activity.id];
        });
    };

    const onStart = (activity) => {
        // MVP: abrimos modal. Al “Finalizar” se marca automáticamente.
        setActiveActivity(activity);
    };

    const phaseKey = phaseToKey(phase);
    const isNight = phaseKey === "night";

    // NUEVO: recommended fijo por día + pillars por rotación/diversidad
    const { recommended, pillars } = useMemo(() => {
        return buildTodaySet({
            phaseKey,
            dayIndex,
            completedIds: completed,
        });
    }, [phaseKey, dayIndex, completed]);

    const totalCount = useMemo(() => {
        // Total = recommended + pillars (si existe), evita inflar el % si el catálogo crece
        const ids = new Set();
        if (recommended?.id) ids.add(recommended.id);
        for (const p of pillars) ids.add(p.id);
        return Math.max(1, ids.size);
    }, [recommended, pillars]);

    const completedCount = useMemo(() => {
        // Contamos completadas solo dentro del set mostrado (recommended + 3)
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

                        {/* Debug helper (opcional): indica cómo forzar fase */}
                        <div className="small pb-sub mt-2">
                            Test fase: <span className="pb-mono">/today?phase=day</span> o{" "}
                            <span className="pb-mono">/today?phase=night</span>
                        </div>
                    </div>

                    <div className="pb-progress card shadow-sm">
                        <div className="card-body p-3 p-md-4 d-flex align-items-center gap-3">
                            <ProgressRing value={progress} />
                            <div>
                                <div className="fw-bold">Progreso diario</div>
                                <div className="pb-sub small">
                                    {Math.max(0, totalCount - completedCount)} restantes hoy
                                </div>
                                <div className="small">
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
                            onComplete={toggleComplete}
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
                                onComplete={toggleComplete}
                            />
                        </div>
                    ))}
                </div>

                {/* Noche: bloque informativo extra (opcional) */}
                {isNight && (
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
            </div>

            {/* Modal “actividad en curso” */}
            {activeActivity && (
                <>
                    <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true">
                        <div className="modal-dialog modal-dialog-centered" role="document">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">{activeActivity.title}</h5>
                                    <button type="button" className="btn-close" onClick={() => setActiveActivity(null)} />
                                </div>

                                <div className="modal-body">
                                    <p className="text-secondary mb-2">{activeActivity.description}</p>

                                    <div className="small text-secondary">
                                        Placeholder de ejecución. Más adelante, según{" "}
                                        <span className="pb-mono">{activeActivity.run}</span>, abrimos el minijuego/pantalla real.
                                    </div>
                                </div>

                                <div className="modal-footer">
                                    <button className="btn btn-outline-secondary" onClick={() => setActiveActivity(null)}>
                                        Cerrar
                                    </button>

                                    <button
                                        className="btn btn-primary"
                                        onClick={() => {
                                            // “Finalizar” = marcar como completada automáticamente
                                            if (!completed.includes(activeActivity.id)) toggleComplete(activeActivity);
                                            setActiveActivity(null);
                                        }}
                                    >
                                        Finalizar y guardar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="modal-backdrop show" />
                </>
            )}
        </div>
    );
};
