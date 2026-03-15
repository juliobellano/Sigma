# Sigma — Your Hands-Free Cooking Companion

> **Hackathon:** Gemini Live Agent Challenge (Live Agents Track)
> **Core Idea:** A voice-controlled, vision-aware cooking assistant that watches tutorials and your kitchen simultaneously, so you never have to touch the screen.

---

## Project Philosophy

Sigma is not a chatbot. It's a **companion** — like having a patient, knowledgeable friend standing next to you in the kitchen. When your hands are covered in flour and you need to know the next step, you just ask. When you can't find an ingredient, it looks through your camera and points it out. When you need a timer, it just starts one. No typing, no scrolling, no touching the screen.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   Frontend (React + Vite)                 │
│                                                          │
│  ┌─────────────────────┐  ┌────────────────────────┐     │
│  │  Camera Feed         │  │  Dynamic Widget 1      │     │
│  │  (always-on webcam)  │  │  (bbox / image result) │     │
│  ├─────────────────────┤  ├────────────────────────┤     │
│  │  Dynamic Widget 2   │  │  Dynamic Widget 3      │     │
│  │  (recipe steps /    │  │  (timer / search       │     │
│  │   chat / info)      │  │   results / etc.)      │     │
│  └─────────────────────┘  └────────────────────────┘     │
│                                                          │
│  [Voice Activity Indicator — always listening]            │
│                                                          │
│  Audio In:  MediaRecorder -> WebSocket (PCM/opus stream) │
│  Audio Out: WebSocket -> AudioContext playback            │
│  Video In:  Canvas capture -> periodic frame send via WS │
│                                                          │
└──────────────────┬───────────────────────────────────────┘
                   │ WebSocket (bidirectional)
                   │
┌──────────────────▼───────────────────────────────────────┐
│              Backend (Python - Cloud Run)                 │
│                                                          │
│  ┌─────────────────────────────────────────────┐         │
│  │         Gemini Live API Session              │         │
│  │  (persistent audio + video streaming)        │         │
│  │  Model: gemini-2.0-flash-live               │         │
│  │  - Receives: audio chunks + video frames     │         │
│  │  - Sends: audio responses (streaming TTS)    │         │
│  │  - Supports: barge-in / interruption         │         │
│  └──────────────┬──────────────────────────────┘         │
│                 │                                         │
│  ┌──────────────▼──────────────────────────────┐         │
│  │      Orchestrator Agent (ADK LlmAgent)      │         │
│  │      Name: "Sigma"                       │         │
│  │      Role: Route intents to sub-agents,      │         │
│  │            maintain conversation, speak       │         │
│  │                                              │         │
│  │  Tools / Sub-Agents:                         │         │
│  │   ├── TimerTool (function tool)              │         │
│  │   ├── BoundingBoxAgent (AgentTool)           │         │
│  │   └── SubstitutionAgent (AgentTool)          │         │
│  └──────────────────────────────────────────────┘         │
│                                                          │
│  Google Cloud Services:                                  │
│   - Cloud Run (hosting)                                  │
│   - Vertex AI (Gemini API)                               │
│   - Cloud Storage (frame buffer / temp images)           │
│   - Firestore (recipe cache, session state) [optional]   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Widget System Design

The UI has a **2x2 grid**. The top-left is always the camera feed. The other 3 widgets are **dynamic** — they can morph into whatever the current task needs.

### Widget Types

| Widget Type       | Triggered By                          | Content                                      |
|-------------------|---------------------------------------|----------------------------------------------|
| `camera`          | Always on (top-left, fixed)           | Live webcam feed                             |
| `timer`           | "Set a 50 second timer"              | Countdown circle + time remaining            |
| `bbox_result`     | "Where is the galangal?"             | Camera frame with bounding box overlay       |
| `recipe_steps`    | "What's the next step?"             | Step list with current step highlighted      |
| `search_result`   | "What can I substitute for X?"       | Search answer + cabinet check result         |
| `chat`            | General questions                     | Text response card                           |
| `loading`         | Any agent is processing               | Skeleton loader + "Checking..." text         |

### Widget Lifecycle

```
User speaks -> Orchestrator parses intents
  -> Intent 1: Timer       -> Widget slot 1 becomes "timer"      (instant)
  -> Intent 2: Next step   -> Widget slot 2 becomes "loading" -> "recipe_steps"
  -> Intent 3: Find item   -> Widget slot 3 becomes "loading" -> "bbox_result"
```

