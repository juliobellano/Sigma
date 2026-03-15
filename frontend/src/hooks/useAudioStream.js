import { useCallback, useRef, useState } from "react";

export default function useAudioStream() {
  const recorderCtxRef = useRef(null);
  const recorderNodeRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const playerCtxRef = useRef(null);
  const playerNodeRef = useRef(null);
  const playerAnalyserRef = useRef(null);
  const streamRef = useRef(null);
  const onAudioRef = useRef(null);
  const [micActive, setMicActive] = useState(false);

  const startMic = useCallback(async (onAudioChunk) => {
    onAudioRef.current = onAudioChunk;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Create AudioContext at 16kHz for Gemini input
    const ctx = new AudioContext({ sampleRate: 16000 });
    recorderCtxRef.current = ctx;

    await ctx.audioWorklet.addModule("/pcm-recorder-processor.js");
    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-recorder-processor");

    // Analyser for mic waveform visualization
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    micAnalyserRef.current = analyser;

    worklet.port.onmessage = (e) => {
      const bytes = new Uint8Array(e.data);
      const b64 = arrayBufferToBase64(bytes);
      onAudioRef.current?.(b64);
    };

    source.connect(worklet);
    worklet.connect(ctx.destination);
    recorderNodeRef.current = worklet;
    setMicActive(true);
  }, []);

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderNodeRef.current?.disconnect();
    recorderCtxRef.current?.close();
    recorderCtxRef.current = null;
    recorderNodeRef.current = null;
    micAnalyserRef.current = null;
    streamRef.current = null;
    setMicActive(false);
  }, []);

  const initPlayer = useCallback(async () => {
    if (playerCtxRef.current) return;

    const ctx = new AudioContext({ sampleRate: 24000 });
    playerCtxRef.current = ctx;

    await ctx.audioWorklet.addModule("/pcm-player-processor.js");
    const worklet = new AudioWorkletNode(ctx, "pcm-player-processor");

    // Analyser for playback waveform visualization
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    worklet.connect(analyser);
    analyser.connect(ctx.destination);
    playerAnalyserRef.current = analyser;

    playerNodeRef.current = worklet;
  }, []);

  const playAudioChunk = useCallback(
    async (data) => {
      if (!playerNodeRef.current) await initPlayer();
      // Accept both ArrayBuffer and base64 string
      const bytes = typeof data === "string" ? base64ToArrayBuffer(data) : data;
      playerNodeRef.current.port.postMessage(bytes, [bytes]);
    },
    [initPlayer]
  );

  const handleInterruption = useCallback(() => {
    playerNodeRef.current?.port.postMessage("flush");
  }, []);

  // Returns current frequency data from mic or player analyser
  const getAnalyserData = useCallback((source = "mic") => {
    const analyser =
      source === "mic" ? micAnalyserRef.current : playerAnalyserRef.current;
    if (!analyser) return null;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }, []);

  return {
    micActive,
    startMic,
    stopMic,
    initPlayer,
    playAudioChunk,
    handleInterruption,
    getAnalyserData,
  };
}

// --- Helpers ---

function arrayBufferToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
