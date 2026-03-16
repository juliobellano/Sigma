/**
 * Plays a pleasant two-tone alarm chime using the Web Audio API.
 * No external audio files needed — generates tones programmatically.
 */
export function playAlarmChime() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const playTone = (freq1, freq2, startTime) => {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.value = freq1;
    osc2.type = "sine";
    osc2.frequency.value = freq2;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02); // quick attack
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25); // decay

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + 0.25);
    osc2.stop(startTime + 0.25);
  };

  const now = ctx.currentTime;
  playTone(880, 1100, now);        // first chime
  playTone(880, 1100, now + 0.2);  // second chime

  // Clean up AudioContext after playback
  setTimeout(() => ctx.close(), 700);
}
