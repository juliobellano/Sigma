import React from "react";

export default function CameraWidget({ videoRef }) {
  return (
    <div className="relative w-full h-full rounded-card overflow-hidden bg-black border border-border shadow-card hover:shadow-card-hover transition-shadow duration-200">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded-full">
        <span className="w-2 h-2 bg-accent-red rounded-full animate-pulse" />
        <span className="text-xs font-semibold tracking-wide text-text-primary">
          LIVE
        </span>
      </div>
    </div>
  );
}
