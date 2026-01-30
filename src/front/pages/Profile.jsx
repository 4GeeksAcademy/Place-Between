import React, { useEffect, useState } from "react";
import { getBackendUrl } from "../utils"; // your helper
import { useNavigate } from "react-router-dom";
import { useMusicPlayer } from "../contexts/MusicPlayerContext"; // assumes you have context

export const Profile = () => {
	const navigate = useNavigate();
	const BACKEND_URL = getBackendUrl();
	const token = localStorage.getItem("pb_token");

	// Form state
	const [username, setUsername] = useState("");
	const [emailsEnabled, setEmailsEnabled] = useState(true);
	const [musicEnabled, setMusicEnabled] = useState(true);
	const [status, setStatus] = useState({ loading: false, error: "", success: "" });

	const { setSoundEnabled } = useMusicPlayer(); // control global music

	// Load current user info
	useEffect(() => {
		if (!token) return;
		fetch(`${BACKEND_URL}/api/users/me`, {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then((r) => r.json())
			.then((data) => {
				setUsername(data.username || "");
				setEmailsEnabled(data.emails_enabled ?? true);
				setMusicEnabled(data.music_enabled ?? true);
				setSoundEnabled(data.music_enabled ?? true);
			})
			.catch((err) => console.error("Error loading profile:", err));
	}, [BACKEND_URL, token, setSoundEnabled]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setStatus({ loading: true, error: "", success: "" });

		try {
			const res = await fetch(`${BACKEND_URL}/api/users/me`, {
				method: "PATCH", // partial update
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					username,
					emails_enabled: emailsEnabled,
					music_enabled: musicEnabled,
				}),
			});

			const data = await res.json();
			if (!res.ok) throw new Error(data?.msg || "No se pudo actualizar el perfil");

			setStatus({ loading: false, error: "", success: "Perfil actualizado correctamente." });

			// Update music globally
			setSoundEnabled(musicEnabled);
		} catch (err) {
			setStatus({ loading: false, error: err.message || "Error actualizando perfil.", success: "" });
		}
	};

	return (
		<div className="container py-4">
			<h2 className="mb-4">Configuración de perfil</h2>
			<div className="container py-5">
				<h1 className="h2 fw-bold mb-2">Perfil</h1>
				<p className="text-secondary mb-0">Placeholder. Aquí irán ajustes, recordatorios y música.</p>
			</div>

			{status.error && <div className="alert alert-danger">{status.error}</div>}
			{status.success && <div className="alert alert-success">{status.success}</div>}

			<form onSubmit={handleSubmit} className="d-grid gap-3">
				{/* Username */}
				<div>
					<label className="form-label">Nombre de usuario</label>
					<input
						type="text"
						className="form-control"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						placeholder="Tu nombre"
					/>
				</div>

				{/* Emails toggle */}
				<div className="form-check form-switch">
					<input
						className="form-check-input"
						type="checkbox"
						id="emailsEnabled"
						checked={emailsEnabled}
						onChange={(e) => setEmailsEnabled(e.target.checked)}
					/>
					<label className="form-check-label" htmlFor="emailsEnabled">
						Activar correos electrónicos
					</label>
				</div>

				{/* Music toggle */}
				<div className="form-check form-switch">
					<input
						className="form-check-input"
						type="checkbox"
						id="musicEnabled"
						checked={musicEnabled}
						onChange={(e) => setMusicEnabled(e.target.checked)}
					/>
					<label className="form-check-label" htmlFor="musicEnabled">
						Activar música de fondo
					</label>
				</div>

				<button className="btn btn-primary" type="submit" disabled={status.loading}>
					{status.loading ? "Guardando..." : "Guardar cambios"}
				</button>
			</form>
		</div>
	);
};
