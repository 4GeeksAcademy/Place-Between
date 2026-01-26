import React from "react";

export const ProgressRing = ({ value = 0, size = 64, stroke = 8 }) => {
    const v = Math.max(0, Math.min(100, value));
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (v / 100) * c;

    return (
        <div className="pb-ring" style={{ width: size, height: size }}>
            <svg width={size} height={size}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    strokeWidth={stroke}
                    className="pb-ring-track"
                    fill="none"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    strokeWidth={stroke}
                    className="pb-ring-bar"
                    fill="none"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                />
            </svg>
            <div className="pb-ring-label">
                <div className="pb-ring-value">{Math.round(v)}%</div>
                <div className="pb-ring-sub">hoy</div>
            </div>
        </div>
    );
};
