import React, { useEffect, useMemo, useState } from "react";

/**
 * MirrorReviewRunner
 * - Fetch /api/mirror/week
 * - Muestra mini resumen semanal (chart + stats)
 * - Muestra categoría dominante + emoción dominante
 * - Permite reflexión opcional y completar actividad
 */

// Normaliza base URL (Vite)
const API_BASE = String(import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

// Token storage (ajusta si usas otra key)
const getToken = () => localStorage.getItem("pb_token");

const authHeaders = () => {
    const token = getToken();
    if (!token) return null;
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
};

// Convierte YYYY-MM-DD a etiqueta de día (Lun, Mar...)
const dayLabel = (iso) => {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    if (!y || !m || !d) return "—";
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return names[dt.getDay()] || "—";
};

/**
 * Helper: obtiene el "top" de una distribución tipo:
 * { "Tristeza": 3, "Ansiedad": 5 }
 */
const topFromDistribution = (obj) => {
    if (!obj || typeof obj !== "object") return null;

    const entries = Object.entries(obj)
        .map(([name, value]) => [String(name || "").trim(), Number(value) || 0])
        .filter(([name]) => name.length > 0);

    if (!entries.length) return null;

    entries.sort((a, b) => b[1] - a[1]);
    const [name, value] = entries[0];
    return { name, value };
};

function MiniLineChart({ series }) {
    const W = 560;
    const H = 160;
    const pad = 18;
    const padB = 28;

    const maxV = Math.max(...series.map((p) => p.value), 1);
    const minV = Math.min(...series.map((p) => p.value), 0);

    const n = Math.max(series.length, 2);
    const xStep = (W - pad * 2) / (n - 1);

    const yFor = (v) => {
        const range = Math.max(maxV - minV, 1);
        const t = (v - minV) / range;
        return pad + (1 - t) * (H - pad - padB);
    };

    const pts = series.map((p, i) => ({
        ...p,
        x: pad + i * xStep,
        y: yFor(p.value),
    }));

    const d = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ");

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-100" style={{ height: 170 }}>
            {/* grid */}
            {[0.33, 0.66].map((t) => {
                const y = pad + t * (H - pad - padB);
                return (
                    <line
                        key={t}
                        x1={pad}
                        x2={W - pad}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        opacity="0.12"
                    />
                );
            })}

            {/* line */}
            <path d={d} fill="none" stroke="currentColor" strokeWidth="3" opacity="0.9" />

            {/* points + labels */}
            {pts.map((p) => (
                <g key={p.iso || p.label}>
                    <circle cx={p.x} cy={p.y} r="5" fill="currentColor" opacity="0.9" />
                    <text x={p.x} y={H - 10} fontSize="12" textAnchor="middle" opacity="0.65">
                        {p.label}
                    </text>
                </g>
            ))}
        </svg>
    );
}

