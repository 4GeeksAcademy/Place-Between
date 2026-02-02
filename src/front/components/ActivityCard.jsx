import React from "react";

// Fallback visual para actividades sin imagen (DB-only o catálogo incompleto)
const FALLBACK_IMG = "/assets/img/rigo-baby.png"; // ajusta si tu ruta real es otra

export const ActivityCard = ({
    activity,
    completed = false,
    variant = "compact", // "hero" | "compact"
    onStart,
    onComplete, // compat
    showCompleteButton = true, // compat
}) => {
    const hasRun = Boolean(activity?.run);
    const duration = Number(activity?.duration);
    const durationLabel = Number.isFinite(duration) ? `${duration} min` : "—";

    // Imagen: si falta, usamos fallback (modelo 2A friendly)
    const imageSrc = activity?.image || FALLBACK_IMG;

    return (
        <div
            className={`pb-activity card shadow-sm h-100 ${variant === "hero" ? "pb-activity-hero" : ""
                }`}
        >
            {/* Imagen siempre visible para consistencia de layout */}
            <div className="pb-activity-imgWrap">
                <img
                    className="pb-activity-img"
                    src={imageSrc}
                    alt={activity?.title || "Actividad"}
                    loading="lazy"
                    onError={(e) => {
                        // Si la imagen remota falla, caemos al fallback local sin bucle infinito
                        if (e.currentTarget.src.includes("rigo-baby")) return;
                        e.currentTarget.src = FALLBACK_IMG;
                    }}
                />
            </div>

            {/* Body en flex-col para igualar alturas y anclar acciones abajo */}
            <div
                className={`card-body d-flex flex-column ${variant === "hero" ? "p-4 p-lg-5" : "p-4"
                    }`}
            >
                {/* MAIN: ocupa el espacio variable */}
                <div className="pb-activity-main flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start gap-3">
                        <div>
                            <div className="pb-meta">
                                <span className={`badge ${activity?.branchBadge || "text-bg-light border"}`}>
                                    {activity?.branch || "General"}
                                </span>

                                <span className="pb-dot" />
                                <span className="text-secondary small">{durationLabel}</span>

                                {completed && (
                                    <>
                                        <span className="pb-dot" />
                                        <span className="badge text-bg-success">Completada</span>
                                    </>
                                )}
                            </div>

                            <h3 className={`${variant === "hero" ? "h3" : "h5"} fw-bold mt-2 mb-2`}>
                                {activity?.title || "Actividad"}
                            </h3>

                            {/* Clamp para que no rompa alturas */}
                            <p className="pb-activity-desc text-secondary mb-0">
                                {activity?.description || "Sin descripción."}
                            </p>
                        </div>

                        {activity?.priority && variant === "hero" && (
                            <span className="badge text-bg-warning">Prioridad</span>
                        )}
                    </div>

                    {/* Mensajes (también con clamp) */}
                    {!hasRun && (
                        <div className="pb-activity-note mt-3 small text-secondary">
                            <span className="fw-semibold">Pendiente:</span> esta actividad aún no tiene runner asignado.
                        </div>
                    )}

                    {activity?.reason && (
                        <div className="pb-activity-reason mt-3 small text-secondary">
                            <span className="fw-semibold">Sugerencia:</span> {activity.reason}
                        </div>
                    )}
                </div>

                {/* ACTIONS: siempre abajo */}
                <div className="d-flex flex-wrap gap-2 mt-3 mt-auto pt-2">
                    <button
                        className="btn btn-primary"
                        onClick={() => onStart?.(activity)}
                        disabled={!hasRun}
                        title={!hasRun ? "Actividad pendiente de configuración (sin runner)" : "Empezar"}
                    >
                        Empezar
                    </button>

                    {/* Futuro: “Ver detalles”, etc. */}
                </div>
            </div>
        </div>
    );
};
