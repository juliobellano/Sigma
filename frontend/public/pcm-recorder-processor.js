/**
 * AudioWorklet processor: captures mic audio as PCM 16-bit 16kHz chunks.
 * Posts Int16Array buffers to the main thread.
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    // Send chunks every ~100ms (1600 samples at 16kHz)
    this._chunkSize = 1600;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const float32 = input[0];
    for (let i = 0; i < float32.length; i++) {
      // Clamp and convert Float32 [-1, 1] → Int16
      const s = Math.max(-1, Math.min(1, float32[i]));
      this._buffer.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }

    if (this._buffer.length >= this._chunkSize) {
      const chunk = new Int16Array(this._buffer.splice(0, this._chunkSize));
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-recorder-processor", PcmRecorderProcessor);
