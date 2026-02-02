import React, { useEffect, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppNavbar } from "../components/AppNavbar.jsx";
import { MusicPlayer } from "../components/MusicPlayer.jsx";
import { MusicPlayerContext } from "../MusicPlayerContext.jsx";

import { ToastProvider } from "../components/toasts/ToastContext.jsx";
import { ToastHost } from "../components/toasts/ToastHost.jsx";

export const AppLayout = () => {
	const navigate = useNavigate();
	const [musicUrl, setMusicUrl] = useState(null);
	const [soundEnabled, setSoundEnabled] = useState(false);

	useEffect(() => {
		const token = localStorage.getItem("pb_token");
		if (!token) navigate("/auth/login", { replace: true });
	}, [navigate]);

	// Alineado con Today/Mirror: night >= 19 o < 6
	const isNight = useMemo(() => {
		const p = new URLSearchParams(window.location.search).get("phase");
		if (p === "day" || p === "night") return p === "night";
		const hour = new Date().getHours();
		return hour >= 19 || hour < 6;
	}, []);

	useEffect(() => {
	const token = localStorage.getItem("pb_token");
	const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
    const fetchMusic = async () => {
      const res = await fetch(`${BACKEND_URL}/api/music/default`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data?.url_music) setMusicUrl(data.url_music);
    };

    fetchMusic();
  	}, [BACKEND_URL, token]);

	const enableSound = () => setSoundEnabled(true);

	useEffect(() => {
		console.log("musicUrl:", musicUrl, "soundEnabled:", soundEnabled);
	}, [musicUrl, soundEnabled]);
	
	return (
		<ToastProvider>
			<MusicPlayerContext.Provider value={{ enableSound }}> 
				{soundEnabled && musicUrl && <MusicPlayer url={musicUrl} />}
				<AppNavbar />
				<ToastHost isNight={isNight} />
				<Outlet />
				{/* Sin footer en área privada */}
			</MusicPlayerContext.Provider>
		</ToastProvider>
	);
};
