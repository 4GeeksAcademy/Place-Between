import React, { useMemo, useState } from "react";

const TIPS = [
    "Ponle nombre a la emoción: reduce la activación y clarifica la decisión.",
    "Si estás rumiando, vuelve a lo sensorial: 3 cosas que ves + 2 que oyes + 1 que sientes.",
    "Pregunta útil: ¿qué necesidad hay detrás de lo que siento ahora?",
    "Micro-pausa: exhala más largo que inhalas durante 60–90s.",
];

export const LibraryTipRunner = ({ activity, onSaved }) => {
    const tip = useMemo(() => {
        const i = Math.floor(Math.random() * TIPS.length);
        return TIPS[i];
    }, []);

    const [note, setNote] = useState("");

    const save = () => {
        onSaved?.({
            type: "library_tip",
            tip,
            note: note.trim() || null,
        });
    };

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Tip del día"}</div>

            {activity?.description && (
                <div className="small text-secondary mb-3">{activity.description}</div>
            )}

            <div className="p-3 border rounded mb-3">
                <div className="fw-semibold mb-1">Idea rápida</div>
                <div className="text-secondary">{tip}</div>
            </div>

            <div className="mb-3">
                <label className="form-label fw-semibold">Aplicación (opcional)</label>
                <textarea
                    className="form-control"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="¿Cómo lo aplicarías hoy?"
                />
            </div>

            <button className="btn btn-primary w-100" onClick={save}>
                Completar
            </button>
        </div>
    );
};
