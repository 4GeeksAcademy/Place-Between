import React from "react";

export const MusicPlayer = ({ url }) => {
  if (!url) return null;

  const embedPlayerUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
    url
  )}&auto_play=true&loop=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`;

  return (
    <iframe
      src={embedPlayerUrl}
      title="pb-music"
      allow="autoplay; encrypted-media"
      // Fuera del flujo de layout -> no “empuja” el navbar
      style={{
        position: "fixed",
        left: "-9999px",
        top: "-9999px",
        width: 300,
        height: 80,
        opacity: 0,
        border: 0,
        pointerEvents: "none",
      }}
    />
  );
};
