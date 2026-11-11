// Breakroom audio: music, ambience and effects on separate channels through Web Audio.
// Built on the same pattern as Tilt's engine. Browsers only allow sound after a tap,
// so unlock() must be called from a tap or key handler.

const TRACKS = { theme: 'audio/theme.mp3', ambience: 'audio/ambience.mp3' };
const CLIPS = ['thud-a', 'thud-b', 'glass', 'chain', 'clunk', 'tape-click', 'tape-tick', 'glitch', 'drip-1', 'drip-2', 'drip-3', 'drip-4'];

let ctx = null;
let master, musicBus, musicFilter, ambBus, sfxBus, hissGain;
const raw = {}, buf = {};
let musicSrc = null, ambSrc = null, hissSrc = null;
let noiseBuf = null;
let enabled = true;
let dripTimer = 6;

export function preload() {
  const get = (url) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  for (const [k, url] of Object.entries(TRACKS)) raw[k] = get(url);
  for (const k of CLIPS) raw[k] = get(`audio/sfx/${k}.mp3`);
}

export async function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0;
  master.connect(ctx.destination);
  musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 18000;
  musicBus = ctx.createGain(); musicBus.gain.value = 0;
  musicFilter.connect(musicBus); musicBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  hissGain = ctx.createGain(); hissGain.gain.value = 0; hissGain.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // tape hiss, always running, faded in on the deal screen
  hissSrc = ctx.createBufferSource(); hissSrc.buffer = noiseBuf; hissSrc.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
  hissSrc.connect(hp); hp.connect(hissGain); hissSrc.start();

  for (const k of [...Object.keys(TRACKS), ...CLIPS]) {
    try { const ab = await raw[k]; if (ab) buf[k] = await ctx.decodeAudioData(ab.slice(0)); } catch (e) { /* missing file: stay silent */ }
  }
  if (buf.theme && !musicSrc) {
    musicSrc = ctx.createBufferSource(); musicSrc.buffer = buf.theme; musicSrc.loop = true;
    musicSrc.connect(musicFilter); musicSrc.start();
  }
  if (buf.ambience && !ambSrc) {
    ambSrc = ctx.createBufferSource(); ambSrc.buffer = buf.ambience; ambSrc.loop = true;
    ambSrc.loopStart = 0.05; ambSrc.loopEnd = buf.ambience.duration - 0.05;
    ambSrc.connect(ambBus); ambSrc.start();
  }
  if (pendingMood) mood(pendingMood.name, pendingMood.danger);
}

export function setEnabled(on) {
  enabled = on;
  if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
}

const ramp = (param, v, t = 0.4) => param.setTargetAtTime(v, ctx.currentTime, t);

// title: the theme in full. round: the drone up front, the theme low and muffled,
// opening up as the wall gets closer. deal: muffled theme under tape hiss.
let pendingMood = null;
let lastMood = null;
export function mood(name, danger = 0) {
  if (!ctx || !musicBus) { pendingMood = { name, danger }; return; }
  if (name === 'round') {
    const f = 380 + danger * danger * 9000;
    musicFilter.frequency.setTargetAtTime(f, ctx.currentTime, 0.6);
    musicBus.gain.setTargetAtTime(0.22 + danger * 0.4, ctx.currentTime, 0.6);
    if (lastMood !== 'round') { ramp(ambBus.gain, 1.0, 0.8); ramp(hissGain.gain, 0, 0.3); }
  } else if (name === 'deal') {
    ramp(musicFilter.frequency, 900, 0.3); ramp(musicBus.gain, 0.5); ramp(ambBus.gain, 0.45); ramp(hissGain.gain, 0.022, 0.2);
  } else if (name === 'title') {
    ramp(musicFilter.frequency, 16000, 0.5); ramp(musicBus.gain, 0.75, 0.8); ramp(ambBus.gain, 0.5); ramp(hissGain.gain, 0.008, 0.3);
  } else if (name === 'over') {
    ramp(musicFilter.frequency, 500, 0.2); ramp(musicBus.gain, 0.3, 0.3); ramp(ambBus.gain, 0.8); ramp(hissGain.gain, 0.03, 0.1);
  } else if (name === 'pause') {
    ramp(musicFilter.frequency, 700, 0.2); ramp(musicBus.gain, 0.3, 0.2); ramp(ambBus.gain, 0.3, 0.2);
  }
  lastMood = name;
}

// A short dip in the music, used under the Host's voice lines.
export function duck(secs = 1.5) {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(musicBus.gain.value * 0.45, t, 0.08);
  musicBus.gain.setTargetAtTime(lastMood === 'round' ? 0.25 : 0.5, t + secs, 0.5);
}

export function clip(name, { gain = 1, rate = 1, pan = 0, delay = 0 } = {}) {
  if (!ctx || !buf[name]) return;
  const s = ctx.createBufferSource();
  s.buffer = buf[name];
  s.playbackRate.value = rate;
  const gn = ctx.createGain(); gn.gain.value = gain;
  let node = gn;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); gn.connect(p); node = p; }
  s.connect(gn); node.connect(sfxBus);
  s.start(ctx.currentTime + delay);
}

export function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}

