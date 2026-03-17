import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GoogleGenAI } from "@google/genai";
import CameraWidget from "./components/CameraWidget";
import WidgetManager from "./components/WidgetManager";
import VoiceIndicator from "./components/VoiceIndicator";
import DebugPanel from "./components/DebugPanel";
import TutorialProgressBar from "./components/TutorialProgressBar";
import useGeminiLive from "./hooks/useGeminiLive";
import useCamera from "./hooks/useCamera";
import useAudioStream from "./hooks/useAudioStream";
import { playAlarmChime } from "./utils/alarmChime";

const BBOX_MODEL = "gemini-3-flash-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const HOW_TO_MODEL = "gemini-3.1-flash-image-preview";
const TUTORIAL_MODEL = "gemini-3.1-pro-preview";

const TUTORIAL_SYSTEM_PROMPT = `Analyze this YouTube cooking tutorial video and extract all the cooking steps as a JSON array.

For each step include:
- step_number: integer starting at 0
- step_name: short title (max 4 words)
- timestamp: approximate video timestamp (e.g. "0:30", "2:15")
- description: 1-2 sentences of what to do

Return ONLY a valid JSON array with no extra text. Example:
[{"step_number":0,"step_name":"Gather ingredients","timestamp":"0:00","description":"Get all ingredients ready on the counter."}]

If this is NOT a cooking tutorial video, return exactly this text with no quotes: its not a tutorial video!`;
const HOW_TO_SYSTEM_PROMPT = `Act as a professional illustrator. I have uploaded a reference image, and the goal to teach is: TASK_PLACEHOLDER.

Create a clean, highly simplified 4-step illustrated infographic that teaches this goal. Design a horizontal landscape graphic layout divided into four clear, sequential sections from left to right (Step 1, Step 2, Step 3, Step 4).

Using the uploaded photo as your absolute base, preserve as many assets, objects, lighting characteristics, and colors from the original picture as possible. Keep the visual identity of the items completely stable, but translate them into a very simple, minimalist illustration style.

Show the progression of the action across the four sections. Add minimal, very readable text labels (max 3 words per step) and simple directional arrows to demonstrate the action. White or solid background, high contrast, no visual clutter, and no logos.`;
const geminiAI = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

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
        const [yMin, xMin, yMax, xMax] = box.box_2d ?? box.box;
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

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new ArrayBuffer(binary.length);
  const view = new Uint8Array(bytes);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return bytes;
}

const EMPTY_SLOT = { type: "empty", data: {}, context: null, active: false };

const TUTORIAL_LOADING_STAGES = [
  "Finding YouTube video...",
  "Watching the tutorial...",
  "Understanding the steps...",
  "Setting up your plan...",
];

