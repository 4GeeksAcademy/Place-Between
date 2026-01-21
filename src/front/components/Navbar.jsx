import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { getToken, logout } from "../services/authService";

const LogoMark = ({ size = 22 }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 64 64"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<path d="M32 6L58 22L32 58L6 22L32 6Z" fill="currentColor" opacity="0.18" />
		<path d="M32 10L54 23L32 54L10 23L32 10Z" fill="currentColor" />
		<path d="M32 18L44 25L32 40L20 25L32 18Z" fill="white" opacity="0.85" />
	</svg>
);

export const Navbar = () => {
	const location = useLocation();
	const navigate = useNavigate();

	const token = getToken();

	// Rutas que consideramos "APP" (privadas o de producto)
	const isAppRoute =
		location.pathname.startsWith("/today") ||
		location.pathname.startsWith("/activities") ||
		location.pathname.startsWith("/mirror") ||
		location.pathname.startsWith("/profile") ||
		location.pathname.startsWith("/settings") ||
		location.pathname.startsWith("/goals");

	// Si hay token o estás en rutas de app => navbar privada
	const mode = token || isAppRoute ? "app" : "public";
	const isLanding = location.pathname === "/";

	const handleLogout = () => {
		logout();
		navigate("/");
	};

	return (
		<nav className="navbar navbar-expand-lg bg-white border-bottom sticky-top pb-navbar">
			<div className="container py-2">
				<Link to={mode === "app" ? "/today" : "/"} className="navbar-brand d-flex align-items-center gap-2 fw-bold">
					<span className="text-primary d-inline-flex align-items-center">
						<LogoMark />
					</span>
					<span>Place Between</span>
				</Link>

				<button
					className="navbar-toggler"
					type="button"
					data-bs-toggle="collapse"
					data-bs-target="#pbNavbar"
					aria-controls="pbNavbar"
					aria-expanded="false"
					aria-label="Toggle navigation"
				>
					<span className="navbar-toggler-icon" />
				</button>

				<div className="collapse navbar-collapse" id="pbNavbar">
					{mode === "public" ? (
						<>
							<ul className="navbar-nav mx-auto mb-2 mb-lg-0 gap-lg-3">
								<li className="nav-item">
									<a className="nav-link" href={isLanding ? "#como-funciona" : "/#como-funciona"}>
										Cómo funciona
									</a>
								</li>
								<li className="nav-item">
									<a className="nav-link" href={isLanding ? "#actividades" : "/#actividades"}>
										Actividades
									</a>
								</li>
								<li className="nav-item">
									<a className="nav-link" href={isLanding ? "#espejo" : "/#espejo"}>
										Espejo
									</a>
								</li>
								<li className="nav-item">
									<a className="nav-link" href={isLanding ? "#goals" : "/#goals"}>
										Objetivos
									</a>
								</li>
							</ul>

							<div className="d-flex gap-2">
								<Link to="/auth/login" className="btn btn-outline-secondary">
									Entrar
								</Link>
								<Link to="/auth/signup" className="btn btn-primary">
									Empezar gratis
								</Link>
							</div>
						</>
					) : (
						<>
							<ul className="navbar-nav mx-auto mb-2 mb-lg-0 gap-lg-3">
								<li className="nav-item">
									<NavLink to="/today" className={({ isActive }) => `nav-link ${isActive ? "fw-semibold text-primary" : ""}`}>
										Hoy
									</NavLink>
								</li>
								<li className="nav-item">
									<NavLink to="/activities" className={({ isActive }) => `nav-link ${isActive ? "fw-semibold text-primary" : ""}`}>
										Actividades
									</NavLink>
								</li>
								<li className="nav-item">
									<NavLink to="/mirror" className={({ isActive }) => `nav-link ${isActive ? "fw-semibold text-primary" : ""}`}>
										Espejo
									</NavLink>
								</li>
								<li className="nav-item">
									<NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? "fw-semibold text-primary" : ""}`}>
										Perfil
									</NavLink>
								</li>
							</ul>

							<div className="d-flex gap-2">
								<button type="button" className="btn btn-outline-secondary" onClick={handleLogout}>
									Salir
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</nav>
	);
};
