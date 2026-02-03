import React, { useEffect, useMemo, useState } from "react";
import { ActivityCard } from "../components/ActivityCard";
import { ActivityModal } from "../components/ActivityModal";
import { useToasts } from "../components/toasts/ToastContext";

import { normalizePointsResult } from "../services/pointsService";
import { getUserScope } from "../services/authService";

import { activitiesCatalog } from "../data/activities";

// ---------- Helpers ----------

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

const getDateKey = () => {
	const d = new Date();
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
};

const storageKey = (userScope, dateKey, phaseKey) =>
	`pb_${userScope}_today_${dateKey}_${phaseKey}`;

const todaySetKey = (userScope, dateKey, phaseKey) =>
	`pb_${userScope}_todayset_${dateKey}_${phaseKey}`;

const loadCompleted = (userScope, dateKey, phaseKey) => {
	try {
		const raw = localStorage.getItem(storageKey(userScope, dateKey, phaseKey));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed?.completed) ? parsed.completed : [];
	} catch {
		return [];
	}
};

const saveCompleted = (userScope, dateKey, phaseKey, completed) => {
	localStorage.setItem(
		storageKey(userScope, dateKey, phaseKey),
		JSON.stringify({ completed })
	);
};

const loadTodaySet = (userScope, dateKey, phaseKey) => {
	try {
		const raw = localStorage.getItem(todaySetKey(userScope, dateKey, phaseKey));
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

export const Activities = () => {
	// Contextos fijos para hoy
	const dateKey = useMemo(() => getDateKey(), []);
	const userScope = useMemo(() => getUserScope(), []);

	// Estados de filtros y UI
	const [completedDay, setCompletedDay] = useState(() => loadCompleted(userScope, dateKey, "day"));
	const [completedNight, setCompletedNight] = useState(() => loadCompleted(userScope, dateKey, "night"));
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

	// Unión de completadas (para evitar duplicados)
	const completedAll = useMemo(() => {
		return new Set([...(completedDay || []), ...(completedNight || [])]);
	}, [completedDay, completedNight]);

	// Índice del catálogo local (para enriquecer)
	const catalogIndex = useMemo(() => buildCatalogIndex(), []);


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

	// Actualiza completadas cuando cambia la ruta (usuario puede cambiar scope al cambiar entre espacios)
	useEffect(() => {
		const nextScope = getUserScope();
		const day = loadCompleted(nextScope, dateKey, "day");
		const night = loadCompleted(nextScope, dateKey, "night");
		setCompletedDay(day);
		setCompletedNight(night);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname, location.search]);

	const onStart = (activity) => setActiveActivity(activity);

	// Completar en backend (catálogo = 5 puntos)
	const completeActivityBackend = async (activity, { source, isRecommended }) => {
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
					external_id: activity.id,
					session_type: activity.phase,      // "day" | "night"
					source,                            // "today" | "catalog"
					is_recommended: !!isRecommended,   // true si era la recomendada del set
				}),
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.msg || "Error backend");

			const toast = normalizePointsResult(data, {
				source,
				isRecommended: !!isRecommended,
			});

			if (toast) pushPointsToast(toast);

			return data;
		} catch (e) {
			console.warn("Catalog backend completion failed:", e);
			return null;
		}
	};

	// Maneja completado (backend + localStorage + UI)
	const handleComplete = async (activity) => {
		const phaseKey = activity.phase; // "day" | "night"
		const set = loadTodaySet(userScope, dateKey, phaseKey);

		const inTodaySet = !!set && (
			set?.recommendedId === activity.id ||
			(Array.isArray(set?.pillarIds) && set.pillarIds.includes(activity.id))
		);

		const isRecommended = !!set && set?.recommendedId === activity.id;

		const source = inTodaySet ? "today" : "catalog";

		// 1) backend (puntos fuente de verdad)
		await completeActivityBackend(activity, { source, isRecommended });

		// 2) localStorage + UI (para que Today/Activities compartan “completed”)
		if (phaseKey === "day") {
			setCompletedDay((prev) => {
				const next = prev.includes(activity.id) ? prev : [...prev, activity.id];
				saveCompleted(userScope, dateKey, "day", next);
				return next;
			});
		} else {
			setCompletedNight((prev) => {
				const next = prev.includes(activity.id) ? prev : [...prev, activity.id];
				saveCompleted(userScope, dateKey, "night", next);
				return next;
			});
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
		<div className="pb-activities">
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
								completed={completedAll.has(a.id)}
								onStart={onStart}
								onComplete={() => { }}
								showCompleteButton={false}
							/>
						</div>
					))}
				</div>

				{activeActivity && (
					<ActivityModal
						activity={activeActivity}
						onClose={() => setActiveActivity(null)}
						onComplete={async () => {
							await handleComplete(activeActivity);
							setActiveActivity(null);
						}}
						onSaved={async () => {
							await handleComplete(activeActivity);
							setActiveActivity(null);
						}}
					/>
				)}
			</div>
		</div>
	);
};