function TutorialLoadingStages({ stage }) {
  return (
    <div
      className="w-72 h-40 rounded-card p-[1.5px] overflow-hidden"
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
        {/* Stage label with fade transition */}
        <div className="h-6 relative flex items-center justify-center w-full">
          <AnimatePresence mode="wait">
            <motion.span
              key={stage}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-sm text-text-secondary font-medium absolute"
            >
              {TUTORIAL_LOADING_STAGES[stage]}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function buildInjectionText(result) {
  if (result.type === "find_object") {
    return result.found
      ? `[BACKGROUND_RESULT] Finished checking the camera. Found "${result.label}" — it's visible and highlighted on screen.`
      : `[BACKGROUND_RESULT] Finished checking the camera. Couldn't spot "${result.label}" — user may need to shift the camera.`;
  }
  if (result.type === "how_to") {
    const desc = result.description ? ` ${result.description}` : "";
    return `[BACKGROUND_RESULT] Finished illustrating "${result.task}".${desc} The step-by-step guide is displayed on screen.`;
  }
  if (result.type === "find_substitute") {
    const { ingredient, substitutes, best } = result;
    const names = substitutes
      .map((s) => `${s.name}${s.ratio ? ` (${s.ratio})` : ""}${s.available ? " — available in kitchen" : ""}`)
      .join("; ");
    const bestPart = best
      ? ` Best pick: ${best.name}${best.available ? " — it's visible on the counter!" : ""}.`
      : "";
    return `[BACKGROUND_RESULT] Substitutes for "${ingredient}": ${names}.${bestPart} Results shown on screen.`;
  }
  return `[BACKGROUND_RESULT] A background task completed.`;
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [voiceState, setVoiceState] = useState("idle");
  const voiceStateRef = useRef("idle");       // mirrors voiceState for async callbacks
  const pendingResultsRef = useRef([]);        // queue of completed sub-agent results
  const [logs, setLogs] = useState([]);
  const [widgets, setWidgets] = useState([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);
  const [isCapturing, setIsCapturing] = useState(false);

  // Tutorial state
  const [tutorialSteps, setTutorialSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [tutorialLoading, setTutorialLoading] = useState(false);
  const [tutorialLoadingStage, setTutorialLoadingStage] = useState(0);
  const [tutorialError, setTutorialError] = useState("");
  const tutorialStepsRef = useRef([]);
  const currentStepIndexRef = useRef(-1);
  const pendingTutorialStepsRef = useRef(null);
  const pendingInjectRef = useRef(null);

  const addLog = useCallback((level, msg) => {
    setLogs((prev) => [...prev.slice(-200), { time: ts(), level, msg }]);
  }, []);

  const setVoiceStateSync = useCallback((state) => {
    voiceStateRef.current = state;
    setVoiceState(state);
  }, []);

  const audio = useAudioStream();

  // TTS agent — uses Gemini 2.5 Flash TTS to speak announcements
  const speakTTS = useCallback(async (text) => {
    try {
      addLog("info", `TTS: "${text}"`);
      const response = await geminiAI.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
          systemInstruction: "You are Sigma, a warm, cheerful, and encouraging cooking companion. Speak casually like a supportive best friend in the kitchen — brief, upbeat, and natural. Never sound robotic.",
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const pcm = base64ToArrayBuffer(audioData);
        audio.playAudioChunk(pcm);
        addLog("info", "TTS audio playing");
      }
    } catch (err) {
      addLog("error", `TTS failed: ${err.message}`);
    }
  }, [audio.playAudioChunk, addLog]);

  const processQueue = useCallback(() => {
    if (pendingResultsRef.current.length === 0) return;
    if (voiceStateRef.current !== "listening") return; // conductor busy, will retry on next onTurnComplete
    const result = pendingResultsRef.current.shift();
    const injection = buildInjectionText(result);
    addLog("info", `[Queue] Injecting: ${injection}`);
    geminiRef.current?.sendText(injection);
  }, [addLog]); // refs don't need to be in deps

  const enqueueResult = useCallback((result) => {
    pendingResultsRef.current.push(result);
    addLog("info", `[Queue] Enqueued ${result.type} (depth: ${pendingResultsRef.current.length})`);
    if (voiceStateRef.current === "listening") {
      processQueue(); // conductor idle — inject immediately
    }
  }, [addLog, processQueue]);

  const onAudio = useCallback(
    (data) => {
      setVoiceStateSync("speaking");
      audio.playAudioChunk(data);
    },
    [audio.playAudioChunk, setVoiceStateSync]
  );

  const onTranscript = useCallback(
    (role, text) => {
      addLog("recv", `transcript [${role}]: ${text}`);
    },
    [addLog]
  );

  const onInterrupted = useCallback(() => {
    audio.handleInterruption();
    setVoiceStateSync("listening");
  }, [audio.handleInterruption, setVoiceStateSync]);

  const onTurnComplete = useCallback(() => {
    setVoiceStateSync("listening");
    processQueue(); // check for queued sub-agent results
  }, [setVoiceStateSync, processQueue]);

  const captureFrameRef = useRef(null);

  function normalizeYouTubeUrl(url) {
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return `https://www.youtube.com/watch?v=${shortMatch[1]}`;
    return url;
  }

  const analyzeTutorial = useCallback(async (url) => {
    try {
      addLog("send", `[tutorial] model=${TUTORIAL_MODEL} url=${url}`);

      const response = await geminiAI.models.generateContent({
        model: TUTORIAL_MODEL,
        contents: [{
          role: "user",
          parts: [
            { fileData: { fileUri: url, mimeType: "video/mp4" } },
            { text: TUTORIAL_SYSTEM_PROMPT },
          ],
        }],
      });

      const text = response.text?.trim();
      addLog("recv", `[tutorial] response: ${text?.slice(0, 300)}${text?.length > 300 ? "…" : ""}`);

      if (!text) {
        setTutorialError("Could not analyze the video. Try again.");
        return null;
      }

      if (text === "its not a tutorial video!") {
        setTutorialError("its not a tutorial video!");
        return null;
      }

      const steps = JSON.parse(text);
      addLog("recv", `[tutorial] parsed ${steps.length} steps`);
      return steps;
    } catch (err) {
      addLog("error", `Tutorial analysis failed: ${err.message}`);
      setTutorialError("Failed to analyze the video. Check the URL and try again.");
      return null;
    }
  }, [addLog]);

  const onToolCall = useCallback(
    (fc, session) => {
      if (fc.name === "set_timer") {
        const { seconds, label } = fc.args || {};
        addLog("info", `Tool: set_timer(${seconds}s, "${label || "Timer"}")`);

        let placed = false;

        setWidgets((prev) => {
          const slot = prev.findIndex((w) => w.type === "empty");
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
                { id: fc.id, name: fc.name, response: { output: `Timer set for ${seconds} seconds${label ? ` (${label})` : ""}` } },
              ],
            });
          } else {
            session.sendToolResponse({
              functionResponses: [
                { id: fc.id, name: fc.name, response: { output: "All widget slots are in use. Tell the user to wait for a timer to finish." } },
              ],
            });
          }
        }, 0);
      }

      if (fc.name === "find_object") {
        const { object_name } = fc.args || {};
        addLog("info", `Tool: find_object("${object_name}")`);

        // Trigger camera flash animation
        setIsCapturing(true);
        setTimeout(() => setIsCapturing(false), 500);

        // Show loading widget
        let loadingSlot = -1;
        setWidgets((prev) => {
          const slot = prev.findIndex((w) => w.type === "empty");
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
            functionResponses: [{ id: fc.id, name: fc.name, response: { output: "Camera is not available. Tell the user to make sure the camera is on." } }],
          });
          return;
        }

        // Respond to Gemini immediately — unblocks sequential tool dispatch
        session.sendToolResponse({
          functionResponses: [{ id: fc.id, name: fc.name, response: { output: "Searching, I'll highlight it when found." } }],
        });

        (async () => {
          try {
            const response = await geminiAI.models.generateContent({
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
                responseSchema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      box_2d: { type: "array", items: { type: "number" } },
                    },
                    required: ["label", "box_2d"],
                  },
                },
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

            enqueueResult({ type: "find_object", label: object_name, found });

            // Auto-remove bbox widget after 5 seconds
            setTimeout(() => {
              setWidgets((prev) =>
                prev.map((w) =>
                  w.type === "bbox" && w.data?.label === widgetLabel
                    ? EMPTY_SLOT
                    : w
                )
              );
            }, 15000);
          } catch (err) {
            addLog("error", `find_object failed: ${err.message}`);
            if (loadingSlot >= 0) {
              setWidgets((prev) => {
                const next = [...prev];
                if (next[loadingSlot]?.type === "loading") next[loadingSlot] = EMPTY_SLOT;
                return next;
              });
            }
          }
        })();
      }

      if (fc.name === "find_substitute") {
        const { ingredient } = fc.args || {};
        addLog("info", `Tool: find_substitute("${ingredient}")`);

        // Show loading widget
        let loadingSlot = -1;
        setWidgets((prev) => {
          const slot = prev.findIndex((w) => w.type === "empty");
          if (slot === -1) return prev;
          loadingSlot = slot;
          const next = [...prev];
          next[slot] = { type: "loading", data: {}, context: "substitution", active: true };
          return next;
        });

        // Respond to Gemini immediately — unblocks sequential tool dispatch
        session.sendToolResponse({
          functionResponses: [{ id: fc.id, name: fc.name, response: { output: "Searching for substitutes, I'll show the results when ready." } }],
        });

        (async () => {
          try {
            // Stage 1 — Search for substitutes via Google Search grounding
            const searchResponse = await geminiAI.models.generateContent({
              model: BBOX_MODEL,
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `Find cooking substitutes for "${ingredient}".
Return a JSON array: [{"name": "substitute name", "ratio": "usage ratio hint"}]
Include 3-5 practical substitutes, ordered by similarity.`,
                    },
                  ],
                },
              ],
              config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json",
              },
            });

            const searchText = searchResponse.text.trim();
            addLog("recv", `substitute search: ${searchText}`);
            const substitutes = JSON.parse(searchText);

            // Stage 2 — Vision: check which substitutes are visible in the kitchen
            const frameB64 = captureFrameRef.current?.();
            let results;

            if (frameB64) {
              const names = substitutes.map((s) => s.name);
              const visionResponse = await geminiAI.models.generateContent({
                model: BBOX_MODEL,
                contents: [
                  {
                    role: "user",
                    parts: [
                      { inlineData: { mimeType: "image/jpeg", data: frameB64 } },
                      {
                        text: `Look at this image. Which of these items are visible: ${names.join(", ")}?
Return a JSON array: [{"name": "item", "visible": true/false}]
Only mark as visible if you can clearly see it.`,
                      },
                    ],
                  },
                ],
                config: {
                  responseMimeType: "application/json",
                },
              });

              const visionText = visionResponse.text.trim();
              addLog("recv", `substitute vision: ${visionText}`);
              const visibility = JSON.parse(visionText);
              const visibleSet = new Set(
                visibility.filter((v) => v.visible).map((v) => v.name.toLowerCase())
              );

              results = substitutes.map((s) => ({
                name: s.name,
                ratio: s.ratio,
                available: visibleSet.has(s.name.toLowerCase()),
              }));
            } else {
              addLog("info", "No camera frame — skipping vision check");
              results = substitutes.map((s) => ({
                name: s.name,
                ratio: s.ratio,
                available: false,
              }));
            }

            // Pick best recommendation (prefer available, otherwise first)
            const best = results.find((r) => r.available) || results[0];
            const recommendation = best
              ? `Use ${best.name}${best.ratio ? ` — ${best.ratio}` : ""}`
              : null;

            // Update widget: loading → search
            setWidgets((prev) => {
              const next = [...prev];
              const slot = loadingSlot >= 0 && loadingSlot < next.length ? loadingSlot : next.findIndex((w) => w.type === "loading");
              if (slot === -1) return prev;
              next[slot] = {
                type: "search",
                data: { ingredient, substitutes: results, recommendation },
                context: null,
                active: true,
              };
              return next;
            });

            enqueueResult({ type: "find_substitute", ingredient, substitutes: results, recommendation, best });

            // Auto-remove after 15 seconds
            setTimeout(() => {
              setWidgets((prev) =>
                prev.map((w) =>
                  w.type === "search" && w.data?.ingredient === ingredient
                    ? EMPTY_SLOT
                    : w
                )
              );
            }, 15000);
          } catch (err) {
            addLog("error", `find_substitute failed: ${err.message}`);
            if (loadingSlot >= 0) {
              setWidgets((prev) => {
                const next = [...prev];
                if (next[loadingSlot]?.type === "loading") next[loadingSlot] = EMPTY_SLOT;
                return next;
              });
            }
          }
        })();
      }

      if (fc.name === "how_to") {
        const { task } = fc.args || {};
        addLog("info", `Tool: how_to("${task}")`);

        // Camera flash
        setIsCapturing(true);
        setTimeout(() => setIsCapturing(false), 500);

        // Show loading widget
        let loadingSlot = -1;
        setWidgets((prev) => {
          const slot = prev.findIndex((w) => w.type === "empty");
          if (slot === -1) return prev;
          loadingSlot = slot;
          const next = [...prev];
          next[slot] = { type: "loading", data: {}, context: "how_to", active: true };
          return next;
        });

        // Capture frame
        const frameB64 = captureFrameRef.current?.();

        // Respond immediately to unblock Gemini
        session.sendToolResponse({
          functionResponses: [{ id: fc.id, name: fc.name, response: { output: "Generating your visual guide, it'll appear on screen in a moment!" } }],
        });

        (async () => {
          try {
            const systemPrompt = HOW_TO_SYSTEM_PROMPT.replace("TASK_PLACEHOLDER", task);
            const parts = frameB64
              ? [
                  { inlineData: { mimeType: "image/jpeg", data: frameB64 } },
                  { text: task },
                ]
              : [{ text: task }];

            const response = await geminiAI.models.generateContent({
              model: HOW_TO_MODEL,
              contents: [{ role: "user", parts }],
              config: {
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: { aspectRatio: "16:9", imageSize: "512" },
                thinkingConfig: { thinkingLevel: "MINIMAL" },
                tools: [{ googleSearch: {} }],
                systemInstruction: systemPrompt,
              },
            });

            const responseParts = response.candidates?.[0]?.content?.parts || [];
            const imagePart = responseParts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
            const textPart = responseParts.find((p) => p.text);

            const imageDataUrl = imagePart
              ? `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
              : null;
            const description = textPart?.text?.trim() || "";

            addLog("recv", `how_to raw response: ${JSON.stringify(response.candidates?.[0]?.content?.parts?.map((p) => p.text ? { text: p.text } : { inlineData: { mimeType: p.inlineData?.mimeType, size: p.inlineData?.data?.length } }))}`);
            addLog("recv", `how_to description: "${description}"`);

            // Update widget: loading → how_to
            setWidgets((prev) => {
              const next = [...prev];
              const slot = loadingSlot >= 0 && loadingSlot < next.length ? loadingSlot : next.findIndex((w) => w.type === "loading");
              if (slot === -1) return prev;
              next[slot] = {
                type: "how_to",
                data: { image: imageDataUrl, task },
                context: null,
                active: true,
              };
              return next;
            });

            enqueueResult({ type: "how_to", task, description });

            // Auto-remove after 30 seconds
            setTimeout(() => {
              setWidgets((prev) =>
                prev.map((w) =>
                  w.type === "how_to" && w.data?.task === task ? EMPTY_SLOT : w
                )
              );
            }, 30000);
          } catch (err) {
            addLog("error", `how_to failed: ${err.message}`);
            if (loadingSlot >= 0) {
              setWidgets((prev) => {
                const next = [...prev];
                if (next[loadingSlot]?.type === "loading") next[loadingSlot] = EMPTY_SLOT;
                return next;
              });
            }
          }
        })();
      }

      if (fc.name === "list_item") {
        const { step_name, items } = fc.args || {};
        addLog("info", `Tool: list_item("${step_name}", ${items?.length} items)`);

        let placed = false;
        setWidgets((prev) => {
          const slot = prev.findIndex((w) => w.type === "empty");
          if (slot === -1) return prev;
          placed = true;
          const next = [...prev];
          next[slot] = { type: "item_list", data: { step_name, items }, context: null, active: true };
          return next;
        });

        setTimeout(() => {
          session.sendToolResponse({
            functionResponses: [{ id: fc.id, name: fc.name, response: {
              output: placed
                ? `Showing ${items?.length} items for "${step_name}" on screen.`
                : "All widget slots are in use. Tell the user to wait for a widget to close.",
            }}],
          });

          if (placed) {
            setTimeout(() => {
              setWidgets((prev) =>
                prev.map((w) =>
                  w.type === "item_list" && w.data?.step_name === step_name ? EMPTY_SLOT : w
                )
              );
            }, 20000);
          }
        }, 0);
      }

      if (fc.name === "set_goals") {
        const { steps } = fc.args;
        const isReconnect = tutorialStepsRef.current.length > 0;
        tutorialStepsRef.current = steps;
        if (!isReconnect) {
          currentStepIndexRef.current = 0;
          setCurrentStepIndex(0);
        }
        setTutorialSteps(steps);
        const idx = currentStepIndexRef.current;
        session.sendToolResponse({
          functionResponses: [{
            id: fc.id, name: fc.name,
            response: { output: isReconnect
              ? `Tutorial restored! ${steps.length} steps. Currently on step ${idx + 1}: ${steps[idx]?.step_name}.`
              : `Tutorial set! ${steps.length} steps. Step 1: ${steps[0]?.step_name}.`
            }
          }],
        });
      }

      if (fc.name === "check_current_step") {
        const idx = currentStepIndexRef.current;
        const step = tutorialStepsRef.current[idx];
        const total = tutorialStepsRef.current.length;
        session.sendToolResponse({
          functionResponses: [{
            id: fc.id, name: fc.name,
            response: { output: step
              ? `Currently on step ${idx + 1} of ${total}: "${step.step_name}". ${step.description}`
              : "No tutorial loaded." }
          }],
        });
      }

      if (fc.name === "check_next_step") {
        const nextIdx = currentStepIndexRef.current + 1;
        const next = tutorialStepsRef.current[nextIdx];
        const total = tutorialStepsRef.current.length;
        session.sendToolResponse({
          functionResponses: [{
            id: fc.id, name: fc.name,
            response: { output: next
              ? `Next is step ${nextIdx + 1} of ${total}: "${next.step_name}". ${next.description}`
              : "Already on the last step!" }
          }],
        });
      }

      if (fc.name === "next_step") {
        const newIdx = Math.min(
          currentStepIndexRef.current + 1,
          tutorialStepsRef.current.length - 1
        );
        currentStepIndexRef.current = newIdx;
        setCurrentStepIndex(newIdx);
        const step = tutorialStepsRef.current[newIdx];
        // Dismiss any ingredient list — user is moving on
        setWidgets((prev) => prev.map((w) => w.type === "item_list" ? EMPTY_SLOT : w));
        session.sendToolResponse({
          functionResponses: [{
            id: fc.id, name: fc.name,
            response: { output: `Now on step ${newIdx + 1}: ${step?.step_name}.` }
          }],
        });
      }
    },
    [addLog, enqueueResult]
  );

  const onSetupComplete = useCallback(() => {
    if (pendingInjectRef.current) {
      const text = pendingInjectRef.current;
      pendingInjectRef.current = null;
      pendingTutorialStepsRef.current = null;
      geminiRef.current?.sendText(text);
    } else if (tutorialStepsRef.current.length > 0) {
      // Reconnect — restore context
      const steps = tutorialStepsRef.current;
      const idx = currentStepIndexRef.current;
      geminiRef.current?.sendText(
        `[TUTORIAL_RESUMED] Session reconnected. The tutorial has ${steps.length} steps: ${JSON.stringify(steps)}. The user is currently on step ${idx + 1}: "${steps[idx]?.step_name}". Please call set_goals to restore your tool state, then briefly acknowledge you're back.`
      );
    }
  }, []);

  const gemini = useGeminiLive({
    onAudio,
    onTranscript,
    onInterrupted,
    onTurnComplete,
    onToolCall,
    onLog: addLog,
    onSetupComplete,
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
    // Play alarm chime then TTS announcement
    playAlarmChime();
    speakTTS(`Hey, your ${label} timer just went off! Time to check on it.`);
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
  }, [addLog, speakTTS]);

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
    setTutorialError("");

    if (youtubeUrl) {
      setTutorialLoading(true);
      setTutorialLoadingStage(0);

      const STAGE_DELAYS = [1800, 3500, 5500]; // ms to advance to stages 1, 2, 3
      const stageTimers = STAGE_DELAYS.map((delay, i) =>
        setTimeout(() => setTutorialLoadingStage(i + 1), delay)
      );

      const normalizedUrl = normalizeYouTubeUrl(youtubeUrl);
      const steps = await analyzeTutorial(normalizedUrl);
      stageTimers.forEach(clearTimeout);
      setTutorialLoading(false);
      if (!steps) return; // tutorialError already set
      pendingTutorialStepsRef.current = steps;
      pendingInjectRef.current = `[TUTORIAL_LOADED] I've analyzed your tutorial. It has ${steps.length} steps: ${JSON.stringify(steps)}. Please call set_goals now with these steps.`;
    }

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
    setVoiceStateSync("listening");
  };

  // Splash screen
  if (!started) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 bg-surface">
        <h1 className="text-5xl font-bold text-text-primary">
          Sigma
        </h1>
        <p className="text-text-secondary text-lg">Your hands-free cooking companion</p>

        {tutorialLoading ? (
          <TutorialLoadingStages stage={tutorialLoadingStage} />
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 w-full max-w-sm">
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => { setYoutubeUrl(e.target.value); setTutorialError(""); }}
                placeholder="Paste a YouTube tutorial link (optional)"
                className="w-full px-4 py-2.5 rounded-full border border-border bg-card text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:border-text-primary transition-colors"
              />
              {tutorialError && (
                <p className="text-accent-red text-xs text-center">{tutorialError}</p>
              )}
            </div>

            <button
              onClick={handleStart}
              className="px-8 py-3 bg-text-primary hover:bg-black text-white font-semibold text-base rounded-full transition-colors"
            >
              Start Cooking
            </button>
          </>
        )}
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
          maxHeight: tutorialSteps.length > 0 ? "calc(100vh - 220px)" : "calc(100vh - 120px)",
        }}
      >
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-3">
          <CameraWidget videoRef={camera.videoRef} isCapturing={isCapturing} />
          {widgets.map((slot, i) => (
            <WidgetManager key={i} slot={slot} onTimerDone={onTimerDone} />
          ))}
        </div>
      </div>

      {/* Tutorial progress bar — below grid so it's never clipped by browser chrome */}
      {tutorialSteps.length > 0 && (
        <TutorialProgressBar steps={tutorialSteps} currentIndex={currentStepIndex} />
      )}

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