Widgets are assigned to slots dynamically. When a new task comes in and all 3 dynamic slots are taken, the **oldest completed widget** gets replaced.

### WebSocket Event Schema

All widget updates flow through a single WebSocket as JSON events:

```jsonc
// Backend -> Frontend: Widget update
{
  "type": "widget_update",
  "widget_id": "w1",              // which slot (w1, w2, w3)
  "widget_type": "timer",         // which component to render
  "data": {                       // type-specific payload
    "seconds": 50,
    "label": "Simmer the broth"
  }
}

// Backend -> Frontend: Voice audio chunk
{
  "type": "audio_chunk",
  "data": "<base64 encoded audio>"
}

// Backend -> Frontend: Agent is speaking (for VAD indicator)
{
  "type": "agent_state",
  "state": "speaking" | "listening" | "thinking"
}

// Frontend -> Backend: Audio chunk from mic
{
  "type": "user_audio",
  "data": "<base64 encoded PCM>"
}

// Frontend -> Backend: Camera frame
{
  "type": "camera_frame",
  "data": "<base64 encoded JPEG>",
  "timestamp": 1710567890
}
```

---

## Implementation Phases

---

### Phase 1 — UI Shell + Gemini Live API Connection

**Goal:** Get the 2x2 grid working with live camera, voice input/output, and basic Q&A through Gemini Live API.

#### Frontend Tasks

1. **Set up React + Vite project**
   - Install: `react`, `vite`, `tailwindcss`
   - Create the 2x2 responsive grid layout
   - Top-left widget: Webcam feed using `getUserMedia()` API
   - Other 3 widgets: Empty placeholder cards with "Ready" state

2. **Webcam capture**
   - Access camera via `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`
   - Display live feed in top-left widget via `<video>` element
   - Capture frames periodically (every 1-2 seconds) using a hidden `<canvas>`
   - Convert frame to base64 JPEG for sending to backend

3. **Audio capture + playback**
   - Use `MediaRecorder` or `AudioWorklet` to capture mic audio as PCM chunks
   - Stream audio chunks to backend via WebSocket
   - Receive audio response chunks from backend
   - Play them using `AudioContext` + `AudioBufferSourceNode` for low-latency playback

4. **WebSocket client**
   - Connect to backend WebSocket on load
   - Send: `user_audio` events (mic stream) + `camera_frame` events (periodic snapshots)
   - Receive: `audio_chunk` (agent voice), `widget_update` (dynamic UI), `agent_state`

5. **Voice Activity Detection (VAD) indicator**
   - Show a pulsing mic icon when user is speaking
   - Show a speaking animation when agent is responding
   - Show a thinking indicator when processing

#### Backend Tasks

1. **Set up Python FastAPI + WebSocket server**
   - `pip install fastapi uvicorn websockets google-genai`
   - Single WebSocket endpoint: `ws://host/ws`
   - Handle incoming audio + video frames from frontend

2. **Gemini Live API session**
   - Use `google.genai` SDK to create a Live API session
   - Model: `gemini-2.0-flash-live` (or latest live-capable model)
   - Configure for:
     - Audio input (PCM from user mic)
     - Audio output (TTS responses)
     - Video input (camera frames)
     - Barge-in enabled (user can interrupt)
   - System instruction (first draft):
     ```
     You are Sigma, a warm and encouraging cooking companion.
     You help users follow cooking tutorials hands-free.
     You can see through their camera and hear them speak.
     Keep responses SHORT and conversational — they're cooking!
     Be proactive: if you notice something (smoke, boiling over), warn them.
     Personality: Patient, cheerful, like a supportive friend in the kitchen.
     ```

3. **Stream relay**
   - Forward user audio -> Gemini Live API
   - Forward camera frames -> Gemini Live API (as inline image data)
   - Receive Gemini audio output -> forward to frontend as `audio_chunk` events

4. **Deploy to Cloud Run**
   - Dockerfile with Python + dependencies
   - Enable WebSocket support on Cloud Run
   - Set up Vertex AI credentials / API key

#### Phase 1 Deliverable

You can open the app, see your camera, talk to Sigma, and it responds with voice. It sees your camera feed and can answer basic questions like "what do you see?" or "what am I holding?" — No tools, no widgets yet, just conversation.

---

### Phase 2 — Timer Tool (First Widget Integration)

**Goal:** When user says "set a 50 second timer", the orchestrator calls a timer tool, and a countdown widget appears in one of the 3 dynamic slots.

