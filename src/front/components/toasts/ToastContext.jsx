import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const remove = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const push = useCallback((toast) => {
        const id = uid();
        const item = { id, ...toast };
        setToasts((prev) => [...prev, item]);
        return id;
    }, []);

    const pushPointsToast = useCallback(
        ({ points, reason }, opts = {}) => {
            return push({
                type: "points",
                points,
                reason,
                durationMs: opts.durationMs ?? 2200,
            });
        },
        [push]
    );

    const value = useMemo(
        () => ({ toasts, push, pushPointsToast, remove }),
        [toasts, push, pushPointsToast, remove]
    );

    return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToasts = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToasts must be used within <ToastProvider />");
    return ctx;
};
