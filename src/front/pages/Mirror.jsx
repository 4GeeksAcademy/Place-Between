import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

/* -------------------------
  HELPERS
------------------------- */

const getBackendUrl = () => {
  const url = import.meta.env.VITE_BACKEND_URL;
  return (url || "").replace(/\/$/, "");
};

const formatDateTime = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const normalizeKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");

const getEmotionClass = (emotionName) => {
  const k = normalizeKey(emotionName);
  if (k === "alegria") return "pb-e-alegria";
  if (k === "tristeza") return "pb-e-tristeza";
  if (k === "ira") return "pb-e-ira";
  if (k === "miedo") return "pb-e-miedo";
  return "pb-e-default";
};

const getIntensityClass = (intensity) => {
  const n = Number(intensity);
  if (!Number.isFinite(n)) return "pb-i-5";
  const clamped = Math.max(1, Math.min(10, Math.round(n)));
  return `pb-i-${clamped}`;
};

const getCategoryClass = (categoryName) => {
  const k = normalizeKey(categoryName);
  if (k === "emocion") return "pb-cat-emocion";
  if (k === "espejo") return "pb-cat-espejo";
  if (k === "aprendizaje") return "pb-cat-aprendizaje";
  if (k === "fisico") return "pb-cat-fisico";
  if (k === "regulacion") return "pb-cat-regulacion";
  if (k === "objetivos") return "pb-cat-objetivos";
  return "pb-cat-default";
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const toISODate = (d) => {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseIsoYmdLocal = (iso) => {
  // YYYY-MM-DD -> Date local (mediodía para evitar DST)
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  return dt;
};

const startOfWeekMonday = (baseDate) => {
  const d = new Date(baseDate);
  const day = d.getDay(); // 0 domingo .. 6 sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(12, 0, 0, 0);
  return d;
};

const weekRangeLD = (baseDate) => {
  const mon = startOfWeekMonday(baseDate);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: toISODate(mon), end: toISODate(sun), mon, sun };
};

const monthToRange = (yyyyMm) => {
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const toISO = (x) => x.toISOString().slice(0, 10);
  return { start: toISO(start), end: toISO(end) };
};

const shiftMonth = (yyyyMm, delta) => {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const isFutureMonth = (yyyyMm) => {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return yyyyMm > cur;
};

const dayLabelLD = (iso) => {
  const d = parseIsoYmdLocal(iso);
  const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return names[d.getDay()];
};

const dayOfMonthLabel = (iso) => String(iso).slice(8, 10);

const enumerateDaysIso = (startIso, endIso) => {
  const out = [];
  const start = parseIsoYmdLocal(startIso);
  const end = parseIsoYmdLocal(endIso);
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    out.push(toISODate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
};

const buildEmptyDay = (iso) => ({
  date: iso,
  points_total: 0,
  points_day: 0,
  points_night: 0,
  completions_count: 0,
  principal_count: 0,
  recommended_count: 0,
  categories: {},
  emotions: {},
  emotion_entries: [],
  activities: [],
});

const monthLabelEs = (yyyyMm) => {
  const [y, m] = yyyyMm.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(dt);
};

/* -------------------------
  SMALL SVG CHARTS
------------------------- */

function LineChart({
  series,
  xLabels,
  activeClassName,
  onPointClick,
  categoryClassForPoint,
  valueFormatter,
}) {
  const W = 1000;

  // +aire vertical (sobre todo para labels y puntos)
  const H = 340;

  const padL = 55;
  const padR = 20;

  // más margen arriba/abajo para que el número no “abrace” el dot
  const padT = 28;
  const padB = 70;

  // modo “denso” (mes / series largas)
  const dense = series.length > 14;

  // en modo denso, no pintamos todos los labels del eje X (evita apiñamiento)
  //const xEvery = dense ? 3 : 1;

  const maxV = Math.max(...series.map((p) => p.value), 1);
  const minV = Math.min(...series.map((p) => p.value), 0);

  const n = Math.max(series.length, 2);
  const xStep = (W - padL - padR) / (n - 1);

  const yFor = (v) => {
    // si todos 0, deja línea al fondo suave
    const range = Math.max(maxV - minV, 1);
    const t = (v - minV) / range;
    return padT + (1 - t) * (H - padT - padB);
  };

  const points = series.map((p, i) => ({
    ...p,
    x: padL + i * xStep,
    y: yFor(p.value),
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  return (
    <div className={`pb-linechart ${activeClassName || ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Recorrido">
        {/* grid */}
        {[0.25, 0.5, 0.75].map((t) => {
          const y = padT + t * (H - padT - padB);
          return <line key={t} className="pb-linechart-grid" x1={padL} x2={W - padR} y1={y} y2={y} />;
        })}

        {/* axis */}
        <line className="pb-linechart-axis" x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} />
        <line className="pb-linechart-axis" x1={padL} x2={padL} y1={padT} y2={H - padB} />

        {/* line */}
        <path className="pb-linechart-path" d={pathD} />


        {/* points + labels */}
        {points.map((p, i) => {
          const ptClass = categoryClassForPoint ? categoryClassForPoint(p) : "";

          // intentamos poner el valor arriba, pero si “choca” con el techo, lo bajamos debajo del dot
          const above = p.y - (dense ? 26 : 34);
          const below = p.y + (dense ? 30 : 36);

          const yLabel = above < padT + 16
            ? clamp(below, padT + 16, H - padB - 12)
            : clamp(above, padT + 16, H - padB - 12);

          const showValue = !dense || Number(p.value) !== 0; // en mes: oculta 0s (limpia muchísimo)

          //const showX = !dense || i % xEvery === 0 || i === points.length - 1;

          return (
            <g key={p.iso}>
              <circle
                className={`pb-linechart-point ${ptClass}`}
                cx={p.x}
                cy={p.y}
                r={dense ? 6 : 8}
                onClick={() => onPointClick?.(p.iso)}
              />

              {showValue && (
                <text
                  className={`pb-linechart-value ${dense ? "is-dense" : ""}`}
                  x={p.x}
                  y={yLabel}
                  textAnchor="middle"
                >
                  {valueFormatter ? valueFormatter(p.value) : p.value}
                </text>
              )}


              <text
                className={`pb-linechart-xlabel ${dense ? "is-dense" : ""}`}
                x={p.x}
                y={H - 18}
                textAnchor="middle"
              >
                {xLabels?.[i] ?? ""}
              </text>

            </g>
          );
        })}

      </svg>
    </div>
  );
}

function PieSolid({ items, selectedName, onSelect }) {
  // items: [{name,count,avg}]
  const total = items.reduce((a, b) => a + (b.count || 0), 0) || 1;

  const size = 260;
  const cx = 150;
  const cy = 150;
  const r = 110;

  let acc = 0;

  const slicePath = (start, end) => {
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;

    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);

    const large = end - start > 0.5 ? 1 : 0;

    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  };

  return (
    <div className="pb-em-pie">
      <svg viewBox="0 0 300 300" width={size} height={size} aria-label="Distribución de emociones">
        {items.map((it) => {
          const frac = (it.count || 0) / total;
          const start = acc;
          const end = acc + frac;
          acc = end;

          const isActive = selectedName && normalizeKey(selectedName) === normalizeKey(it.name);
          const cls = `${getEmotionClass(it.name)} ${isActive ? "pb-em-slice-active" : ""}`;

          return (
            <path
              key={it.name}
              className={`pb-em-slice ${cls}`}
              d={slicePath(start, end)}
              onClick={() => onSelect?.(it.name)}
            />
          );
        })}
        <circle
          className="pb-em-pie-center"
          cx={cx}
          cy={cy}
          r={r + 1}
          style={{ pointerEvents: "none" }}
        />
      </svg>
      <div className="pb-em-pie-hint">click</div>
    </div>
  );
}

/* -------------------------
  COMPONENT
------------------------- */

export const Mirror = () => {
  const BACKEND_URL = useMemo(() => getBackendUrl(), []);
  const token = useMemo(() => localStorage.getItem("pb_token"), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dataToday, setDataToday] = useState(null);
  const [dataRange, setDataRange] = useState(null);

  const [rangeView, setRangeView] = useState("today"); // "today" | "7d" | "30d"
  const [activityView, setActivityView] = useState("chrono"); // "chrono" | "session"

  const [weekCursor, setWeekCursor] = useState(() => new Date());
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // “Tu recorrido” selector (total o categoría)
  const [metricCategory, setMetricCategory] = useState(null); // null => total

  // Emociones seleccionada (drilldown)
  const [selectedEmotion, setSelectedEmotion] = useState(null);

  // refs para scroll día
  const techDetailsRef = useRef(null);

  const phaseParam = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get("phase");
    return p === "day" || p === "night" ? p : null;
  }, []);

  const getPhaseFromRoot = () =>
    document?.documentElement?.getAttribute("data-pb-phase") || "day";

  const [phaseLive, setPhaseLive] = useState(() => getPhaseFromRoot());

  useEffect(() => {
    const handler = (e) => {
      const next = e?.detail?.phase || getPhaseFromRoot();
      setPhaseLive(next);
    };
    window.addEventListener("pb:phase-updated", handler);
    return () => window.removeEventListener("pb:phase-updated", handler);
  }, []);

  const isNight = phaseParam ? phaseParam === "night" : phaseLive === "night";


  // Semana máxima: semana actual (L-D). No se puede ir al futuro.
  const currentWeekStartISO = useMemo(() => weekRangeLD(new Date()).start, []);
  const currentWeekStartDate = useMemo(() => parseIsoYmdLocal(currentWeekStartISO), [currentWeekStartISO]);

  const canGoNextWeek = useMemo(() => {
    const next = new Date(weekCursor);
    next.setDate(next.getDate() + 7);
    return startOfWeekMonday(next).getTime() <= currentWeekStartDate.getTime();
  }, [weekCursor, currentWeekStartDate]);

  const displayName = useMemo(() => {
    const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");
    try {
      const raw = localStorage.getItem("pb_user");
      if (raw) {
        const obj = JSON.parse(raw);
        const name = obj?.username || obj?.name || obj?.email;
        if (name) return cap(String(name).split("@")[0]);
      }
    } catch (_e) { }
    const u = localStorage.getItem("pb_username") || localStorage.getItem("pb_user_name") || "";
    return cap(u) || "";
  }, []);


  useEffect(() => {
    // al cambiar de tab, resetea drilldown/metricas
    setSelectedEmotion(null);
    setMetricCategory(null);
  }, [rangeView]);

  useEffect(() => {
    const run = async () => {
      if (!BACKEND_URL) {
        setError("Falta configurar VITE_BACKEND_URL.");
        setLoading(false);
        return;
      }
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const endpoint = (() => {
          if (rangeView === "today") return "/api/mirror/today";

          if (rangeView === "7d") {
            const { start, end } = weekRangeLD(weekCursor);
            return `/api/mirror/range?start=${start}&end=${end}`;
          }

          const { start, end } = monthToRange(monthCursor);
          return `/api/mirror/range?start=${start}&end=${end}`;
        })();

        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = payload?.msg || payload?.message || "No se pudo cargar el Espejo.";
          throw new Error(msg);
        }

        if (rangeView === "today") setDataToday(payload);
        else setDataRange(payload);
      } catch (e) {
        setError(e?.message || "Error inesperado cargando el Espejo.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [BACKEND_URL, token, rangeView, weekCursor, monthCursor]);

  /* -------------------------
    HOY
  ------------------------- */
  const sessions = dataToday?.sessions || [];
  const activities = dataToday?.activities || [];
  const pointsToday = dataToday?.points_today ?? 0;
  const pointsByCategory = dataToday?.points_by_category || {};
  const emotion = dataToday?.emotion || null;
  const dateStr = dataToday?.date || null;

  const emotionClass = emotion ? getEmotionClass(emotion.name) : "pb-e-default";
  const intensityClass = emotion ? getIntensityClass(emotion.intensity) : "pb-i-5";

  const activitiesChrono = useMemo(() => {
    return [...activities].sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)));
  }, [activities]);

  const activitiesBySession = useMemo(() => {
    return {
      day: activitiesChrono.filter((a) => a.session_type === "day"),
      night: activitiesChrono.filter((a) => a.session_type === "night"),
    };
  }, [activitiesChrono]);

  /* -------------------------
    RANGE (7 / mes)
  ------------------------- */
  const rangeMeta = dataRange?.range || null;
  const rangeDaysRaw = dataRange?.days || [];

  const rangeDays = useMemo(() => {
    if (!rangeMeta?.start || !rangeMeta?.end) return [];

    const isoList = enumerateDaysIso(rangeMeta.start, rangeMeta.end);
    const byDate = new Map(rangeDaysRaw.map((d) => [d.date, d]));

    return isoList.map((iso) => {
      const d = byDate.get(iso);
      return d ? { ...buildEmptyDay(iso), ...d } : buildEmptyDay(iso);
    });
  }, [rangeMeta?.start, rangeMeta?.end, rangeDaysRaw]);

  const totalRangePts = dataRange?.totals?.points_total ?? 0;

  const consistencyPct = useMemo(() => {
    const total = rangeDays.length || 0;
    if (!total) return 0;
    const consistent = rangeDays.filter((d) => (d.principal_count || 0) > 0).length;
    return Math.round((consistent / total) * 100);
  }, [rangeDays]);

  const categoriesTotals = useMemo(() => {
    const cats = dataRange?.distributions?.categories_points || {};
    return Object.entries(cats)
      .map(([name, pts]) => ({ name, pts: Number(pts) || 0 }))
      .filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts);
  }, [dataRange]);

  const emotionsTotals = useMemo(() => {
    const em = dataRange?.distributions?.emotions || {};
    return Object.entries(em)
      .map(([name, v]) => ({
        name,
        count: Number(v?.count) || 0,
        avg: v?.intensity_avg != null ? Number(v.intensity_avg) : null,
      }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [dataRange]);

  const xLabels = useMemo(() => {
    if (rangeView === "30d") return rangeDays.map((d) => dayOfMonthLabel(d.date));
    return rangeDays.map((d) => dayLabelLD(d.date));
  }, [rangeDays, rangeView]);

  const lineSeries = useMemo(() => {
    return rangeDays.map((d) => {
      const value = metricCategory ? Number(d?.categories?.[metricCategory] || 0) : Number(d.points_total || 0);
      return { iso: d.date, value };
    });
  }, [rangeDays, metricCategory]);

  const onPointClick = (iso) => {
    const outer = techDetailsRef.current;
    if (outer) outer.open = true;

    // abre el detail del día concreto
    const dayDetails = document.querySelector(`details[data-tech-day="${iso}"]`);
    if (dayDetails) dayDetails.open = true;

    const el = document.getElementById(`pb-tech-${iso}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // drilldown emociones: agrupado por día (solo texto, sin navegación)
  const emotionDrillByDay = useMemo(() => {
    if (!selectedEmotion) return [];
    const out = [];

    for (const d of rangeDays) {
      const entries = Array.isArray(d.emotion_entries) ? d.emotion_entries : [];
      const matching = entries.filter((e) => normalizeKey(e?.name) === normalizeKey(selectedEmotion));
      if (!matching.length) continue;

      out.push({
        date: d.date,
        dayLabel: rangeView === "30d" ? dayOfMonthLabel(d.date) : dayLabelLD(d.date),
        count: matching.length,
        entries: matching,
        avg:
          matching.filter((x) => x.intensity != null).length > 0
            ? matching.filter((x) => x.intensity != null).reduce((a, b) => a + Number(b.intensity || 0), 0) /
            matching.filter((x) => x.intensity != null).length
            : null,
      });
    }

    // orden cronológico asc (más natural para “por día”)
    out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return out;
  }, [selectedEmotion, rangeDays, rangeView]);

  /* -------------------------
    HEADER
  ------------------------- */
  const containerClass = rangeView === "today" ? "container py-5" : "container py-5 pb-mirror-container--wide";

  const rangeHeader = useMemo(() => {
    if (rangeView === "today") return dateStr ? `Resumen de hoy (${dateStr})` : "Resumen de hoy";

    if (rangeView === "7d" && rangeMeta?.start && rangeMeta?.end) {
      return `Semana (L–D): ${rangeMeta.start} → ${rangeMeta.end}`;
    }

    if (rangeView === "30d") {
      return `Mes: ${monthLabelEs(monthCursor)}`;
    }

    return "Resumen";
  }, [rangeView, dateStr, rangeMeta?.start, rangeMeta?.end, monthCursor]);

  return (
    <div className={`pb-mirror-shell ${isNight ? "pb-mirror-night" : "pb-mirror-day"}`}>
      <div className={`container py-5 ${rangeView !== "today" ? "pb-mirror-range" : ""}`}>
        {/* Tabs rango */}
        <div className="d-flex justify-content-end mb-3">
          <div className="btn-group" role="group" aria-label="Rango espejo">
            <button
              type="button"
              className={`btn btn-sm ${rangeView === "today" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setRangeView("today")}
            >
              Hoy
            </button>
            <button
              type="button"
              className={`btn btn-sm ${rangeView === "7d" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setRangeView("7d")}
            >
              7 días
            </button>
            <button
              type="button"
              className={`btn btn-sm ${rangeView === "30d" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setRangeView("30d")}
            >
              30 días
            </button>
          </div>
        </div>

        {/* Título */}
        <div className="d-flex align-items-start justify-content-between mb-3 gap-3 flex-wrap">
          <div>
            <h1 className="h2 fw-bold mb-1">Espejo</h1>
            <p className="text-secondary mb-0">{rangeHeader}</p>
          </div>

          {/* Controles semana / mes */}
          {rangeView === "7d" && (
            <div className="d-flex gap-2 align-items-center">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() =>
                  setWeekCursor((d) => {
                    const x = new Date(d);
                    x.setDate(x.getDate() - 7);
                    return x;
                  })
                }
              >
                ◀ Semana anterior
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={!canGoNextWeek}
                title={!canGoNextWeek ? "No se puede ir a semanas futuras" : "Semana siguiente"}
                onClick={() => {
                  if (!canGoNextWeek) return;
                  setWeekCursor((d) => {
                    const x = new Date(d);
                    x.setDate(x.getDate() + 7);
                    return x;
                  });
                }}
              >
                Semana siguiente ▶
              </button>
            </div>
          )}

          {rangeView === "30d" && (
            <div className="d-flex gap-2 align-items-center">
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setMonthCursor((m) => shiftMonth(m, -1))}>
                ◀ Mes anterior
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={isFutureMonth(shiftMonth(monthCursor, +1))}
                title={isFutureMonth(shiftMonth(monthCursor, +1)) ? "No se puede ir a meses futuros" : "Mes siguiente"}
                onClick={() => {
                  const next = shiftMonth(monthCursor, +1);
                  if (isFutureMonth(next)) return;
                  setMonthCursor(next);
                }}
              >
                Mes siguiente ▶
              </button>
            </div>
          )}
        </div>

        {/* Auth guard */}
        {!token && (
          <div className="alert alert-warning">
            <div className="fw-semibold mb-1">Necesitas iniciar sesión para ver tu Espejo.</div>
            <div className="d-flex gap-2 mt-2">
              <Link className="btn btn-primary" to="/auth/login">
                Ir a login
              </Link>
              <Link className="btn btn-outline-primary" to="/auth/signup">
                Crear cuenta
              </Link>
            </div>
          </div>
        )}

        {token && loading && <div className="text-secondary">Cargando resumen...</div>}

        {token && !loading && error && (
          <div className="alert alert-danger">
            <div className="fw-semibold">No se pudo cargar el Espejo</div>
            <div className="mt-1">{error}</div>
          </div>
        )}

        {token && !loading && !error && (dataToday || dataRange) && (
          <>
            {/* =========================
                VISTA 7 / 30
            ========================= */}
            {rangeView !== "today" && dataRange && (
              <div className="row g-3">
                <div className="col-12">
                  <div className="card shadow-sm pb-card-soft">
                    <div className="card-body">
                      <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                        <div>
                          <div className="pb-eyebrow">Resumen</div>
                          <div className="h4 fw-bold mb-1">
                            {isNight ? "Buenas noches" : "Buenos días"},{" "}
                            {displayName || "Usuario"}!
                          </div>
                          <div className="text-secondary small">
                            {dataRange?.range?.start} → {dataRange?.range?.end}
                          </div>
                        </div>

                        <div className="text-secondary small">
                          Total <span className="fw-semibold">{totalRangePts}</span> pts
                        </div>
                      </div>

                      {/* KPIs */}
                      <div className="row g-3 mt-2">
                        <div className="col-12 col-md-4">
                          <div className="pb-kpi">
                            <div className="text-secondary small">Equilibrio</div>
                            <div className="display-6 fw-bold mb-0">{consistencyPct}%</div>
                            <div className="text-secondary small">días consistentes</div>
                          </div>
                        </div>

                        <div className="col-12 col-md-4">
                          <div className="pb-kpi">
                            <div className="text-secondary small">Racha</div>
                            <div className="display-6 fw-bold mb-0">{dataRange?.streak?.current ?? 0}</div>
                            <div className="text-secondary small">actual</div>
                          </div>
                        </div>

                        <div className="col-12 col-md-4">
                          <div className="pb-kpi">
                            <div className="text-secondary small">Mejor racha</div>
                            <div className="display-6 fw-bold mb-0">{dataRange?.streak?.best ?? 0}</div>
                            <div className="text-secondary small">en el rango</div>
                          </div>
                        </div>
                      </div>

                      {/* Tu recorrido: selector (pills) */}
                      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-4">
                        <div>
                          <div className="fw-semibold">Tu recorrido</div>
                          <div className="text-secondary small">Mostrando: <span className="fw-semibold">{metricCategory || "Total"}</span></div>
                        </div>

                        <div className="pb-metric-pills">
                          <button
                            type="button"
                            className={`pb-pill ${metricCategory === null ? "pb-pill-active" : ""}`}
                            onClick={() => setMetricCategory(null)}
                          >
                            Total
                          </button>
                          {categoriesTotals.map((c) => (
                            <button
                              type="button"
                              key={c.name}
                              className={`pb-pill ${getCategoryClass(c.name)} ${metricCategory === c.name ? "pb-pill-active" : ""}`}
                              onClick={() => setMetricCategory(c.name)}
                            >
                              {c.name} <span className="pb-pill-num">{c.pts}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Línea */}
                      <div className="mt-2">
                        <LineChart
                          series={lineSeries}
                          xLabels={xLabels}
                          activeClassName={metricCategory ? getCategoryClass(metricCategory) : "pb-metric-total"}
                          categoryClassForPoint={() => (metricCategory ? getCategoryClass(metricCategory) : "pb-metric-total")}
                          onPointClick={onPointClick}
                          valueFormatter={(v) => String(v)}
                        />
                        <div className="d-flex justify-content-between text-secondary small mt-2">
                          <span>{dataRange?.range?.start}</span>
                          <span>{dataRange?.range?.end}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emociones + Categorías */}
                <div className="col-12 col-lg-6">
                  <div className="card shadow-sm pb-card-soft h-100">
                    <div className="card-body">
                      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div>
                          <div className="fw-semibold mb-1">Emociones</div>
                          <div className="text-secondary small">Frecuencia + intensidad media</div>
                        </div>

                      </div>

                      {emotionsTotals.length === 0 && <div className="text-secondary mt-3">Sin check-ins emocionales en este rango.</div>}

                      {emotionsTotals.length > 0 && (
                        <div className="pb-em-grid mt-3">
                          {/* lista */}
                          <div className="pb-em-list">
                            {emotionsTotals.map((e) => {
                              const active = selectedEmotion && normalizeKey(selectedEmotion) === normalizeKey(e.name);
                              return (
                                <button
                                  key={e.name}
                                  type="button"
                                  className={`pb-em-row ${getEmotionClass(e.name)} ${active ? "pb-em-row-active" : ""}`}
                                  onClick={() => setSelectedEmotion((cur) => (normalizeKey(cur) === normalizeKey(e.name) ? null : e.name))}
                                >
                                  <div className="pb-em-row-name">{e.name}</div>
                                  <div className="pb-em-row-meta">
                                    <span className="pb-em-row-count">{e.count}×</span>
                                    <span className="pb-em-row-avg">avg {e.avg != null ? e.avg.toFixed(1) : "—"}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* pie sólido (sin degradado) */}
                          <PieSolid
                            items={emotionsTotals}
                            selectedName={selectedEmotion}
                            onSelect={(name) => setSelectedEmotion((cur) => (normalizeKey(cur) === normalizeKey(name) ? null : name))}
                          />
                        </div>
                      )}

                      {/* Drilldown real: por día, con texto escrito */}
                      {selectedEmotion && (
                        <div className="mt-3">
                          <div className="fw-semibold mb-2">Detalle · {selectedEmotion}</div>
                          <button className="btn btn-sm btn-outline-primary" onClick={() => setSelectedEmotion(null)}>
                            Cerrar
                          </button>

                          {emotionDrillByDay.length === 0 && (
                            <div className="text-secondary">No hay registros para esta emoción en este rango.</div>
                          )}

                          {emotionDrillByDay.length > 0 && (
                            <div className="pb-em-drill">
                              {emotionDrillByDay.map((d) => (
                                <div key={d.date} className="pb-em-day">
                                  <div className="pb-em-day-head">
                                    <div className="fw-semibold">
                                      {d.date} <span className="text-secondary">· {rangeView === "30d" ? `día ${dayOfMonthLabel(d.date)}` : dayLabelLD(d.date)}</span>
                                    </div>
                                    <div className="text-secondary small">
                                      {d.count}× · avg {d.avg != null ? d.avg.toFixed(1) : "—"}
                                    </div>
                                  </div>

                                  <div className="pb-em-day-notes">
                                    {d.entries.map((e, idx) => (
                                      <div key={idx} className="pb-em-note">
                                        <div className="pb-em-note-top">
                                          <span className="pb-em-note-int">{e.intensity != null ? `${e.intensity}/10` : "—"}</span>
                                          <span className="pb-em-note-time">{e.created_at ? formatDateTime(e.created_at) : ""}</span>
                                        </div>
                                        <div className="pb-em-note-text">{e.note ? e.note : "Sin nota"}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Categorías: barras horizontales */}
                <div className="col-12 col-lg-6">
                  <div className="card shadow-sm pb-card-soft h-100">
                    <div className="card-body">
                      <div className="fw-semibold mb-1">Categorías</div>
                      <div className="text-secondary small mb-3">Dónde se fueron tus puntos</div>

                      {categoriesTotals.length === 0 && <div className="text-secondary">Sin puntos en este rango.</div>}

                      {categoriesTotals.length > 0 && (
                        <div className="pb-hbars">
                          {categoriesTotals.map((c) => {
                            const ratio = totalRangePts > 0 ? c.pts / totalRangePts : 0;
                            const active = metricCategory === c.name;
                            return (
                              <button
                                type="button"
                                key={c.name}
                                className={`pb-hbar ${getCategoryClass(c.name)} ${active ? "pb-hbar-active" : ""}`}
                                onClick={() => setMetricCategory(c.name)}
                                title={`Mostrar recorrido: ${c.name}`}
                              >
                                <div className="pb-hbar-top">
                                  <span className="pb-hbar-name">{c.name}</span>
                                  <span className="pb-hbar-pts">{c.pts} pts</span>
                                </div>
                                <div className="pb-hbar-track">
                                  <div className="pb-hbar-fill" style={{ width: `${clamp(Math.round(ratio * 100), 0, 100)}%` }} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reporte técnico plegable + drilldown día */}
                <div className="col-12">
                  <details ref={techDetailsRef} className="card shadow-sm pb-card-soft">
                    <summary className="card-body fw-semibold pb-details-summary">
                      Reporte técnico
                      <span className="text-secondary fw-normal ms-2">(por día + actividades)</span>
                    </summary>

                    <div className="card-body pt-0">
                      <div className="mt-2 d-flex flex-column gap-2">
                        {rangeDays.map((d) => (
                          <details key={d.date} data-tech-day={d.date} id={`pb-tech-${d.date}`} className="pb-tech-day">
                            <summary className="pb-tech-day-summary">
                              <div className="pb-tech-left">
                                <div className="fw-semibold">{d.date}</div>
                                <div className="text-secondary small">
                                  completadas: {d.completions_count} · principal: {d.principal_count} · recomendado: {d.recommended_count}
                                </div>
                              </div>
                              <div className="pb-tech-right">
                                <div className="fw-bold">{d.points_total}</div>
                              </div>
                            </summary>

                            <div className="pb-tech-day-body">
                              {Array.isArray(d.activities) && d.activities.length > 0 ? (
                                <div className="d-flex flex-column gap-2">
                                  {d.activities.map((a, idx) => (
                                    <div key={idx} className="pb-item pb-item-stack">
                                      <div className="fw-semibold">{a.name}</div>
                                      <div className="text-secondary small">
                                        {a.category_name} · {a.session_type} · {a.points} pts {a.completed_at ? `· ${formatDateTime(a.completed_at)}` : ""}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-secondary">Sin actividades registradas este día.</div>
                              )}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            )}

            {/* =========================
                VISTA HOY
            ========================= */}
            {rangeView === "today" && dataToday && (
              <>
                <div className={`card shadow-sm mb-4 pb-card-soft pb-mirror-hero ${emotionClass} ${intensityClass}`}>
                  <div className="card-body d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-4">
                    <div>
                      <div className="pb-eyebrow">Estado actual</div>

                      <div className="pb-hero-title">
                        {emotion ? (
                          <>
                            {emotion.name} <span className="pb-hero-sub">· {emotion.intensity ?? "—"}/10</span>
                          </>
                        ) : (
                          "Sin registro emocional hoy"
                        )}
                      </div>

                      <div className="pb-hero-text">
                        {emotion?.note ? emotion.note : "Registra tu emoción por la noche para que el Espejo refleje patrones."}
                      </div>

                      <div className="d-flex gap-2 mt-3">
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            const el = document.querySelector("details[data-mirror-details]");
                            if (el) {
                              el.setAttribute("open", "");
                              el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                          }}
                        >
                          Ver detalle
                        </button>
                      </div>
                    </div>

                    <div className="pb-orb" aria-hidden="true">
                      <div className="pb-orb-stars pb-orb-stars-a" />
                      <div className="pb-orb-stars pb-orb-stars-b" />
                    </div>
                  </div>
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-12 col-md-4">
                    <div className="card shadow-sm pb-card-soft">
                      <div className="card-body">
                        <div className="text-secondary small">Puntos de hoy</div>
                        <div className="display-6 fw-bold">{pointsToday}</div>
                      </div>
                    </div>
                  </div>

                  <div className="col-12 col-md-4">
                    <div className="card shadow-sm pb-card-soft">
                      <div className="card-body">
                        <div className="text-secondary small">Sesiones</div>
                        <div className="display-6 fw-bold">{sessions.length}</div>
                        <div className="text-secondary small">
                          {sessions.length ? sessions.map((s) => s.session_type).join(" · ") : "Sin sesiones registradas"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-12 col-md-4">
                    <div className="card shadow-sm pb-card-soft">
                      <div className="card-body">
                        <div className="text-secondary small">Actividades completadas</div>
                        <div className="display-6 fw-bold">{activities.length}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card shadow-sm pb-card-soft mb-4">
                  <div className="card-body">
                    <div className="fw-semibold">Puntos por categoría</div>
                    <div className="text-secondary small mb-3">Distribución de puntos (hoy)</div>

                    {Object.keys(pointsByCategory).length === 0 && (
                      <div className="text-secondary">Aún no hay actividad registrada hoy.</div>
                    )}

                    {Object.keys(pointsByCategory).length > 0 && (
                      <div className="pb-tiles">
                        {Object.entries(pointsByCategory)
                          .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                          .map(([cat, pts]) => (
                            <div
                              key={cat}
                              className={`pb-tile ${getCategoryClass(cat)}`}
                              title={`${cat}: ${pts} pts`}
                            >
                              <div className="pb-tile-title">{cat}</div>
                              <div className="pb-tile-sub">{pts} pts</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="card shadow-sm pb-card-soft">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between gap-3 mb-2">
                      <h2 className="h5 fw-bold mb-0">Recorrido de hoy</h2>
                    </div>

                    <div className="text-secondary small mb-2">Sendero</div>

                    {!activitiesChrono.length && <p className="text-secondary mb-0">Aún no has completado actividades hoy.</p>}

                    {!!activitiesChrono.length && (
                      <div className="pb-trail-wrap">
                        <div className="pb-trail">
                          {activitiesChrono.map((a, idx) => (
                            <React.Fragment key={`${a.id}-${a.completed_at}-${idx}`}>
                              {idx > 0 && <div className="pb-trail-connector" />}
                              <div
                                className={`pb-trail-node ${getCategoryClass(a.category_name)}`}
                                title={`${a.name} (${a.points} pts)`}
                                aria-label={a.name}
                              />
                            </React.Fragment>
                          ))}
                          <div className="pb-trail-destination" title="Cierre de hoy" />
                        </div>
                      </div>
                    )}

                    <details data-mirror-details className="mt-3">
                      <summary className="fw-semibold pb-details-summary">Ver detalle</summary>

                      <div className="mt-3 d-flex justify-content-end">
                        <div className="btn-group" role="group" aria-label="Vista actividades">
                          <button
                            type="button"
                            className={`btn btn-sm ${activityView === "chrono" ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setActivityView("chrono")}
                          >
                            Cronológico
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${activityView === "session" ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setActivityView("session")}
                          >
                            Día / Noche
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        {activityView === "chrono" && (
                          <div className="d-flex flex-column gap-2">
                            {activitiesChrono.map((a, idx) => (
                              <div key={`${a.id}-${a.completed_at}-${idx}-chrono`} className="pb-item">
                                <div>
                                  <div className="fw-semibold">{a.name}</div>
                                  <div className="text-secondary small">
                                    {a.category_name} · {a.session_type} · {formatDateTime(a.completed_at)}
                                  </div>
                                </div>
                                <div className="fw-bold">{a.points}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {activityView === "session" && (
                          <div className="row g-3">
                            {["day", "night"].map((st) => {
                              const list = activitiesBySession[st] || [];
                              return (
                                <div className="col-12 col-lg-6" key={st}>
                                  <div className="fw-semibold mb-2">{st === "day" ? "Día" : "Noche"}</div>

                                  {!list.length && <div className="text-secondary">Sin actividades.</div>}

                                  {!!list.length && (
                                    <div className="d-flex flex-column gap-2">
                                      {list.map((a, idx) => (
                                        <div key={`${a.id}-${a.completed_at}-${idx}-${st}`} className="pb-item pb-item-stack">
                                          <div className="fw-semibold">{a.name}</div>
                                          <div className="text-secondary small">
                                            {a.category_name} · {formatDateTime(a.completed_at)} · {a.points} pts
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
