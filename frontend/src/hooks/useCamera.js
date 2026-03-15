import { useCallback, useEffect, useRef, useState } from "react";

const CAPTURE_INTERVAL = 1000; // 1 FPS
const CAPTURE_SIZE = 768;
const JPEG_QUALITY = 0.7;

export default function useCamera({ onFrame, enabled }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const [active, setActive] = useState(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setActive(true);
    } catch (err) {
      console.error("Camera access denied:", err);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clearInterval(intervalRef.current);
    setActive(false);
  }, []);

  // Frame capture loop
  useEffect(() => {
    if (!active || !enabled) {
      clearInterval(intervalRef.current);
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = CAPTURE_SIZE;
      canvasRef.current.height = CAPTURE_SIZE;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      // Center-crop to square
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const side = Math.min(vw, vh);
      const sx = (vw - side) / 2;
      const sy = (vh - side) / 2;

      ctx.drawImage(video, sx, sy, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            // Strip data:image/jpeg;base64, prefix
            const b64 = reader.result.split(",")[1];
            onFrame?.(b64);
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    }, CAPTURE_INTERVAL);

    return () => clearInterval(intervalRef.current);
  }, [active, enabled, onFrame]);

  // Capture a single frame on demand at native aspect ratio (returns base64 JPEG without prefix)
  const bboxCanvasRef = useRef(null);
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!bboxCanvasRef.current || bboxCanvasRef.current.width !== vw || bboxCanvasRef.current.height !== vh) {
      bboxCanvasRef.current = document.createElement("canvas");
      bboxCanvasRef.current.width = vw;
      bboxCanvasRef.current.height = vh;
    }

    const canvas = bboxCanvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, vw, vh);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return dataUrl.split(",")[1];
  }, []);

  return { videoRef, active, start, stop, captureFrame };
}
