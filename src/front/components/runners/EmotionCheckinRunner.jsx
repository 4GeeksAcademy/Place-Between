import React, { useEffect, useMemo, useState } from "react";

const getBackendUrl = () =>
    (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

const normalize = (s) =>
    String(s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

const ALLOWED_EMOTION_NAMES = new Set(["alegria", "tristeza", "ira", "miedo"]);

export const EmotionCheckinRunner = ({ onSaved }) => {
    const BACKEND_URL = getBackendUrl();
    const token = localStorage.getItem("pb_token");

    const [emotions, setEmotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    const [emotionId, setEmotionId] = useState("");
    const [intensity, setIntensity] = useState(5);
    const [note, setNote] = useState("");

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                setErr(null);

                if (!BACKEND_URL) throw new Error("VITE_BACKEND_URL no está configurado.");

                const res = await fetch(`${BACKEND_URL}/api/emotions`);
                const data = await res.json().catch(() => null);

                if (!res.ok) throw new Error(data?.msg || "Error cargando emociones");
                if (!Array.isArray(data))
                    throw new Error("Respuesta inválida del backend (no es lista).");

                const filtered = data.filter((e) =>
                    ALLOWED_EMOTION_NAMES.has(normalize(e.name))
                );

                if (filtered.length === 0) {
                    throw new Error("No hay emociones válidas en DB. Crea: Alegría, Tristeza, Ira y Miedo.");
                }

                setEmotions(filtered);
                setEmotionId(String(filtered[0].id));
            } catch (e) {
                setErr(e?.message || "Error cargando emociones");
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [BACKEND_URL]);

    const selectedEmotion = useMemo(
        () => emotions.find((e) => String(e.id) === String(emotionId)),
        [emotions, emotionId]
    );

    const save = async () => {
        try {
            if (saving || saved) return;

            setSaving(true);
            setErr(null);

            if (!emotionId) throw new Error("Selecciona una emoción.");
            if (!token) throw new Error("Necesitas iniciar sesión para guardar el check-in.");
            if (!BACKEND_URL) throw new Error("VITE_BACKEND_URL no está configurado.");

            const res = await fetch(`${BACKEND_URL}/api/emotions/checkin`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    emotion_id: Number(emotionId),
                    intensity: Number(intensity),
                    note,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.msg || "No se pudo guardar el check-in");

            window.dispatchEvent(new Event("pb:emotion-updated"));

            setSaved(true);

            window.setTimeout(() => {
                onSaved?.({
                    type: "emotion_checkin",
                    emotion_id: Number(emotionId),
                    intensity: Number(intensity),
                    note,
                });
            }, 700);
        } catch (e) {
            setErr(e?.message || "Error guardando check-in");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-secondary">Cargando emociones…</div>;
    if (err) return <div className="alert alert-warning mb-0">{err}</div>;

    const locked = saving || saved;

    return (
        <div>
            <div className="mb-3">
                <label className="form-label fw-semibold">¿Qué emoción predomina ahora?</label>
                <select
                    className="form-select"
                    value={emotionId}
                    onChange={(e) => setEmotionId(e.target.value)}
                    disabled={locked}
                >
                    {emotions.map((e) => (
                        <option key={e.id} value={e.id}>
                            {e.name}
                        </option>
                    ))}
                </select>

                {selectedEmotion?.description && (
                    <div className="small text-secondary mt-2">{selectedEmotion.description}</div>
                )}
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
                    disabled={locked}
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
                    placeholder="¿Qué lo ha provocado? ¿Qué necesitas?"
                    disabled={locked}
                />
            </div>

            {saved && (
                <div className="alert alert-success pb-fade-in">
                    Guardado. Gracias por registrarlo.
                </div>
            )}

            <button className="btn btn-primary w-100" onClick={save} disabled={locked}>
                {saving ? "Guardando…" : saved ? "Guardado" : "Guardar check-in"}
            </button>
        </div>
    );
};