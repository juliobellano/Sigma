import React, { useState, useCallback, useEffect, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import CameraWidget from "./components/CameraWidget";
import WidgetManager from "./components/WidgetManager";
import VoiceIndicator from "./components/VoiceIndicator";
import DebugPanel from "./components/DebugPanel";
import useGeminiLive from "./hooks/useGeminiLive";
import useCamera from "./hooks/useCamera";
import useAudioStream from "./hooks/useAudioStream";

const BBOX_MODEL = "gemini-3-flash-preview";
const bboxAI = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// Draw bounding boxes on an image client-side using canvas (preserves original dimensions)
function drawBBoxes(frameB64, boxes) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      for (const box of boxes) {
        const [yMin, xMin, yMax, xMax] = box.box_2d;
        const x = (xMin / 1000) * img.width;
        const y = (yMin / 1000) * img.height;
        const w = ((xMax - xMin) / 1000) * img.width;
        const h = ((yMax - yMin) / 1000) * img.height;

        // Draw green rectangle
        ctx.strokeStyle = "#22C55E";
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);

        // Draw label background + text
        const label = box.label || "object";
        ctx.font = "bold 16px sans-serif";
        const textWidth = ctx.measureText(label).width;
        const labelH = 24;
        const labelY = Math.max(y - labelH, 0);
        ctx.fillStyle = "#22C55E";
        ctx.fillRect(x, labelY, textWidth + 12, labelH);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(label, x + 6, labelY + 17);
      }

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = `data:image/jpeg;base64,${frameB64}`;
  });
}

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 1 });
}

const EMPTY_SLOT = { type: "empty", data: {}, context: null, active: false };