#### How It Works

```
User: "Set a 50 second timer for the rice"
  -> Gemini Live API recognizes intent
  -> Calls timer_tool(seconds=50, label="rice")
  -> Backend sends widget_update to frontend
  -> Frontend renders countdown widget
  -> Agent says "Got it! 50 second timer for the rice is running."
  -> When timer hits 0, frontend plays alarm sound
  -> Agent says "Your rice timer is done!"
```

#### Backend Implementation

1. **Define TimerTool as a function tool for Gemini**

   ```python
   timer_tool = {
       "name": "set_timer",
       "description": "Set a countdown timer. Use when the user asks to time something.",
       "parameters": {
           "type": "object",
           "properties": {
               "seconds": {
                   "type": "integer",
                   "description": "Duration in seconds"
               },
               "label": {
                   "type": "string",
                   "description": "What this timer is for (e.g. 'boil pasta')"
               }
           },
           "required": ["seconds"]
       }
   }
   ```

2. **Handle tool call from Gemini**
   - When Gemini's response includes a `function_call` for `set_timer`:
     - Extract `seconds` and `label`
     - Send `widget_update` event to frontend via WebSocket
     - Send `function_response` back to Gemini confirming timer was set
     - Gemini then generates the voice confirmation

3. **Timer completion callback**
   - Frontend tracks timer locally (no backend needed for countdown)
   - When timer hits 0, frontend sends event to backend: `{ "type": "timer_done", "label": "rice" }`
   - Backend injects this into the Gemini session so the agent can announce it

#### Frontend Implementation

1. **Timer widget component**
   - Circular countdown animation (SVG circle with `stroke-dashoffset`)
   - Large time display: `00:50` counting down
   - Label text below: "Rice"
   - Alarm sound + visual flash when complete
   - "Dismiss" voice command or tap to clear

2. **Widget manager**
   - Listen for `widget_update` events from WebSocket
   - Find first available slot (or replace oldest completed widget)
   - Render the appropriate widget component based on `widget_type`

#### Phase 2 Deliverable

User says "set a timer for 2 minutes for the pasta." A beautiful countdown timer appears in one of the widget slots. Sigma confirms with voice. When it hits zero, an alarm chimes and Sigma announces "Your pasta timer is done!"

---

### Phase 3 — ADK Orchestrator + Bounding Box Agent

**Goal:** Refactor to use ADK for multi-agent orchestration. Add a sub-agent that detects and highlights ingredients/objects on camera using Gemini's spatial understanding.

#### Architecture Change

In Phase 1-2, we use Gemini Live API directly with function tools. Now we layer in ADK for the agent logic while keeping Gemini Live API for the voice/video streaming.

```
Gemini Live API (voice + video stream)
    |
    v
Orchestrator Agent (ADK LlmAgent - "Sigma")
    |
    ├── set_timer()         <- function tool (from Phase 2)
    ├── BoundingBoxAgent    <- AgentTool (NEW)
    └── SubstitutionAgent   <- AgentTool (Phase 4)
```

**Important integration note:** The Gemini Live API handles real-time audio/video streaming. ADK handles the agent logic and tool routing. These work together:
- Live API receives voice + video -> extracts text intent + latest frame
- The intent is routed to the ADK orchestrator
- ADK calls the appropriate sub-agent/tool
- Results are sent back through the Live API as audio + widget updates

#### Bounding Box Agent

**Trigger:** User asks "Where is the galangal?" or "Show me the salt" or "Which one is the cilantro?"

**Flow:**
```
1. Orchestrator receives: "Where is the galangal?"
2. Orchestrator calls BoundingBoxAgent via AgentTool
3. BoundingBoxAgent:
   a. Grabs the latest camera frame from session state
   b. Sends frame + prompt to Gemini Flash 2.5:
      "Detect the galangal in this image. Return bounding boxes
       as JSON: [{label, box_2d: [y_min, x_min, y_max, x_max]}]"
   c. Receives normalized coordinates (0-1000 scale)
   d. Optionally: Uses code_execution tool to draw boxes with Pillow
      and returns annotated image as base64
   e. Saves result to session state: annotated_image + label
4. Backend sends widget_update to frontend:
   {
     widget_type: "bbox_result",
     data: {
       image: "<base64 annotated image>",
       label: "Galangal",
       confidence: "found"
     }
   }
5. Orchestrator speaks: "The galangal is right here - I've highlighted it for you!"
```

