import React, { useState } from "react";

export const NightJournalRunner = ({ activity, onSaved }) => {
    const [text, setText] = useState("");

    const save = () => {
        onSaved?.({
            type: "night_journal",
            text: text.trim() || null,
        });
    };

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Reflexión (1 frase)"}</div>
            <div className="small text-secondary mb-3">
                ¿Qué te ha enseñado hoy esa emoción?
            </div>

            <textarea
                className="form-control mb-3"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Una frase. Sin juicio."
            />

            <button className="btn btn-primary w-100" onClick={save} disabled={!text.trim()}>
                Guardar y completar
            </button>
        </div>
    );
};
