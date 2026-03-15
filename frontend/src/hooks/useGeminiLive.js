import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI } from "@google/genai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

const SYSTEM_INSTRUCTION = `You are Sigma, a warm, patient, and encouraging cooking companion.

PERSONALITY:
- You're like a best friend who happens to be great at cooking
- You're cheerful but not annoying — read the room
- You celebrate small wins: "Nice knife work!" "That looks perfect!"
- You're calm when things go wrong: "No worries, we can fix that"
- You use casual, conversational language — never robotic

BEHAVIOR:
- Keep responses SHORT (1-2 sentences for most things). The user is cooking!
- Be PROACTIVE: if you see something concerning (smoke, overflowing pot), warn them immediately
- When multiple things are asked at once, prioritize safety first, then urgency, then curiosity
- Always confirm actions clearly
- If you're not sure about something, say so honestly

You can see through the user's camera and hear them speak. They are cooking hands-free, so keep things brief and helpful.

CAPABILITIES:
- set_timer: Set countdown timers for cooking tasks.
- IMPORTANT: You MUST call the set_timer tool ANY time the user mentions a timer, countdown, or timing something. NEVER just say you'll set a timer — ALWAYS make the tool call. Examples: "set a timer", "time this for 5 minutes", "remind me in 30 seconds", "let's do 2 minutes for the eggs".
- After calling set_timer, confirm it briefly with voice: "Got it, X minutes for the Y!"
- When a timer completes, you'll be notified via a system message. Announce it warmly and remind the user what to do, e.g. "Your eggs timer is done! Don't forget to take them out!"

- find_object: Visually locate and highlight objects/ingredients on the user's camera.
- IMPORTANT: You MUST call find_object ANY time the user asks to find, locate, spot, or show an object or ingredient. Examples: "where is the salt?", "show me the fish sauce", "can you find the garlic?", "which one is the cilantro?".
- After calling find_object, you will receive a result telling you what was found. Announce it naturally, e.g. "Here's the fish sauce — it's right there on your left!" or "I've highlighted the garlic for you!". Be specific about the location if the result mentions it.
- If the object was NOT found, say so kindly: "Hmm, I don't see the salt in the frame. Can you move the camera a bit?"`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "set_timer",
        description: "Set a countdown timer for a cooking task. Use when the user asks to time something like boiling, simmering, baking, etc.",
        parameters: {
          type: "object",
          properties: {
            seconds: {
              type: "integer",
              description: "Duration in seconds",
            },
            label: {
              type: "string",
              description: "What this timer is for, e.g. 'boil pasta', 'rice', 'eggs'",
            },
          },
          required: ["seconds"],
        },
      },
      {
        name: "find_object",
        description: "Visually locate and highlight an object or ingredient on the user's camera. Use when the user asks where something is, asks you to find/spot/show something, or wants to identify items visible on camera.",
        parameters: {
          type: "object",
          properties: {
            object_name: {
              type: "string",
              description: "The object or ingredient to find, e.g. 'fish sauce', 'salt', 'galangal'",
            },
          },
          required: ["object_name"],
        },
      },
    ],
  },
];

export default function useGeminiLive({ onAudio, onTranscript, onInterrupted, onTurnComplete, onToolCall, onLog }) {
  const sessionRef = useRef(null);
  const [status, setStatus] = useState("disconnected"); // disconnected | connecting | connected

  const connect = useCallback(async () => {
    if (sessionRef.current) return;
    if (!API_KEY) {
      onLog?.("error", "VITE_GEMINI_API_KEY not set in .env");
      return;
    }

    setStatus("connecting");
    onLog?.("info", "Connecting to Gemini Live...");

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });

      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: ["audio"],
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          speechConfig: {
            languageCode: "en-US",
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: {},
          tools: TOOLS,
        },
        callbacks: {
          onopen: () => {
            setStatus("connected");
            onLog?.("info", "Gemini Live connected");
          },
          onmessage: (message) => {
            if (message.setupComplete) {
              onLog?.("info", "Setup complete");
              return;
            }

            // Tool calls from Gemini
            if (message.toolCall) {
              onLog?.("recv", `toolCall: ${JSON.stringify(message.toolCall)}`);
              const { functionCalls } = message.toolCall;
              if (functionCalls) {
                for (const fc of functionCalls) {
                  onToolCall?.(fc, session);
                }
              }
              return;
            }

            const content = message.serverContent;
            if (!content) return;

            // Audio chunks
            if (content.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
                  const data = base64ToArrayBuffer(part.inlineData.data);
                  onAudio?.(data);
                }
              }
            }

            // Turn complete
            if (content.turnComplete) {
              onTurnComplete?.();
              onLog?.("recv", "turn_complete");
            }

            // Interruption
            if (content.interrupted) {
              onInterrupted?.();
              onLog?.("recv", "interruption");
            }

            // Transcriptions
            if (content.inputTranscription?.text) {
              onTranscript?.("user", content.inputTranscription.text);
              onLog?.("recv", `transcript [user]: ${content.inputTranscription.text}`);
            }
            if (content.outputTranscription?.text) {
              onTranscript?.("assistant", content.outputTranscription.text);
              onLog?.("recv", `transcript [assistant]: ${content.outputTranscription.text}`);
            }
          },
          onerror: (error) => {
            onLog?.("error", `Gemini error: ${error.message || error}`);
          },
          onclose: (event) => {
            setStatus("disconnected");
            sessionRef.current = null;
            onLog?.("info", `Gemini disconnected${event.reason ? `: ${event.reason}` : ""}`);
          },
        },
      });

      sessionRef.current = session;
    } catch (e) {
      setStatus("disconnected");
      onLog?.("error", `Connection failed: ${e.message}`);
    }
  }, [onAudio, onTranscript, onInterrupted, onTurnComplete, onLog]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setStatus("disconnected");
  }, []);

  const sendAudio = useCallback((base64) => {
    sessionRef.current?.sendRealtimeInput({
      audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
    });
  }, []);

  const sendVideo = useCallback((base64) => {
    sessionRef.current?.sendRealtimeInput({
      video: { data: base64, mimeType: "image/jpeg" },
    });
  }, []);

  const sendToolResponse = useCallback((functionResponses) => {
    sessionRef.current?.sendToolResponse({ functionResponses });
  }, []);

  const sendText = useCallback((text) => {
    sessionRef.current?.sendClientContent({ turns: { parts: [{ text }] }, turnComplete: true });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  return { status, connect, disconnect, sendAudio, sendVideo, sendToolResponse, sendText };
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new ArrayBuffer(binary.length);
  const view = new Uint8Array(bytes);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return bytes;
}