#### Backend Implementation

```python
from google.adk.agents import LlmAgent
from google.adk.tools import agent_tool
from google.genai import types

# --- Bounding Box Agent ---
bbox_agent = LlmAgent(
    name="BoundingBoxAgent",
    model="gemini-2.5-flash",
    instruction="""
    You are a visual detection specialist. Given an image and an object name,
    detect the object and return bounding box coordinates.

    Use the code_execution tool to:
    1. Parse the bounding box coordinates from your detection
    2. Draw rectangles on the image using Pillow
    3. Return the annotated image

    Coordinates are in [y_min, x_min, y_max, x_max] format, 0-1000 scale.
    Scale to actual image dimensions before drawing.

    If the object is NOT found, clearly say so.
    """,
    tools=[types.Tool(code_execution=types.ToolCodeExecution())],
    output_key="bbox_result"
)

# --- Orchestrator ---
orchestrator = LlmAgent(
    name="Sigma",
    model="gemini-2.0-flash",
    instruction="""
    You are Sigma, a warm cooking companion. Route tasks to your tools:
    - Finding/identifying objects on camera -> call BoundingBoxAgent
    - Setting timers -> call set_timer
    - Substitution questions -> call SubstitutionAgent (Phase 4)
    - General questions -> answer directly

    Always be brief, warm, and helpful. The user's hands are busy!
    """,
    tools=[
        agent_tool.AgentTool(agent=bbox_agent),
        timer_tool,
    ]
)
```

#### Frontend Implementation

1. **Bounding box widget component**
   - Receives annotated image (base64) from backend
   - Displays in widget slot with a subtle highlight animation
   - Shows label overlay: "Galangal - Found!"
   - Auto-dismiss after 10 seconds or on next command

2. **Alternative: Client-side box drawing**
   - If you want smoother UX, have the backend send raw coordinates instead
   - Frontend draws boxes on a `<canvas>` overlay on top of the camera frame
   - This avoids the round-trip of image encoding/decoding
   - More responsive, but requires more frontend code

#### Phase 3 Deliverable

User says "Where is the fish sauce?" Sigma's bounding box agent analyzes the camera feed, draws a box around the fish sauce bottle, and displays the annotated image in a widget. Sigma says "Found it! The fish sauce is on your left, I've highlighted it for you."

---

### Phase 4 — Substitution Agent (Google Search Grounding)

**Goal:** When user is missing an ingredient, the agent searches for substitutes, then checks the camera to see if any substitute is available in the user's kitchen.

**Trigger:** "I'm out of black pepper" or "I don't have lemongrass, what can I use?"

#### Flow (Two-Stage: Search -> Vision Check)

```
1. User: "I ran out of black pepper. Here's my spice rack - anything I can use?"

2. Orchestrator calls SubstitutionAgent

3. SubstitutionAgent - Stage 1 (Google Search):
   a. Uses Google Search grounding tool
   b. Query: "cooking substitutes for black pepper"
   c. Gets list: ["white pepper", "ground cayenne", "paprika", "green peppercorns"]

4. SubstitutionAgent - Stage 2 (Vision Check):
   a. Grabs latest camera frame from session state
   b. Sends frame + prompt to Gemini:
      "Look at this image of a spice rack. Check if any of these items
       are visible: white pepper, ground cayenne, paprika, green peppercorns.
       Return which ones you can see and which you cannot."
   c. Gemini responds: "I can see paprika and what appears to be cayenne."

5. SubstitutionAgent returns structured result:
   {
     "missing_ingredient": "black pepper",
     "substitutes_found_in_kitchen": ["paprika", "cayenne"],
     "substitutes_not_found": ["white pepper", "green peppercorns"],
     "recommendation": "Use paprika as a 1:1 substitute, or cayenne at half
                        the amount (it's spicier)."
   }

6. Widget update -> search_result widget shows the recommendation

7. Orchestrator speaks: "Good news! I can see paprika on your shelf -
   you can use it as a 1:1 swap for black pepper. I also spotted cayenne,
   but use half the amount since it's much spicier!"
```

#### Backend Implementation

