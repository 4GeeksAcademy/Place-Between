import React, { useMemo, useState } from "react";

const AREAS = [
    { key: "jaw", label: "Mandíbula" },
    { key: "neck", label: "Cuello / hombros" },
    { key: "chest", label: "Pecho" },
    { key: "stomach", label: "Estómago" },
    { key: "throat", label: "Garganta" },
    { key: "breath", label: "Respiración" },
];

export const SomaticCheckRunner = ({ activity, onSaved }) => {
    const [selected, setSelected] = useState(() => new Set());
    const [intensity, setIntensity] = useState(5);
    const [note, setNote] = useState("");

    const toggle = (k) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    };

    const selectedLabels = useMemo(() => {
        const map = new Map(AREAS.map((a) => [a.key, a.label]));
        return [...selected].map((k) => map.get(k)).filter(Boolean);
    }, [selected]);

    const save = () => {
        onSaved?.({
            type: "somatic_check",
            areas: selectedLabels,
            intensity: Number(intensity),
            note: note.trim() || null,
        });
    };

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Chequeo somático"}</div>
            <div className="small text-secondary mb-3">
                Marca dónde lo notas más fuerte. No hace falta “arreglar” nada: solo observar.
            </div>

            <div className="mb-3">
                <div className="d-flex flex-wrap gap-2">
                    {AREAS.map((a) => {
                        const active = selected.has(a.key);
                        return (
                            <button
                                key={a.key}
                                type="button"
                                className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-primary"}`}
                                onClick={() => toggle(a.key)}
                            >
                                {a.label}
                            </button>
                        );
                    })}
                </div>
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
                <div className="d-flex justify-content-between small text-secondary">
                    <span>Suave</span>
                    <span>Muy intensa</span>
                </div>
            </div>

            <div className="mb-3">
                <label className="form-label fw-semibold">Nota (opcional)</label>
                <textarea
                    className="form-control"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ej: mandíbula tensa tras reunión…"
                />
            </div>

            <button className="btn btn-primary w-100" onClick={save}>
                Guardar y completar
            </button>
        </div>
    );
};
