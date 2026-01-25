import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
  return "pb-cat-default";
};

const getPointsBucketClass = (pts, total) => {
  const p = Number(pts) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return "pb-b-2";
  const ratio = p / t;

  if (ratio >= 0.55) return "pb-b-5";
  if (ratio >= 0.35) return "pb-b-4";
  if (ratio >= 0.20) return "pb-b-3";
  if (ratio > 0) return "pb-b-2";
  return "pb-b-1";
};

export const Mirror = () => {
  const BACKEND_URL = useMemo(() => getBackendUrl(), []);
  const token = useMemo(() => localStorage.getItem("pb_token"), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dataToday, setDataToday] = useState(null);

  const [rangeView, setRangeView] = useState("today"); // "today" | "7d" | "30d"
  const [activityView, setActivityView] = useState("chrono"); // "chrono" | "session"

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

        const res = await fetch(`${BACKEND_URL}/api/mirror/today`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = payload?.msg || payload?.message || "No se pudo cargar el Espejo.";
          throw new Error(msg);
        }

        setDataToday(payload);
      } catch (e) {
        setError(e?.message || "Error inesperado cargando el Espejo.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [BACKEND_URL, token]);

  const sessions = dataToday?.sessions || [];
  const activities = dataToday?.activities || [];
  const pointsToday = dataToday?.points_today ?? 0;
  const pointsByCategory = dataToday?.points_by_category || {};
  const emotion = dataToday?.emotion || null;
  const dateStr = dataToday?.date || null;

  const emotionClass = emotion ? getEmotionClass(emotion.name) : "pb-e-default";
  const intensityClass = emotion ? getIntensityClass(emotion.intensity) : "pb-i-5";

  const activitiesChrono = useMemo(() => {
    return [...activities].sort((a, b) =>
      String(a.completed_at).localeCompare(String(b.completed_at))
    );
  }, [activities]);

  const activitiesBySession = useMemo(() => {
    return {
      day: activitiesChrono.filter((a) => a.session_type === "day"),
      night: activitiesChrono.filter((a) => a.session_type === "night"),
    };
  }, [activitiesChrono]);

  const phaseParam = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get("phase");
    return p === "day" || p === "night" ? p : null;
  }, []);

  // Fondo día/noche (solo estética)
  const hour = new Date().getHours();
  const autoNight = hour >= 20 || hour < 6;
  const isNight = phaseParam ? phaseParam === "night" : autoNight;

  return (
    <div className={`pb-mirror-shell ${isNight ? "pb-mirror-night" : "pb-mirror-day"}`}>
      <div className="container py-5">
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
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h1 className="h2 fw-bold mb-1">Espejo</h1>
            <p className="text-secondary mb-0">
              {rangeView === "today"
                ? (dateStr ? `Resumen de hoy (${dateStr})` : "Resumen de hoy")
                : (rangeView === "7d" ? "Resumen (últimos 7 días)" : "Resumen (últimos 30 días)")}
            </p>
          </div>
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

        {token && !loading && !error && dataToday && (
          <>
            {/* Si NO es today, de momento mostramos placeholder (hasta endpoints week/month) */}
            {rangeView !== "today" && (
              <div className="row g-3">
                <div className="col-12 col-lg-8">
                  <div className="card shadow-sm pb-card-soft">
                    <div className="card-body">
                      <div className="fw-semibold mb-1">Próximamente</div>
                      <div className="text-secondary">
                        Este panel se conectará a backend cuando añadamos{" "}
                        <span className="pb-mono">/api/mirror/week</span> y{" "}
                        <span className="pb-mono">/api/mirror/month</span>.
                        Aquí irán gráficos de emociones y actividad por día.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Consistency SOLO en 7/30 */}
                <div className="col-12 col-lg-4">
                  <div className="card shadow-sm pb-card-soft h-100">
                    <div className="card-body d-flex flex-column justify-content-between">
                      <div>
                        <div className="text-secondary small">Consistency</div>
                        <div className="display-6 fw-bold mb-1">—</div>
                        <div className="text-secondary">racha (días con 1 ejercicio principal)</div>
                      </div>

                      <div className="text-secondary small mt-3">
                        Se calcula con el histórico de sesiones (7/30 días).
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VISTA HOY */}
            {rangeView === "today" && (
              <>
                {/* HERO (único estado emocional + orb) — eliminamos duplicidad */}
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
                        {emotion?.note
                          ? emotion.note
                          : "Registra tu emoción por la noche para que el Espejo refleje patrones."}
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

                {/* KPIs compactos */}
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

                {/* Puntos por categoría (HOY) */}
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
                              className={`pb-tile ${getCategoryClass(cat)} ${getPointsBucketClass(pts, pointsToday)}`}
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

                {/* Recorrido */}
                <div className="card shadow-sm pb-card-soft">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between gap-3 mb-2">
                      <h2 className="h5 fw-bold mb-0">Recorrido de hoy</h2>
                    </div>

                    <div className="text-secondary small mb-2">Sendero</div>

                    {!activitiesChrono.length && (
                      <p className="text-secondary mb-0">Aún no has completado actividades hoy.</p>
                    )}

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

                    {/* Detalle */}
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
