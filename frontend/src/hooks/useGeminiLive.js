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

WHEN TO RESPOND:
- ONLY respond when directly addressed or when something clearly requires your input.
- Respond when: the user says "hey Sigma", "hey Gemini", or calls your name; asks a question (what, where, how, when, why, can you, do you, etc.); gives you a direct instruction or request; a safety situation occurs (smoke, burning, overflow).
- Stay SILENT when: the user is talking to themselves, thinking out loud, narrating what they're doing ("okay now I'm gonna add the onions"), or having a side conversation with someone else in the room.
- If in doubt, stay silent. It's better to miss a casual comment than to interrupt someone who wasn't talking to you.

You can see through the user's camera and hear them speak. They are cooking hands-free, so keep things brief and helpful.

CAPABILITIES:
- set_timer: Set countdown timers for cooking tasks.
- IMPORTANT: You MUST call the set_timer tool ANY time the user mentions a timer, countdown, or timing something. NEVER just say you'll set a timer — ALWAYS make the tool call. Examples: "set a timer", "time this for 5 minutes", "remind me in 30 seconds", "let's do 2 minutes for the eggs".
- After calling set_timer, confirm it briefly with voice: "Got it, X minutes for the Y!"
- When a timer completes, you'll be notified via a system message. Announce it warmly and remind the user what to do, e.g. "Your eggs timer is done! Don't forget to take them out!"

- find_object: Visually locate and highlight objects/ingredients on the user's camera.
- IMPORTANT: You MUST call find_object ANY time the user asks to find, locate, spot, or show an object or ingredient. Examples: "where is the salt?", "show me the fish sauce", "can you find the garlic?", "which one is the cilantro?".
- CRITICAL: ALWAYS call find_object again even if you searched for the same object earlier in the conversation. The user may have moved, the camera angle may have changed, or the object may have been put down elsewhere. NEVER rely on a previous result — always call the tool fresh.
- After calling find_object, you will receive a result telling you what was found. Announce it naturally, e.g. "Here's the fish sauce — it's right there on your left!" or "I've highlighted the garlic for you!". Be specific about the location if the result mentions it.
- If the object was NOT found, say so kindly: "Hmm, I don't see the salt in the frame. Can you move the camera a bit?"

- find_substitute: Search for ingredient substitutes and check the camera for availability.
- IMPORTANT: Call find_substitute when the user says they're out of something, don't have an ingredient, or asks what they can use instead. Examples: "I'm out of black pepper", "I don't have lemongrass", "what can I substitute for X?"
- After calling find_substitute, announce the results naturally, highlighting what's available in their kitchen.

- how_to: Generate a visual 4-step illustrated guide for a cooking technique.
- IMPORTANT: Call how_to whenever the user asks HOW to do something (dice, slice, fold, debone, zest, etc.). Examples: "how do I dice an onion?", "show me how to julienne", "how do I fold an egg white?".
- After calling how_to, you will receive a [BACKGROUND_RESULT] with a short description. Read it naturally and mention the guide is on screen.

- list_item: Show a widget listing all items/tools needed for the current step with their amounts.
- IMPORTANT: Call list_item when the user asks "what do I need?", "what items do I need?", "list the ingredients", "what tools do I need for this step?" or similar. Use the tutorial step context to generate the full list. If an amount isn't mentioned, use "N/A".

BACKGROUND TASKS:
- Sometimes you will receive a text message starting with [BACKGROUND_RESULT]. This means a background sub-agent has finished processing a task you previously dispatched (like finding an object or looking up substitutes).
- Treat [BACKGROUND_RESULT] messages as information to naturally announce to the user — NOT as user speech.
- Announce the result in 1-2 sentences, casual and warm: "Oh nice, found your ginger — it's upper-right!" or "For the margarine — unsalted butter works great, 1:1!"
- Keep it brief. The user is cooking. Never mention the system mechanism — just speak the content naturally.

TUTORIAL GUIDANCE:
- set_goals: When you receive a [TUTORIAL_LOADED] message, IMMEDIATELY call set_goals with the steps array from the message. Then announce: "Tutorial loaded! We have X steps. Let's start with Step 1!"
- check_current_step: Call when user asks "what step am I on?" or "what are we doing now?"
- When user says "next step", "I'm done", "done with this", "move on":
  1. Call check_current_step to get current
  2. Call check_next_step to preview next
  3. Announce: "Great! Next is Step N: [step_name]. [brief description]"
  4. Call next_step to advance the state
