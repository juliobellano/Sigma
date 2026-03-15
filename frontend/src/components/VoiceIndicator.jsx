import React, { useRef, useEffect, useCallback } from "react";

const BAR_COUNT = 40;
const BAR_GAP = 3;
const BAR_WIDTH = 4;
const MIN_BAR_HEIGHT = 2;
const MAX_BAR_HEIGHT = 32;
const CANVAS_HEIGHT = 40;

const STATE_COLORS = {
  listening: "#22C55E",
  speaking: "#3B82F6",
  thinking: "#F59E0B",
  idle: "#888888",
};

const STATE_LABELS = {
  idle: "Ready to listen",
  listening: "Listening...",
  speaking: "Sigma is speaking",
  thinking: "Thinking...",
};

const STATE_TEXT_COLORS = {
  idle: "text-text-secondary",
  listening: "text-accent-green",
  speaking: "text-accent-blue",
  thinking: "text-accent-amber",
};

export default function VoiceIndicator({ state, geminiStatus, getAnalyserData }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const smoothedRef = useRef(new Float32Array(BAR_COUNT).fill(0));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = CANVAS_HEIGHT;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const source = state === "speaking" ? "player" : "mic";
    const raw = getAnalyserData?.(source);
    const smoothed = smoothedRef.current;

    for (let i = 0; i < BAR_COUNT; i++) {
      let target = 0;
      if (raw && raw.length > 0) {
        const binIndex = Math.floor((i / BAR_COUNT) * raw.length);
        target = raw[binIndex] / 255;
      }
      const smoothing = target > smoothed[i] ? 0.4 : 0.85;
      smoothed[i] = smoothed[i] * smoothing + target * (1 - smoothing);
    }

    const color = STATE_COLORS[state] || STATE_COLORS.idle;
    const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
    const startX = (width - totalWidth) / 2;
    const centerY = height / 2;

    for (let i = 0; i < BAR_COUNT; i++) {
      const barHeight = MIN_BAR_HEIGHT + smoothed[i] * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
      const x = startX + i * (BAR_WIDTH + BAR_GAP);
      const y = centerY - barHeight / 2;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, BAR_WIDTH, barHeight, 2);
      ctx.fill();
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [state, getAnalyserData]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-full shadow-card px-5 h-10">
      {/* Connection dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          geminiStatus === "gemini_connected"
            ? "bg-accent-green"
            : geminiStatus === "connecting_to_gemini"
            ? "bg-accent-amber animate-pulse"
            : "bg-text-secondary"
        }`}
      />

      {/* Waveform */}
      <canvas
        ref={canvasRef}
        className="flex-1 min-w-0"
        style={{ height: CANVAS_HEIGHT }}
      />

      {/* State label */}
      <span className={`text-xs font-medium flex-shrink-0 ${STATE_TEXT_COLORS[state] || "text-text-secondary"}`}>
        {STATE_LABELS[state] || ""}
      </span>
    </div>
  );
}
