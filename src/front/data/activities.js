// src/front/data/activities.js
// Fuente única de verdad para actividades (datos + estructura para futuras funcionalidades)

// Imágenes temporales (luego las cambiamos por assets propios)
const IMG_DAY_1 =
  "https://images.unsplash.com/photo-1528715471579-d1bcf0ba5e83?auto=format&fit=crop&w=1200&q=80";
const IMG_DAY_2 =
  "https://images.unsplash.com/photo-1527137342181-19aab11a8ee8?auto=format&fit=crop&w=1200&q=80";
const IMG_DAY_3 =
  "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80";
const IMG_DAY_HERO =
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1600&q=80";

const IMG_NIGHT_1 =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80";
const IMG_NIGHT_2 =
  "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80";
const IMG_NIGHT_3 =
  "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=1200&q=80";
const IMG_NIGHT_HERO =
  "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1600&q=80";

/**
 * Estructura base de una actividad.
 * - id: string estable (clave para completar/persistir)
 * - phase: "day" | "night"
 * - branch: "Regulación" | "Aprendizaje" | "Físico" | "Emoción"
 * - run: placeholder para lógica futura (ej. abrir minijuego respiración)
 */
export const activitiesCatalog = {
  day: [
    {
      id: "d-rec-breath-5",
      phase: "day",
      title: "Respiración guiada (5 min)",
      branch: "Regulación",
      branchBadge: "text-bg-primary",
      duration: 5,
      description: "Un reinicio breve para bajar tensión y centrarte.",
      reason: "Ideal para empezar el día con claridad.",
      image: IMG_DAY_HERO,
      priority: true,
      run: {
        type: "breathing_guided",

        // Preset elegido por defecto
        defaultPreset: "standard", // quick | standard | deep

        // Presets de duración (2/3/5 min) con patrón base 4-6
        presets: {
          quick: {
            label: "Rápido (2 min)",
            totalSeconds: 120,
            pattern: "calm_4_2_6",
          },
          standard: {
            label: "Estándar (3 min)",
            totalSeconds: 180,
            pattern: "calm_4_2_6",
          },
          deep: {
            label: "Profundo (5 min)",
            totalSeconds: 300,
            pattern: "calm_4_2_6",
          },
        },

        // Selector secundario de patrón (opcional en UI del runner)
        patterns: {
          calm_4_2_6: { label: "Calma (4–2–6)", inhale: 4, hold: 2, exhale: 6 },
          box_4_4_4_4: {
            label: "Box (4–4–4–4)",
            inhale: 4,
            hold: 4,
            exhale: 4,
            hold2: 4,
          },
        },
      },
    },
    {
      id: "d-soma-check",
      phase: "day",
      title: "Chequeo somático",
      branch: "Físico",
      branchBadge: "text-bg-success",
      duration: 3,
      description: "Escanea cuerpo: mandíbula, pecho, estómago, respiración.",
      image: IMG_DAY_1,
      run: "somatic_check",
    },
    {
      id: "d-tip-emotion",
      phase: "day",
      title: "Tip emocional del día",
      branch: "Aprendizaje",
      branchBadge: "text-bg-info",
      duration: 2,
      description: "Una idea corta y aplicable para entender lo que sientes.",
      image: IMG_DAY_2,
      run: "library_tip",
    },
    {
      id: "d-thought-cut",
      phase: "day",
      title: "Corte de pensamiento",
      branch: "Regulación",
      branchBadge: "text-bg-primary",
      duration: 4,
      description: "Ejercicio breve para reducir rumia y ansiedad.",
      image: IMG_DAY_3,
      run: "thought_cut",
    },
    {
      id: "d-goals-review",
      phase: "day",
      title: "Revisar objetivos (2 min)",
      branch: "Objetivos",
      branchBadge: "text-bg-warning",
      duration: 2,
      description:
        "Elige 1 micro-paso para hoy. Si no hay goals, crea uno pequeño.",
      reason: "Viernes = hábitos y metas.",
      image: IMG_DAY_2,
      run: "goals_review",
    },
    {
      id: "d-stretch-break",
      phase: "day",
      title: "Pausa activa / estiramientos",
      branch: "Físico",
      branchBadge: "text-bg-success",
      duration: 6,
      description: "Movimiento suave para soltar tensión y resetear postura.",
      reason: "Sábado = autocuidado físico ligero.",
      image: IMG_DAY_1,
      run: "stretch_break",
    },
    {
      id: "d-mirror-review",
      phase: "day",
      title: "Revisión semanal en Espejo",
      branch: "Espejo",
      branchBadge: "text-bg-dark",
      duration: 4,
      description: "Mira 7 días: racha, emoción dominante y lo que funcionó.",
      reason: "Domingo = cerrar y preparar la semana.",
      image: IMG_DAY_HERO,
      run: "mirror_review",
    },
  ],

  night: [
    {
      id: "n-rec-emotion-check",
      phase: "night",
      title: "Identifica tu emoción (2 min)",
      branch: "Emoción",
      branchBadge: "text-bg-light border",
      duration: 2,
      description: "Selecciona emoción + una frase.",
      reason: "Esto alimenta el Espejo y te ayuda a ver patrones.",
      image: IMG_NIGHT_HERO,
      priority: true,
      run: "emotion_checkin",
    },
    {
      id: "n-body-signal",
      phase: "night",
      title: "Señal corporal de hoy",
      branch: "Emoción",
      branchBadge: "text-bg-light border",
      duration: 3,
      description: "¿Dónde se siente más fuerte? Pecho, estómago, garganta…",
      image: IMG_NIGHT_1,
      run: "body_signal",
    },
    {
      id: "n-reframe-1",
      phase: "night",
      title: "Reencuadre breve",
      branch: "Regulación",
      branchBadge: "text-bg-primary",
      duration: 4,
      description: "Una frase alternativa más útil para cerrar el día.",
      image: IMG_NIGHT_2,
      run: "reframe",
    },
    {
      id: "n-journal-1",
      phase: "night",
      title: "Reflexión (1 frase)",
      branch: "Aprendizaje",
      branchBadge: "text-bg-info",
      duration: 2,
      description: "¿Qué te ha enseñado hoy esa emoción?",
      image: IMG_NIGHT_3,
      run: "night_journal",
    },
  ],
};

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
