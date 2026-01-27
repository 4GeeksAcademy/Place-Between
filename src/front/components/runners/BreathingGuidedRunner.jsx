import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * BreathingGuidedRunner (v3 UX)
 * - Setup: explicación + selector preset + selector patrón
 * - Start => countdown 3-2-1 => running
 * - Running: orb (bola) que crece/aguanta/decrece + texto dentro (Inhala/Aguanta/Exhala)
 * - Color dinámico:
 *    - Inhala: azul/cian más claro
 *    - Aguanta: azul más profundo
 *    - Exhala: tono ligeramente más violeta
 *    - La intensidad oscurece al inflar y aclara al exhalar
 * - Finish => onSaved(payload)
 *
 * Props:
 *  - run: { type, defaultPreset, presets, patterns }
 *  - activity: (opcional) { title, description }
 *  - onSaved(payload)
 */
export const BreathingGuidedRunner = ({ run, activity, onSaved }) => {
    // ---------- 1) Defaults seguros (incluye patrón Calma 4–2–6 por defecto) ----------
    const presets = run?.presets || {
        quick: { label: "Rápido (2 min)", totalSeconds: 120, pattern: "calm_4_2_6" },
        standard: { label: "Estándar (3 min)", totalSeconds: 180, pattern: "calm_4_2_6" },
        deep: { label: "Profundo (5 min)", totalSeconds: 300, pattern: "calm_4_2_6" },
    };

    const patterns = run?.patterns || {
        calm_4_2_6: { label: "Calma (4–2–6)", inhale: 4, hold: 2, exhale: 6 },
        box_4_4_4_4: { label: "Box (4–4–4–4)", inhale: 4, hold: 4, exhale: 4, hold2: 4 },
    };

    const defaultPresetKey =
        run?.defaultPreset && presets[run.defaultPreset] ? run.defaultPreset : "standard";

    // ---------- 2) Estado UX ----------
    const [stage, setStage] = useState("setup"); // setup | countdown | running | done
    const [countdown, setCountdown] = useState(3);

    const [presetKey, setPresetKey] = useState(defaultPresetKey);
    const preset = presets[presetKey] || presets.standard;

    const derivedPatternKey =
        preset?.pattern && patterns[preset.pattern] ? preset.pattern : "calm_4_2_6";
    const [patternKey, setPatternKey] = useState(derivedPatternKey);
    const pattern = patterns[patternKey] || patterns.calm_4_2_6;

    // Si cambias preset, ajusta patrón por defecto si el preset lo define (solo en setup)
    useEffect(() => {
        if (stage !== "setup") return;
        const next =
            preset?.pattern && patterns[preset.pattern] ? preset.pattern : "calm_4_2_6";
        setPatternKey(next);
    }, [presetKey]);

    const totalSeconds = Number(preset?.totalSeconds) || 180;

    // ---------- 3) Plan de fases ----------
    const phasePlan = useMemo(() => {
        const inhale = Number(pattern?.inhale) || 4;
        const hold = Number(pattern?.hold) || 2;
        const exhale = Number(pattern?.exhale) || 6;
        const hold2 = Number(pattern?.hold2) || 2;

        const phases = [
            { key: "inhale", label: "Inhala", seconds: inhale },
            ...(hold > 0 ? [{ key: "hold", label: "Aguanta", seconds: hold }] : []),
            { key: "exhale", label: "Exhala", seconds: exhale },
            ...(hold2 > 0 ? [{ key: "hold2", label: "Aguanta", seconds: hold2 }] : []),
        ];

        const cycleSeconds = phases.reduce((acc, p) => acc + p.seconds, 0) || 1;
        return { phases, cycleSeconds };
    }, [pattern]);

    // ---------- 4) Motor tiempo (RAF) ----------
    const rafRef = useRef(null);
    const startAtRef = useRef(null);        // performance.now() cuando arrancas o reanudas
    const pausedElapsedRef = useRef(0);     // ms acumulados antes de pausar
    const [elapsedMs, setElapsedMs] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const stopRaf = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
    };

    const tick = () => {
        const now = performance.now();
        const startAt = startAtRef.current ?? now;
        const nextElapsed = pausedElapsedRef.current + (now - startAt);

        setElapsedMs(nextElapsed);

        if (nextElapsed >= totalSeconds * 1000) {
            stopRaf();
            setStage("done");
            setIsPaused(false);
            return;
        }

        rafRef.current = requestAnimationFrame(tick);
    };

    const startRunning = () => {
        setElapsedMs(0);
        pausedElapsedRef.current = 0;
        startAtRef.current = performance.now();
        setIsPaused(false);
        setStage("running");
        stopRaf();
        rafRef.current = requestAnimationFrame(tick);
    };

    const pause = () => {
        if (stage !== "running") return;
        stopRaf();
        // guardamos lo que llevamos hasta ahora
        pausedElapsedRef.current = elapsedMs;
        startAtRef.current = null;
        setIsPaused(true);
    };

    const resume = () => {
        if (stage !== "running") return;
        startAtRef.current = performance.now();
        setIsPaused(false);
        stopRaf();
        rafRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => () => stopRaf(), []);

    // ---------- 5) Countdown ----------
    useEffect(() => {
        if (stage !== "countdown") return;

        setCountdown(3);
        const t = window.setInterval(() => {
            setCountdown((c) => {
                if (c <= 1) {
                    window.clearInterval(t);
                    startRunning();
                    return 0;
                }
                return c - 1;
            });
        }, 900);

        return () => window.clearInterval(t);
    }, [stage]);

    // ---------- 6) Derivados (fase actual + progreso) ----------
    const elapsedSec = Math.min(totalSeconds, elapsedMs / 1000);
    const remainingSec = Math.max(0, Math.ceil(totalSeconds - elapsedSec));

    const currentPhase = useMemo(() => {
        const phases = phasePlan.phases;
        const cycle = phasePlan.cycleSeconds || 1;
        const t = elapsedSec % cycle;

        let acc = 0;
        for (let i = 0; i < phases.length; i++) {
            const p = phases[i];
            acc += p.seconds;
            if (t < acc) return p;
        }
        return phases[0] || { key: "inhale", label: "Inhala", seconds: 4 };
    }, [elapsedSec, phasePlan]);

    const phaseProgress = useMemo(() => {
        const phases = phasePlan.phases;
        const cycle = phasePlan.cycleSeconds || 1;
        const t = elapsedSec % cycle;

        let acc = 0;
        for (let i = 0; i < phases.length; i++) {
            const p = phases[i];
            const start = acc;
            const end = acc + p.seconds;
            if (t >= start && t < end) {
                const denom = Math.max(0.001, p.seconds);
                return (t - start) / denom; // 0..1
            }
            acc = end;
        }
        return 0;
    }, [elapsedSec, phasePlan]);

    // ---------- 7) Orb scale (más expresivo) ----------
    const orbScale = useMemo(() => {
        if (stage !== "running") return 0.9;

        const base = 0.85;
        const peak = 1.30;

        if (currentPhase.key === "inhale") return base + (peak - base) * phaseProgress;
        if (currentPhase.key === "exhale") return peak - (peak - base) * phaseProgress;

        // hold: mantener arriba (tras inhalar)
        if (currentPhase.key === "hold") return peak;

        // hold2: mantener abajo (tras exhalar)
        if (currentPhase.key === "hold2") return base;

        return 1;
    }, [stage, currentPhase.key, phaseProgress]);

    // ---------- 8) Color: intensidad + matiz por fase ----------
    const orbIntensity = useMemo(() => {
        if (stage !== "running") return 0;

        if (currentPhase.key === "inhale") return phaseProgress;
        if (currentPhase.key === "exhale") return 1 - phaseProgress;

        // hold / hold2
        return 1;
    }, [stage, currentPhase.key, phaseProgress]);

    const lerp = (a, b, t) => a + (b - a) * t;

    // Elegimos un "par" de colores por fase: claro -> oscuro
    // inhale: más cian
    // hold: azul profundo
    // exhale: un poco más violeta
    const orbColor = useMemo(() => {
        const t = Math.min(1, Math.max(0, orbIntensity));

        const phase = currentPhase.key;

        let light = { r: 150, g: 205, b: 255 }; // default (azul claro)
        let dark = { r: 35, g: 110, b: 190 };   // default (azul oscuro)

        if (phase === "inhale") {
            light = { r: 155, g: 230, b: 255 }; // más cian
            dark = { r: 40, g: 135, b: 210 };
        } else if (phase === "hold" || phase === "hold2") {
            light = { r: 125, g: 185, b: 255 }; // menos brillante
            dark = { r: 25, g: 95, b: 175 };    // profundo
        } else if (phase === "exhale") {
            light = { r: 190, g: 190, b: 255 }; // violeta suave
            dark = { r: 85, g: 90, b: 200 };
        }

        const r = Math.round(lerp(light.r, dark.r, t));
        const g = Math.round(lerp(light.g, dark.g, t));
        const b = Math.round(lerp(light.b, dark.b, t));

        // alpha y glow varían con intensidad
        const a = lerp(0.28, 0.55, t);
        const glowA = lerp(0.20, 0.60, t);

        return {
            fill: `rgba(${r}, ${g}, ${b}, ${a})`,
            glow: `rgba(${r}, ${g}, ${b}, ${glowA})`,
        };
    }, [orbIntensity, currentPhase.key]);

    // ---------- 9) Helpers ----------
    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, "0")}`;
    };

    const begin = () => setStage("countdown");

    const reset = () => {
        stopRaf();
        setElapsedMs(0);
        startAtRef.current = null;
        setStage("setup");
    };

    const finish = () => {
        onSaved?.({
            type: "breathing_guided",
            presetKey,
            patternKey,
            totalSeconds,
        });
    };

    // ---------- 10) UI ----------
    if (stage === "setup") {
        return (
            <div>
                <div className="mb-3">
                    <div className="fw-semibold mb-1">{activity?.title || "Respiración guiada"}</div>
                    <div className="text-secondary small">
                        {activity?.description ||
                            "Elige una duración y un patrón. Luego pulsa Empezar."}
                    </div>
                </div>

                <div className="mb-3">
                    <div className="fw-semibold mb-2">Duración</div>
                    <div className="btn-group w-100" role="group" aria-label="Duración">
                        {Object.entries(presets).map(([key, p]) => (
                            <button
                                key={key}
                                type="button"
                                className={`btn ${presetKey === key ? "btn-primary" : "btn-outline-primary"
                                    }`}
                                onClick={() => setPresetKey(key)}
                            >
                                {p.label || key}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-3">
                    <div className="fw-semibold mb-2">Patrón</div>
                    <select
                        className="form-select"
                        value={patternKey}
                        onChange={(e) => setPatternKey(e.target.value)}
                    >
                        {Object.entries(patterns).map(([key, p]) => (
                            <option key={key} value={key}>
                                {p.label || key}
                            </option>
                        ))}
                    </select>

                    <div className="small text-secondary mt-2">
                        Inhala {pattern.inhale}s · Aguanta {pattern.hold || 0}s · Exhala{" "}
                        {pattern.exhale}s
                        {pattern.hold2 ? ` · Aguanta ${pattern.hold2}s` : ""}
                    </div>
                </div>

                <button className="btn btn-primary w-100" onClick={begin}>
                    Empezar
                </button>
            </div>
        );
    }

    if (stage === "countdown") {
        return (
            <div
                className="d-flex flex-column align-items-center justify-content-center"
                style={{ minHeight: 260 }}
            >
                <div className="text-secondary mb-2">Prepárate…</div>
                <div className="display-3 fw-bold">{countdown}</div>
            </div>
        );
    }

    if (stage === "done") {
        return (
            <div>
                <div className="alert alert-success mb-3">
                    Listo. Has completado la respiración.
                </div>
                <button className="btn btn-success w-100" onClick={finish}>
                    Guardar y volver
                </button>
                <button className="btn btn-outline-secondary w-100 mt-2" onClick={reset}>
                    Repetir
                </button>
            </div>
        );
    }

    // stage === "running"
    return (
        <div>
            <div className="d-flex justify-content-end align-items-center mb-2">
                <div className="pb-mono fw-bold">{fmt(remainingSec)}</div>
            </div>

            {/* Orb */}
            <div
                className="d-flex align-items-center justify-content-center rounded border"
                style={{ height: 240, position: "relative", overflow: "hidden" }}
            >
                <div
                    style={{
                        width: 130,
                        height: 130,
                        borderRadius: 999,
                        transform: `scale(${orbScale})`,
                        transition:
                            "transform 120ms linear, background-color 120ms linear, box-shadow 120ms linear",
                        background: orbColor.fill,
                        boxShadow: `0 0 55px ${orbColor.glow}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <div style={{ textAlign: "center", lineHeight: 1.1 }}>
                        <div className="fw-semibold" style={{ fontSize: 18 }}>
                            {currentPhase.label}
                        </div>
                    </div>
                </div>
            </div>

            <div className="small text-secondary mt-2">
                Patrón: {pattern.label || patternKey} · Inhala {pattern.inhale}s · Aguanta {pattern.hold || 0}s · Exhala {pattern.exhale}s
                {pattern.hold2 ? ` · Aguanta ${pattern.hold2}s` : ""}
                {isPaused ? " · (Pausado)" : ""}
            </div>

            <div className="d-flex gap-2 mt-3">
                {!isPaused ? (
                    <button className="btn btn-outline-primary flex-fill" onClick={pause}>
                        Pausar
                    </button>
                ) : (
                    <button className="btn btn-primary flex-fill" onClick={resume}>
                        Reanudar
                    </button>
                )}

                <button className="btn btn-outline-secondary flex-fill" onClick={reset}>
                    Reiniciar
                </button>
            </div>
        </div>
    );
};
