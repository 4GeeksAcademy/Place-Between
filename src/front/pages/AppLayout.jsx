import React from "react";
import { Outlet } from "react-router-dom";
import { AppNavbar } from "../components/AppNavbar.jsx";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";



export const AppLayout = () => {

	const navigate = useNavigate();

	useEffect(() => {
		const token = localStorage.getItem("pb_token");
		if (!token) navigate("/auth/login", { replace: true });
	}, [navigate]);

	return (
		<>
			<AppNavbar />
			<Outlet />
			{/* Sin footer en área privada */}
		</>
	);
};
