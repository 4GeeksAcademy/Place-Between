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

	// -------------------------
	// Música
	// -------------------------
	const [musicUrl, setMusicUrl] = useState(null);

	// pseudo-fade controlado
	const [playerVisible, setPlayerVisible] = useState(true);
	const [playerKey, setPlayerKey] = useState(0);

	// Persistencia ON/OFF (si no existe, por defecto ON)
	const [soundEnabled, setSoundEnabled] = useState(() => {
		const v = localStorage.getItem("pb_sound_enabled");
		return v === null ? true : v === "1";
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

	// -------------------------
	// Preferencias del usuario (timezone + horarios día/noche)
	// -------------------------
	const [userPrefs, setUserPrefs] = useState(null);

	const fetchUserPrefs = useCallback(async () => {
		if (!backendUrl || !token) return;

		try {
			const res = await fetch(`${backendUrl}/api/users/user`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!res.ok) return;
			const data = await res.json().catch(() => null);
			if (!data) return;

			setUserPrefs({
				timezone: data.timezone || "Europe/Madrid",
				day_start_time: data.day_start_time || "06:00",
				night_start_time: data.night_start_time || "19:00",
			});
		} catch (e) {
			console.warn("No se pudo cargar prefs de usuario:", e);
		}
	}, [backendUrl, token]);

	// carga inicial prefs
	useEffect(() => {
		fetchUserPrefs();
	}, [fetchUserPrefs]);

	// refresco cuando el Perfil actualiza prefs
	useEffect(() => {
		const handler = () => fetchUserPrefs();
		window.addEventListener("pb:user-prefs-updated", handler);
		return () => window.removeEventListener("pb:user-prefs-updated", handler);
	}, [fetchUserPrefs]);

	// tick para recalcular phase cuando pasa el tiempo (sin tocar nada)
	const [nowTick, setNowTick] = useState(0);
	useEffect(() => {
		const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
		return () => window.clearInterval(id);
	}, []);

	const getMinutes = (hhmm, fallback) => {
		const s = (hhmm || "").trim();
		const m = /^(\d{2}):(\d{2})$/.exec(s);
		if (!m) return fallback;
		const hh = Number(m[1]);
		const mm = Number(m[2]);
		if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback;
		return hh * 60 + mm;
	};

	const getNowMinutesInTimeZone = (timeZone) => {
		try {
			const dtf = new Intl.DateTimeFormat("en-GB", {
				timeZone,
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			});

			const parts = dtf.formatToParts(new Date());
			const hh = Number(parts.find((p) => p.type === "hour")?.value);
			const mm = Number(parts.find((p) => p.type === "minute")?.value);
			if (Number.isNaN(hh) || Number.isNaN(mm)) throw new Error("bad parts");
			return hh * 60 + mm;
		} catch {
			const d = new Date();
			return d.getHours() * 60 + d.getMinutes();
		}
	};

	const phase = useMemo(() => {
		const p = new URLSearchParams(window.location.search).get("phase");
		if (p === "day" || p === "night") return p;

		const tz = userPrefs?.timezone || "Europe/Madrid";
		const dayStart = getMinutes(userPrefs?.day_start_time, 6 * 60);
		const nightStart = getMinutes(userPrefs?.night_start_time, 19 * 60);
		const nowMin = getNowMinutesInTimeZone(tz);

		if (dayStart < nightStart) {
			return nowMin >= nightStart || nowMin < dayStart ? "night" : "day";
		}

		return nowMin >= nightStart && nowMin < dayStart ? "night" : "day";
	}, [userPrefs, nowTick]);

	const isNight = useMemo(() => phase === "night", [phase]);

	useEffect(() => {
		document.documentElement.setAttribute("data-pb-phase", phase);
		document.documentElement.setAttribute("data-pb-theme", phase);

		window.dispatchEvent(new CustomEvent("pb:phase-updated", { detail: { phase } }));
	}, [phase]);

	// -------------------------
	// Helpers música
	// -------------------------
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

	const applyTrackUrl = useCallback(
		(nextUrl, hintText) => {
			if (!nextUrl) return;

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

	const refreshMusic = useCallback(async () => {
		if (!backendUrl) return;
		if (musicMode === "off") return;

		const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

		try {
			if (musicMode === "default") {
				const res = await fetch(`${backendUrl}/api/music/default`, { headers });
				if (res.ok) {
					const data = await res.json().catch(() => null);
					if (data?.url_music) applyTrackUrl(data.url_music, "Música: Default");
				}
				return;
			}

			const resDynamic = await fetch(`${backendUrl}/api/music/current?phase=${phase}`, {
				headers,
			});

			if (resDynamic.ok) {
				const data = await resDynamic.json().catch(() => null);
				if (data?.url_music) {
					const label = data?.emotion ? `Música adaptada a: ${data.emotion}` : "Música: Default";
					applyTrackUrl(data.url_music, label);
					return;
				}
			}

			const resDefault = await fetch(`${backendUrl}/api/music/default`, { headers });
			if (resDefault.ok) {
				const data = await resDefault.json().catch(() => null);
				if (data?.url_music) applyTrackUrl(data.url_music, "Música: Default");
			}
		} catch (e) {
			console.warn("No se pudo cargar música:", e);
		}
	}, [backendUrl, token, musicMode, phase, applyTrackUrl]);

	useEffect(() => {
		refreshMusic();
	}, [refreshMusic]);

	useEffect(() => {
		const handler = () => refreshMusic();
		window.addEventListener("pb:emotion-updated", handler);
		return () => window.removeEventListener("pb:emotion-updated", handler);
	}, [refreshMusic]);

	useEffect(() => {
		refreshMusic();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase]);

	return (
		<ToastProvider>
			<MusicPlayerContext.Provider
				value={{
					phase,

					soundEnabled,
					musicMode,
					musicHint,

					toggleSound,
					enableSound,
					disableSound,
					setMusicMode,

					refreshMusic,
				}}
			>
				{musicMode !== "off" && soundEnabled && playerVisible && musicUrl && (
					<MusicPlayer key={playerKey} url={musicUrl} />
				)}

				<AppNavbar />
				<ToastHost isNight={isNight} />
				<Outlet />

				<MusicDock />
			</MusicPlayerContext.Provider>
		</ToastProvider>
	);
};