export function noise(dur, { vol = 0.15, freq = 800, type = 'lowpass', delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(gn); gn.connect(sfxBus);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

// Muffle everything for a moment, as if your ears are ringing.
export function ring(secs = 1.2) {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicFilter.frequency.cancelScheduledValues(t);
  musicFilter.frequency.setTargetAtTime(200, t, 0.02);
  ambBus.gain.setTargetAtTime(0.25, t, 0.03);
  ambBus.gain.setTargetAtTime(1, t + secs, 0.6);
  tone(3100, secs * 1.3, { vol: 0.025 });
}

// Drips land somewhere in the room every few seconds.
export function tick(dt, active) {
  if (!ctx || !active) return;
  dripTimer -= dt;
  if (dripTimer <= 0) {
    dripTimer = 5 + Math.random() * 9;
    const n = 1 + Math.floor(Math.random() * 4);
    clip(`drip-${n}`, { gain: 0.35 + Math.random() * 0.35, rate: 0.9 + Math.random() * 0.2, pan: Math.random() * 1.6 - 0.8 });
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);

// One place that maps game moments to sounds. x is the position across the field (0 to 360).
export function play(ev) {
  if (!ctx) return;
  const pan = ev.x !== undefined ? (ev.x / 360) * 1.4 - 0.7 : 0;
  switch (ev.type) {
    case 'paddle': clip('thud-a', { gain: 0.8, rate: rnd(0.95, 1.08), pan: ev.u * 0.3 }); break;
    case 'wall': clip('thud-b', { gain: 0.18, rate: rnd(1.5, 1.7) }); break;
    case 'break': clip('thud-b', { gain: 0.75, rate: ev.brick === 'steel' ? 0.8 : rnd(1.1, 1.25), pan }); noise(0.12, { vol: 0.08, freq: 1400, type: 'bandpass' }); break;
    case 'dent': clip('clunk', { gain: 0.4, rate: 1.9, pan }); break;
    case 'pipe': clip('clunk', { gain: 0.45, rate: 2.4 }); tone(880, 0.25, { type: 'triangle', vol: 0.03 }); break;
    case 'glass': clip('glass', { gain: 0.55, rate: rnd(1.05, 1.25), pan }); break;
    case 'ceiling': clip('clunk', { gain: 0.9, rate: 0.85 }); tone(52, 0.7, { vol: 0.35, slide: 38 }); noise(0.6, { vol: 0.12, freq: 220 }); break;
    case 'launch': clip('tape-tick', { gain: 0.5 }); break;
    case 'bulb': clip('glass', { gain: 0.9, rate: 1.7 }); clip('glitch', { gain: 0.7, rate: 0.9 }); ring(1.4); break;
    case 'rewind': clip('glitch', { gain: 0.6, rate: 1.4 }); tone(400, 0.5, { type: 'sawtooth', vol: 0.04, slide: 1400 }); break;
    case 'tape': clip('tape-click', { gain: 0.8 }); clip('tape-tick', { gain: 0.5, delay: 0.12 }); break;
    case 'chain': clip('chain', { gain: 0.6, rate: rnd(0.95, 1.1) }); break;
    case 'clang': clip('clunk', { gain: 0.55, rate: 1.5 }); tone(320, 0.3, { type: 'triangle', vol: 0.03 }); break;
    case 'bossHit': clip('thud-a', { gain: 1, rate: 0.6 }); clip('glass', { gain: 0.5, rate: 0.8 }); break;
    case 'bossDead': clip('glass', { gain: 1, rate: 0.6 }); clip('clunk', { gain: 1, rate: 0.5 }); noise(1.2, { vol: 0.25, freq: 500 }); break;
    case 'regrow': clip('thud-b', { gain: 0.25, rate: 0.7 }); break;
    case 'vent': noise(1.1, { vol: 0.3, freq: 2400, type: 'bandpass' }); tone(90, 0.8, { vol: 0.15, slide: 60 }); break;
    case 'hop': clip('chain', { gain: 0.35, rate: 0.7 }); break;
    case 'fuse': noise(0.3, { vol: 0.3, freq: 600 }); clip('glitch', { gain: 0.4, rate: 1.6 }); break;
    case 'flicker': clip('glitch', { gain: 0.2, rate: 2.2 }); break;
    case 'blackout': tone(60, 0.4, { vol: 0.15 }); break;
    case 'match': noise(0.5, { vol: 0.12, freq: 3000, type: 'bandpass' }); tone(200, 0.4, { type: 'sawtooth', vol: 0.02, slide: 90 }); break;
    case 'clear': clip('clunk', { gain: 0.8, rate: 0.7 }); clip('tape-click', { gain: 0.7, delay: 0.25 }); break;
    case 'dead': case 'crushed':
      clip('glitch', { gain: 0.9, rate: 0.6 });
      tone(330, 1.4, { type: 'sawtooth', vol: 0.08, slide: 30 });
      if (ev.type === 'crushed') { clip('clunk', { gain: 1, rate: 0.45 }); noise(1, { vol: 0.35, freq: 160 }); }
      break;
    case 'ui': clip('tape-tick', { gain: 0.5 }); break;
    case 'select': clip('tape-click', { gain: 0.6, rate: 1.15 }); break;
    case 'take': clip('tape-click', { gain: 0.9 }); clip('clunk', { gain: 0.3, rate: 1.6, delay: 0.08 }); break;
    case 'type': clip('tape-tick', { gain: 0.12, rate: rnd(1.6, 2.1) }); break;
    default: break;
  }
}