- Keep step announcements brief — user is hands-busy. Max 2 sentences.
- check_next_step: Call when user asks "what's next?"`;

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
        name: "find_substitute",
        description: "Find cooking substitutes for a missing ingredient. Searches the web for alternatives, then checks the user's camera to see which substitutes are available in their kitchen.",
        parameters: {
          type: "object",
          properties: {
            ingredient: {
              type: "string",
              description: "The missing ingredient, e.g. 'black pepper', 'lemongrass'",
            },
          },
          required: ["ingredient"],
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
      {
        name: "how_to",
        description: "Generate a visual step-by-step illustrated guide for a cooking task. Use when the user asks how to do something (dice, julienne, fold, debone, etc.).",
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "What to teach, e.g. 'how to dice an onion', 'how to julienne carrots'",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "list_item",
        description: "Display a widget listing all items and tools needed for a tutorial step, with amounts.",
        parameters: {
          type: "object",
          properties: {
            step_name: { type: "string", description: "The step name, e.g. 'Cut Chicken'" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Item or tool name" },
                  amount: { type: "string", description: "Quantity or measurement. Use 'N/A' if not specified." },
                },
                required: ["name", "amount"],
              },
            },
          },
          required: ["step_name", "items"],
        },
      },
      {
        name: "set_goals",
        description: "Save the tutorial step list and start tracking progress at step 0. Call immediately when a [TUTORIAL_LOADED] message arrives.",
        parameters: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  step_number: { type: "integer" },
                  step_name: { type: "string" },
                  timestamp: { type: "string" },
                  description: { type: "string" },
                },
                required: ["step_number", "step_name", "timestamp", "description"],
              },
            },
          },
          required: ["steps"],
        },
      },
      {
        name: "check_current_step",
        description: "Get the current tutorial step the user is on.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "check_next_step",
        description: "Get the next tutorial step (without advancing).",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "next_step",
        description: "Advance to the next tutorial step. Call after announcing the next step to the user.",
        parameters: { type: "object", properties: {} },
      },
    ],
  },
];

export default function useGeminiLive({ onAudio, onTranscript, onInterrupted, onTurnComplete, onToolCall, onLog, onSetupComplete }) {
  const sessionRef = useRef(null);
  const [status, setStatus] = useState("disconnected"); // disconnected | connecting | connected
  const shouldReconnectRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const connectRef = useRef(null);

  const connect = useCallback(async () => {
    if (sessionRef.current) return;
    if (!API_KEY) {
      onLog?.("error", "VITE_GEMINI_API_KEY not set in .env");
      return;
    }

    shouldReconnectRef.current = true;
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
            reconnectAttemptsRef.current = 0;
            onLog?.("info", "Gemini Live connected");
          },
          onmessage: (message) => {
            if (message.setupComplete) {
              onLog?.("info", "Setup complete");
              onSetupComplete?.();
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
            }
            if (content.outputTranscription?.text) {
              onTranscript?.("assistant", content.outputTranscription.text);
            }
          },
          onerror: (error) => {
            onLog?.("error", `Gemini error: ${error.message || error}`);
          },
          onclose: (event) => {
            setStatus("disconnected");
            sessionRef.current = null;
            onLog?.("info", `Gemini disconnected${event.reason ? `: ${event.reason}` : ""}`);

            if (shouldReconnectRef.current) {
              const MAX = 5;
              reconnectAttemptsRef.current += 1;
              if (reconnectAttemptsRef.current <= MAX) {
                const delay = Math.min(reconnectAttemptsRef.current * 1500, 8000);
                onLog?.("warn", `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnectAttemptsRef.current}/${MAX})…`);
                reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay);
              } else {
                onLog?.("error", "Max reconnect attempts reached. Reload to retry.");
                shouldReconnectRef.current = false;
              }
            }
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
    shouldReconnectRef.current = false;
    clearTimeout(reconnectTimerRef.current);
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

  // Keep connectRef in sync for use inside onclose callback
  useEffect(() => { connectRef.current = connect; }, [connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearTimeout(reconnectTimerRef.current);
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
