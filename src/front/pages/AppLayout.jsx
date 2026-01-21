import React from "react";
import { Outlet } from "react-router-dom";
import { AppNavbar } from "../components/AppNavbar.jsx";

export const AppLayout = () => {
	return (
		<>
			<AppNavbar />
			<Outlet />
			{/* Sin footer en área privada */}
		</>
	);
};
