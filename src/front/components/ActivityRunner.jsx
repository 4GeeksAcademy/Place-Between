import React, { useEffect, useMemo, useState } from "react";

const getBackendUrl = () => (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

// Normaliza: lower + sin tildes + trim
const normalize = (s) =>
    String(s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

// MVP: 4 ramas base (permitimos variantes)
const ALLOWED_EMOTION_NAMES = new Set([
    "alegria",
    "tristeza",
    "ira",
    "miedo",
]);

const getIntensityTier = (n) => {
    if (n <= 3) return "low";
    if (n <= 7) return "mid";
    return "high";
};

export const ActivityRunner = ({ activity, onSaved }) => {
    const runKey = activity?.run;

    // Alias para no romper si aún hay activities con run antiguo
    if (runKey === "emotion_checkin" || runKey === "emotion_picker") {
        return <EmotionCheckinRunner onSaved={onSaved} />;
    }

    return (
        <div className="text-secondary">
            Runner no implementado aún: <span className="pb-mono">{String(runKey)}</span>
        </div>
    );
};

const EmotionCheckinRunner = ({ onSaved }) => {
    const BACKEND_URL = getBackendUrl();
    const token = localStorage.getItem("pb_token"); // necesario SOLO para guardar

    const [emotions, setEmotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    const [emotionId, setEmotionId] = useState("");
    const [intensity, setIntensity] = useState(5); // 1..10
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                setErr(null);

                if (!BACKEND_URL) throw new Error("VITE_BACKEND_URL no está configurado.");

                // GET /api/emotions ahora es público en tu backend
                const res = await fetch(`${BACKEND_URL}/api/emotions`);
                const data = await res.json().catch(() => null);

                if (!res.ok) throw new Error(data?.msg || "Error cargando emociones");
                if (!Array.isArray(data)) throw new Error("Respuesta inválida del backend (no es lista).");

                const filtered = data.filter((e) => ALLOWED_EMOTION_NAMES.has(normalize(e.name)));

                if (filtered.length === 0) {
                    throw new Error(
                        "No hay emociones válidas en DB. Crea: Alegría, Tristeza, Ira y Miedo (o Ansiedad)."
                    );
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

    const intensityTier = useMemo(() => getIntensityTier(Number(intensity)), [intensity]);

    const save = async () => {
        try {
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

            onSaved?.(data);
        } catch (e) {
            setErr(e?.message || "Error guardando check-in");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-secondary">Cargando emociones…</div>;
    if (err) return <div className="alert alert-warning mb-0">{err}</div>;

    return (
        <div>
            <div className="mb-3">
                <label className="form-label fw-semibold">¿Qué emoción predomina ahora?</label>
                <select className="form-select" value={emotionId} onChange={(e) => setEmotionId(e.target.value)}>
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
                />
            </div>

            <button className="btn btn-primary w-100" onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar check-in"}
            </button>
        </div>
    );
};
