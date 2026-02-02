import React, { useState } from "react";

const AREAS = [
    "Pecho",
    "Estómago",
    "Garganta",
    "Mandíbula",
    "Hombros",
    "Cabeza",
    "Respiración",
    "Otro",
];

export const BodySignalRunner = ({ activity, onSaved }) => {
    const [area, setArea] = useState(AREAS[0]);
    const [intensity, setIntensity] = useState(5);
    const [note, setNote] = useState("");

    const save = () => {
        onSaved?.({
            type: "body_signal",
            area,
            intensity: Number(intensity),
            note: note.trim() || null,
        });
    };

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Señal corporal"}</div>
            <div className="small text-secondary mb-3">
                ¿Dónde se siente más fuerte? No es diagnóstico: es registro.
            </div>

            <div className="mb-3">
                <label className="form-label fw-semibold">Zona principal</label>
                <select className="form-select" value={area} onChange={(e) => setArea(e.target.value)}>
                    {AREAS.map((a) => (
                        <option key={a} value={a}>
                            {a}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mb-3">
                <label className="form-label fw-semibold">
                    Intensidad: <span className="pb-mono">{intensity}</span>/10
                </label>
                <input
                    type="range"
                    className="form-range"
                    min="1"
                    max="10"
                    step="1"
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                />
            </div>

            <div className="mb-3">
                <label className="form-label fw-semibold">Nota (opcional)</label>
                <textarea
                    className="form-control"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ej: presión en el pecho tras conversación…"
                />
            </div>

            <button className="btn btn-primary w-100" onClick={save}>
                Completar
            </button>
        </div>
    );
};