```python
from google.adk.agents import LlmAgent
from google.adk.tools import agent_tool, google_search

substitution_agent = LlmAgent(
    name="SubstitutionAgent",
    model="gemini-2.5-flash",
    instruction="""
    You are a cooking ingredient substitution expert.

    When a user is missing an ingredient:

    STEP 1 - SEARCH: Use google_search to find the best cooking substitutes.
    Focus on ratio/amount differences (e.g. "use half as much cayenne").

    STEP 2 - VISION CHECK: You will receive the user's camera frame
    in the session state as {latest_camera_frame}. Analyze the image to see
    if any of the substitute ingredients are visible in the user's kitchen.

    STEP 3 - RESPOND with a structured answer:
    - What substitutes exist (from search)
    - Which ones you can see in their kitchen (from vision)
    - Your top recommendation with quantity guidance
    - If NO substitutes are visible: suggest what they could buy,
      and still give the best substitute so they know what to look for.

    Be encouraging - never make the user feel bad for missing an ingredient!
    """,
    tools=[google_search],
    output_key="substitution_result"
)
```

#### Frontend Implementation

1. **Search result widget component**
   - Clean card layout showing:
     - Missing ingredient (crossed out)
     - Found substitutes (with "In your kitchen!" badge)
     - Not found substitutes (dimmed)
     - Recommendation banner at top: "Use paprika - 1:1 ratio"
   - Stays visible until dismissed or replaced

#### Phase 4 Deliverable

User holds up their spice rack and says "I don't have black pepper, can I use anything here?" Sigma searches for substitutes, scans the spice rack, and says "I see paprika on your shelf - that'll work as a 1:1 replacement! I also see cayenne but use half the amount, it's much hotter."

---

## System Instruction (Full Persona)

```
You are Sigma, a warm, patient, and encouraging cooking companion.

PERSONALITY:
- You're like a best friend who happens to be great at cooking
- You're cheerful but not annoying - read the room
- You celebrate small wins: "Nice knife work!" "That looks perfect!"
- You're calm when things go wrong: "No worries, we can fix that"
- You use casual, conversational language - never robotic

BEHAVIOR:
- Keep responses SHORT (1-2 sentences for most things). The user is cooking!
- Be PROACTIVE: if you see something concerning (smoke, overflowing pot),
  warn them immediately
- When multiple things are asked at once, prioritize safety first,
  then urgency, then curiosity
- Always confirm actions: "Timer set!" / "Found it!" / "Searching for substitutes..."
- If you're not sure about something, say so honestly

CAPABILITIES YOU HAVE:
- set_timer: Set countdown timers for cooking tasks
- BoundingBoxAgent: Visually locate and highlight ingredients/objects on camera
- SubstitutionAgent: Find ingredient substitutes using Google Search,
  then check the camera

WHEN USING TOOLS:
- Respond to the user IMMEDIATELY with voice while tools are processing
- Example: "Let me find the galangal for you..." (while BoundingBoxAgent processes)
- Never go silent - the user should always know you're working on it
```

---

## Google Cloud Deployment

### Services Used

1. **Cloud Run** — Host the FastAPI backend (WebSocket + agent logic)
2. **Vertex AI** — Gemini API calls (Live API + Flash for sub-agents)
3. **Cloud Storage** — Temporary frame buffer for camera images (optional, can use in-memory)
4. **Artifact Registry** — Docker image storage for Cloud Run deployment

### Deployment Script

```bash
#!/bin/bash
# deploy.sh - Automated Cloud Run deployment

PROJECT_ID="your-project-id"
REGION="us-central1"
SERVICE_NAME="sigma-backend"

# Build and push
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Deploy to Cloud Run with WebSocket support
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --session-affinity \
  --timeout=3600 \
  --memory=2Gi \
  --cpu=2 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
```

---

## Tech Stack Summary

| Component            | Technology                                    |
|----------------------|-----------------------------------------------|
| Frontend             | React + Vite + TailwindCSS                    |
| Real-time Comms      | WebSocket (native)                            |
| Voice + Video Stream | Gemini Live API (gemini-2.0-flash-live)       |
| Agent Framework      | Google Agent Development Kit (ADK)            |
| Bounding Box         | Gemini Flash 2.5 + code_execution tool        |
| Search Grounding     | Google Search tool (via ADK)                  |
| Hosting              | Google Cloud Run                              |
| AI Backend           | Vertex AI (Gemini API)                        |
| Temp Storage         | Cloud Storage or in-memory                    |

---

## File Structure

