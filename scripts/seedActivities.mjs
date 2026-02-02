// BACKEND_URL="http://localhost:3001" npm run seed:activities
// Hace falta tener FLASK_DEBUG=1 en .env para estar en modo desarrollador

import { activitiesCatalog } from "../src/front/data/activities.js";

const rawBase = process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || "";
const BACKEND_URL = String(rawBase).replace(/\/$/, "");

if (!BACKEND_URL) {
  console.error(
    "ERROR: Define BACKEND_URL o VITE_BACKEND_URL (ej. http://localhost:3001)",
  );
  process.exit(1);
}

const day = activitiesCatalog?.day || [];
const night = activitiesCatalog?.night || [];
const payload = [...day, ...night];

if (!payload.length) {
  console.error(
    "ERROR: El catálogo está vacío. Revisa src/front/data/activities.js",
  );
  process.exit(1);
}

async function run() {
  console.log(
    `Seeding ${payload.length} activities -> ${BACKEND_URL}/api/dev/seed/activities/bulk`,
  );

  const res = await fetch(`${BACKEND_URL}/api/dev/seed/activities/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activities: payload }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Seed bulk FAILED:", data);
    process.exit(1);
  }

  console.log("Seed bulk OK:", data);
}

run().catch((e) => {
  console.error("Seed bulk ERROR:", e);
  process.exit(1);
});
