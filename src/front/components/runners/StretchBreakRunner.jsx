import React, { useEffect, useMemo, useState } from "react";

const PRESETS = [
    { key: "quick", label: "Rápido (2 min)", seconds: 120 },
    { key: "standard", label: "Estándar (4 min)", seconds: 240 },
    { key: "deep", label: "Completo (6 min)", seconds: 360 },
];

const fmt = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
};

export const StretchBreakRunner = ({ activity, onSaved }) => {
    const [presetKey, setPresetKey] = useState("standard");
    const preset = useMemo(() => PRESETS.find((p) => p.key === presetKey) || PRESETS[1], [presetKey]);

    const [running, setRunning] = useState(false);
    const [left, setLeft] = useState(preset.seconds);

    useEffect(() => {
        if (!running) setLeft(preset.seconds);
    }, [preset.seconds, running]);

    useEffect(() => {
        if (!running) return;
        if (left <= 0) return;

        const t = window.setTimeout(() => setLeft((v) => v - 1), 1000);
        return () => window.clearTimeout(t);
    }, [running, left]);

    const start = () => setRunning(true);

    const finish = () => {
        onSaved?.({
            type: "stretch_break",
            preset: presetKey,
            totalSeconds: preset.seconds,
        });
    };

    const done = running && left <= 0;

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Pausa activa"}</div>
            <div className="small text-secondary mb-3">
                Movimiento suave. No fuerces: busca soltar tensión.
            </div>

            {!running && (
                <>
                    <div className="btn-group w-100 mb-3" role="group">
                        {PRESETS.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                className={`btn ${presetKey === p.key ? "btn-primary" : "btn-outline-primary"}`}
                                onClick={() => setPresetKey(p.key)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <button className="btn btn-primary w-100" onClick={start}>
                        Empezar
                    </button>
                </>
            )}

            {running && (
                <>
                    <div className="p-3 border rounded mb-3 text-center">
                        <div className="small text-secondary mb-1">Tiempo restante</div>
                        <div className="display-6 mb-0">{fmt(Math.max(0, left))}</div>
                    </div>

                    {!done ? (
                        <button className="btn btn-outline-primary w-100" onClick={finish}>
                            Finalizar antes y completar
                        </button>
                    ) : (
                        <button className="btn btn-primary w-100" onClick={finish}>
                            Completar
                        </button>
                    )}
                </>
            )}
        </div>
    );
};
