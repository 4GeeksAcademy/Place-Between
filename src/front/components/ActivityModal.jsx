import React, { useMemo } from "react";
import { ActivityRunner } from "./ActivityRunner";
import { hasRunner } from "./runners/runnerRegistry";

/**
 * ActivityModal
 * - Modal reutilizable (Today + Activities)
 * - Elimina la necesidad de mantener exclusiones del botón legacy.
 *
 * Reglas:
 * - Si el runType tiene runner registrado => NO mostramos botón "Empezar ahora / Finalizar y guardar"
 *   (el runner controla el inicio/cierre via onSaved).
 * - Si NO hay runner registrado => mostramos botón legacy (completado inmediato).
 *
 * Props:
 * - activity: activity enriquecida (id, title, description, phase, branch, duration, run...)
 * - onClose(): cerrar modal
 * - onComplete(): completar inmediato (legacy) y cerrar (el caller decide)
 * - onSaved(): por defecto llama a onComplete (pero normalmente el caller lo pasa igual)
 */
export const ActivityModal = ({ activity, onClose, onComplete, onSaved }) => {
    const getRunType = (a) => (typeof a?.run === "string" ? a.run : a?.run?.type);

    const runType = useMemo(() => getRunType(activity), [activity]);
    const runnerImplemented = useMemo(() => hasRunner(runType), [runType]);

    // Meta line (sin mentir con duración si hay presets)
    const meta = useMemo(() => {
        const phaseLabel = activity?.phase === "night" ? "Noche" : "Día";
        const branch = activity?.branch ? `· ${activity.branch}` : "";

        const hasPresets =
            typeof activity?.run === "object" && Boolean(activity?.run?.presets);

        const duration =
            !hasPresets && Number.isFinite(activity?.duration)
                ? `· ${activity.duration} min`
                : "";

        return `${phaseLabel} ${duration} ${branch}`.replace(/\s+/g, " ").trim();
    }, [activity]);

    return (
        <>
            <div
                className="modal d-block"
                tabIndex="-1"
                role="dialog"
                aria-modal="true"
                style={{ background: "rgba(0,0,0,0.55)" }}
                onClick={onClose}
            >
                <div
                    className="modal-dialog modal-dialog-centered"
                    role="document"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">{activity?.title}</h5>
                            <button
                                type="button"
                                className="btn-close"
                                aria-label="Close"
                                onClick={onClose}
                            />
                        </div>

                        <div className="modal-body">
                            {meta && <div className="small text-secondary mb-2">{meta}</div>}
                            {activity?.description && <p className="mb-0">{activity.description}</p>}

                            <div className="mt-3 p-3 border rounded pb-modal-panel">
                                <ActivityRunner
                                    activity={activity}
                                    onSaved={async () => {
                                        // El runner decide cuándo “termina”.
                                        // Por defecto completamos igual que legacy (pero con puntos correctos).
                                        if (onSaved) return onSaved();
                                        return onComplete?.();
                                    }}
                                />
                            </div>
                        </div>

                        <div className="modal-footer">

                            {/* Botón legacy SOLO si NO existe runner implementado */}
                            {!runnerImplemented && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={onComplete}
                                >
                                    Empezar ahora
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="modal-backdrop show" />
        </>
    );
};
