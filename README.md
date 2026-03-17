# Sigma — Hands-Free AI Cooking Companion

> **Gemini Live Agent Challenge — Live Agents Category**

[![Live Agents](https://img.shields.io/badge/Category-Live%20Agents-4285F4?style=flat-square&logo=google)](https://geminiliveagentchallenge.devpost.com)
[![Gemini Live API](https://img.shields.io/badge/Gemini-Live%20API-34A853?style=flat-square&logo=google)](https://ai.google.dev)
[![Google Cloud](https://img.shields.io/badge/Cloud-Vertex%20AI-EA4335?style=flat-square&logo=googlecloud)](https://cloud.google.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat-square&logo=react)](https://react.dev)

---

#GeminiLiveAgentChallenge

## What is Sigma?

A real-time, multimodal AI cooking assistant that lives in your browser. Your hands are covered in flour — you can't type. Your eyes are on the pan — you can't read a recipe. Sigma listens, watches, and responds with **voice + vision**, no screen touching required.

Now unlocked to guide through any YouTube tutorial.

**This is not a chatbot. There is no text box. Sigma is entirely hands-free.**

---

## Demo

> 📹 [Watch the 3-minute demo](<!-- add video link here -->)

---

## Why This Is Different

| Traditional Cooking App | Sigma |
|---|---|
| You type a question | You say it aloud |
| You read the answer | Sigma speaks back |
| You tap "next step" | You say "next" |
| Static recipe page | Live camera awareness |
| Single model | 6 Gemini models orchestrated in parallel |

---

## Features

### Voice + Vision
- Bidirectional audio via Gemini Live API — 16kHz PCM in, 24kHz out via AudioWorklet
- Barge-in detection, session resumption, real-time transcription
- 1 FPS camera feed streamed to Gemini for continuous kitchen awareness

### 8 Agentic Tools

| Tool | Trigger | What Happens |
|---|---|---|
| `set_timer` | "set a 5 minute timer" | Countdown widget |
| `find_object` | "where's the garlic?" | Camera → bbox detection → overlay |
| `find_substitute` | "I'm out of lemongrass" | Google Search grounding + camera check |
| `how_to` | "how do I dice an onion?" | Illustrated 4-step guide generated |
| `list_item` | "what do I need?" | Ingredient/tool list widget |
| `set_goals` | YouTube tutorial loaded | Steps parsed into progress tracker |
| `check_current_step` / `check_next_step` | "what step am I on?" | Returns tutorial state |
| `next_step` | "I'm done with this" | Advances tutorial index |

### Tutorial Mode
Paste a YouTube URL → Gemini 3.1 Pro watches the full video → extracts structured steps → navigate hands-free with voice.

---

## 🏗️ Architecture

> **Zero-backend** — all orchestration runs client-side. No server, no database.

### System overview

```mermaid
flowchart TB
    subgraph USER["👤 User"]
        MIC["🎤 Microphone<br/><i>PCM 16kHz</i>"]
        CAM["📷 Camera<br/><i>JPEG 768px · 1 FPS</i>"]
        SPK["🔊 Speaker<br/><i>PCM 24kHz</i>"]
        SCREEN["🖥️ Screen<br/><i>Widget display</i>"]
    end

    subgraph BROWSER["⚛️ Browser Client · React 18 + Vite"]
        direction TB

        subgraph HOOKS["Custom Hooks"]
            GEMINI_HOOK["useGeminiLive<br/><i>WebSocket session<br/>auto-reconnect · resumption</i>"]
            AUDIO_HOOK["useAudioStream<br/><i>AudioWorklet PCM codec<br/>16kHz ↑ · 24kHz ↓<br/>FFT analyser</i>"]
            CAM_HOOK["useCamera<br/><i>1 FPS capture loop<br/>on-demand full-res</i>"]
        end

        subgraph ORCHESTRATOR["🧠 App.jsx — Orchestrator"]
            DISPATCH["Tool Dispatcher<br/><i>Routes to sub-agents</i>"]
            QUEUE["Result Queue<br/><i>FIFO · drains on idle</i>"]
            STATE["Voice State Machine<br/><i>idle → listening →<br/>speaking → listening</i>"]
        end

        subgraph WIDGETS["📊 Widget Manager · 3 Slots"]
            W_TIMER["⏱️ Timer"]
            W_BBOX["🔲 BBox"]
            W_SEARCH["🔍 Search"]
            W_HOWTO["🎨 How-to"]
            W_LIST["📋 Item List"]
            W_LOADING["⏳ Loading"]
        end

        TUTORIAL["📚 Tutorial Engine<br/><i>Step tracking + progress bar</i>"]
        VOICE_VIZ["🎙️ VoiceIndicator<br/><i>40-bar FFT waveform</i>"]
    end

    subgraph GEMINI["☁️ Gemini Cloud"]
        direction TB

        subgraph CONDUCTOR["🎯 Conductor"]
            LIVE["Gemini Live 2.5 Flash<br/><i>WebSocket · bidirectional<br/>voice + vision + tool calling</i>"]
        end

        subgraph BBOX_AGENT["🔲 BBox Agent"]
            BBOX_MODEL["Gemini 3 Flash Preview<br/><i>+ Code Execution</i>"]
            CODE_EXEC["Python Sandbox (gVisor)<br/><i>Runs OpenCV bbox code<br/>inside Gemini's runtime<br/>No external Vision API</i>"]
            BBOX_MODEL --> CODE_EXEC
        end

        subgraph SUB_AGENT["🔍 Substitute Agent"]
            SUB_MODEL["Gemini 3.1 Flash<br/><i>+ Google Search Grounding</i>"]
            VISION_CHECK["Vision Follow-up<br/><i>Camera availability check</i>"]
            SUB_MODEL --> VISION_CHECK
        end

        subgraph HOWTO_AGENT["🎨 How-To Agent"]
            HOWTO_MODEL["Gemini 3.1 Flash Image<br/><i>Nano Banana Pro<br/>Illustrated guide gen</i>"]
        end

        subgraph TUTORIAL_AGENT["📚 Tutorial Analyzer"]
            TUTORIAL_MODEL["Gemini 3.1 Pro Preview<br/><i>Full YouTube video<br/>multimodal understanding</i>"]
        end

    end

    MIC -- "PCM 16kHz" --> AUDIO_HOOK
    CAM -- "MediaStream" --> CAM_HOOK
    AUDIO_HOOK -- "PCM 24kHz" --> SPK
    WIDGETS --> SCREEN

    AUDIO_HOOK -- "base64 chunks" --> GEMINI_HOOK
    CAM_HOOK -- "base64 JPEG" --> GEMINI_HOOK
    GEMINI_HOOK -- "audio out" --> AUDIO_HOOK
    GEMINI_HOOK -- "tool calls" --> DISPATCH
    DISPATCH -- "widget updates" --> WIDGETS
    DISPATCH -- "async results" --> QUEUE
    QUEUE -- "[BACKGROUND_RESULT]<br/>re-inject on idle" --> GEMINI_HOOK

    GEMINI_HOOK <== "WebSocket<br/>audio + video + text" ==> LIVE
    DISPATCH -. "REST async" .-> BBOX_MODEL
    DISPATCH -. "REST async" .-> SUB_MODEL
    DISPATCH -. "REST async" .-> HOWTO_MODEL
    DISPATCH -. "REST async" .-> TUTORIAL_MODEL

    style USER fill:#f9fafb,stroke:#d1d5db,color:#111
    style BROWSER fill:#f0fdf4,stroke:#86efac,color:#111
    style GEMINI fill:#faf5ff,stroke:#c4b5fd,color:#111
    style CONDUCTOR fill:#ede9fe,stroke:#8b5cf6,color:#111
    style BBOX_AGENT fill:#dcfce7,stroke:#4ade80,color:#111
    style SUB_AGENT fill:#fef3c7,stroke:#f59e0b,color:#111
    style HOWTO_AGENT fill:#ffe4e6,stroke:#fb7185,color:#111
    style TUTORIAL_AGENT fill:#dbeafe,stroke:#3b82f6,color:#111
    style HOOKS fill:#ecfdf5,stroke:#6ee7b7,color:#111
    style ORCHESTRATOR fill:#ecfdf5,stroke:#6ee7b7,color:#111
    style WIDGETS fill:#ecfdf5,stroke:#6ee7b7,color:#111
```

### Why each model?

| Model | Role | Why this one? |
|---|---|---|
| **Gemini Live 2.5 Flash** | Conductor — voice conversation + tool calling | Native audio WebSocket, lowest latency, built-in session resumption |
| **Gemini 3 Flash Preview** | Bounding box detection | **Code Execution** — runs Python/OpenCV in Gemini's own gVisor sandbox to compute bbox coords. No external Vision API needed. Simple model is enough for object detection |
| **Gemini 3.1 Flash** | Substitute finder | **Google Search Grounding** — real-time web data for cooking substitutes. Flash is fast enough — no deep reasoning needed for "what replaces X?" |
| **Gemini 3.1 Flash Image** | How-to illustrated guides | **Nano Banana Pro** — native image gen with legible text, preserves camera frame assets as reference |
| **Gemini 3.1 Pro Preview** | YouTube tutorial analysis | **Most capable multimodal model** — watches full video (visual + audio + captions), extracts structured steps. Pro-level reasoning needed for unstructured tutorial content |
| **Gemini 2.5 Flash TTS** | Timer announcements | Dedicated TTS endpoint — bypasses live session so timers fire even mid-conversation |

### Voice state machine

```mermaid
stateDiagram-v2
    [*] --> IDLE: App starts
    IDLE --> LISTENING: Gemini connected
    LISTENING --> SPEAKING: onAudio received
    SPEAKING --> LISTENING: onTurnComplete
    LISTENING --> TOOL_RECEIVED: toolCall event
    SPEAKING --> INTERRUPTED: user speaks
    INTERRUPTED --> LISTENING: audio flushed

    state TOOL_RECEIVED {
        [*] --> IMMEDIATE_RESPONSE
        IMMEDIATE_RESPONSE --> SHOW_LOADING: place widget
        SHOW_LOADING --> FIRE_SUB_AGENT: async REST
        FIRE_SUB_AGENT --> WAITING: processing
        WAITING --> UPDATE_WIDGET: result
        UPDATE_WIDGET --> ENQUEUE_RESULT: push to queue
    }

    TOOL_RECEIVED --> LISTENING: unblocks Gemini

    state QUEUE_DRAIN {
        [*] --> CHECK_STATE
        CHECK_STATE --> INJECT: listening
        CHECK_STATE --> WAIT: not listening
        WAIT --> CHECK_STATE: onTurnComplete
        INJECT --> [*]: sendClientContent
    }

    ENQUEUE_RESULT --> QUEUE_DRAIN
    QUEUE_DRAIN --> LISTENING: result injected
```

### Tool dispatch flow

```mermaid
sequenceDiagram
    actor U as 👤 User
    participant S as 🎯 Sigma<br/>Live 2.5 Flash
    participant O as 🧠 Orchestrator
    participant W as 📊 Widget
    participant A as 🔲 BBox Agent<br/>3 Flash + Code Exec
    participant Q as 📬 Queue

    U->>S: 🎤 "where's the garlic?"
    S->>O: toolCall: find_object("garlic")
    O->>S: ⚡ "Searching..."
    Note over S: Unblocked — keeps talking

    par Parallel execution
        O->>W: slot = loading
        O->>A: camera frame + prompt
        Note over A: Code Execution runs<br/>Python in gVisor sandbox<br/>→ bbox coords [y,x,y,x]
        A-->>O: JSON bbox results
    end

    O->>W: loading → bbox overlay
    O->>Q: enqueue result

    alt Conductor idle
        Q->>O: dequeue
        O->>S: [BACKGROUND_RESULT] Found garlic
        S->>U: 🔊 "Found it — right by the cutting board!"
    else Conductor busy
        Note over Q: Wait for onTurnComplete...
        S-->>O: turn complete
        O->>S: [BACKGROUND_RESULT] Found garlic
        S->>U: 🔊 "Oh, spotted your garlic!"
    end

    W->>W: auto-dismiss (15s)
```

### Substitute search — Google Search grounding

```mermaid
sequenceDiagram
    actor U as 👤 User
    participant S as 🎯 Sigma
    participant O as 🧠 Orchestrator
    participant F as 🔍 3.1 Flash<br/>+ Google Search
    participant V as 👁️ Vision Check
    participant W as 📊 Widget

    U->>S: 🎤 "I don't have lemongrass"
    S->>O: find_substitute("lemongrass")
    O->>S: ⚡ "Searching..."

    O->>F: query + Google Search grounding
    Note over F: Flash is fast enough —<br/>no reasoning needed<br/>for substitute lookup.<br/>Google Search provides<br/>real-time cooking data.
    F-->>O: ranked substitutes + ratios

    O->>V: camera frame + "which are visible?"
    V-->>O: ginger: visible, lemon zest: not found

    O->>W: search widget (subs + availability)
    O->>S: [BACKGROUND_RESULT] Best: ginger (visible)
    S->>U: 🔊 "Ginger works — and you've got some!"
```

### Tutorial analysis — Gemini 3.1 Pro

```mermaid
sequenceDiagram
    actor U as 👤 User
    participant APP as ⚛️ Start Screen
    participant PRO as 📚 3.1 Pro Preview
    participant S as 🎯 Sigma

    U->>APP: Paste YouTube URL
    APP->>PRO: fileData: {fileUri: url}

    Note over PRO: Why 3.1 Pro?<br/>Most capable multimodal model.<br/>Watches full video —<br/>visual + audio + captions.<br/>Pro reasoning extracts<br/>structured steps from<br/>unscripted content.

    PRO-->>APP: JSON: [{step_number, step_name,<br/>timestamp, description}, ...]

    APP->>S: [TUTORIAL_LOADED] + steps
    S->>S: set_goals(steps)
    S->>U: 🔊 "Tutorial loaded! 8 steps.<br/>Let's start with Step 1!"
```

### Widget slot lifecycle

```mermaid
stateDiagram-v2
    [*] --> EMPTY
    EMPTY --> LOADING: tool dispatched
    LOADING --> TIMER: set_timer
    LOADING --> BBOX: find_object
    LOADING --> SEARCH: find_substitute
    LOADING --> HOW_TO: how_to
    LOADING --> ITEM_LIST: list_item

    TIMER --> TIMER_DONE: countdown = 0
    TIMER_DONE --> EMPTY: 5s
    BBOX --> EMPTY: 15s
    SEARCH --> EMPTY: 15s
    HOW_TO --> EMPTY: 30s
    ITEM_LIST --> EMPTY: next_step or 20s

    note right of TIMER_DONE: 🔔 Alarm chime<br/>+ TTS announcement
```

---

## Key Design Decisions

| Decision | Why |
|---|---|
| **Zero backend** | All API calls from browser — no server, no infra cost |
| **Fire-and-forget tools** | Immediate placeholder unblocks voice — no silence |
| **Code execution for bbox** | Python runs inside Gemini's sandbox — no external Vision API |
| **Google Search grounding** | Real-time web data — recipes change, training data doesn't |
| **3.1 Flash for substitutes** | Fast enough — "what replaces X" doesn't need reasoning |
| **3.1 Pro for tutorials** | Only model that watches full YouTube video multimodally |
| **Separate TTS agent** | Timer announcements fire even mid-conversation |
| **Result injection queue** | Sub-agent results wait for idle — no mid-sentence interrupts |
| **3-slot widget system** | `empty → loading → result → auto-dismiss` lifecycle |

---

## Project Structure

```
sigma/
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Orchestrator + tool dispatch
│   │   ├── hooks/
│   │   │   ├── useGeminiLive.js        # Gemini Live WebSocket client
│   │   │   ├── useCamera.js            # Camera stream + frame capture
│   │   │   └── useAudioStream.js       # PCM audio I/O via AudioWorklet
│   │   └── components/
│   │       ├── CameraWidget.jsx        # Live feed + flash animation
│   │       ├── TimerWidget.jsx         # Countdown + drain bar
│   │       ├── BBoxWidget.jsx          # Bounding box overlay
│   │       ├── SearchWidget.jsx        # Substitute display
│   │       ├── HowToWidget.jsx         # Illustrated guide
│   │       ├── VoiceIndicator.jsx      # FFT waveform canvas
│   │       └── TutorialProgressBar.jsx
│   ├── public/
│   │   ├── pcm-recorder-processor.js   # AudioWorklet: mic → 16kHz PCM
│   │   └── pcm-player-processor.js     # AudioWorklet: 24kHz PCM → speaker
│   └── .env                            # VITE_GEMINI_API_KEY
└── README.md
```

---

## Getting Started

```bash
cd frontend
npm install
```

Create `frontend/.env`:
```
VITE_GEMINI_API_KEY=your_google_ai_studio_key_here
```

```bash
npm run dev
```

Open `http://localhost:5173`, grant mic + camera, start talking.

For **Tutorial Mode**: paste a YouTube URL on the splash screen before starting.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | Tailwind CSS 3.4 |
| Animation | Framer Motion 12 |
| Gemini SDK | @google/genai 1.45 |
| Audio | Web Audio API + AudioWorklet |

---

## What I Learned

**Background tasks + result injection is the key pattern.** Respond immediately, run heavy tasks async, inject results as `[BACKGROUND_RESULT]` on the next idle turn. Conversation never blocks.

**Context window compression matters.** Long cooking sessions accumulate context. `SlidingWindow` compression prevents degradation over 30-60 minute sessions.

**Multi-model orchestration needs clear handoffs.** Each model returns different formats. A clean dispatch layer with a FIFO result queue prevents race conditions.

---

## License

MIT