```
sigma/
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Main 2x2 grid layout
│   │   ├── components/
│   │   │   ├── CameraWidget.jsx     # Webcam feed + frame capture
│   │   │   ├── TimerWidget.jsx      # Countdown timer
│   │   │   ├── BBoxWidget.jsx       # Bounding box result display
│   │   │   ├── SearchWidget.jsx     # Substitution search results
│   │   │   ├── ChatWidget.jsx       # General text responses
│   │   │   ├── LoadingWidget.jsx    # Skeleton loader
│   │   │   └── WidgetManager.jsx    # Dynamic widget slot manager
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js      # WS connection + event handling
│   │   │   ├── useAudioStream.js    # Mic capture + audio playback
│   │   │   └── useCamera.js         # Camera access + frame capture
│   │   └── utils/
│   │       └── widgetRouter.js      # Maps widget_type -> component
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── main.py                      # FastAPI + WebSocket server
│   ├── agents/
│   │   ├── orchestrator.py          # Sigma orchestrator (ADK)
│   │   ├── bbox_agent.py            # Bounding box detection agent
│   │   └── substitution_agent.py    # Search + vision substitution agent
│   ├── tools/
│   │   └── timer_tool.py            # Timer function tool definition
│   ├── live_api/
│   │   └── session_manager.py       # Gemini Live API session handling
│   ├── requirements.txt
│   └── Dockerfile
│
├── deploy/
│   ├── deploy.sh                    # Cloud Run deployment script
│   ├── cloudbuild.yaml              # Cloud Build config (optional)
│   └── terraform/                   # IaC for bonus points (optional)
│       └── main.tf
│
├── docs/
│   ├── architecture-diagram.png     # Polished diagram for submission
│   └── cloud-proof-recording.mp4    # Cloud Run console proof
│
├── README.md                        # Setup instructions + project overview
└── spec.md                          # This file
```

---

## Key Risks and Mitigations

| Risk                                  | Mitigation                                                  |
|---------------------------------------|-------------------------------------------------------------|
| Gemini Live API latency spikes        | Pre-buffer audio, show "thinking" state in UI               |
| Bounding box detection inaccurate     | Fall back to text description: "I think it's on your left"  |
| WebSocket drops on Cloud Run          | Implement auto-reconnect with exponential backoff           |
| Camera frame too large to send        | Resize to 640x480, compress JPEG quality 70%                |
| Multiple timers overlap               | Widget manager supports multiple timer widgets              |
| User accent/language challenges       | System prompt: "Be patient with different accents"          |
| Deadline pressure (building from 0)   | Prioritize Phase 1+2 for MVP, Phase 3+4 if time allows     |

---

## Demo Video Script (Under 4 Minutes)

| Time      | Content                                                                 |
|-----------|-------------------------------------------------------------------------|
| 0:00-0:20 | **Hook:** Show someone struggling to scroll a recipe with messy hands   |
| 0:20-0:40 | **Intro:** "Meet Sigma" - show the 2x2 UI, explain the concept     |
| 0:40-1:20 | **Demo 1:** Voice conversation - ask "What do you see?" with camera on  |
| 1:20-1:50 | **Demo 2:** "Set a 3 minute timer for the eggs" - timer widget appears  |
| 1:50-2:30 | **Demo 3:** "Where is the fish sauce?" - bounding box highlights it     |
| 2:30-3:15 | **Demo 4:** "I'm out of black pepper" - search + cabinet scan           |
| 3:15-3:30 | **Interrupt demo:** Talk over Sigma to show barge-in works          |
| 3:30-3:50 | **Architecture:** Flash the diagram, mention ADK + Cloud Run + Vertex   |
| 3:50-4:00 | **Close:** "Sigma - your hands-free kitchen companion"              |

---

## Submission Checklist

- [ ] Text Description — Summary of features, tech stack, and learnings
- [ ] Public GitHub Repo — With clear README + spin-up instructions
- [ ] Proof of Cloud Deployment — Screen recording of Cloud Run console
- [ ] Architecture Diagram — Polished version of the diagram above
- [ ] Demo Video (<4 min) — Show: voice Q&A, timer, bounding box, substitution
- [ ] Blog Post — "How I built Sigma with Gemini Live API and ADK" (bonus: +0.6)
- [ ] Automated Deployment — deploy.sh or Terraform in repo (bonus: +0.2)
- [ ] GDG Profile — Link to your Google Developer Group profile (bonus: +0.2)

---

**Priority:** Phase 1 and Phase 2 alone make a solid submission. Phase 3 and 4 push into prize territory. Ship the MVP first, then layer on the magic.
