import React, { useEffect, useMemo, useState } from "react";
import { ActivityCard } from "../components/ActivityCard";
import { ActivityRunner } from "../components/ActivityRunner";
import { useToasts } from "../components/toasts/ToastContext";
import { normalizePointsResult } from "../services/pointsService";

import { activitiesCatalog } from "../data/activities";


const getBackendUrl = () => {
	const url = import.meta.env.VITE_BACKEND_URL;
	return (url || "").replace(/\/$/, "");
};

const phaseLabel = (phaseKey) => (phaseKey === "night" ? "Noche" : "Día");

/**
 * Construye un índice rápido del catálogo local por id (external_id).
 * Esto permite "enriquecer" lo que viene de DB con run/duration/image/badges.
 */
const buildCatalogIndex = () => {
	const day = activitiesCatalog?.day || [];
	const night = activitiesCatalog?.night || [];
	const all = [...day, ...night];
	const m = new Map();
	for (const a of all) m.set(a.id, a);
	return m;
};

export const Activities = () => {
	const [phaseFilter, setPhaseFilter] = useState("all"); // all | day | night
	const [branchFilter, setBranchFilter] = useState("all");
	const [q, setQ] = useState("");
	const [activeActivity, setActiveActivity] = useState(null);
	const { pushPointsToast } = useToasts();

	// Datos desde backend
	const [dbActivities, setDbActivities] = useState([]);
	const [loading, setLoading] = useState(true);
	const [err, setErr] = useState(null);

	const BACKEND_URL = getBackendUrl();

	// Índice del catálogo local (para enriquecer)
	const catalogIndex = useMemo(() => buildCatalogIndex(), []);

	// Helper: extrae run.type normalizado de activity
	const getRunType = (a) => (typeof a?.run === "string" ? a.run : a?.run?.type);

	// 1) Fetch de actividades activas desde DB (requiere JWT)
	useEffect(() => {
		const token = localStorage.getItem("pb_token");
		if (!token) {
			setErr("Necesitas iniciar sesión para ver el catálogo.");
			setLoading(false);
			setDbActivities([]);
			return;
		}
		if (!BACKEND_URL) {
			setErr("VITE_BACKEND_URL no está configurado.");
			setLoading(false);
			setDbActivities([]);
			return;
		}

		let cancelled = false;

		const load = async () => {
			try {
				setLoading(true);
				setErr(null);

				const res = await fetch(`${BACKEND_URL}/api/activities`, {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				});

				const data = await res.json().catch(() => null);

				if (!res.ok) {
					const msg = data?.msg || "Error cargando actividades";
					throw new Error(msg);
				}

				if (!Array.isArray(data)) throw new Error("Respuesta inválida del backend (no es lista).");

				if (!cancelled) setDbActivities(data);
			} catch (e) {
				if (!cancelled) {
					setDbActivities([]);
					setErr(e?.message || "Error cargando actividades");
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		load();

		return () => {
			cancelled = true;
		};
	}, [BACKEND_URL]);

	/**
	 * 2) Normalización + enrich:
	 * DB devuelve Activity.serialize() (campos típicos: id, external_id, name, description, activity_type, category...)
	 * Nosotros convertimos a shape UI y añadimos lo que falte desde activitiesCatalog.
	 */
	const allActivities = useMemo(() => {
		const out = [];

		for (const a of dbActivities) {
			const externalId = a.external_id;

			// Mapeo básico desde DB
			// activity_type en DB puede ser "day"/"night"/"both" según tu seed bulk :contentReference[oaicite:3]{index=3}
			// Para catálogo, si es "both" lo tratamos como day por defecto (o lo duplicas en ambos, si prefieres).
			const type = (a.activity_type || "").toLowerCase();
			const phase = type === "night" ? "night" : "day";

			const base = {
				id: externalId,
				phase,
				title: a.name || externalId,
				description: a.description || "",
				branch: a.category?.name || "General",
				// Campos que se enriquecerán si existen en catálogo
				duration: undefined,
				image: undefined,
				branchBadge: undefined,
				reason: undefined,
				run: undefined,
			};

			// Enriquecimiento desde catálogo local (si existe)
			const local = catalogIndex.get(externalId);
			const enriched = local
				? {
					...base,
					// Preferimos el contenido de catálogo para los campos "de UX"
					phase: local.phase || base.phase,
					branch: local.branch || base.branch,
					duration: local.duration ?? base.duration,
					image: local.image ?? base.image,
					branchBadge: local.branchBadge ?? base.branchBadge,
					reason: local.reason ?? base.reason,
					run: local.run ?? base.run,
				}
				: base;

			out.push({ ...enriched, _phaseLabel: phaseLabel(enriched.phase) });
		}

		return out;
	}, [dbActivities, catalogIndex]);

	const branches = useMemo(() => {
		const set = new Set(allActivities.map((a) => a.branch).filter(Boolean));
		return ["all", ...Array.from(set)];
	}, [allActivities]);

	const filtered = useMemo(() => {
		const query = q.trim().toLowerCase();

		return allActivities
			.filter((a) => {
				if (phaseFilter === "day" && a.phase !== "day") return false;
				if (phaseFilter === "night" && a.phase !== "night") return false;
				if (branchFilter !== "all" && a.branch !== branchFilter) return false;
				if (!query) return true;

				const hay = `${a.title || ""} ${a.description || ""} ${a.reason || ""}`.toLowerCase();
				return hay.includes(query);
			})
			.sort((a, b) => {
				const pa = a.priority ? 1 : 0;
				const pb = b.priority ? 1 : 0;
				if (pb !== pa) return pb - pa;
				const da = a.duration ?? 999;
				const db = b.duration ?? 999;
				if (da !== db) return da - db;
				return (a.title || "").localeCompare(b.title || "");
			});
	}, [allActivities, phaseFilter, branchFilter, q]);

	const onStart = (activity) => setActiveActivity(activity);

	// Completar en backend (catálogo = 5 puntos)
	const completeActivityBackend = async (activity) => {
		const token = localStorage.getItem("pb_token");
		if (!token) return null;
		if (!BACKEND_URL) return null;

		try {
			const res = await fetch(`${BACKEND_URL}/api/activities/complete`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					external_id: activity.id, // id UI == external_id DB
					session_type: activity.phase, // "day" | "night"
					source: "catalog",
					is_recommended: false,
				}),
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.msg || "Error backend");

			const toast = normalizePointsResult(data, {
				source: "catalog",
				isRecommended: false,
			});

			if (toast) {
				pushPointsToast(toast);
			}

			return data;
		} catch (e) {
			console.warn("Catalog backend completion failed:", e);
			return null;
		}
	};

	// UI states
	if (loading) {
		return (
			<div className="container py-4 py-lg-5">
				<h1 className="h2 fw-bold mb-2">Actividades</h1>
				<p className="text-secondary mb-0">Cargando catálogo…</p>
			</div>
		);
	}

	if (err) {
		return (
			<div className="container py-4 py-lg-5">
				<h1 className="h2 fw-bold mb-2">Actividades</h1>
				<div className="alert alert-warning mb-0">{err}</div>
			</div>
		);
	}

	return (
		<div className="container py-4 py-lg-5">
			<div className="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-3 mb-4">
				<div>
					<h1 className="h2 fw-bold mb-2">Actividades</h1>
					<p className="text-secondary mb-0">
						Catálogo completo. Filtra por fase, rama o busca por texto.
					</p>
				</div>

				<div className="d-flex flex-wrap gap-2">
					<div className="btn-group" role="group" aria-label="Filtro fase">
						<button
							type="button"
							className={`btn ${phaseFilter === "all" ? "btn-primary" : "btn-outline-primary"}`}
							onClick={() => setPhaseFilter("all")}
						>
							Todas
						</button>
						<button
							type="button"
							className={`btn ${phaseFilter === "day" ? "btn-primary" : "btn-outline-primary"}`}
							onClick={() => setPhaseFilter("day")}
						>
							Día
						</button>
						<button
							type="button"
							className={`btn ${phaseFilter === "night" ? "btn-primary" : "btn-outline-primary"}`}
							onClick={() => setPhaseFilter("night")}
						>
							Noche
						</button>
					</div>

					<select
						className="form-select"
						style={{ width: 220 }}
						value={branchFilter}
						onChange={(e) => setBranchFilter(e.target.value)}
						aria-label="Filtro rama"
					>
						{branches.map((b) => (
							<option key={b} value={b}>
								{b === "all" ? "Todas las ramas" : b}
							</option>
						))}
					</select>

					<input
						className="form-control"
						style={{ width: 260 }}
						placeholder="Buscar…"
						value={q}
						onChange={(e) => setQ(e.target.value)}
					/>
				</div>
			</div>

			<div className="d-flex justify-content-between align-items-center mb-3">
				<div className="small text-secondary">
					Mostrando <span className="fw-semibold">{filtered.length}</span> actividades
				</div>

				<button
					type="button"
					className="btn btn-sm btn-outline-secondary"
					onClick={() => {
						setPhaseFilter("all");
						setBranchFilter("all");
						setQ("");
					}}
				>
					Limpiar filtros
				</button>
			</div>

			<div className="row g-4">
				{filtered.map((a) => (
					<div className="col-12 col-md-6 col-lg-4" key={a.id}>
						<ActivityCard
							activity={{
								...a,
								reason: a.reason ? `${a._phaseLabel}: ${a.reason}` : `${a._phaseLabel}`,
							}}
							completed={false}
							onStart={onStart}
							onComplete={() => { }}
							showCompleteButton={false}
						/>
					</div>
				))}
			</div>



			{activeActivity && (
				<>
					<div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true">
						<div className="modal-dialog modal-dialog-centered" role="document">
							<div className="modal-content">
								<div className="modal-header">
									<h5 className="modal-title">{activeActivity.title}</h5>
									<button type="button" className="btn-close" onClick={() => setActiveActivity(null)} />
								</div>

								<div className="modal-body">
									<p className="text-secondary mb-2">{activeActivity.description}</p>

									<div className="mt-3 p-3 border rounded bg-body-tertiary">
										<div className="fw-semibold mb-2">Ejercicio</div>

										<ActivityRunner
											activity={activeActivity}
											onSaved={async () => {
												// al guardar el check-in, marcamos completado en backend (catálogo)
												await completeActivityBackend(activeActivity);
												setActiveActivity(null);
											}}
										/>
									</div>
								</div>

								<div className="modal-footer">
									<button className="btn btn-outline-secondary" onClick={() => setActiveActivity(null)}>
										Cerrar
									</button>

									{getRunType(activeActivity) !== "emotion_checkin" && getRunType(activeActivity) !== "breathing_guided" && (
										<button
											className="btn btn-primary"
											onClick={async () => {
												await completeActivityBackend(activeActivity);
												setActiveActivity(null);
											}}
										>
											Empezar ahora
										</button>
									)}
								</div>
							</div>
						</div>
					</div>

					<div className="modal-backdrop show" />
				</>
			)}
		</div>
	);
};
