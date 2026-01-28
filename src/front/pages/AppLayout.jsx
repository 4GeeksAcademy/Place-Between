import React from "react";
import { Outlet } from "react-router-dom";
import { AppNavbar } from "../components/AppNavbar.jsx";
import { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { MusicPlayer } from "../components/MusicPlayer.jsx";
import { MusicPlayerContext } from "../contexts/MusicPlayerContext.jsx";


export const AppLayout = () => {

	const navigate = useNavigate();
	const [musicUrl, setMusicUrl] = useState(null);
	const [soundEnabled, setSoundEnabled] = useState(false);

	useEffect(() => {
		const token = localStorage.getItem("pb_token");
		if (!token) navigate("/auth/login", { replace: true });
	}, [navigate]);

	// plays default background music

	useEffect(() => {
		fetch(`${import.meta.env.VITE_BACKEND_URL}/api/music/default`)
			.then(r => r.json())
			.then(data => {
				console.log("Fetched music:", data);
				if (data.url_music) {
					setMusicUrl(data.url_music);
				} else {
					console.log("No url_music in response");
				}
			})
			.catch(err => console.error("Error fetching music:", err));
	}, []);

	const enableSound = () => setSoundEnabled(true);

	useEffect(() => {
		console.log("musicUrl:", musicUrl, "soundEnabled:", soundEnabled);
	}, [musicUrl, soundEnabled]);

	return (
		<MusicPlayerContext.Provider value={{ setMusicUrl, enableSound }}>
			{soundEnabled && musicUrl && <MusicPlayer url={musicUrl} />}
			<AppNavbar />
			<Outlet />
			{/* Sin footer en área privada */}
		</MusicPlayerContext.Provider>
	);
};