export default function App() {
  const [started, setStarted] = useState(false);
  const [voiceState, setVoiceState] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [widgets, setWidgets] = useState([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);

  const addLog = useCallback((level, msg) => {
    setLogs((prev) => [...prev.slice(-200), { time: ts(), level, msg }]);
  }, []);

  const audio = useAudioStream();

  const onAudio = useCallback(
    (data) => {
      setVoiceState("speaking");
      audio.playAudioChunk(data);
    },
    [audio.playAudioChunk]
  );

  const onTranscript = useCallback(
    (role, text) => {
      addLog("recv", `transcript [${role}]: ${text}`);
    },
    [addLog]
  );

  const onInterrupted = useCallback(() => {
    audio.handleInterruption();
    setVoiceState("listening");
  }, [audio.handleInterruption]);

  const onTurnComplete = useCallback(() => {
    setVoiceState("listening");
  }, []);

  const captureFrameRef = useRef(null);

  const onToolCall = useCallback(
    (fc, session) => {
      if (fc.name === "set_timer") {
        const { seconds, label } = fc.args || {};
        addLog("info", `Tool: set_timer(${seconds}s, "${label || "Timer"}")`);

        let placed = false;

        setWidgets((prev) => {
          let slot = prev.findIndex((w) => w.type === "empty");
          if (slot === -1) slot = prev.findIndex((w) => !w.active);
          if (slot === -1) return prev;

          placed = true;
          const next = [...prev];
          next[slot] = {
            type: "timer",
            data: { duration: seconds, label: label || "Timer" },
            context: null,
            active: true,
          };
          return next;
        });

        setTimeout(() => {
          if (placed) {
            session.sendToolResponse({
              functionResponses: [
                { id: fc.id, response: { result: `Timer set for ${seconds} seconds${label ? ` (${label})` : ""}` } },
              ],
            });
          } else {
            session.sendToolResponse({
              functionResponses: [
                { id: fc.id, response: { result: "All widget slots are in use. Tell the user to wait for a timer to finish." } },
              ],
            });
          }
        }, 0);
      }

      if (fc.name === "find_object") {
        const { object_name } = fc.args || {};
        addLog("info", `Tool: find_object("${object_name}")`);

        // Show loading widget
        let loadingSlot = -1;
        setWidgets((prev) => {
          let slot = prev.findIndex((w) => w.type === "empty");
          if (slot === -1) slot = prev.findIndex((w) => !w.active);
          if (slot === -1) return prev;
          loadingSlot = slot;
          const next = [...prev];
          next[slot] = { type: "loading", data: {}, context: "bbox", active: true };
          return next;
        });

        // Capture frame and call Gemini 3 Flash Preview
        const frameB64 = captureFrameRef.current?.();
        if (!frameB64) {
          addLog("error", "No camera frame available for find_object");
          session.sendToolResponse({
            functionResponses: [{ id: fc.id, response: { result: "Camera is not available. Tell the user to make sure the camera is on." } }],
          });
          return;
        }

        (async () => {
          try {
            const response = await bboxAI.models.generateContent({
              model: BBOX_MODEL,
              contents: [
                {
                  role: "user",
                  parts: [
                    { inlineData: { mimeType: "image/jpeg", data: frameB64 } },
                    {
                      text: `Detect "${object_name}" in this image. Return ONLY a JSON array of bounding boxes: [{"label": "name", "box_2d": [y_min, x_min, y_max, x_max]}]. Coordinates on 0-1000 scale. If not found, return []. No explanation, just valid JSON.`,
                    },
                  ],
                },
              ],
              config: {
                responseMimeType: "application/json",
              },
            });

            const text = response.text.trim();
            addLog("recv", `bbox response: ${text}`);

            const rawBoxes = JSON.parse(text);
            const found = rawBoxes.length > 0;

            // Draw bounding boxes on the original frame using canvas
            const annotatedImage = await drawBBoxes(frameB64, rawBoxes);

            const widgetLabel = found
              ? `Found: ${object_name}`
              : `Not found: ${object_name}`;

            // Place bbox widget (replace the loading slot)
            setWidgets((prev) => {
              const next = [...prev];
              const slot = loadingSlot >= 0 && loadingSlot < next.length ? loadingSlot : next.findIndex((w) => w.type === "loading");
              if (slot === -1) return prev;
              next[slot] = {
                type: "bbox",
                data: { image: annotatedImage, label: widgetLabel },
                context: null,
                active: true,
              };
              return next;
            });

            // Send tool response so Gemini Live can talk about it
            const resultMsg = found
              ? `Found ${object_name} in the camera view and highlighted it with a bounding box. Tell the user where you see it and that you've highlighted it on screen.`
              : `Could not find ${object_name} in the current camera view. Tell the user you couldn't spot it and suggest moving the camera.`;

            session.sendToolResponse({
              functionResponses: [{ id: fc.id, response: { result: resultMsg } }],
            });

            // Nudge Gemini to speak about the result
            setTimeout(() => {
              geminiRef.current?.sendText(
                found
                  ? `[SYSTEM: The bounding box for "${object_name}" is now shown on screen. Tell the user briefly, e.g. "Here's the ${object_name}, I've highlighted it for you!"]`
                  : `[SYSTEM: Could not find "${object_name}" on camera. Tell the user kindly, e.g. "I couldn't spot the ${object_name}. Try moving the camera a bit."]`
              );
            }, 500);

            // Auto-remove bbox widget after 5 seconds
            setTimeout(() => {
              setWidgets((prev) =>
                prev.map((w) =>
                  w.type === "bbox" && w.data?.label === widgetLabel
                    ? EMPTY_SLOT
                    : w
                )
              );
            }, 5000);
          } catch (err) {
            addLog("error", `find_object failed: ${err.message}`);
            if (loadingSlot >= 0) {
              setWidgets((prev) => {
                const next = [...prev];
                if (next[loadingSlot]?.type === "loading") next[loadingSlot] = EMPTY_SLOT;
                return next;
              });
            }
            session.sendToolResponse({
              functionResponses: [{ id: fc.id, response: { result: `Detection failed: ${err.message}. Tell the user something went wrong and to try again.` } }],
            });
          }
        })();
      }
    },
    [addLog]
  );

  const gemini = useGeminiLive({
    onAudio,
    onTranscript,
    onInterrupted,
    onTurnComplete,
    onToolCall,
    onLog: addLog,
  });

  // Keep a ref to gemini for use in callbacks
  const geminiRef = useRef(gemini);
  useEffect(() => { geminiRef.current = gemini; }, [gemini]);

  const onTimerDone = useCallback((label) => {
    addLog("info", `Timer done: ${label}`);
    // Mark the slot as inactive
    setWidgets((prev) =>
      prev.map((w) =>
        w.type === "timer" && w.data?.label === label && w.active
          ? { ...w, active: false }
          : w
      )
    );
    // Tell Gemini so it can announce
    geminiRef.current?.sendText(`[SYSTEM: The timer for "${label}" just finished. Announce it to the user and remind them what to do, e.g. "Your ${label} timer is done! Don't forget to take it out."]`);
    // Auto-remove widget after 5 seconds
    setTimeout(() => {
      setWidgets((prev) =>
        prev.map((w) =>
          w.type === "timer" && w.data?.label === label && !w.active
            ? EMPTY_SLOT
            : w
        )
      );
    }, 5000);
  }, [addLog]);

  const onCameraFrame = useCallback(
    (b64) => {
      gemini.sendVideo(b64);
    },
    [gemini.sendVideo]
  );

  const camera = useCamera({ onFrame: onCameraFrame, enabled: started && gemini.status === "connected" });

  // Keep captureFrame ref in sync
  useEffect(() => { captureFrameRef.current = camera.captureFrame; }, [camera.captureFrame]);

  const sendCountRef = useRef({ audio: 0, frame: 0 });
  useEffect(() => {
    const interval = setInterval(() => {
      const c = sendCountRef.current;
      if (c.audio > 0 || c.frame > 0) {
        if (c.audio > 0) addLog("send", `user_audio x${c.audio}`);
        if (c.frame > 0) addLog("send", `camera_frame x${c.frame}`);
        sendCountRef.current = { audio: 0, frame: 0 };
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [addLog]);

  const handleStart = async () => {
    setStarted(true);
    addLog("info", "Starting...");

    try {
      await camera.start();
      addLog("info", "Camera started");
    } catch (e) {
      addLog("error", `Camera failed: ${e.message}`);
    }

    try {
      await audio.initPlayer();
      addLog("info", "Audio player ready");
    } catch (e) {
      addLog("error", `Player failed: ${e.message}`);
    }

    try {
      await audio.startMic((b64) => {
        sendCountRef.current.audio++;
        gemini.sendAudio(b64);
      });
      addLog("info", "Mic started (16kHz)");
    } catch (e) {
      addLog("error", `Mic failed: ${e.message}`);
    }

    gemini.connect();
    setVoiceState("listening");
  };

  // Splash screen
  if (!started) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 bg-surface">
        <h1 className="text-5xl font-bold text-text-primary">
          Sigma
        </h1>
        <p className="text-text-secondary text-lg">Your hands-free cooking companion</p>
        <button
          onClick={handleStart}
          className="mt-4 px-8 py-3 bg-text-primary hover:bg-black text-white font-semibold text-base rounded-full transition-colors"
        >
          Start Cooking
        </button>
      </div>
    );
  }

  const geminiStatusLabel =
    gemini.status === "connected" ? "gemini_connected" :
    gemini.status === "connecting" ? "connecting_to_gemini" : "disconnected";

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-surface p-6 gap-4">
      {/* Connection banner */}
      {gemini.status !== "connected" && (
        <div className="text-center text-sm text-accent-amber bg-accent-amber/10 border border-accent-amber/20 rounded-full py-1.5 px-4">
          {gemini.status === "connecting" ? "Connecting to Gemini..." : "Disconnected"}
        </div>
      )}

      {/* 16:9 container */}
      <div
        className="w-full max-w-[1440px]"
        style={{
          aspectRatio: "16 / 9",
          maxHeight: "calc(100vh - 120px)",
        }}
      >
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-3">
          <CameraWidget videoRef={camera.videoRef} />
          {widgets.map((slot, i) => (
            <WidgetManager key={i} slot={slot} onTimerDone={onTimerDone} />
          ))}
        </div>
      </div>

      {/* Voice indicator below container */}
      <div className="w-full max-w-md">
        <VoiceIndicator
          state={voiceState}
          geminiStatus={geminiStatusLabel}
          getAnalyserData={audio.getAnalyserData}
        />
      </div>

      {/* Debug Panel */}
      <DebugPanel logs={logs} />
    </div>
  );
}
