import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { MusicPlayerContext } from "./MusicPlayerContext.jsx";

/**
 * MusicDock (flotante)
 * - Persistente entre pantallas (vive en AppLayout).
 * - Controles: Auto / Default / Silencio + Play/Pause + hint.
 */
export const MusicDock = () => {
    const music = useContext(MusicPlayerContext);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    const modeLabel = useMemo(() => {
        const m = music?.musicMode || "auto";
        if (m === "off") return "Silencio";
        if (m === "default") return "Default";
        return "Auto";
    }, [music?.musicMode]);

    const pillTitle =
        "Se adapta a tu estado emocional.\n" +
        "Auto: por emoción · Default: playlist fija · Silencio: sin música";

    // Cerrar dropdown al click fuera
    useEffect(() => {
        const onDocClick = (e) => {
            if (!open) return;
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    const setMode = (m) => {
        music?.setMusicMode?.(m);
        setOpen(false);
    };

    const disabled = (music?.musicMode || "auto") === "off";

    return (
        <div
            ref={rootRef}
            className="pb-music-dock"
            aria-label="Music dock"
        >
            <div className="pb-music-dock-row">
                {/* Pill / dropdown trigger */}
                <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill d-flex align-items-center gap-2 pb-music-pill"
                    onClick={() => setOpen((v) => !v)}
                    title={pillTitle}
                >
                    <span className="pb-mono">Música:</span>
                    <span className="fw-semibold">{modeLabel}</span>

                    {(music?.musicMode || "auto") !== "off" && (
                        <span
                            className={`badge ${music?.soundEnabled ? "text-bg-success" : "text-bg-secondary"
                                }`}
                        >
                            {music?.soundEnabled ? "ON" : "OFF"}
                        </span>
                    )}
                    <span className="pb-music-caret" aria-hidden="true">▾</span>
                </button>

                {/* Play/Pause */}
                <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill pb-music-toggle"
                    onClick={() => music?.toggleSound?.()}
                    disabled={disabled}
                    title={music?.soundEnabled ? "Pausar música" : "Reproducir música"}
                >
                    {music?.soundEnabled ? "🔊" : "🔈"}
                </button>
            </div>

            {/* Hint */}
            {music?.musicHint && (
                <div className="small text-secondary pb-music-hint" title={music.musicHint}>
                    {music.musicHint}
                </div>
            )}

            {/* Dropdown menu */}
            {open && (
                <div className="pb-music-menu" role="menu">
                    <button className="pb-music-item" onClick={() => setMode("auto")} role="menuitem">
                        Auto (emociones)
                    </button>
                    <button className="pb-music-item" onClick={() => setMode("default")} role="menuitem">
                        Default
                    </button>
                    <div className="pb-music-sep" />
                    <button className="pb-music-item pb-music-item-danger" onClick={() => setMode("off")} role="menuitem">
                        Silencio
                    </button>
                </div>
            )}
        </div>
    );
};
