// src/front/data/goalTemplates.js
import templates from "./goalTemplates.seed.json";

export const goalTemplatesCatalog = Array.isArray(templates) ? templates : [];

export const GOAL_FREQUENCIES = ["daily", "weekly", "monthly"];
export const GOAL_SIZES = ["small", "medium", "large"];

export function getGoalTemplateCategories() {
  const set = new Set();
  for (const t of goalTemplatesCatalog) if (t?.category) set.add(t.category);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}