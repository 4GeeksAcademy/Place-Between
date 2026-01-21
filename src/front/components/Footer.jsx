import { Link } from "react-router-dom";

export const Footer = () => (
	<footer className="border-top bg-white">
		<div className="container py-5">
			<div className="row g-4">
				<div className="col-12 col-lg-4">
					<div className="fw-bold mb-2">Place Between</div>
					<p className="text-secondary mb-3">
						Autoconocimiento diario: Día → Noche → Espejo. Contenido limitado para el MVP, diseñado para crecer.
					</p>
					<div className="d-flex gap-2">
						<a className="btn btn-outline-secondary btn-sm" href="#" aria-label="Red social 1">
							⌁
						</a>
						<a className="btn btn-outline-secondary btn-sm" href="#" aria-label="Red social 2">
							⌁
						</a>
						<a className="btn btn-outline-secondary btn-sm" href="#" aria-label="Red social 3">
							⌁
						</a>
					</div>
				</div>

				<div className="col-6 col-lg-2">
					<div className="fw-semibold mb-2">Producto</div>
					<ul className="list-unstyled small mb-0">
						<li><a className="text-secondary text-decoration-none" href="/#como-funciona">Cómo funciona</a></li>
						<li><a className="text-secondary text-decoration-none" href="/#actividades">Actividades</a></li>
						<li><a className="text-secondary text-decoration-none" href="/#espejo">Espejo</a></li>
						<li><a className="text-secondary text-decoration-none" href="/#goals">Objetivos</a></li>
					</ul>
				</div>

				<div className="col-6 col-lg-3">
					<div className="fw-semibold mb-2">Cuenta</div>
					<ul className="list-unstyled small mb-0">
						<li><Link className="text-secondary text-decoration-none" to="/auth/signup">Crear cuenta</Link></li>
						<li><Link className="text-secondary text-decoration-none" to="/auth/login">Entrar</Link></li>
						<li><a className="text-secondary text-decoration-none" href="#">Soporte</a></li>
					</ul>
				</div>

				<div className="col-12 col-lg-3">
					<div className="fw-semibold mb-2">Legal</div>
					<ul className="list-unstyled small mb-0">
						<li><a className="text-secondary text-decoration-none" href="#">Privacidad</a></li>
						<li><a className="text-secondary text-decoration-none" href="#">Términos</a></li>
						<li><a className="text-secondary text-decoration-none" href="#">Cookies</a></li>
					</ul>
				</div>
			</div>

			<hr className="my-4" />

			<div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2 small text-secondary">
				<span>© {new Date().getFullYear()} Place Between</span>
				<div className="d-flex gap-3">
					<a className="text-secondary text-decoration-none" href="#">Help Center</a>
					<a className="text-secondary text-decoration-none" href="#">Status</a>
				</div>
			</div>
		</div>
	</footer>
);
