'use client';

/**
 * 以 WebAudio 即時合成音效：不需下載任何音檔、無授權問題。
 */
type SoundName =
  'select' | 'move' | 'capture' | 'flip' | 'check' | 'win' | 'lose' | 'draw' | 'notify';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 木頭敲擊聲：濾波雜訊 + 短促正弦 */
function knock(a: AudioContext, t: number, freq: number, gain: number, decay: number): void {
  const len = Math.floor(a.sampleRate * decay);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * 3;
  bp.Q.value = 1.2;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);

  const osc = a.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + decay);
  const og = a.createGain();
  og.gain.setValueAtTime(gain * 0.6, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(og).connect(a.destination);
  osc.start(t);
  osc.stop(t + decay);
}

function tone(
  a: AudioContext,
  t: number,
  freq: number,
  dur: number,
  gain = 0.12,
  type: OscillatorType = 'triangle',
): void {
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (name) {
    case 'select':
      knock(a, t, 900, 0.12, 0.05);
      break;
    case 'move':
      knock(a, t, 420, 0.5, 0.12);
      break;
    case 'capture':
      knock(a, t, 300, 0.7, 0.16);
      knock(a, t + 0.07, 520, 0.4, 0.1);
      break;
    case 'flip':
      knock(a, t, 700, 0.3, 0.06);
      knock(a, t + 0.12, 380, 0.45, 0.1);
      break;
    case 'check':
      tone(a, t, 660, 0.18, 0.12, 'square');
      tone(a, t + 0.16, 880, 0.25, 0.1, 'square');
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.12, f, 0.4));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(a, t + i * 0.18, f, 0.45, 0.1, 'sine'));
      break;
    case 'draw':
      [440, 440].forEach((f, i) => tone(a, t + i * 0.2, f, 0.3, 0.1, 'sine'));
      break;
    case 'notify':
      tone(a, t, 880, 0.15, 0.08, 'sine');
      break;
  }
}
