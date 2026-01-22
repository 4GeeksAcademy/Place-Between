// src/front/data/weeklyPlan.js
// Plan semanal fijo para el recomendado (MVP).
// 0=Domingo ... 6=Sábado

export const weeklyPlan = {
	day: {
		0: "d-mirror-review",     // Domingo (si no existe aún, hacemos fallback)
		1: "d-rec-breath-5",      // Lunes
		2: "d-soma-check",        // Martes
		3: "d-thought-cut",       // Miércoles
		4: "d-tip-emotion",       // Jueves
		5: "d-goals-review",      // Viernes
		6: "d-stretch-break",     // Sábado
	},
	night: {
		0: "n-rec-emotion-pick",
		1: "n-rec-emotion-pick",
		2: "n-rec-emotion-pick",
		3: "n-rec-emotion-pick",
		4: "n-rec-emotion-pick",
		5: "n-rec-emotion-pick",
		6: "n-rec-emotion-pick",
	},
};

// Utilidad por si quieres mostrar el foco semanal en UI
export const weekdayLabelES = {
	0: "Domingo",
	1: "Lunes",
	2: "Martes",
	3: "Miércoles",
	4: "Jueves",
	5: "Viernes",
	6: "Sábado",
};
