// src/front/data/todaySelector.js
import { weeklyPlan } from "./weeklyPlan";
import { activitiesCatalog } from "./activities";

/**
 * Rotación determinista: desplaza la lista por dayIndex.
 * Evita que las 3 tarjetas sean siempre las mismas.
 */
function rotated(list, dayIndex) {
	if (!list.length) return list;
	const offset = dayIndex % list.length;
	return [...list.slice(offset), ...list.slice(0, offset)];
}

/**
 * Diversidad simple de ramas: intenta que las 3 pillas no repitan branch.
 */
function pickWithBranchDiversity(list, count) {
	const out = [];
	const used = new Set();

	for (const a of list) {
		if (out.length >= count) break;
		if (!used.has(a.branch)) {
			out.push(a);
			used.add(a.branch);
		}
	}

	// Si no alcanzamos count por diversidad, rellenamos con lo que falte
	if (out.length < count) {
		for (const a of list) {
			if (out.length >= count) break;
			if (!out.some((x) => x.id === a.id)) out.push(a);
		}
	}

	return out.slice(0, count);
}

/**
 * Obtiene recommended fijo por semana, con fallback si falta.
 */
function getWeeklyRecommendedId(phaseKey, dayIndex) {
	const planned = weeklyPlan?.[phaseKey]?.[dayIndex];
	return planned || null;
}

/**
 * API principal:
 * - phaseKey: "day" | "night"
 * - dayIndex: 0..6
 * - completedIds: string[]
 */
export function buildTodaySet({ phaseKey, dayIndex, completedIds }) {
	const pool = activitiesCatalog[phaseKey] || [];
	if (!pool.length) return { recommended: null, pillars: [] };

	const plannedId = getWeeklyRecommendedId(phaseKey, dayIndex);

	// Recommended: primero intentamos el del plan semanal.
	// Si está completado o no existe, usamos "siguiente pendiente" por rotación.
	let recommended =
		pool.find((a) => a.id === plannedId && !completedIds.includes(a.id)) ||
		null;

	const rot = rotated(pool, dayIndex);
	if (!recommended) {
		recommended = rot.find((a) => !completedIds.includes(a.id)) || rot[0];
	}

	// Pillars:
	// - excluimos recommended
	// - priorizamos no completadas
	// - rotamos para variedad
	const rest = rot.filter((a) => a.id !== recommended.id);
	const notDone = rest.filter((a) => !completedIds.includes(a.id));
	const done = rest.filter((a) => completedIds.includes(a.id));

	const ordered = [...notDone, ...done];
	const pillars = pickWithBranchDiversity(ordered, 3);

	return { recommended, pillars };
}
