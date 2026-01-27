import React, { useMemo } from "react";
import { runnerAliases, runnerMap, knownRunTypes } from "./runners/runnerRegistry";

/**
 * Normaliza activity.run a un objeto estable:
 * - Si run es string: { type: run }
 * - Si run es objeto: { type: run.type, ...run }
 * - Si no hay run: null
 */
const normalizeRun = (run) => {
    if (!run) return null;

    // string canonical
    if (typeof run === "string") {
        const type = run.trim();
        return type ? { type } : null;
    }

    // objeto (futuro): { type, ...params }
    if (typeof run === "object") {
        const type = String(run.type || "").trim();
        if (!type) return null;
        return { ...run, type };
    }

    return null;
};

/**
 * Aplica aliases legacy → canonical.
 */
const canonicalizeType = (type) => {
    // Solo aceptamos string como tipo válido
    const t = typeof type === "string" ? type.trim() : "";
    if (!t) return "";

    const alias = runnerAliases[t];

    // Alias válido SOLO si es string
    if (typeof alias === "string" && alias.trim()) return alias.trim();

    return t;
};

/**
 * UI estándar cuando run falta o no es válido.
 */
const MissingRun = () => (
    <div className="alert alert-warning mb-0">
        <div className="fw-semibold mb-1">Esta actividad no tiene runner asignado.</div>
        <div className="small">
            Falta <span className="pb-mono">activity.run</span> en el catálogo (activities.js) o no se enriqueció desde DB.
        </div>
    </div>
);

/**
 * UI estándar cuando el run existe pero no hay runner implementado aún.
 */
const UnimplementedRun = ({ type }) => (
    <div className="alert alert-secondary mb-0">
        <div className="fw-semibold mb-1">Runner pendiente</div>
        <div className="small">
            <span className="pb-mono">{typeof type === "string" ? type : "—"}</span> no está implementado aún.
        </div>
    </div>
);

export const ActivityRunner = ({ activity, onSaved }) => {
    // 1) Normaliza el run (string/u objeto) y aplica canonical
    const runNorm = useMemo(() => normalizeRun(activity?.run), [activity?.run]);
    const runType = useMemo(() => canonicalizeType(runNorm?.type), [runNorm?.type]);

    // 2) Dev warnings (para detectar problemas de catálogo/seed/enrich)
    //    - No rompe en prod, pero te da señales claras en dev.
    if (import.meta?.env?.DEV) {
        if (!runNorm) {
            console.warn("[ActivityRunner] activity.run missing/invalid:", {
                activityId: activity?.id,
                title: activity?.title,
                run: activity?.run,
            });
        } else if (!knownRunTypes.has(runType)) {
            console.warn("[ActivityRunner] unknown run.type (not in knownRunTypes):", {
                activityId: activity?.id,
                title: activity?.title,
                runType,
                run: runNorm,
            });
        } else if (!runnerMap[runType]) {
            console.warn("[ActivityRunner] run.type known but runner not implemented:", {
                activityId: activity?.id,
                title: activity?.title,
                runType,
            });
        }
    }

    // 3) Validaciones
    if (!runNorm) return <MissingRun />;

    const Runner = runnerMap[runType];
    if (!Runner) return <UnimplementedRun type={runType || "—"} />;

    // 4) Ejecuta runner
    return <Runner activity={activity} run={runNorm} onSaved={onSaved} />;
};
