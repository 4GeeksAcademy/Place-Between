import { getUserScope } from "./authService";
// src/front/services/pointsService.js
// MVP localStorage. Preparado para reemplazar por API sin tocar la UI.

const getDateKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const storageKey = (dateKey) => `pb_${getUserScope()}_points_${dateKey}`;

/**
 * Estado:
 * {
 *   total: number,
 *   ledger: { [activityId]: number }  // puntos otorgados por actividad ese día
 * }
 */
export function loadPointsState(dateKey = getDateKey()) {
  try {
    const raw = localStorage.getItem(storageKey(dateKey));
    if (!raw) return { total: 0, ledger: {} };
    const parsed = JSON.parse(raw);
    return {
      total: Number.isFinite(parsed?.total) ? parsed.total : 0,
      ledger:
        parsed?.ledger && typeof parsed.ledger === "object"
          ? parsed.ledger
          : {},
    };
  } catch {
    return { total: 0, ledger: {} };
  }
}

export function savePointsState(dateKey, state) {
  localStorage.setItem(storageKey(dateKey), JSON.stringify(state));
}

export function hasAwarded(dateKey, activityId) {
  const st = loadPointsState(dateKey);
  return Object.prototype.hasOwnProperty.call(st.ledger, activityId);
}

/**
 * Reglas de puntos (MVP):
 * - 1 vez por actividad/día
 * - base = 10
 * - Contexto:
 *    Today + fase correcta + recommended: x2
 *    Today + fase correcta (no recommended): x1
 *    Today + fase incorrecta: x0.5
 *    Catálogo: x0.5 (se deja preparado aunque hoy no se use)
 */
export function computePoints({ source, isCorrectPhase, isRecommended }) {
  const base = 10;

  let mult = 1;

  if (source === "catalog") {
    mult = 0.5;
  } else {
    // source === "today" (u otros futuros)
    if (isCorrectPhase && isRecommended) mult = 2;
    else if (isCorrectPhase) mult = 1;
    else mult = 0.5;
  }

  // Redondeo simple, mínimo 1 punto si hay otorgamiento
  const pts = Math.max(1, Math.round(base * mult));
  return pts;
}

/**
 * Otorga puntos si no se otorgaron ya hoy para esa actividad.
 * Devuelve: { awarded: boolean, points: number, total: number }
 */
export function awardPointsOnce({
  dateKey = getDateKey(),
  activityId,
  source = "today", // "today" | "catalog" | etc.
  isCorrectPhase = true,
  isRecommended = false,
  overridePoints = null,
}) {
  const st = loadPointsState(dateKey);

  if (Object.prototype.hasOwnProperty.call(st.ledger, activityId)) {
    return { awarded: false, points: 0, total: st.total };
  }

  let points = computePoints({ source, isCorrectPhase, isRecommended });
  // Override manual (útil para testing o casos especiales)
  if (overridePoints != null) {
    points = overridePoints;
  }

  const next = {
    total: st.total + points,
    ledger: { ...st.ledger, [activityId]: points },
  };

  savePointsState(dateKey, next);

  return { awarded: true, points, total: next.total };
}

/**
 * Normaliza la respuesta del backend de /activities/complete
 * a un shape único para UI (toast, logs, etc.)
 */
export const normalizePointsResult = (data, context = {}) => {
  if (!data) {
    return null;
  }

  // Caso idempotente: ya completada
  if (data.already_completed) {
    return {
      points: 0,
      reason: "Ya habías completado esta actividad hoy",
    };
  }

  const points = Number(data.points_awarded ?? data.points ?? 0);

  // Contexto opcional para afinar el mensaje
  const { source = "today", isRecommended = false } = context;

  let reason = "Actividad completada";

  if (points === 20) {
    reason = "Actividad recomendada completada";
  } else if (points === 10) {
    reason = "Actividad completada";
  } else if (points === 5) {
    reason = "Actividad completada desde el catálogo";
  } else if (points === 0) {
    reason = "Completada sin puntos";
  }

  // Override explícito por contexto
  if (source === "catalog") {
    reason = "Añadida al Espejo desde el catálogo";
  }

  return { points, reason };
};
