import React from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function CameraWidget({ videoRef, isCapturing = false }) {
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

      {/* Camera shutter flash overlay */}
      <AnimatePresence>
        {isCapturing && (
          <motion.div
            key="flash"
            className="absolute inset-0 bg-white pointer-events-none z-10 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0] }}
            transition={{ duration: 0.5, times: [0, 0.15, 1], ease: "easeOut" }}
          >
            <span className="text-4xl select-none" style={{ filter: "drop-shadow(0 0 8px rgba(0,0,0,0.3))" }}>
              📷
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
