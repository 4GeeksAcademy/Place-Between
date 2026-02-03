import React, { useEffect, useMemo, useCallback, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppNavbar } from "../components/AppNavbar.jsx";
import { MusicPlayer } from "../components/music/MusicPlayer.jsx";
import { MusicPlayerContext } from "../components/music/MusicPlayerContext.jsx";
import { MusicDock } from "../components/music/MusicDock.jsx";

import { ToastProvider } from "../components/toasts/ToastContext.jsx";
import { ToastHost } from "../components/toasts/ToastHost.jsx";

export const AppLayout = () => {
	const navigate = useNavigate();

	const token = useMemo(() => localStorage.getItem("pb_token"), []);
	const backendUrl = useMemo(() => {
		const raw = import.meta.env?.VITE_BACKEND_URL;
		return (raw || "").replace(/\/$/, "");
	}, []);

	// --- Música: estado base ---
	const [musicUrl, setMusicUrl] = useState(null);

	// pseudo-fade controlado
	const [playerVisible, setPlayerVisible] = useState(true);
	const [playerKey, setPlayerKey] = useState(0);

	// Persistencia ON/OFF
	const [soundEnabled, setSoundEnabled] = useState(() => {
		return localStorage.getItem("pb_sound_enabled") === "1";
	});

	// Modo: auto | default | off
	const [musicMode, setMusicModeState] = useState(() => {
		return localStorage.getItem("pb_music_mode") || "auto";
	});

	// Mensaje UI breve tipo “Música adaptada a: …”
	const [musicHint, setMusicHint] = useState(null);

	useEffect(() => {
		localStorage.setItem("pb_sound_enabled", soundEnabled ? "1" : "0");
	}, [soundEnabled]);

	useEffect(() => {
		localStorage.setItem("pb_music_mode", musicMode);
	}, [musicMode]);

	useEffect(() => {
		if (!token) navigate("/auth/login", { replace: true });
	}, [navigate, token]);

	const isNight = useMemo(() => {
		const p = new URLSearchParams(window.location.search).get("phase");
		if (p === "day" || p === "night") return p === "night";
		const hour = new Date().getHours();
		return hour >= 19 || hour < 6;
	}, []);

	const phase = useMemo(() => (isNight ? "night" : "day"), [isNight]);

	const enableSound = () => setSoundEnabled(true);
	const disableSound = () => setSoundEnabled(false);
	const toggleSound = () => setSoundEnabled((v) => !v);

	const showHint = useCallback((text) => {
		if (!text) return;
		setMusicHint(text);
		window.setTimeout(() => setMusicHint(null), 2500);
	}, []);

	const setMusicMode = useCallback(
		(mode) => {
			const m = (mode || "auto").toLowerCase();
			if (!["auto", "default", "off"].includes(m)) return;

			setMusicModeState(m);

			// UX: si el usuario elige Auto/Default, asumimos intención de escuchar
			if (m === "off") {
				setSoundEnabled(false);
				setMusicUrl(null);
				showHint("Música: Silencio");
			} else {
				setSoundEnabled(true);
				showHint(m === "default" ? "Música: Default" : "Música: Auto");
			}
		},
		[showHint]
	);

	/**
	 * Aplica nueva URL de música:
	 * - pseudo-fade: desmonta el iframe brevemente
	 * - fuerza remount con playerKey para que SoundCloud aplique el cambio siempre
	 */
	const applyTrackUrl = useCallback(
		(nextUrl, hintText) => {
			if (!nextUrl) return;

			// Si la URL no cambia, no hace falta tocar el iframe.
			// Aun así, si quieres forzar refresco, incrementa playerKey igualmente.
			if (nextUrl === musicUrl) {
				if (hintText) showHint(hintText);
				return;
			}

			setPlayerVisible(false);

			window.setTimeout(() => {
				setMusicUrl(nextUrl);
				setPlayerKey((k) => k + 1);
				setPlayerVisible(true);
			}, 180);

			if (hintText) showHint(hintText);
		},
		[musicUrl, showHint]
	);

	// Función central: pedir música según modo, con fallback
	const refreshMusic = useCallback(async () => {
		if (!backendUrl) return;
		if (musicMode === "off") return;

		const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

		try {
			// DEFAULT => siempre playlist fija
			if (musicMode === "default") {
				const res = await fetch(`${backendUrl}/api/music/default`, { headers });
				if (res.ok) {
					const data = await res.json().catch(() => null);
					if (data?.url_music) applyTrackUrl(data.url_music, "Música: Default");
				}
				return;
			}

			// AUTO => por emoción, fallback a default
			const resDynamic = await fetch(
				`${backendUrl}/api/music/current?phase=${phase}`,
				{ headers }
			);

			if (resDynamic.ok) {
				const data = await resDynamic.json().catch(() => null);
				if (data?.url_music) {
					const label = data?.emotion
						? `Música adaptada a: ${data.emotion}`
						: "Música: Default";
					applyTrackUrl(data.url_music, label);
					return;
				}
			}

			// fallback
			const resDefault = await fetch(`${backendUrl}/api/music/default`, { headers });
			if (resDefault.ok) {
				const data = await resDefault.json().catch(() => null);
				if (data?.url_music) applyTrackUrl(data.url_music, "Música: Default");
			}
		} catch (e) {
			console.warn("No se pudo cargar música:", e);
		}
	}, [backendUrl, token, musicMode, phase, applyTrackUrl]);

	// Carga inicial
	useEffect(() => {
		refreshMusic();
	}, [refreshMusic]);

	// Actualiza automáticamente cuando cambia emoción (sin recargar)
	useEffect(() => {
		const handler = () => refreshMusic();
		window.addEventListener("pb:emotion-updated", handler);
		return () => window.removeEventListener("pb:emotion-updated", handler);
	}, [refreshMusic]);

	// Si cambia day/night, refrescamos
	useEffect(() => {
		refreshMusic();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase]);

	return (
		<ToastProvider>
			<MusicPlayerContext.Provider
				value={{
					// estado
					soundEnabled,
					musicMode,
					musicHint,

					// acciones
					toggleSound,
					enableSound,
					disableSound,
					setMusicMode,

					// refresh manual
					refreshMusic,
				}}
			>
				{/* Player (fuera del layout, no afecta navbar) */}
				{musicMode !== "off" && soundEnabled && playerVisible && musicUrl && (
					<MusicPlayer key={playerKey} url={musicUrl} />
				)}

				<AppNavbar />
				<ToastHost isNight={isNight} />
				<Outlet />

				{/* Dock flotante persistente */}
				<MusicDock />
			</MusicPlayerContext.Provider>
		</ToastProvider>
	);
};
