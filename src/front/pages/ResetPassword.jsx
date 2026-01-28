import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../services/authService";

const LEFT_BG =
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1400&q=80";

export const ResetPassword = () => {
    const [params] = useSearchParams();
    const tokenFromUrl = params.get("token") || "";

    const [form, setForm] = useState({
        token: tokenFromUrl,
        password: "",
        confirm: "",
    });

    const [status, setStatus] = useState({ loading: false, error: "", done: false });

    const validation = useMemo(() => {
        if (!form.token) return "Falta el token/código de verificación.";
        if (!form.password) return "Escribe la nueva contraseña.";
        if (form.password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
        if (form.password !== form.confirm) return "Las contraseñas no coinciden.";
        return "";
    }, [form.token, form.password, form.confirm]);

    const onChange = (e) => {
        const { name, value } = e.target;
        setForm((p) => ({ ...p, [name]: value }));
        setStatus((s) => ({ ...s, error: "" }));
    };

    const onSubmit = async (e) => {
        e.preventDefault();

        if (validation) {
            setStatus({ loading: false, error: validation, done: false });
            return;
        }

        setStatus({ loading: true, error: "", done: false });
        try {
            await resetPassword({
                token: form.token.trim(),
                password: form.password,
            });
            setStatus({ loading: false, error: "", done: true });
        } catch (err) {
            setStatus({
                loading: false,
                error: err?.message || "No se pudo cambiar la contraseña.",
                done: false,
            });
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
                            <h1 className="display-6 fw-bold mb-3">Nueva contraseña.</h1>
                            <p className="text-secondary mb-0">
                                Introduce el código del enlace y define una contraseña nueva.
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
                            <Link to="/auth/signup" className="pb-auth-tab">
                                Registro
                            </Link>
                            <span className="pb-auth-tab active" aria-current="page">
                                Reset
                            </span>
                        </div>

                        <h2 className="h3 fw-bold mb-2">Cambiar contraseña</h2>
                        <p className="text-secondary mb-4">
                            Si has recibido un mensaje, pega aquí el código que recibiste.
                        </p>

                        {status.error && <div className="alert alert-warning">{status.error}</div>}

                        {status.done ? (
                            <div className="alert alert-success pb-fade-in">
                                Contraseña cambiada correctamente.
                                <div className="mt-3">
                                    <Link className="btn btn-primary" to="/auth/login">
                                        Ir a login
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={onSubmit}>
                                <div className="mb-3">
                                    <label className="form-label">Código</label>
                                    <input
                                        className="form-control"
                                        name="token"
                                        value={form.token}
                                        onChange={onChange}
                                        placeholder="Pega aquí el código del enlace"
                                        disabled={status.loading}
                                    />
                                </div>

                                <div className="mb-3">
                                    <label className="form-label">Nueva contraseña</label>
                                    <input
                                        className="form-control"
                                        type="password"
                                        name="password"
                                        value={form.password}
                                        onChange={onChange}
                                        placeholder="Mínimo 6 caracteres"
                                        autoComplete="new-password"
                                        disabled={status.loading}
                                    />
                                </div>

                                <div className="mb-3">
                                    <label className="form-label">Repetir contraseña</label>
                                    <input
                                        className="form-control"
                                        type="password"
                                        name="confirm"
                                        value={form.confirm}
                                        onChange={onChange}
                                        autoComplete="new-password"
                                        disabled={status.loading}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary btn-lg w-100"
                                    disabled={status.loading}
                                >
                                    {status.loading ? "Cambiando…" : "Cambiar contraseña"}
                                </button>

                                <div className="mt-3 text-center">
                                    <Link to="/auth/login" className="small text-decoration-none">
                                        Volver a login
                                    </Link>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
