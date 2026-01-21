import React from "react";
import { Outlet } from "react-router-dom";
import { PublicNavbar } from "../components/PublicNavbar.jsx";
import { Footer } from "../components/Footer.jsx";

export const PublicLayout = () => {
	return (
		<>
			<PublicNavbar />
			<Outlet />
			<Footer />
		</>
	);
};
