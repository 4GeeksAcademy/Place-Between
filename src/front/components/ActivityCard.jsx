import React from "react";

export const ActivityCard = ({
    activity,
    completed = false,
    variant = "compact", // "hero" | "compact"
    onStart,
    onComplete,
    showCompleteButton = true,
}) => {
    return (
        <div className={`pb-activity card shadow-sm ${variant === "hero" ? "pb-activity-hero" : ""}`}>
            {activity.image && (
                <div className="pb-activity-imgWrap">
                    <img className="pb-activity-img" src={activity.image} alt={activity.title} />
                </div>
            )}

            <div className={`card-body ${variant === "hero" ? "p-4 p-lg-5" : "p-4"}`}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                    <div>
                        <div className="pb-meta">
                            <span className={`badge ${activity.branchBadge || "text-bg-light border"}`}>{activity.branch}</span>
                            <span className="pb-dot" />
                            <span className="text-secondary small">{activity.duration} min</span>
                            {completed && (
                                <>
                                    <span className="pb-dot" />
                                    <span className="badge text-bg-success">Completada</span>
                                </>
                            )}
                        </div>

                        <h3 className={`${variant === "hero" ? "h3" : "h5"} fw-bold mt-2 mb-2`}>
                            {activity.title}
                        </h3>

                        <p className="text-secondary mb-0">{activity.description}</p>
                    </div>

                    {activity.priority && variant === "hero" && (
                        <span className="badge text-bg-warning">Prioridad</span>
                    )}
                </div>

                <div className="d-flex flex-wrap gap-2 mt-3">
                    <button className="btn btn-primary" onClick={() => onStart?.(activity)}>
                        Empezar
                    </button>

                    
                </div>

                {activity.reason && (
                    <div className="mt-3 small text-secondary">
                        <span className="fw-semibold">Sugerencia:</span> {activity.reason}
                    </div>
                )}
            </div>
        </div>
    );
};
