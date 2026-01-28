import React from "react";

export const MusicPlayer = ({ url }) => {
    if (!url) return null;

    const embedPlayerUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        url
    )}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`;


    return (
        <iframe
            src={embedPlayerUrl}
            allow="autoplay"
            style={{ width: 1, height: 1, opacity: 0 }}
            title="default-music"
        />
    );
};
