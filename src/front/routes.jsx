import React from "react";
import { createBrowserRouter } from "react-router-dom";

import { PublicLayout } from "./pages/PublicLayout";
import { AppLayout } from "./pages/AppLayout";

import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";

import { Today } from "./pages/Today";
import { Activities } from "./pages/Activities";
import { Mirror } from "./pages/Mirror";
import { Profile } from "./pages/Profile";

export const router = createBrowserRouter([
  // Público
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/auth/login", element: <Login /> },
      { path: "/auth/signup", element: <Signup /> },
    ],
  },

  // App
  {
    element: <AppLayout />,
    children: [
      { path: "/today", element: <Today /> },
      { path: "/activities", element: <Activities /> },
      { path: "/mirror", element: <Mirror /> },
      { path: "/profile", element: <Profile /> },
    ],
  },
]);
