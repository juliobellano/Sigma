import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = {
  timer: ["Setting up your timer...", "Counting down...", "Almost ready..."],
  bbox: ["Scanning your kitchen...", "Looking for ingredients...", "Analyzing the frame..."],
  substitution: ["Searching for alternatives...", "Checking your spice rack...", "Finding the best match..."],
  generic: ["Thinking...", "Working on it...", "Let me check..."],
};

export default function LoadingWidget({ context = "generic" }) {
  const messages = MESSAGES[context] || MESSAGES.generic;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div
      className="w-full h-full rounded-card p-[1.5px] overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #F59E0B, #FBBF24, #FDE68A, #F59E0B)",
        backgroundSize: "300% 300%",
        animation: "shimmer 3s ease infinite",
      }}
    >
      <div
        className="w-full h-full bg-card rounded-[23px] flex flex-col items-center justify-center gap-4 px-6"
        style={{ animation: "subtlePulse 3s ease-in-out infinite" }}
      >
        {/* Bouncing dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-accent-amber"
              style={{
                animation: "dotBounce 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>

        {/* Rotating message */}
        <div className="h-6 relative flex items-center justify-center w-full">
          <AnimatePresence mode="wait">
            <motion.span
              key={index}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-sm text-text-secondary font-medium absolute"
            >
              {messages[index]}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
