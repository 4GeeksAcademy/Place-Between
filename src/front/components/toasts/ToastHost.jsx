// Este componente renderiza los toasts en pantalla
import React, { useEffect } from "react";
import { useToasts } from "./ToastContext";

export const ToastHost = ({ isNight = false }) => {
    const { toasts, remove } = useToasts();

    useEffect(() => {
        // Programa autocierre por toast (si tiene durationMs)
        toasts.forEach((t) => {
            if (!t.durationMs) return;
            if (t._timer) return; // evita duplicar si se re-renderiza
        });
    }, [toasts]);

    return (
        <div
            className="position-fixed bottom-0 end-0 p-3"
            style={{ zIndex: 1080 }}
            aria-live="polite"
            aria-atomic="true"
        >
            <div className="d-flex flex-column gap-2">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} isNight={isNight} onClose={() => remove(t.id)} />
                ))}
            </div>
        </div>
    );
};

const ToastItem = ({ toast, isNight, onClose }) => {
    useEffect(() => {
        const ms = Number(toast.durationMs);
        if (!ms) return;
        const timer = window.setTimeout(() => onClose?.(), ms);
        return () => window.clearTimeout(timer);
    }, [toast.durationMs, onClose]);

    if (toast.type === "points") {
        return (
            <div className={`toast show border-0 shadow-sm ${isNight ? "text-bg-dark" : ""}`}>
                <div className="toast-body">
                    <div className="fw-semibold">+{toast.points} puntos</div>
                    <div className={`small ${isNight ? "opacity-75" : "text-secondary"}`}>{toast.reason}</div>
                </div>
            </div>
        );
    }

    // fallback genérico
    return (
        <div className={`toast show border-0 shadow-sm ${isNight ? "text-bg-dark" : ""}`}>
            <div className="toast-body">
                <div className="fw-semibold">{toast.title || "Aviso"}</div>
                {toast.message && <div className={`small ${isNight ? "opacity-75" : "text-secondary"}`}>{toast.message}</div>}
            </div>
        </div>
    );
};
