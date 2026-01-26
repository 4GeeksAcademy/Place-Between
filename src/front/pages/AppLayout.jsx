import React, { useEffect, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppNavbar } from "../components/AppNavbar.jsx";

import { ToastProvider } from "../components/toasts/ToastContext.jsx";
import { ToastHost } from "../components/toasts/ToastHost.jsx";

export const AppLayout = () => {
	const navigate = useNavigate();

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

	return (
		<ToastProvider>
			<AppNavbar />
			<ToastHost isNight={isNight} />
			<Outlet />
			{/* Sin footer en área privada */}
		</ToastProvider>
	);
};
