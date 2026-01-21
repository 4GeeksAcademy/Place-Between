import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login as loginService } from "../services/authService";

const LEFT_BG =
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1400&q=80";

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const Login = () => {
    const navigate = useNavigate();

    const [form, setForm] = useState({ email: "", password: "", remember: true });
    const [status, setStatus] = useState({ loading: false, error: "" });

    const validation = useMemo(() => {
        if (!form.email || !form.password) return "Completa email y contraseña.";
        if (!validateEmail(form.email)) return "El email no tiene un formato válido.";
        if (form.password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
        return "";
    }, [form.email, form.password]);

    const onChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
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
            await loginService({
                email: form.email.trim().toLowerCase(),
                password: form.password,
                remember_me: form.remember,
            });
            navigate("/today");
        } catch (err) {
            setStatus({ loading: false, error: err.message || "No se pudo iniciar sesión." });
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
                            <h1 className="display-6 fw-bold mb-3">Encuentra tu calma.</h1>
                            <p className="text-secondary mb-0">
                                Día → Noche → Espejo. Rutina simple, señales claras.
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
                        {/* Switch Login / Signup */}
                        <div className="pb-auth-switch mb-4">
                            <Link to="/auth/login" className="pb-auth-tab active">
                                Login
                            </Link>
                            <Link to="/auth/signup" className="pb-auth-tab">
                                Registro
                            </Link>
                        </div>

                        <h2 className="h3 fw-bold mb-2">Bienvenido de vuelta</h2>
                        <p className="text-secondary mb-4">
                            Introduce tus datos para continuar.
                        </p>

                        {status.error && (
                            <div className="alert alert-danger" role="alert">
                                {status.error}
                            </div>
                        )}

                        <form onSubmit={onSubmit} className="d-grid gap-3">
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
                                <div className="d-flex justify-content-between align-items-center">
                                    <label className="form-label mb-0">Contraseña</label>
                                    <Link to="/auth/forgot" className="small text-decoration-none">
                                        ¿Olvidaste tu contraseña?
                                    </Link>
                                </div>
                                <input
                                    className="form-control form-control-lg mt-2"
                                    type="password"
                                    name="password"
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={onChange}
                                    autoComplete="current-password"
                                />
                            </div>

                            <div className="form-check">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    name="remember"
                                    checked={form.remember}
                                    onChange={onChange}
                                    id="remember"
                                />
                                <label className="form-check-label text-secondary" htmlFor="remember">
                                    Recuérdame (30 días)
                                </label>
                            </div>

                            <button
                                className="btn btn-primary btn-lg"
                                type="submit"
                                disabled={status.loading}
                            >
                                {status.loading ? "Entrando..." : "Entrar"}
                            </button>

                            <div className="text-center text-secondary small">
                                ¿No tienes cuenta?{" "}
                                <Link to="/auth/signup" className="text-decoration-none">
                                    Crear cuenta
                                </Link>
                            </div>
                        </form>

                    </div>
                </div>
            </div>
        </div>
    );
};
