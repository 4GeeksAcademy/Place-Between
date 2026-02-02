import React, { useEffect, useState } from "react";

export const Profile = () => {
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
  const token = localStorage.getItem("pb_token");

  const [form, setForm] = useState({
    username: "",
    emails_enabled: true,
    music_enabled: true,
  });

  const [status, setStatus] = useState({
    loading: false,
    error: "",
    success: "",
  });

  // fetch del perfil mediante token
  useEffect(() => {
    if (!token) return;

    fetch(`${BACKEND_URL}/api/users/user`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setForm({
          username: data.username || "",
          emails_enabled: data.emails_enabled ?? true,
        });

      })
      .catch(() => {
        setStatus((s) => ({ ...s, error: "No se pudo cargar el perfil" }));
      });
  }, [BACKEND_URL, token]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: "", success: "" });

    try {
      const res = await fetch(`${BACKEND_URL}/api/users/user`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.msg);

      setStatus({
        loading: false,
        error: "",
        success: "Perfil actualizado correctamente",
      });
    } catch (err) {
      setStatus({
        loading: false,
        error: err.message || "Error al guardar",
        success: "",
      });
    }
  };

  return (
    <div className="container py-4">
      <h2 className="mb-4">Configuración de perfil</h2>

      {status.error && <div className="alert alert-danger">{status.error}</div>}
      {status.success && <div className="alert alert-success">{status.success}</div>}

      <form onSubmit={onSubmit} className="d-grid gap-3">

        <div>
          <label className="form-label">Nombre de usuario</label>
          <input
            className="form-control"
            name="username"
            value={form.username}
            onChange={onChange}
          />
        </div>

        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            name="emails_enabled"
            checked={form.emails_enabled}
            onChange={onChange}
          />
          <label className="form-check-label">
            Activar correos electrónicos
          </label>
        </div>

        <button className="btn btn-primary" disabled={status.loading}>
          {status.loading ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
};
export default Profile;