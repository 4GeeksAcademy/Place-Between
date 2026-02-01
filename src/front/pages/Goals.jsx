import React, { useEffect, useMemo, useState } from "react";
import {
    listGoals,
    createGoal,
    deleteGoal,
    addGoalProgress,
    completeGoal,
} from "../services/goalsService";

export const Goals = () => {
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    // form create
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [size, setSize] = useState("medium");
    const [targetValue, setTargetValue] = useState(10);
    const [pointsReward, setPointsReward] = useState(10);

    const sorted = useMemo(() => {
        return [...items].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    }, [items]);

    async function refresh() {
        setErr("");
        setBusy(true);
        try {
            const data = await listGoals();
            setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            setErr(e.message || "Error cargando goals.");
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
            const payload = {
                title,
                description,
                size,
                target_value: Number(targetValue),
                points_reward: Number(pointsReward),
            };
            const created = await createGoal(payload);
            setItems((prev) => [created, ...prev]);
            setTitle("");
            setDescription("");
            setSize("medium");
            setTargetValue(10);
            setPointsReward(10);
        } catch (e2) {
            setErr(e2.message || "Error creando goal.");
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (id) => {
        setErr("");
        setBusy(true);
        try {
            await deleteGoal(id);
            setItems((prev) => prev.filter((g) => g.id !== id));
        } catch (e) {
            setErr(e.message || "Error borrando goal.");
        } finally {
            setBusy(false);
        }
    };

    const handleProgress = async (id, delta) => {
        setErr("");
        setBusy(true);
        try {
            await addGoalProgress(id, { delta_value: Number(delta) });
            // refresh rápido (para tener current_value actualizado)
            await refresh();
        } catch (e) {
            setErr(e.message || "Error añadiendo progreso.");
        } finally {
            setBusy(false);
        }
    };

    const handleComplete = async (id) => {
        setErr("");
        setBusy(true);
        try {
            await completeGoal(id); // daily_session_id opcional -> backend crea/usa DAY hoy
            await refresh();
        } catch (e) {
            setErr(e.message || "Error completando goal.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="container py-4 pb-goals">
            <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                <div>
                    <h1 className="h4 mb-1">Objetivos</h1>
                    <div className="text-muted small">Crea, registra progreso y completa (suma puntos en sesión DAY de hoy).</div>
                </div>
                <button className="btn btn-outline-secondary" onClick={refresh} disabled={busy}>
                    Actualizar
                </button>
            </div>

            {err ? (
                <div className="alert alert-danger" role="alert">
                    {err}
                </div>
            ) : null}

            <div className="card mb-4">
                <div className="card-body">
                    <h2 className="h6 mb-3">Crear objetivo</h2>
                    <form className="row g-3" onSubmit={handleCreate}>
                        <div className="col-12 col-lg-5">
                            <label className="form-label">Título</label>
                            <input
                                className="form-control"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ej: Caminar"
                                required
                                disabled={busy}
                            />
                        </div>

                        <div className="col-12 col-lg-7">
                            <label className="form-label">Descripción</label>
                            <input
                                className="form-control"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Opcional"
                                disabled={busy}
                            />
                        </div>

                        <div className="col-6 col-lg-3">
                            <label className="form-label">Tamaño</label>
                            <select className="form-select" value={size} onChange={(e) => setSize(e.target.value)} disabled={busy}>
                                <option value="small">Small</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                            </select>
                        </div>

                        <div className="col-6 col-lg-3">
                            <label className="form-label">Target</label>
                            <input
                                className="form-control"
                                type="number"
                                min="0"
                                value={targetValue}
                                onChange={(e) => setTargetValue(e.target.value)}
                                disabled={busy}
                            />
                        </div>

                        <div className="col-6 col-lg-3">
                            <label className="form-label">Recompensa (pts)</label>
                            <input
                                className="form-control"
                                type="number"
                                min="0"
                                value={pointsReward}
                                onChange={(e) => setPointsReward(e.target.value)}
                                disabled={busy}
                            />
                        </div>

                        <div className="col-6 col-lg-3 d-flex align-items-end">
                            <button className="btn btn-primary w-100" disabled={busy}>
                                Crear
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="d-flex align-items-center justify-content-between mb-2">
                <h2 className="h6 mb-0">Listado</h2>
                {busy ? <span className="text-muted small">Cargando…</span> : null}
            </div>

            {sorted.length === 0 ? (
                <div className="text-muted">Aún no hay objetivos.</div>
            ) : (
                <div className="row g-3">
                    {sorted.map((g) => {
                        const done = !!g.completed_at;
                        const cur = Number(g.current_value || 0);
                        const tgt = Number(g.target_value || 0);
                        const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;

                        return (
                            <div className="col-12 col-lg-6" key={g.id}>
                                <div className={`card ${done ? "border-success" : ""}`}>
                                    <div className="card-body">
                                        <div className="d-flex align-items-start justify-content-between gap-3">
                                            <div className="flex-grow-1">
                                                <div className="d-flex align-items-center gap-2">
                                                    <h3 className="h6 mb-0">{g.title}</h3>
                                                    {done ? <span className="badge text-bg-success">Completado</span> : null}
                                                </div>
                                                {g.description ? <div className="text-muted small mt-1">{g.description}</div> : null}

                                                <div className="mt-3">
                                                    <div className="d-flex justify-content-between small text-muted">
                                                        <span>
                                                            Progreso: <strong className="text-body">{cur}</strong> / {tgt}
                                                        </span>
                                                        <span>{pct}%</span>
                                                    </div>
                                                    <div className="progress mt-1" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                                                        <div className="progress-bar" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>

                                                <div className="mt-3 small text-muted">
                                                    Tamaño: <span className="text-body">{g.size}</span> · Recompensa:{" "}
                                                    <span className="text-body">{Number(g.points_reward || 0)} pts</span>
                                                </div>
                                            </div>

                                            <div className="d-flex flex-column gap-2" style={{ minWidth: 160 }}>
                                                <button className="btn btn-outline-primary" disabled={busy || done} onClick={() => handleProgress(g.id, 1)}>
                                                    +1 progreso
                                                </button>
                                                <button className="btn btn-success" disabled={busy || done} onClick={() => handleComplete(g.id)}>
                                                    Completar
                                                </button>
                                                <button className="btn btn-outline-danger" disabled={busy} onClick={() => handleDelete(g.id)}>
                                                    Eliminar
                                                </button>
                                            </div>
                                        </div>

                                        {done ? (
                                            <div className="mt-3 small text-muted">
                                                Completed at: <span className="text-body">{g.completed_at}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
