import React, { useState } from "react";

export const ReframeRunner = ({ activity, onSaved }) => {
    const [thought, setThought] = useState("");
    const [reframe, setReframe] = useState("");

    const save = () => {
        onSaved?.({
            type: "reframe",
            thought: thought.trim() || null,
            reframe: reframe.trim() || null,
        });
    };

    const disabled = !thought.trim() || !reframe.trim();

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Reencuadre breve"}</div>
            <div className="small text-secondary mb-3">
                Escribe una frase alternativa más útil (no “positiva”, útil).
            </div>

            <div className="mb-3">
                <label className="form-label fw-semibold">Pensamiento que se repite</label>
                <input
                    className="form-control"
                    value={thought}
                    onChange={(e) => setThought(e.target.value)}
                    placeholder="Ej: ‘Lo hice fatal’"
                />
            </div>

            <div className="mb-3">
                <label className="form-label fw-semibold">Reencuadre útil</label>
                <input
                    className="form-control"
                    value={reframe}
                    onChange={(e) => setReframe(e.target.value)}
                    placeholder="Ej: ‘No fue perfecto, pero aprendí X y mañana ajusto Y’"
                />
            </div>

            <button className="btn btn-primary w-100" onClick={save} disabled={disabled}>
                Guardar y completar
            </button>
        </div>
    );
};
