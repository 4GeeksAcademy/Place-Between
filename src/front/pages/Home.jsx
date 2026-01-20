import React, { useEffect, useRef, useState } from "react";

// ✅ Sustituir estas URLs por assets locales cuando los tenga
const HERO_IMAGE =
	"https://images.unsplash.com/photo-1528715471579-d1bcf0ba5e83?auto=format&fit=crop&w=1200&q=80";
const ILLU_1_DIA =
	"https://images.unsplash.com/photo-1527137342181-19aab11a8ee8?auto=format&fit=crop&w=1200&q=80";
const ILLU_2_NOCHE =
	"https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&q=80";

function Reveal({ children, className = "" }) {
	const ref = useRef(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						setVisible(true);
						obs.disconnect();
						break;
					}
				}
			},
			{ threshold: 0.15 }
		);

		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	return (
		<div ref={ref} className={`pb-reveal ${visible ? "is-visible" : ""} ${className}`}>
			{children}
		</div>
	);
}

export const Home = () => {
	return (
		<main className="pb-landing">
			{/* HERO */}
			<section className="py-5 py-lg-6">
				<div className="container">
					<div className="row align-items-center g-5 g-lg-6">
						<div className="col-12 col-lg-6">
							<Reveal>
								<div className="d-inline-flex align-items-center px-3 py-1 rounded-pill bg-primary bg-opacity-10 text-primary fw-semibold small mb-3">
									Rutina diaria de autoconocimiento
								</div>

								<h1 className="display-4 fw-bold lh-1 mb-3">
									Mírate una vez al día.
									<br />
									<span className="text-primary">Entiende tus patrones.</span>
								</h1>

								<p className="lead text-secondary mb-4 pb-maxw">
									Place Between combina <strong>Día</strong> (acciones conscientes), <strong>Noche</strong>{" "}
									(identificación emocional) y <strong>Espejo</strong> (progreso visible).
								</p>

								<div className="d-flex flex-column flex-sm-row gap-3">
									<a href="#cta" className="btn btn-primary btn-lg px-4">
										Empezar ahora
									</a>
									<a href="#como-funciona" className="btn btn-outline-secondary btn-lg px-4">
										Ver recorrido
									</a>
								</div>

								<div className="d-flex align-items-center gap-3 mt-4 text-secondary small">
									<div className="d-flex">
										<div className="pb-avatar"></div>
										<div className="pb-avatar pb-avatar--2"></div>
										<div className="pb-avatar pb-avatar--3"></div>
									</div>
									<span>Prototipo con contenido limitado (expandible).</span>
								</div>
							</Reveal>
						</div>

						<div className="col-12 col-lg-6">
							<Reveal className="pb-reveal-delay">
								<div className="pb-hero-card">
									<img src={HERO_IMAGE} className="img-fluid pb-hero-img" alt="Ilustración de calma" />
									<div className="pb-hero-glow pb-hero-glow--a" />
									<div className="pb-hero-glow pb-hero-glow--b" />
								</div>
							</Reveal>
						</div>
					</div>
				</div>
			</section>

			{/* HOW IT WORKS */}
			<section id="como-funciona" className="py-5 py-lg-6 border-top bg-white">
				<div className="container">
					<Reveal>
						<div className="mb-4 mb-lg-5">
							<div className="text-primary fw-bold small text-uppercase">Proceso</div>
							<h2 className="h1 fw-bold mb-2">Cómo funciona</h2>
							<p className="text-secondary mb-0">Un ciclo simple: Día → Noche → Espejo.</p>
						</div>
					</Reveal>

					<div className="row g-4">
						<div className="col-12 col-md-6 col-lg-3">
							<Reveal>
								<div className="card h-100 shadow-sm pb-card">
									<div className="card-body p-4">
										<div className="pb-icon bg-primary bg-opacity-10 text-primary">🎯</div>
										<h3 className="h5 fw-bold mt-3">Define objetivos</h3>
										<p className="text-secondary mb-0">
											Elige goals predefinidos o crea los tuyos. Duración + recordatorios opcionales.
										</p>
									</div>
								</div>
							</Reveal>
						</div>

						<div className="col-12 col-md-6 col-lg-3">
							<Reveal>
								<div className="card h-100 shadow-sm pb-card">
									<div className="card-body p-4">
										<div className="pb-icon bg-warning bg-opacity-15 text-warning">🧘</div>
										<h3 className="h5 fw-bold mt-3">Practica a diario</h3>
										<p className="text-secondary mb-0">
											Actividades breves: respiración, pulso emocional, corte de pensamiento, etc.
										</p>
									</div>
								</div>
							</Reveal>
						</div>

						<div className="col-12 col-md-6 col-lg-3">
							<Reveal>
								<div className="card h-100 shadow-sm pb-card">
									<div className="card-body p-4">
										<div className="pb-icon bg-success bg-opacity-15 text-success">📈</div>
										<h3 className="h5 fw-bold mt-3">Observa tendencias</h3>
										<p className="text-secondary mb-0">
											El Espejo muestra rachas, historial y señales claras (7/30 días).
										</p>
									</div>
								</div>
							</Reveal>
						</div>

						<div className="col-12 col-md-6 col-lg-3">
							<Reveal>
								<div className="card h-100 shadow-sm pb-card">
									<div className="card-body p-4">
										<div className="pb-icon bg-info bg-opacity-15 text-info">🌙</div>
										<h3 className="h5 fw-bold mt-3">Cierra el día</h3>
										<p className="text-secondary mb-0">
											Noche: eliges emoción (4 básicas) y haces una reflexión breve.
										</p>
									</div>
								</div>
							</Reveal>
						</div>
					</div>
				</div>
			</section>

			{/* ACTIVIDADES */}
			<section id="actividades" className="py-5 py-lg-6 border-top bg-light">
				<div className="container">
					<Reveal>
						<div className="row align-items-end g-3 mb-4 mb-lg-5">
							<div className="col-12 col-lg-7">
								<h2 className="h1 fw-bold mb-2">Contenido limitado, bien elegido</h2>
								<p className="text-secondary mb-0">
									Para la demo: pocas actividades, consistentes y reutilizables.
								</p>
							</div>
							<div className="col-12 col-lg-5">
								<div className="d-flex gap-2 justify-content-lg-end flex-wrap">
									<span className="badge text-bg-primary">Día</span>
									<span className="badge text-bg-dark">Noche</span>
									<span className="badge text-bg-secondary">Espejo</span>
									<span className="badge text-bg-light border">Goals</span>
								</div>
							</div>
						</div>
					</Reveal>

					<div className="row g-4">
						<div className="col-12 col-lg-6">
							<Reveal>
								<div className="pb-media-card">
									<img src={ILLU_1_DIA} className="img-fluid pb-media-img" alt="Actividad guiada" />
									<div className="p-4 p-lg-5">
										<h3 className="h4 fw-bold mb-2">Día: acciones conscientes</h3>
										<p className="text-secondary mb-0">
											Aprendizaje emocional, regulación y cuidado físico. Cada actividad cuenta una vez al día.
										</p>
									</div>
								</div>
							</Reveal>
						</div>

						<div className="col-12 col-lg-6">
							<Reveal>
								<div className="pb-media-card">
									<img src={ILLU_2_NOCHE} className="img-fluid pb-media-img" alt="Reflexión nocturna" />
									<div className="p-4 p-lg-5">
										<h3 className="h4 fw-bold mb-2">Noche: emoción y cierre</h3>
										<p className="text-secondary mb-0">
											Alegría, tristeza, ira, miedo/ansiedad. La sombra queda como narrativa/visual en esta entrega.
										</p>
									</div>
								</div>
							</Reveal>
						</div>
					</div>
				</div>
			</section>

			{/* ESPEJO PREVIEW */}
			<section id="espejo" className="py-5 py-lg-6 border-top bg-white">
				<div className="container">
					<Reveal>
						<div className="pb-big-panel">
							<div className="row align-items-center g-4 g-lg-5">
								<div className="col-12 col-lg-5">
									<h2 className="display-6 fw-bold mb-3">
										Visualiza tu <span className="text-primary">Espejo</span>
									</h2>
									<p className="text-secondary mb-4">
										El Espejo es el núcleo: resumen diario, tendencias 7/30, rachas y objetivos completados.
									</p>
									<ul className="text-secondary mb-0">
										<li>Resumen diario claro</li>
										<li>Tendencias 7/30 días</li>
										<li>Historial y rachas</li>
										<li>Sección de objetivos</li>
									</ul>
								</div>

								<div className="col-12 col-lg-7">
									<div className="pb-dashboard shadow-sm">
										<div className="d-flex justify-content-between align-items-start mb-3">
											<div>
												<div className="fw-bold">Buenos días, Dani</div>
												<div className="small text-secondary">Tu constancia sube esta semana</div>
											</div>
											<span className="badge text-bg-light border">7 días</span>
										</div>

										<div className="row g-3 mb-3">
											<div className="col-6">
												<div className="pb-stat">
													<div className="small text-secondary">Equilibrio</div>
													<div className="fs-4 fw-bold">75%</div>
												</div>
											</div>
											<div className="col-6">
												<div className="pb-stat">
													<div className="small text-secondary">Respiración</div>
													<div className="fs-4 fw-bold">45m</div>
												</div>
											</div>
										</div>

										<div className="pb-bars">
											<div className="pb-bar" style={{ height: "40%" }} />
											<div className="pb-bar" style={{ height: "60%" }} />
											<div className="pb-bar pb-bar--active" style={{ height: "85%" }} />
											<div className="pb-bar" style={{ height: "55%" }} />
											<div className="pb-bar" style={{ height: "75%" }} />
											<div className="pb-bar" style={{ height: "35%" }} />
											<div className="pb-bar" style={{ height: "80%" }} />
										</div>
									</div>
									<div className="small text-secondary mt-2">
										Mock visual (datos reales en Sprint 1).
									</div>
								</div>
							</div>
						</div>
					</Reveal>
				</div>
			</section>

			{/* GOALS */}
			<section id="goals" className="py-5 py-lg-6 border-top bg-light">
				<div className="container">
					<Reveal>
						<h2 className="h1 fw-bold mb-2">Objetivos (Goals)</h2>
						<p className="text-secondary mb-4">
							Predefinidos para empezar rápido, con recompensas visuales/narrativas en el MVP.
						</p>
					</Reveal>

					<div className="row g-4">
						{[
							{ tier: "Small", text: "Respirar conscientemente 3 días." },
							{ tier: "Medium", text: "Cuidar mi estado emocional durante 14 días." },
							{ tier: "Large", text: "Reducir mi estrés general este mes." },
							{ tier: "Life Goal", text: "Conocerme mejor emocionalmente." },
						].map((g) => (
							<div className="col-12 col-md-6 col-lg-3" key={g.tier}>
								<Reveal>
									<div className="card h-100 shadow-sm pb-card">
										<div className="card-body p-4">
											<div className="fw-bold mb-2">{g.tier}</div>
											<p className="text-secondary mb-0">{g.text}</p>
										</div>
									</div>
								</Reveal>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* CTA FINAL */}
			<section id="cta" className="py-5 py-lg-6 border-top bg-white">
				<div className="container">
					<Reveal>
						<div className="text-center mx-auto pb-maxw-lg">
							<h2 className="display-6 fw-bold mb-3">¿Listo para empezar?</h2>
							<p className="text-secondary mb-4">
								Una rutina simple, un cierre consciente y un espejo que devuelve señales.
							</p>
							<div className="d-flex flex-column flex-sm-row justify-content-center gap-3">
								<a className="btn btn-primary btn-lg px-4" href="/auth/signup">
									Crear cuenta
								</a>
								<a className="btn btn-outline-secondary btn-lg px-4" href="/auth/login">
									Ya tengo cuenta
								</a>
							</div>
						</div>
					</Reveal>
				</div>
			</section>
		</main>
	);
};
