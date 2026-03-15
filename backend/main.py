import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from gemini_session import GeminiLiveSession

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Sigma Backend")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("Client connected")
    session = GeminiLiveSession(ws)
    try:
        await session.run()
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        logger.info("Session closed")


@app.get("/health")
async def health():
    return {"status": "ok"}
