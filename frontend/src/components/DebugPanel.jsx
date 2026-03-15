import React, { useRef, useEffect, useState } from "react";

export default function DebugPanel({ logs }) {
  const bottomRef = useRef(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, minimized]);

  return (
    <div className={`fixed bottom-0 right-0 w-96 bg-black/90 border border-gray-700 rounded-tl-lg text-xs font-mono overflow-hidden flex flex-col z-50 transition-all duration-200 ${minimized ? "max-h-8" : "max-h-64"}`}>
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 cursor-pointer select-none"
        onClick={() => setMinimized((m) => !m)}
      >
        <span className="text-gray-300 font-semibold">Debug</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{logs.length} events</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${minimized ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {!minimized && (
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {logs.map((log, i) => (
            <div key={i} className={`${colorForLevel(log.level)}`}>
              <span className="text-gray-600">{log.time}</span>{" "}
              <span className={badgeColor(log.level)}>[{log.level}]</span>{" "}
              {log.msg}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

function colorForLevel(level) {
  if (level === "error") return "text-red-400";
  if (level === "warn") return "text-amber-400";
  if (level === "recv") return "text-blue-400";
  if (level === "send") return "text-emerald-400";
  return "text-gray-400";
}

function badgeColor(level) {
  if (level === "error") return "text-red-500";
  if (level === "warn") return "text-amber-500";
  if (level === "recv") return "text-blue-500";
  if (level === "send") return "text-emerald-500";
  return "text-gray-500";
}
