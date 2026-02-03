import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/pb-profile.css";

const getBackendUrl = () => (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const detectTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid";
  } catch {
    return "Europe/Madrid";
  }
};

const resolveAvatarSrc = (backendUrl, avatarUrl) => {
  const url = (avatarUrl || "").trim();
  if (!url) return "";
  if (url.startsWith("/api/")) return `${backendUrl}${url}`; // dev-safe
  return url;
};

export const Profile = () => {
  const navigate = useNavigate();
  const BACKEND_URL = getBackendUrl();
  const token = localStorage.getItem("pb_token");

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [status, setStatus] = useState({ error: "", success: "" });

  const [profile, setProfile] = useState({
    id: null,
    email: "",
    username: "",
    is_email_verified: false,
    timezone: "Europe/Madrid",
    day_start_time: "06:00",
    night_start_time: "19:00",
    emails_enabled: true,
    avatar_url: "",
  });

  // Preferencias locales (no DB)
  const [musicPrefs, setMusicPrefs] = useState(() => {
    const mode = localStorage.getItem("pb_music_mode") || "auto";
    const v = localStorage.getItem("pb_sound_enabled");
    const enabled = v === null ? true : v === "1";
    return { mode, enabled };
  });

  // Cambio contraseña (backend)
  const [pw, setPw] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [savingPw, setSavingPw] = useState(false);

  const authHeaders = useMemo(() => {
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  // Fondo full-viewport solo para Profile (evita “blanco” fuera del container)
  useEffect(() => {
    document.body.classList.add("pb-page-profile");
    return () => document.body.classList.remove("pb-page-profile");
  }, []);

  useEffect(() => {
    if (!token) {
      navigate("/auth/login", { replace: true });
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setStatus({ error: "", success: "" });

        const res = await fetch(`${BACKEND_URL}/api/users/user`, {
          headers: { ...authHeaders },
        });

        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.msg || "No se pudo cargar el perfil.");

        const tz = data.timezone || detectTimeZone() || "Europe/Madrid";

        setProfile({
          id: data.id ?? null,
          email: data.email || "",
          username: data.username || "",
          is_email_verified: !!data.is_email_verified,
          timezone: tz,
          day_start_time: data.day_start_time || "06:00",
          night_start_time: data.night_start_time || "19:00",
          emails_enabled: data.emails_enabled ?? true,
          avatar_url: data.avatar_url || "",
        });
      } catch (e) {
        setStatus({ error: e?.message || "No se pudo cargar el perfil.", success: "" });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [BACKEND_URL, authHeaders, navigate, token]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfile((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!token) return;

    setSavingProfile(true);
    setStatus({ error: "", success: "" });

    try {
      const payload = {
        username: profile.username,
        timezone: profile.timezone || "Europe/Madrid",
        day_start_time: profile.day_start_time,
        night_start_time: profile.night_start_time,
        emails_enabled: profile.emails_enabled,
        avatar_url: profile.avatar_url,
      };

      const res = await fetch(`${BACKEND_URL}/api/users/user`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.msg || "Error al guardar perfil.");

      setStatus({ error: "", success: "Perfil actualizado correctamente." });

      // fuerza recalcular phase (AppLayout) + actualizar páginas legacy que lo escuchen
      window.dispatchEvent(new Event("pb:user-prefs-updated"));
    } catch (e) {
      setStatus({ error: e?.message || "Error al guardar.", success: "" });
    } finally {
      setSavingProfile(false);
    }
  };

  const updateMusicPref = (next) => {
    const merged = { ...musicPrefs, ...next };
    setMusicPrefs(merged);

    localStorage.setItem("pb_music_mode", merged.mode);
    localStorage.setItem("pb_sound_enabled", merged.enabled ? "1" : "0");

    // refresca música/dock si escucha eventos
    window.dispatchEvent(new Event("pb:emotion-updated"));
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setStatus({ error: "", success: "" });

    if (!pw.current_password || !pw.new_password) {
      setStatus({ error: "Completa la contraseña actual y la nueva.", success: "" });
      return;
    }
    if (pw.new_password.length < 6) {
      setStatus({ error: "La nueva contraseña debe tener al menos 6 caracteres.", success: "" });
      return;
    }
    if (pw.new_password !== pw.confirm_password) {
      setStatus({ error: "La confirmación no coincide.", success: "" });
      return;
    }

    setSavingPw(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          current_password: pw.current_password,
          new_password: pw.new_password,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.msg || "No se pudo cambiar la contraseña.");

      setPw({ current_password: "", new_password: "", confirm_password: "" });
      setStatus({ error: "", success: "Contraseña actualizada." });
    } catch (e) {
      setStatus({ error: e?.message || "No se pudo cambiar la contraseña.", success: "" });
    } finally {
      setSavingPw(false);
    }
  };

  const logoutHere = () => {
    localStorage.removeItem("pb_token");
    localStorage.removeItem("pb_user");
    navigate("/auth/login", { replace: true });
  };

  const initials = useMemo(() => {
    const u = (profile.username || "").trim();
    if (!u) return "PB";
    const parts = u.split(/\s+/).slice(0, 2);
    return parts.map((x) => x[0]?.toUpperCase()).join("");
  }, [profile.username]);

  const avatarSrc = useMemo(
    () => resolveAvatarSrc(BACKEND_URL, profile.avatar_url),
    [BACKEND_URL, profile.avatar_url]
  );

  if (loading) {
    return (
      <div className="container py-4">
        <div className="pb-profile-skeleton">Cargando perfil…</div>
      </div>
    );
  }

  return (
    <div className="container py-4 pb-profile">
      <div className="pb-profile-header">
        <div className="pb-profile-title">
          <h2 className="mb-1">Perfil</h2>
          <div className="pb-subtitle">Email sin verificar</div>
        </div>
      </div>

      {status.error && <div className="alert alert-danger mt-3">{status.error}</div>}
      {status.success && <div className="alert alert-success mt-3">{status.success}</div>}

      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-7">
          <div className="pb-card">
            <div className="pb-card-header">
              <h5 className="mb-0">Cuenta</h5>
            </div>

            <form onSubmit={saveProfile} className="pb-card-body">
              <div className="pb-profile-identity">
                <div className="pb-avatar">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="avatar" />
                  ) : (
                    <div className="pb-avatar-fallback">{initials}</div>
                  )}
                </div>

                <div className="flex-grow-1">
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label">Email</label>
                      <input className="form-control" value={profile.email} disabled />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label">Username</label>
                      <input
                        className="form-control"
                        name="username"
                        value={profile.username}
                        onChange={onChange}
                      />
                    </div>

                    <div className="col-12">
                      <div className="pb-help">Pulsa el avatar para editarlo</div>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="my-4" />

              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="form-label">Zona horaria</label>
                  <input
                    className="form-control"
                    name="timezone"
                    value={profile.timezone}
                    onChange={onChange}
                    placeholder="Europe/Madrid"
                  />
                  <div className="pb-help">
                    Formato IANA. Impacta en el cálculo de día/noche.
                  </div>
                </div>

                <div className="col-6 col-md-3">
                  <label className="form-label">Día empieza</label>
                  <input
                    className="form-control"
                    type="time"
                    name="day_start_time"
                    value={profile.day_start_time}
                    onChange={onChange}
                  />
                </div>

                <div className="col-6 col-md-3">
                  <label className="form-label">Noche empieza</label>
                  <input
                    className="form-control"
                    type="time"
                    name="night_start_time"
                    value={profile.night_start_time}
                    onChange={onChange}
                  />
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="emails_enabled"
                      checked={profile.emails_enabled}
                      onChange={onChange}
                      id="emails_enabled"
                    />
                    <label className="form-check-label" htmlFor="emails_enabled">
                      Emails activados
                    </label>
                  </div>
                </div>

                <div className="col-12 d-flex gap-2">
                  <button className="btn btn-primary" type="submit" disabled={savingProfile}>
                    {savingProfile ? "Guardando…" : "Guardar perfil"}
                  </button>

                  <button className="btn btn-outline-danger ms-auto" type="button" onClick={logoutHere}>
                    Logout
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="pb-card mt-3">
            <div className="pb-card-header">
              <h5 className="mb-0">Cambiar contraseña</h5>
            </div>

            <div className="pb-card-body">
              <form onSubmit={changePassword} className="row g-3">
                <div className="col-12 col-md-4">
                  <label className="form-label">Actual</label>
                  <input
                    className="form-control"
                    type="password"
                    value={pw.current_password}
                    onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))}
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Nueva</label>
                  <input
                    className="form-control"
                    type="password"
                    value={pw.new_password}
                    onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))}
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Confirmar</label>
                  <input
                    className="form-control"
                    type="password"
                    value={pw.confirm_password}
                    onChange={(e) => setPw((p) => ({ ...p, confirm_password: e.target.value }))}
                  />
                </div>

                <div className="col-12">
                  <button className="btn btn-outline-light" disabled={savingPw}>
                    {savingPw ? "Actualizando…" : "Confirmar cambio"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-5">
          <div className="pb-card">
            <div className="pb-card-header">
              <h5 className="mb-0">Música</h5>
            </div>

            <div className="pb-card-body">
              <div className="mb-3">
                <label className="form-label">Modo</label>
                <select
                  className="form-select pb-pref-select"
                  value={musicPrefs.mode}
                  onChange={(e) => updateMusicPref({ mode: e.target.value })}
                >
                  <option value="auto">Auto</option>
                  <option value="default">Default</option>
                  <option value="off">Off</option>
                </select>
              </div>

              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={musicPrefs.enabled}
                  onChange={(e) => updateMusicPref({ enabled: e.target.checked })}
                  id="music_enabled"
                />
                <label className="form-check-label" htmlFor="music_enabled">
                  Sonido habilitado
                </label>
              </div>

              <button className="btn btn-outline-light" type="button">
                Guardar preferencias
              </button>

              <div className="pb-help mt-2">El estado se sincroniza con el dock de música.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
