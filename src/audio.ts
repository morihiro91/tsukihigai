let audioContext: AudioContext | null = null;
let initialized = false;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function initAudio() {
  if (initialized) return;
  initialized = true;
  // Resume on first user interaction
  const resume = () => {
    getContext().resume();
    document.removeEventListener('click', resume);
    document.removeEventListener('touchstart', resume);
  };
  document.addEventListener('click', resume);
  document.addEventListener('touchstart', resume);
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  const ctx = getContext();
  if (ctx.state === 'suspended') return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function playPlace() {
  playTone(800, 0.15, 'sine', 0.2);
  setTimeout(() => playTone(1200, 0.1, 'sine', 0.15), 50);
}

export function playCollapse() {
  playTone(200, 0.5, 'sawtooth', 0.3);
  setTimeout(() => playTone(100, 0.8, 'sawtooth', 0.2), 100);
  setTimeout(() => playTone(60, 1.0, 'sawtooth', 0.15), 300);
}
