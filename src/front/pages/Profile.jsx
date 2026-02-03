import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/pb-profile.css";

const getBackendUrl = () =>
  (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
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
    timezone: "UTC",
    day_start_time: "06:00",
    night_start_time: "19:00",
    emails_enabled: true,
    avatar_url: "",
  });

  // Preferencias locales (no DB)
  const [musicPrefs, setMusicPrefs] = useState(() => ({
    mode: localStorage.getItem("pb_music_mode") || "auto",
    enabled: localStorage.getItem("pb_sound_enabled") === "1",
  }));

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

        setProfile({
          id: data.id ?? null,
          email: data.email || "",
          username: data.username || "",
          is_email_verified: !!data.is_email_verified,
          timezone: data.timezone || "UTC",
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
        timezone: profile.timezone,
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
          <div className="text-secondary">
            Ajustes de cuenta, preferencias y seguridad.
          </div>
        </div>

        <div className="pb-profile-badges">
          <span className={`badge ${profile.is_email_verified ? "text-bg-success" : "text-bg-secondary"}`}>
            {profile.is_email_verified ? "Email verificado" : "Email no verificado"}
          </span>
        </div>
      </div>

      {status.error && <div className="alert alert-danger mt-3">{status.error}</div>}
      {status.success && <div className="alert alert-success mt-3">{status.success}</div>}

      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-7">
          <div className="pb-card">
            <div className="pb-card-header">
              <h5 className="mb-0">Cuenta</h5>
              <div className="text-secondary small">Datos básicos e identidad visual.</div>
            </div>

            <form onSubmit={saveProfile} className="pb-card-body">
              <div className="pb-profile-identity">
                <div className="pb-avatar">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="avatar" />
                  ) : (
                    <div className="pb-avatar-fallback">{initials}</div>
                  )}
                </div>

                <div className="flex-grow-1">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label">URL de foto de perfil</label>
                      <input
                        className="form-control"
                        name="avatar_url"
                        value={profile.avatar_url}
                        onChange={onChange}
                        placeholder="https://… (opcional)"
                      />
                      <div className="form-text">
                        Por ahora es un enlace. Si luego quieres subida real, lo integramos con storage.
                      </div>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label">Nombre de usuario</label>
                      <input
                        className="form-control"
                        name="username"
                        value={profile.username}
                        onChange={onChange}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label">Email</label>
                      <input className="form-control" value={profile.email} disabled />
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
                    placeholder="Ej: Europe/Madrid"
                  />
                  <div className="form-text">
                    Formato IANA. Ejemplos: Europe/Madrid, America/Mexico_City.
                  </div>
                </div>

                <div className="col-6 col-md-3">
                  <label className="form-label">Inicio del día</label>
                  <input
                    className="form-control"
                    type="time"
                    name="day_start_time"
                    value={profile.day_start_time}
                    onChange={onChange}
                  />
                </div>

                <div className="col-6 col-md-3">
                  <label className="form-label">Inicio de la noche</label>
                  <input
                    className="form-control"
                    type="time"
                    name="night_start_time"
                    value={profile.night_start_time}
                    onChange={onChange}
                  />
                </div>

                <div className="col-12">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      name="emails_enabled"
                      checked={!!profile.emails_enabled}
                      onChange={onChange}
                    />
                    <label className="form-check-label">
                      Notificaciones por email (recordatorios y avisos)
                    </label>
                  </div>
                </div>
              </div>

              <div className="d-flex gap-2 mt-4">
                <button className="btn btn-primary" disabled={savingProfile}>
                  {savingProfile ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>

          <div className="pb-card mt-3">
            <div className="pb-card-header">
              <h5 className="mb-0">Seguridad</h5>
              <div className="text-secondary small">Cambiar contraseña.</div>
            </div>

            <form onSubmit={changePassword} className="pb-card-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">Contraseña actual</label>
                  <input
                    className="form-control"
                    type="password"
                    value={pw.current_password}
                    onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))}
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Nueva contraseña</label>
                  <input
                    className="form-control"
                    type="password"
                    value={pw.new_password}
                    onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))}
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Confirmar nueva contraseña</label>
                  <input
                    className="form-control"
                    type="password"
                    value={pw.confirm_password}
                    onChange={(e) => setPw((p) => ({ ...p, confirm_password: e.target.value }))}
                  />
                </div>
              </div>

              <div className="d-flex gap-2 mt-4">
                <button className="btn btn-outline-primary" disabled={savingPw}>
                  {savingPw ? "Actualizando…" : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="col-12 col-lg-5">
          <div className="pb-card">
            <div className="pb-card-header">
              <h5 className="mb-0">Preferencias locales</h5>
              <div className="text-secondary small">
                Estas preferencias se guardan en este dispositivo.
              </div>
            </div>

            <div className="pb-card-body">
              <div className="pb-pref-row">
                <div>
                  <div className="fw-semibold">Música (modo)</div>
                  <div className="text-secondary small">
                    Auto (emociones), Default o Silencio.
                  </div>
                </div>

                <select
                  className="form-select pb-pref-select"
                  value={musicPrefs.mode}
                  onChange={(e) => updateMusicPref({ mode: e.target.value })}
                >
                  <option value="auto">Auto (emociones)</option>
                  <option value="default">Default</option>
                  <option value="off">Silencio</option>
                </select>
              </div>

              <div className="pb-pref-row mt-3">
                <div>
                  <div className="fw-semibold">Música (reproducción)</div>
                  <div className="text-secondary small">
                    Si está activada, empezará según el modo.
                  </div>
                </div>

                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={!!musicPrefs.enabled}
                    onChange={(e) => updateMusicPref({ enabled: e.target.checked })}
                    disabled={musicPrefs.mode === "off"}
                  />
                </div>
              </div>

              <div className="alert alert-light mt-3 mb-0">
                Consejo: si quieres que la música cambie al registrar emoción, usa modo <b>Auto</b>.
              </div>
            </div>
          </div>

          <div className="pb-card mt-3 pb-danger">
            <div className="pb-card-header">
              <h5 className="mb-0">Sesión</h5>
              <div className="text-secondary small">Salir del modo privado.</div>
            </div>
            <div className="pb-card-body">
              <button className="btn btn-outline-danger w-100" onClick={logoutHere}>
                Cerrar sesión
              </button>
              <div className="text-secondary small mt-2">
                La sesión se cerrará en este navegador.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
