import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../services/authService";

const LEFT_BG =
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1400&q=80";

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const ForgotPassword = () => {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState({ loading: false, error: "", sent: false });

    const validation = useMemo(() => {
        if (!email) return "Escribe tu email.";
        if (!validateEmail(email)) return "El email no tiene un formato válido.";
        return "";
    }, [email]);

    const onSubmit = async (e) => {
        e.preventDefault();

        if (validation) {
            setStatus({ loading: false, error: validation, sent: false });
            return;
        }

        setStatus({ loading: true, error: "", sent: false });
        try {
            await requestPasswordReset(email.trim().toLowerCase());
            setStatus({ loading: false, error: "", sent: true });
        } catch (err) {
            setStatus({
                loading: false,
                error: err?.message || "No se pudo enviar el enlace. Inténtalo de nuevo.",
                sent: false,
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
                            <h1 className="display-6 fw-bold mb-3">Recupera el acceso.</h1>
                            <p className="text-secondary mb-0">
                                Te enviaremos un enlace para cambiar tu contraseña.
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
                                Recuperar
                            </span>
                        </div>

                        <h2 className="h3 fw-bold mb-2">¿Olvidaste tu contraseña?</h2>
                        <p className="text-secondary mb-4">
                            Escribe tu email y te enviaremos un enlace de verificación.
                        </p>

                        {status.error && <div className="alert alert-warning">{status.error}</div>}

                        {status.sent ? (
                            <div className="alert alert-success pb-fade-in">
                                Si el email existe, te hemos enviado un enlace para restablecer la contraseña.
                                <div className="mt-2 small text-secondary">
                                    Cuando tengas el enlace, abre la pantalla de reset.
                                </div>
                                <div className="d-flex gap-2 mt-3">
                                    <Link className="btn btn-primary" to="/auth/reset">
                                        Ir a cambiar contraseña
                                    </Link>
                                    <Link className="btn btn-outline-secondary" to="/auth/login">
                                        Volver a login
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={onSubmit}>
                                <div className="mb-3">
                                    <label className="form-label">Email</label>
                                    <input
                                        className="form-control form-control-lg"
                                        type="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            setStatus((s) => ({ ...s, error: "" }));
                                        }}
                                        placeholder="tu@email.com"
                                        autoComplete="email"
                                        disabled={status.loading}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary btn-lg w-100"
                                    disabled={status.loading}
                                >
                                    {status.loading ? "Enviando…" : "Enviar enlace"}
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
