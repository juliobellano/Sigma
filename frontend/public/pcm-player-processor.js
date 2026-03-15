/**
 * AudioWorklet processor: plays PCM 16-bit 24kHz audio from a ring buffer.
 * Receives Int16 PCM chunks via port.onmessage, outputs Float32 to speakers.
 */
class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Ring buffer: 24kHz * 10 seconds capacity
    this._capacity = 24000 * 10;
    this._buffer = new Int16Array(this._capacity);
    this._writePos = 0;
    this._readPos = 0;
    this._count = 0;

    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        this._writePos = 0;
        this._readPos = 0;
        this._count = 0;
        return;
      }

      const chunk = new Int16Array(e.data);
      for (let i = 0; i < chunk.length; i++) {
        this._buffer[this._writePos] = chunk[i];
        this._writePos = (this._writePos + 1) % this._capacity;
        if (this._count < this._capacity) {
          this._count++;
        } else {
          // Overwrite oldest data
          this._readPos = (this._readPos + 1) % this._capacity;
        }
      }
    };
  }

  process(_, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];
    for (let i = 0; i < channel.length; i++) {
      if (this._count > 0) {
        const sample = this._buffer[this._readPos];
        this._readPos = (this._readPos + 1) % this._capacity;
        this._count--;
        // Int16 → Float32
        channel[i] = sample / 32768;
      } else {
        channel[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-player-processor", PcmPlayerProcessor);
