// src/front/data/activities.js
// Fuente única de verdad para actividades (datos + estructura para futuras funcionalidades)
import catalog from "./activities.seed.json";

export const activitiesCatalog = catalog;

/**
 * Selección “qué toca hoy” por día de la semana.
 * 0=Domingo ... 6=Sábado
 * MVP: rotamos la recomendada para que no sea siempre la misma.
 */
export function getWeeklyFocusId(phase, dayIndex) {
  const ids = activitiesCatalog[phase].map((a) => a.id);
  if (!ids.length) return null;

  // Recomendación rotativa por día (determinista)
  return ids[dayIndex % ids.length];
}

/**
 * Actividades para la fase, con recomendación sugerida por día.
 */
export function getTodayActivitiesForPhase(phase, dayIndex) {
  const list = activitiesCatalog[phase] || [];
  const focusId = getWeeklyFocusId(phase, dayIndex);

  // Colocamos la "focus" al principio solo como orden visual de carga
  if (!focusId) return list;

  const focus = list.find((a) => a.id === focusId);
  const rest = list.filter((a) => a.id !== focusId);
  return focus ? [focus, ...rest] : list;
}
