import React, { useState, useEffect, useRef } from "react";

const PASTEL_COLORS = [
  { bg: "#DBEAFE", text: "#1E40AF" }, // blue
  { bg: "#FCE7F3", text: "#9D174D" }, // pink
  { bg: "#D9F99D", text: "#3F6212" }, // lime
  { bg: "#FEF3C7", text: "#92400E" }, // amber
  { bg: "#EDE9FE", text: "#5B21B6" }, // violet
  { bg: "#D1FAE5", text: "#065F46" }, // emerald
  { bg: "#FFEDD5", text: "#9A3412" }, // orange
  { bg: "#E0E7FF", text: "#3730A3" }, // indigo
];

function pickColor(label) {
  let hash = 0;
  const s = label || "timer";
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return PASTEL_COLORS[Math.abs(hash) % PASTEL_COLORS.length];
}

function formatTime(totalSeconds) {
  if (totalSeconds <= 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.ceil(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TimerWidget({ duration = 60, label = "Timer", onTimerDone }) {
  const [remaining, setRemaining] = useState(duration);
  const startTimeRef = useRef(Date.now());
  const doneRef = useRef(false);
  const color = pickColor(label);

  useEffect(() => {
    startTimeRef.current = Date.now();
    doneRef.current = false;
    setRemaining(duration);
  }, [duration]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const r = Math.max(0, duration - elapsed);
      setRemaining(r);
      if (r <= 0 && !doneRef.current) {
        doneRef.current = true;
        onTimerDone?.(label);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [duration, onTimerDone]);

  const done = remaining <= 0;
  const progress = duration > 0 ? remaining / duration : 0;

  return (
    <div
      className="w-full h-full rounded-card flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-700"
      style={{ backgroundColor: done ? "#FEE2E2" : color.bg }}
    >
      {/* Animated fill that drains from bottom to top */}
      {!done && (
        <div
          className="absolute bottom-0 left-0 right-0 opacity-15 transition-[height] duration-1000 ease-linear"
          style={{
            height: `${progress * 100}%`,
            backgroundColor: color.text,
          }}
        />
      )}

      {/* Label */}
      {label && (
        <span
          className="text-xs font-semibold uppercase tracking-[0.2em] mb-3 relative z-10"
          style={{ color: done ? "#DC2626" : color.text, opacity: 0.6 }}
        >
          {label}
        </span>
      )}

      {/* Big countdown number */}
      <span
        className={`font-extrabold relative z-10 tabular-nums leading-none ${done ? "animate-pulse" : ""}`}
        style={{
          color: done ? "#DC2626" : color.text,
          fontSize: "clamp(3.5rem, 10vw, 7rem)",
        }}
      >
        {done ? "Done!" : formatTime(remaining)}
      </span>

      {/* Done subtitle */}
      {done && label && (
        <span className="text-sm font-semibold mt-3 relative z-10 animate-pulse" style={{ color: "#DC2626" }}>
          {label} is ready!
        </span>
      )}
    </div>
  );
}
