import asyncio
import base64
import json
import logging

from google import genai
from google.genai import types
from fastapi import WebSocket

from config import GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, MODEL, LIVE_CONNECT_CONFIG

logger = logging.getLogger(__name__)

_client = None


def get_client():
    global _client
    if _client is None:
        _client = genai.Client(
            vertexai=True,
            project=GOOGLE_CLOUD_PROJECT,
            location=GOOGLE_CLOUD_LOCATION,
        )
    return _client


class GeminiLiveSession:
    """Relays messages between a browser WebSocket and a Gemini Live API session."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self._session = None
        self._resumption_handle: str | None = None

    async def run(self):
        config = LIVE_CONNECT_CONFIG
        if self._resumption_handle:
            config = types.LiveConnectConfig(
                **{
                    **LIVE_CONNECT_CONFIG.to_json_dict(),
                    "session_resumption": types.SessionResumptionConfig(
                        handle=self._resumption_handle
                    ),
                }
            )

        await self.ws.send_json({"type": "status", "data": {"state": "connecting_to_gemini"}})
        try:
            async with get_client().aio.live.connect(model=MODEL, config=config) as session:
                self._session = session
                logger.info("Gemini Live session connected")
                await self.ws.send_json({"type": "status", "data": {"state": "gemini_connected"}})
                try:
                    await asyncio.gather(
                        self._upstream_task(),
                        self._downstream_task(),
                    )
                except Exception as e:
                    logger.error(f"Session error: {e}")
                    raise
        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            logger.error(f"Gemini connection failed: {error_msg}")
            await self.ws.send_json({"type": "error", "data": {"message": error_msg}})
            raise

    async def _upstream_task(self):
        """Browser WS → Gemini Live API."""
        try:
            while True:
                raw = await self.ws.receive_text()
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "user_audio":
                    audio_bytes = base64.b64decode(msg["data"])
                    await self._session.send_realtime_input(
                        audio=types.Blob(
                            data=audio_bytes, mime_type="audio/pcm;rate=16000"
                        )
                    )
                elif msg_type == "camera_frame":
                    frame_bytes = base64.b64decode(msg["data"])
                    await self._session.send_realtime_input(
                        video=types.Blob(
                            data=frame_bytes, mime_type="image/jpeg"
                        )
                    )
        except Exception as e:
            logger.info(f"Upstream ended: {e}")

    async def _downstream_task(self):
        """Gemini Live API → Browser WS."""
        try:
            async for response in self._session.receive():
                content = response.server_content
                if not content:
                    continue

                # Audio chunks from model
                if content.model_turn:
                    for part in content.model_turn.parts:
                        if part.inline_data:
                            audio_b64 = base64.b64encode(
                                part.inline_data.data
                            ).decode("ascii")
                            await self.ws.send_json(
                                {"type": "audio_chunk", "data": audio_b64}
                            )

                # Turn complete
                if content.turn_complete:
                    await self.ws.send_json({"type": "turn_complete"})

                # Barge-in / interruption
                if content.interrupted:
                    await self.ws.send_json({"type": "interruption"})

                # Transcriptions
                if content.input_transcription and content.input_transcription.text:
                    await self.ws.send_json(
                        {
                            "type": "transcript",
                            "data": {
                                "role": "user",
                                "text": content.input_transcription.text,
                            },
                        }
                    )
                if content.output_transcription and content.output_transcription.text:
                    await self.ws.send_json(
                        {
                            "type": "transcript",
                            "data": {
                                "role": "assistant",
                                "text": content.output_transcription.text,
                            },
                        }
                    )

                # Session resumption handle
                if (
                    hasattr(content, "session_resumption_update")
                    and content.session_resumption_update
                    and content.session_resumption_update.new_handle
                ):
                    self._resumption_handle = (
                        content.session_resumption_update.new_handle
                    )
        except Exception as e:
            logger.info(f"Downstream ended: {e}")
