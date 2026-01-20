import { Link, useLocation } from "react-router-dom";

const LogoMark = ({ size = 22 }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 64 64"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		{/* Diamante simple (provisional) */}
		<path d="M32 6L58 22L32 58L6 22L32 6Z" fill="currentColor" opacity="0.18" />
		<path d="M32 10L54 23L32 54L10 23L32 10Z" fill="currentColor" />
		<path d="M32 18L44 25L32 40L20 25L32 18Z" fill="white" opacity="0.85" />
	</svg>
);

export const Navbar = () => {
	const location = useLocation();
	const isLanding = location.pathname === "/";

	return (
		<nav className="navbar navbar-expand-lg bg-white border-bottom sticky-top pb-navbar">
			<div className="container py-2">
				<Link to="/" className="navbar-brand d-flex align-items-center gap-2 fw-bold">
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
					<span className="navbar-toggler-icon"></span>
				</button>

				<div className="collapse navbar-collapse" id="pbNavbar">
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
				</div>
			</div>
		</nav>
	);
};