export const MirrorReviewRunner = ({ activity, onSaved }) => {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [data, setData] = useState(null);

    const [reflection, setReflection] = useState("");

    useEffect(() => {
        const run = async () => {
            setErr("");

            if (!API_BASE) {
                setErr("VITE_BACKEND_URL no está configurado.");
                setLoading(false);
                return;
            }

            const headers = authHeaders();
            if (!headers) {
                setErr("No hay token. Inicia sesión para ver el espejo semanal.");
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch(`${API_BASE}/api/mirror/week`, { headers });
                const payload = await res.json().catch(() => null);

                if (!res.ok) {
                    setErr(payload?.message || payload?.msg || `Error ${res.status}`);
                    setData(null);
                    return;
                }

                setData(payload);
            } catch (e) {
                setErr(e?.message || "Error cargando el espejo semanal.");
                setData(null);
            } finally {
                setLoading(false);
            }
        };

        run();
    }, []);

    // Serie para chart (puntos por día)
    const series = useMemo(() => {
        const days = data?.days;
        if (!Array.isArray(days)) return [];
        return days.map((d) => ({
            iso: d.date,
            label: dayLabel(d.date),
            value: Number(d.points_total) || 0,
        }));
    }, [data]);

    // Totales
    const totals = data?.totals || {};
    const streak = data?.streak || {};

    // Categoría dominante (por puntos)
    const topCategory = useMemo(() => {
        const cat = data?.distributions?.categories_points || data?.distributions?.categories || null;
        return topFromDistribution(cat);
    }, [data]);

    // Emoción dominante (por puntos si existe; si no por recuento)
    const topEmotion = useMemo(() => {
        const dist = data?.distributions || {};

        // probamos varias keys típicas
        return (
            topFromDistribution(dist.emotions_points) ||
            topFromDistribution(dist.emotions) ||
            topFromDistribution(dist.emotions_count) ||
            topFromDistribution(dist.emotions_counts) ||
            null
        );
    }, [data]);

    const emotionUnit = useMemo(() => {
        const dist = data?.distributions || {};
        // si viene emotions_points, asumimos pts; si no, “veces”
        if (dist.emotions_points) return "pts";
        if (dist.emotions) return "veces";
        if (dist.emotions_count || dist.emotions_counts) return "veces";
        return "pts";
    }, [data]);

    const handleComplete = () => {
        onSaved?.({
            mirror_week_reflection: reflection.trim() || null,
            // opcional: si quieres loggear qué se mostró
            dominant_category: topCategory?.name || null,
            dominant_emotion: topEmotion?.name || null,
        });
    };

    return (
        <div>
            <div className="mb-2 fw-semibold">{activity?.title || "Revisión semanal en Espejo"}</div>
            <div className="small text-secondary mb-3">
                Resumen del último tramo (7 días). Después, si quieres, escribe una reflexión breve.
            </div>

            {loading && <div className="small text-secondary">Cargando resumen…</div>}

            {!loading && err && <div className="alert alert-danger py-2 mb-3">{err}</div>}

            {!loading && !err && data && (
                <>
                    <div className="border rounded p-3 mb-3">
                        <div className="fw-semibold mb-2">Puntos por día</div>
                        <div className="text-secondary small mb-2">Últimos 7 días</div>
                        <MiniLineChart series={series} />
                    </div>

                    <div className="row g-2 mb-3">
                        <div className="col-6">
                            <div className="border rounded p-2">
                                <div className="small text-secondary">Puntos</div>
                                <div className="fw-semibold">{Number(totals.points_total) || 0}</div>
                            </div>
                        </div>
                        <div className="col-6">
                            <div className="border rounded p-2">
                                <div className="small text-secondary">Completadas</div>
                                <div className="fw-semibold">{Number(totals.completions_total) || 0}</div>
                            </div>
                        </div>
                        <div className="col-6">
                            <div className="border rounded p-2">
                                <div className="small text-secondary">Días “principal”</div>
                                <div className="fw-semibold">{Number(totals.principal_days) || 0}</div>
                            </div>
                        </div>
                        <div className="col-6">
                            <div className="border rounded p-2">
                                <div className="small text-secondary">Racha (actual/mejor)</div>
                                <div className="fw-semibold">
                                    {Number(streak.current) || 0} / {Number(streak.best) || 0}
                                </div>
                            </div>
                        </div>
                    </div>

                    {topCategory && (
                        <div className="border rounded p-2 mb-3">
                            <div className="small text-secondary">Categoría dominante</div>
                            <div className="fw-semibold">
                                {topCategory.name}{" "}
                                <span className="text-secondary fw-normal">· {topCategory.value} pts</span>
                            </div>
                        </div>
                    )}

                    {topEmotion && (
                        <div className="border rounded p-2 mb-3">
                            <div className="small text-secondary">Emoción dominante</div>
                            <div className="fw-semibold">
                                {topEmotion.name}{" "}
                                <span className="text-secondary fw-normal">
                                    · {topEmotion.value} {emotionUnit}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="mb-3">
                        <label className="form-label fw-semibold">Reflexión (opcional)</label>
                        <textarea
                            className="form-control"
                            rows={3}
                            value={reflection}
                            onChange={(e) => setReflection(e.target.value)}
                            placeholder="Ej: cuando dormí mejor, rendí mejor; respiración antes de dormir ayudó…"
                        />
                    </div>

                    <button className="btn btn-primary w-100" onClick={handleComplete}>
                        Completar
                    </button>
                </>
            )}

            {/* fallback si no hay data pero tampoco error */}
            {!loading && !err && !data && (
                <button className="btn btn-primary w-100" onClick={handleComplete}>
                    Completar
                </button>
            )}
        </div>
    );
};
