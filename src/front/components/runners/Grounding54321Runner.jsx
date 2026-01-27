import React, { useMemo, useState } from "react";

/**
 * Grounding54321Runner (thought_cut)
 * UX:
 * - setup: explicación + botón empezar
 * - running: pasos 5-4-3-2-1 con inputs opcionales
 * - outro: cierre suave (frase + mini-check) + "Guardar y volver"
 */
export const Grounding54321Runner = ({ activity, run, onSaved }) => {
    const steps = useMemo(() => {
        const fallback = [
            { key: "see", label: "5 cosas que ves", count: 5, placeholder: "Ej: una lámpara, la pantalla, una planta…" },
            { key: "feel", label: "4 cosas que sientes", count: 4, placeholder: "Ej: el aire en la piel, el peso del cuerpo…" },
            { key: "hear", label: "3 cosas que oyes", count: 3, placeholder: "Ej: tráfico, ventilador, voces…" },
            { key: "smell", label: "2 cosas que hueles", count: 2, placeholder: "Ej: café, jabón, aire…" },
            { key: "taste", label: "1 cosa que saboreas", count: 1, placeholder: "Ej: menta, agua, sabor residual…" },
        ];

        const raw = run?.steps;
        if (!Array.isArray(raw) || raw.length === 0) return fallback;

        return raw.map((s) => ({
            key: s.key || "step",
            label: s.label || "Paso",
            count: Number.isFinite(s.count) ? s.count : 1,
            placeholder: s.placeholder || "",
        }));
    }, [run]);

    const [stage, setStage] = useState("setup"); // setup | running | outro
    const [idx, setIdx] = useState(0);

    const [answers, setAnswers] = useState(() => {
        const init = {};
        for (const s of steps) init[s.key] = Array.from({ length: s.count }, () => "");
        return init;
    });

    // mini-check final (opcional)
    const [after, setAfter] = useState(""); // "mejor" | "igual" | "peor" | ""

    const step = steps[idx];

    const updateItem = (stepKey, i, value) => {
        setAnswers((prev) => ({
            ...prev,
            [stepKey]: (prev[stepKey] || []).map((v, j) => (j === i ? value : v)),
        }));
    };

    const next = () => {
        if (idx < steps.length - 1) setIdx((n) => n + 1);
        else setStage("outro");
    };

    const prev = () => setIdx((n) => Math.max(n - 1, 0));

    const finish = () => {
        onSaved?.({
            type: "thought_cut",
            variant: run?.variant || "grounding_54321",
            answers,
            after, // cómo se siente después (opcional)
            meta: {
                steps: steps.map((s) => ({ key: s.key, label: s.label, count: s.count })),
            },
        });
    };

    // ---------- UI: SETUP ----------
    if (stage === "setup") {
        return (
            <div>
                <div className="mb-2">
                    <div className="fw-semibold">¿En qué consiste?</div>
                    <div className="text-secondary small">
                        Este ejercicio te ayuda a “cortar” la rumiación trayendo la atención al presente
                        con tus sentidos. Puedes hacerlo mentalmente o escribiendo.
                    </div>
                </div>

                <div className="p-3 rounded border bg-body">
                    <div className="fw-semibold mb-1">Pasos</div>
                    <ul className="small text-secondary mb-0">
                        <li>5 cosas que ves</li>
                        <li>4 cosas que sientes</li>
                        <li>3 cosas que oyes</li>
                        <li>2 cosas que hueles</li>
                        <li>1 cosa que saboreas</li>
                    </ul>
                </div>

                <button className="btn btn-primary w-100 mt-3" onClick={() => setStage("running")}>
                    Empezar
                </button>
            </div>
        );
    }

    // ---------- UI: RUNNING ----------
    if (stage === "running") {
        const progressText = `${idx + 1}/${steps.length}`;

        return (
            <div>
                <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <div className="fw-semibold">{step.label}</div>
                        <div className="text-secondary small">Escribe si te ayuda. Si no, piensa y avanza.</div>
                    </div>
                    <div className="pb-mono small text-secondary">{progressText}</div>
                </div>

                <div className="d-flex flex-column gap-2">
                    {Array.from({ length: step.count }).map((_, i) => (
                        <input
                            key={`${step.key}-${i}`}
                            className="form-control"
                            value={(answers?.[step.key] || [])[i] ?? ""}
                            onChange={(e) => updateItem(step.key, i, e.target.value)}
                            // Placeholder solo en el primer input para no “repetir ruido”
                            placeholder={i === 0 ? step.placeholder : ""}
                        />
                    ))}
                </div>

                <div className="d-flex gap-2 mt-3">
                    <button className="btn btn-outline-secondary flex-fill" onClick={prev} disabled={idx === 0}>
                        Atrás
                    </button>

                    <button className="btn btn-primary flex-fill" onClick={next}>
                        {idx < steps.length - 1 ? "Siguiente" : "Terminar"}
                    </button>
                </div>
            </div>
        );
    }

    // ---------- UI: OUTRO (cierre suave) ----------
    return (
        <div>
            <div className="p-3 rounded border bg-body-tertiary">
                <div className="fw-semibold mb-1">Bien hecho.</div>
                <div className="text-secondary small mb-0">
                    Has traído tu atención al presente. No hace falta “sentirse perfecto” para que esto funcione:
                    a veces solo baja un poco el ruido.
                </div>
            </div>

            <div className="mt-3">
                <div className="fw-semibold mb-2">¿Cómo estás ahora?</div>
                <div className="d-flex gap-2">
                    <button
                        type="button"
                        className={`btn flex-fill ${after === "mejor" ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => setAfter("mejor")}
                    >
                        Mejor
                    </button>
                    <button
                        type="button"
                        className={`btn flex-fill ${after === "igual" ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => setAfter("igual")}
                    >
                        Igual
                    </button>
                    <button
                        type="button"
                        className={`btn flex-fill ${after === "peor" ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => setAfter("peor")}
                    >
                        Peor
                    </button>
                </div>
                <div className="small text-secondary mt-2">
                    (Opcional) Esto nos servirá más adelante para ver qué ejercicios te ayudan más.
                </div>
            </div>

            <button className="btn btn-success w-100 mt-3" onClick={finish}>
                Guardar y volver
            </button>
        </div>
    );
};
