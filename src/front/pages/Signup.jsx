import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register  as registerService, login as loginService } from "../services/authService";

const LEFT_BG =
    "https://images.unsplash.com/photo-1528715471579-d1bcf0ba5e83?auto=format&fit=crop&w=1400&q=80";

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const Signup = () => {
    const navigate = useNavigate();
    const [form, setForm] = useState({ username: "", email: "", password: "", password2: "" });
    const [status, setStatus] = useState({ loading: false, error: "" });

    const validation = useMemo(() => {
        if (!form.username || !form.email || !form.password || !form.password2) return "Completa todos los campos.";
        if (!validateEmail(form.email)) return "El email no tiene un formato válido.";
        if (form.password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
        if (form.password !== form.password2) return "Las contraseñas no coinciden.";
        return "";
    }, [form]);

    const onChange = (e) => {
        const { name, value } = e.target;
        setForm((p) => ({ ...p, [name]: value }));
        setStatus((s) => ({ ...s, error: "" }));
    };

    const onSubmit = async (e) => {
        e.preventDefault();

        if (validation) {
            setStatus({ loading: false, error: validation });
            return;
        }

        setStatus({ loading: true, error: "" });
        try {
            await registerService({
                username: form.username.trim(),
                email: form.email.trim().toLowerCase(),
                password: form.password,
                timezone: "UTC",
            });

            // auto-login MVP
            await loginService({
                email: form.email.trim().toLowerCase(),
                password: form.password,
                remember_me: true,
            });

            navigate("/today");
        } catch (err) {
            setStatus({ loading: false, error: err.message || "No se pudo crear la cuenta." });
        }
    };

    return (
        <div className="container py-4 py-lg-5">
            <div className="row g-0 pb-auth-card shadow-sm">
                {/* Panel izquierdo */}
                <div className="col-12 col-lg-5 pb-auth-left d-none d-lg-flex">
                    <div className="pb-auth-left-inner">
                        <div className="d-flex align-items-center gap-2 fw-bold">
                            <span className="pb-logo-mark" aria-hidden="true" />
                            <span>Place Between</span>
                        </div>

                        <div className="mt-auto">
                            <h1 className="display-6 fw-bold mb-3">Empieza sin fricción.</h1>
                            <p className="text-secondary mb-0">
                                Registro simple. Luego, Hoy te guía: siguiente recomendado + 3 actividades.
                            </p>
                        </div>
                    </div>

                    <div
                        className="pb-auth-left-bg"
                        style={{ backgroundImage: `url(${LEFT_BG})` }}
                        aria-hidden="true"
                    />
                </div>

                {/* Panel derecho */}
                <div className="col-12 col-lg-7 bg-white">
                    <div className="p-4 p-md-5">
                        <div className="pb-auth-switch mb-4">
                            <Link to="/auth/login" className="pb-auth-tab">
                                Login
                            </Link>
                            <Link to="/auth/signup" className="pb-auth-tab active">
                                Registro
                            </Link>
                        </div>

                        <h2 className="h3 fw-bold mb-2">Crear cuenta</h2>
                        <p className="text-secondary mb-4">
                            Te tomará menos de un minuto.
                        </p>

                        {status.error && (
                            <div className="alert alert-danger" role="alert">
                                {status.error}
                            </div>
                        )}

                        <form onSubmit={onSubmit} className="d-grid gap-3">
                            <div>
                                <label className="form-label">Nombre de usuario</label>
                                <input
                                    className="form-control form-control-lg"
                                    type="text"
                                    name="username"
                                    placeholder="Tu usuario"
                                    value={form.username}
                                    onChange={onChange}
                                    autoComplete="username"
                                />
                            </div>

                            <div>
                                <label className="form-label">Email</label>
                                <input
                                    className="form-control form-control-lg"
                                    type="email"
                                    name="email"
                                    placeholder="tu@email.com"
                                    value={form.email}
                                    onChange={onChange}
                                    autoComplete="email"
                                />
                            </div>

                            <div>
                                <label className="form-label">Contraseña</label>
                                <input
                                    className="form-control form-control-lg"
                                    type="password"
                                    name="password"
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={onChange}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div>
                                <label className="form-label">Repite la contraseña</label>
                                <input
                                    className="form-control form-control-lg"
                                    type="password"
                                    name="password2"
                                    placeholder="••••••••"
                                    value={form.password2}
                                    onChange={onChange}
                                    autoComplete="new-password"
                                />
                            </div>

                            <button className="btn btn-primary btn-lg" type="submit" disabled={status.loading}>
                                {status.loading ? "Creando cuenta..." : "Crear cuenta"}
                            </button>

                            <div className="text-center text-secondary small">
                                ¿Ya tienes cuenta?{" "}
                                <Link to="/auth/login" className="text-decoration-none">
                                    Entrar
                                </Link>
                            </div>
                        </form>

                    </div>
                </div>
            </div>
        </div>
    );
};
