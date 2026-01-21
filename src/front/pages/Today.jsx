import React, { useEffect, useState } from "react";
import { getToken } from "../services/authService";

export const Today = () => {
    const [mirror, setMirror] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const token = getToken();
        if (!token) return;

        fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/mirror/today`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (r) => {
                if (!r.ok) throw new Error("No se pudo cargar el estado de hoy.");
                return r.json();
            })
            .then(setMirror)
            .catch((e) => setError(e.message));
    }, []);

    return (
        <div className="container py-5">
            <h1 className="h2 fw-bold mb-2">Hoy</h1>

            {error && <div className="alert alert-warning">{error}</div>}

            {mirror ? (
                <pre className="p-3 bg-light border rounded-3 small mb-0">{JSON.stringify(mirror, null, 2)}</pre>
            ) : (
                <p className="text-secondary">Cargando…</p>
            )}
        </div>
    );
};
