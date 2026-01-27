// src/front/components/runners/runnerRegistry.js
// Registro central de runners (escalable y validable)

import { EmotionCheckinRunner } from "./EmotionCheckinRunner";

/**
 * runnerMap:
 * - key = run.type canonical (string)
 * - value = componente runner
 *
 * Importante: aquí SOLO registramos runners implementados.
 * Los no implementados quedan como "missing" y el dispatcher lo reporta.
 */
export const runnerMap = {
  emotion_checkin: EmotionCheckinRunner,
};

/**
 * Aliases legacy / retrocompatibilidad.
 * Si en el catálogo aparece un run antiguo, lo traducimos a canonical.
 */
export const runnerAliases = {
  emotion_picker: "emotion_checkin",
};

/**
 * Lista informativa de runs conocidos por catálogo (aunque no estén implementados aún).
 * Útil para validar y para UI “pendiente”.
 */
export const knownRunTypes = new Set([
  // Ya implementado
  "emotion_checkin",

  // Catalog future (según activities.js)
  "breathing_guided",
  "somatic_check",
  "library_tip",
  "thought_cut",
  "goals_review",
  "stretch_break",
  "mirror_review",
  "body_signal",
  "reframe",
  "night_journal",
]);
