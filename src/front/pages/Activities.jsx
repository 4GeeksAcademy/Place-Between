import React, { useMemo, useState } from "react";
import { ActivityCard } from "../components/ActivityCard";
import { activitiesCatalog } from "../data/activities";

/**
 * MVP: Catálogo completo de actividades con filtros
 * - Fase: Día / Noche / Todas
 * - Rama: (según catálogo)
 * - Búsqueda: título/descripcion
 * - Modal simple al “Empezar” (igual que Today), con “Finalizar” opcional (no persiste aún)
 */
export const Activities = () => {
	const [phaseFilter, setPhaseFilter] = useState("all"); // all | day | night
	const [branchFilter, setBranchFilter] = useState("all");
	const [q, setQ] = useState("");
	const [activeActivity, setActiveActivity] = useState(null);

	const allActivities = useMemo(() => {
		const day = activitiesCatalog?.day || [];
		const night = activitiesCatalog?.night || [];
		// Etiqueta fase para UI
		return [
			...day.map((a) => ({ ...a, _phaseLabel: "Día" })),
			...night.map((a) => ({ ...a, _phaseLabel: "Noche" })),
		];
	}, []);

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

				const hay =
					`${a.title || ""} ${a.description || ""} ${a.reason || ""}`.toLowerCase();
				return hay.includes(query);
			})
			// Orden estable: primero prioridad, luego duración corta, luego título
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

			{/* Contador */}
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

			{/* Grid */}
			<div className="row g-4">
				{filtered.map((a) => (
					<div className="col-12 col-md-6 col-lg-4" key={a.id}>
						{/* Reutilizamos ActivityCard.
						    completed=false porque aún no sincronizamos completadas en catálogo (lo haremos luego). */}
						<ActivityCard
							activity={{
								...a,
								// Añadimos un hint de fase en el texto de reason si quieres (opcional):
								reason: a.reason ? `${a._phaseLabel}: ${a.reason}` : `${a._phaseLabel}`,
							}}
							completed={false}
							onStart={onStart}
							onComplete={() => { }}
						/>
					</div>
				))}
			</div>

			{/* Modal “actividad en curso” (igual que Today, pero sin persistir completado aún) */}
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

									<div className="small text-secondary">
										Placeholder. Runner: <span className="pb-mono">{activeActivity.run}</span>
									</div>
								</div>

								<div className="modal-footer">
									<button className="btn btn-outline-secondary" onClick={() => setActiveActivity(null)}>
										Cerrar
									</button>
									<button
										className="btn btn-primary"
										onClick={() => {
											// En el futuro: aquí navegaríamos al ActivityRunner/Detail y al finalizar se completaría.
											setActiveActivity(null);
										}}
									>
										Empezar ahora
									</button>
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
