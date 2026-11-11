// Draws a round into a small offscreen canvas at low resolution, then lights it.
// Everything is drawn in the logical 360 x 640 space; the context is scaled down.

import { W, H, GRID, PADDLE, CRUSH_Y, BALL, MAX_BULBS } from './config.js';
import { brickRect, bossRect, weakSpot, lighting } from './game.js';

export const LOW_W = 240;
export const LOW_H = 427;
const K = LOW_W / W;

const scene = document.createElement('canvas');
scene.width = LOW_W; scene.height = LOW_H;
const sx = scene.getContext('2d');
const mask = document.createElement('canvas');
mask.width = LOW_W; mask.height = LOW_H;
const mx = mask.getContext('2d');

const backgrounds = {};

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c, d) => [c[0] + d, c[1] + d, c[2] + d];

// ---------- backgrounds, one per floor ----------

function background(floor) {
  if (backgrounds[floor.id]) return backgrounds[floor.id];
  const c = document.createElement('canvas');
  c.width = LOW_W; c.height = LOW_H;
  const x = c.getContext('2d');
  x.scale(K, K);
  const r = rng(floor.id.charCodeAt(1) * 977);
  const base = floor.tint.wall;
  x.fillStyle = rgb(base); x.fillRect(0, 0, W, H);

  if (floor.id === 'B1') {
    // breeze-block wall: big blocks, staggered, grey mortar
    for (let row = 0; row < 24; row++) {
      const y = row * 28, off = row % 2 ? 0 : 30;
      for (let col = -1; col < 7; col++) {
        const bx = col * 60 + off;
        x.fillStyle = rgb(shade(base, (r() - 0.5) * 12));
        x.fillRect(bx + 1, y + 1, 58, 26);
      }
      x.fillStyle = rgb(shade(base, -22)); x.fillRect(0, y, W, 1.5);
    }
  } else if (floor.id === 'B2') {
    // old brick, soot, and two pipes running across
    for (let row = 0; row < 54; row++) {
      const y = row * 12, off = row % 2 ? 0 : 14;
      for (let col = -1; col < 14; col++) {
        x.fillStyle = rgb(shade(base, (r() - 0.5) * 18));
        x.fillRect(col * 28 + off + 1, y + 1, 26, 10);
      }
    }
    for (const py of [300, 470]) {
      const gr = x.createLinearGradient(0, py, 0, py + 16);
      gr.addColorStop(0, 'rgba(120,80,60,1)'); gr.addColorStop(0.5, 'rgba(70,45,34,1)'); gr.addColorStop(1, 'rgba(30,20,16,1)');
      x.fillStyle = gr; x.fillRect(0, py, W, 16);
      for (let fx = 20; fx < W; fx += 90) { x.fillStyle = 'rgba(40,26,20,1)'; x.fillRect(fx, py - 2, 8, 20); }
    }
  } else {
    // cold-store tiles, stained, grout gone green
    for (let ty = 0; ty < H; ty += 20) {
      for (let tx = 0; tx < W; tx += 20) {
        x.fillStyle = rgb(shade(base, (r() - 0.5) * 14 + 10));
        x.fillRect(tx + 1, ty + 1, 18, 18);
      }
    }
  }
  // grime: stains running down from the ceiling, and speckle
  for (let i = 0; i < 18; i++) {
    const gx = r() * W, len = 80 + r() * 380;
    const gr = x.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(10,8,6,0.45)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
    x.fillStyle = gr; x.fillRect(gx, 0, 6 + r() * 18, len);
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,240,210,0.06)';
    x.fillRect(r() * W, r() * H, 1.5, 1.5);
  }
  // a crack or two
  x.strokeStyle = 'rgba(8,6,5,0.6)'; x.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    let cx = r() * W, cy = 200 + r() * 300;
    x.beginPath(); x.moveTo(cx, cy);
    for (let s = 0; s < 14; s++) { cx += (r() - 0.5) * 22; cy += r() * 14; x.lineTo(cx, cy); }
    x.stroke();
  }
  // the floor
  const fl = x.createLinearGradient(0, 600, 0, H);
  fl.addColorStop(0, 'rgba(20,18,15,1)'); fl.addColorStop(1, 'rgba(6,5,4,1)');
  x.fillStyle = fl; x.fillRect(0, 600, W, 40);
  x.fillStyle = 'rgba(255,240,210,0.05)'; x.fillRect(0, 600, W, 1);
  backgrounds[floor.id] = c;
  return c;
}

// ---------- pieces ----------

function drawCeiling(g) {
  const y = g.wallY;
  const gr = sx.createLinearGradient(0, 0, 0, y);
  gr.addColorStop(0, '#0d0c0a'); gr.addColorStop(1, '#2a2622');
  sx.fillStyle = gr; sx.fillRect(0, 0, W, y);
  // underside edge and bolts
  sx.fillStyle = '#3a352f'; sx.fillRect(0, y - 6, W, 6);
  sx.fillStyle = '#121110'; sx.fillRect(0, y - 1, W, 1);
  for (let bx = 12; bx < W; bx += 36) { sx.fillStyle = '#5b544b'; sx.fillRect(bx, y - 4.5, 3, 3); }
  // side rails the ceiling slides down, with a notch for every row it has dropped
  for (const rx of [0, W - 5]) {
    sx.fillStyle = '#1b1916'; sx.fillRect(rx, 0, 5, CRUSH_Y + 8);
    for (let ny = 0; ny < CRUSH_Y; ny += 20) { sx.fillStyle = '#2d2924'; sx.fillRect(rx, ny, 5, 2); }
  }
}

function drawBrick(b, r) {
  const v = (b.seed - 0.5) * 14;
  const { x, y, w, h } = r;
  if (b.type === 'block' || b.type === 'tape') {
    sx.fillStyle = rgb([128 + v, 123 + v, 112 + v]); sx.fillRect(x, y, w, h);
    sx.fillStyle = 'rgba(25,22,18,0.85)';
    sx.fillRect(x + 6, y + 4, 10, 8); sx.fillRect(x + w - 16, y + 4, 10, 8);
    if (b.type === 'tape') {
      sx.fillStyle = '#0c0b0a'; sx.fillRect(x + 13, y + 3, 14, 10);
      sx.fillStyle = '#d9cfb3'; sx.fillRect(x + 14, y + 4, 12, 3);
      sx.fillStyle = '#6d665a'; sx.fillRect(x + 16, y + 9, 2, 2); sx.fillRect(x + 22, y + 9, 2, 2);
    }
  } else if (b.type === 'steel') {
    sx.fillStyle = rgb([88 + v, 94 + v, 100 + v]); sx.fillRect(x, y, w, h);
    sx.fillStyle = 'rgba(120,64,34,0.5)'; sx.fillRect(x + 4 + b.seed * 20, y + 2, 7, 4);
    sx.fillStyle = '#b8bec4';
    for (const [px, py] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]]) sx.fillRect(x + px, y + py, 2, 2);
    if (b.hp < 2) {
      sx.strokeStyle = '#1a1c1e'; sx.lineWidth = 1.3;
      sx.beginPath(); sx.moveTo(x + 10, y); sx.lineTo(x + 18, y + 8); sx.lineTo(x + 15, y + h); sx.moveTo(x + 18, y + 8); sx.lineTo(x + 30, y + 6); sx.stroke();
    }
  } else if (b.type === 'glass') {
    sx.fillStyle = 'rgba(176,212,196,0.5)'; sx.fillRect(x, y, w, h);
    sx.strokeStyle = 'rgba(40,52,48,0.7)'; sx.lineWidth = 0.8;
    sx.save(); sx.beginPath(); sx.rect(x, y, w, h); sx.clip();
    sx.beginPath();
    for (let d = -h; d < w; d += 6) { sx.moveTo(x + d, y); sx.lineTo(x + d + h, y + h); sx.moveTo(x + d + h, y); sx.lineTo(x + d, y + h); }
    sx.stroke(); sx.restore();
    sx.fillStyle = 'rgba(255,255,255,0.35)'; sx.fillRect(x + 4, y + 2, 10, 2);
  } else if (b.type === 'pipe') {
    const gr = sx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#9a5a38'); gr.addColorStop(0.45, '#5c321f'); gr.addColorStop(1, '#22130c');
    sx.fillStyle = gr; sx.fillRect(x - 2, y + 2, w + 4, h - 4);
    sx.fillStyle = '#2b1810'; sx.fillRect(x - 2, y, 5, h); sx.fillRect(x + w - 3, y, 5, h);
  }
  // edges
  sx.fillStyle = 'rgba(255,245,225,0.12)'; sx.fillRect(x, y, w, 1);
  sx.fillStyle = 'rgba(0,0,0,0.45)'; sx.fillRect(x, y + h - 1, w, 1);
  if (b.flash > 0) { sx.fillStyle = `rgba(255,236,200,${b.flash * 0.55})`; sx.fillRect(x, y, w, h); }
}

function drawBoss(g) {
  const b = g.boss;
  if (b.dead) return;
  const r = bossRect(g);
  const ws = weakSpot(g);
  // hanging rods into the ceiling
  sx.fillStyle = '#16140f';
  sx.fillRect(r.x + 14, g.wallY - 6, 4, 10); sx.fillRect(r.x + r.w - 18, g.wallY - 6, 4, 10);

  if (b.key === 'caretaker') {
    // a hulking figure in a boiler suit, headlamp low on the chest
    sx.fillStyle = '#2b2722';
    sx.beginPath();
    sx.moveTo(r.x + 10, r.y); sx.lineTo(r.x + r.w - 10, r.y);
    sx.lineTo(r.x + r.w, r.y + r.h * 0.55); sx.lineTo(r.x + r.w - 18, r.y + r.h);
    sx.lineTo(r.x + 18, r.y + r.h); sx.lineTo(r.x, r.y + r.h * 0.55); sx.closePath(); sx.fill();
    sx.fillStyle = '#3f3a33'; sx.fillRect(r.x + r.w / 2 - 2, r.y, 4, r.h - 8);
    sx.fillStyle = '#1a1814'; sx.fillRect(r.x + 4, r.y + r.h * 0.5, 10, 26); sx.fillRect(r.x + r.w - 14, r.y + r.h * 0.5, 10, 26);
  } else if (b.key === 'boiler') {
    const gr = sx.createLinearGradient(0, r.y, 0, r.y + r.h);
    gr.addColorStop(0, '#7a4a32'); gr.addColorStop(0.5, '#4a2c1e'); gr.addColorStop(1, '#1e120c');
    sx.fillStyle = gr;
    sx.beginPath(); sx.roundRect(r.x, r.y, r.w, r.h, 18); sx.fill();
    sx.fillStyle = '#c9a27a';
    for (let i = 0; i < 9; i++) sx.fillRect(r.x + 10 + i * (r.w - 20) / 8, r.y + 5, 2, 2);
    sx.fillStyle = '#2a1a12'; sx.fillRect(r.x + 26, r.y - 8, 10, 12); sx.fillRect(r.x + r.w - 36, r.y - 8, 10, 12);
  } else {
    // the Host behind wired glass, lit green from behind
    sx.fillStyle = '#0e1210'; sx.fillRect(r.x, r.y, r.w, r.h);
    const glow = sx.createRadialGradient(r.x + r.w / 2, r.y + r.h * 0.4, 4, r.x + r.w / 2, r.y + r.h * 0.4, r.w * 0.6);
    glow.addColorStop(0, 'rgba(150,190,120,0.55)'); glow.addColorStop(1, 'rgba(20,30,20,0.2)');
    sx.fillStyle = glow; sx.fillRect(r.x, r.y, r.w, r.h);
    sx.fillStyle = '#060706';
    sx.beginPath(); sx.arc(r.x + r.w / 2, r.y + 20, 10, 0, Math.PI * 2); sx.fill();
    sx.fillRect(r.x + r.w / 2 - 22, r.y + 32, 44, r.h - 32);
    sx.strokeStyle = 'rgba(60,70,60,0.8)'; sx.lineWidth = 0.8;
    sx.beginPath();
    for (let d = 0; d < r.w; d += 8) { sx.moveTo(r.x + d, r.y); sx.lineTo(r.x + d, r.y + r.h); }
    for (let d = 0; d < r.h; d += 8) { sx.moveTo(r.x, r.y + d); sx.lineTo(r.x + r.w, r.y + d); }
    sx.stroke();
    // cracks spread as it takes damage
    const hits = b.hpMax - b.hp;
    const cr = rng(42);
    sx.strokeStyle = 'rgba(230,240,225,0.7)'; sx.lineWidth = 1;
    for (let i = 0; i < hits; i++) {
      let cx = r.x + r.w / 2, cy = r.y + r.h - 8;
      sx.beginPath(); sx.moveTo(cx, cy);
      for (let s = 0; s < 5; s++) { cx += (cr() - 0.5) * 40; cy -= cr() * 12; sx.lineTo(cx, cy); }
      sx.stroke();
    }
    sx.strokeStyle = '#2c2a26'; sx.lineWidth = 4; sx.strokeRect(r.x, r.y, r.w, r.h);
  }
  // health notches along the top edge
  for (let i = 0; i < b.hpMax; i++) {
    sx.fillStyle = i < b.hp ? '#a39b8b' : '#2a2620';
    sx.fillRect(r.x + 12 + i * ((r.w - 24) / b.hpMax), r.y + 3, (r.w - 24) / b.hpMax - 2, 2);
  }
  // weak spot housing
  sx.fillStyle = '#121110'; sx.fillRect(ws.x - ws.half - 2, ws.y - 6, ws.half * 2 + 4, 10);
  if (b.flash > 0) { sx.fillStyle = `rgba(255,230,190,${b.flash * 0.5})`; sx.fillRect(r.x, r.y, r.w, r.h); }
}

function drawChain(x0, y0, x1, y1, color = '#5e5850') {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.floor(len / 6));
  sx.strokeStyle = color; sx.lineWidth = 1.6;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    sx.beginPath();
    if (i % 2) sx.ellipse(cx, cy, 1.4, 3.2, Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, 0, Math.PI * 2);
    else sx.ellipse(cx, cy, 3.2, 1.4, Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, 0, Math.PI * 2);
    sx.stroke();
  }
}

function drawPaddle(g) {
  const p = g.paddle;
  const w = p.w * (1 + p.squash * 0.08), h = PADDLE.h * (1 - p.squash * 0.3);
  const x = p.x - w / 2, y = PADDLE.y + (PADDLE.h - h);
  // chained at both ends, down to the floor
  drawChain(x + 4, y + h, x - 14, H + 4);
  drawChain(x + w - 4, y + h, x + w + 14, H + 4);
  const gr = sx.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#a08a6a'); gr.addColorStop(0.5, '#5d4c38'); gr.addColorStop(1, '#2a2118');
  sx.fillStyle = gr; sx.fillRect(x, y, w, h);
  sx.fillStyle = 'rgba(20,16,12,0.8)';
  for (let gx = x + w / 2 - 10; gx < x + w / 2 + 10; gx += 4) sx.fillRect(gx, y + 1, 2, h - 2);
  sx.fillStyle = '#2d241b'; sx.fillRect(x, y, 3, h); sx.fillRect(x + w - 3, y, 3, h);
}

function drawBall(b) {
  for (let i = 0; i < b.trail.length; i += 2) {
    sx.fillStyle = `rgba(210,200,180,${(i / b.trail.length) * 0.15})`;
    sx.fillRect(b.trail[i] - 2, b.trail[i + 1] - 2, 4, 4);
  }
  const gr = sx.createRadialGradient(b.x - 1.5, b.y - 1.5, 0.5, b.x, b.y, BALL.r);
  gr.addColorStop(0, '#f2eee4'); gr.addColorStop(0.5, '#9d978b'); gr.addColorStop(1, '#3a3631');
  sx.fillStyle = gr;
  sx.beginPath(); sx.arc(b.x, b.y, BALL.r, 0, Math.PI * 2); sx.fill();
}

function overheadPos(g) {
  const bulbY = Math.max(110, Math.min(400, g.wallY + g.rows * 10 + 50));
  const L = bulbY + 260;
  const a = Math.sin(g.t * 0.8) * 0.3;
  return { x: W / 2 + Math.sin(a) * L, y: -260 + Math.cos(a) * L };
}

// Life bulbs strung on a wire along the floor; each lights a stretch of the paddle lane.
export function lifeBulbs(g) {
  const shown = Math.max(g.run.bulbs, g.run.bulbsShown || 0);
  g.run.bulbsShown = shown;
  const out = [];
  for (let i = 0; i < shown; i++) {
    const x = W * (i + 1) / (shown + 1);
    const sag = Math.sin((i + 1) / (shown + 1) * Math.PI) * 8;
    out.push({ x, y: 614 + sag, lit: i < g.run.bulbs });
  }
  return out;
}

function drawWire(bulbs) {
  sx.strokeStyle = '#1d1a16'; sx.lineWidth = 1.2;
  sx.beginPath(); sx.moveTo(0, 608);
  for (const b of bulbs) sx.lineTo(b.x, b.y - 6);
  sx.lineTo(W, 608); sx.stroke();
}

function bulbSprite(x, y, lit, alpha = 1) {
  sx.fillStyle = `rgba(40,36,30,${alpha})`; sx.fillRect(x - 2, y - 7, 4, 4);
  sx.fillStyle = lit ? `rgba(255,214,150,${alpha})` : `rgba(70,66,60,${alpha})`;
  sx.beginPath(); sx.arc(x, y, 3.6, 0, Math.PI * 2); sx.fill();
}

// ---------- the frame ----------

export function render(g, opts = {}) {
  const L = lighting(g);
  const reduce = !!opts.reduce;
  const shake = reduce ? 0 : g.shake * 4;
  const ox = (Math.random() - 0.5) * shake, oy = (Math.random() - 0.5) * shake;
  const tint = g.floor.tint.light;

  sx.setTransform(K, 0, 0, K, 0, 0);
  sx.translate(ox, oy);
  sx.drawImage(background(g.floor), 0, 0, W, H);

  // painted crush line on the wall
  sx.fillStyle = 'rgba(150,30,24,0.55)';
  for (let dx = 8; dx < W; dx += 16) sx.fillRect(dx, CRUSH_Y - 1, 9, 3);

  drawCeiling(g);
  for (const b of g.bricks) if (b.alive) drawBrick(b, brickRect(g, b));
  if (g.boss) drawBoss(g);
  if (g.chain) drawChain(g.chain.px, g.chain.py, g.chain.tx, g.chain.ty, '#6b6358');

  const bulbs = lifeBulbs(g);
  drawWire(bulbs);
  for (const b of bulbs) bulbSprite(b.x, b.y, b.lit);

  for (const d of g.drops) {
    sx.save(); sx.translate(d.x, d.y); sx.rotate(Math.sin(d.spin) * 0.4);
    sx.fillStyle = '#0d0c0b'; sx.fillRect(-8, -5, 16, 10);
    sx.fillStyle = '#d9cfb3'; sx.fillRect(-7, -4, 14, 3);
    sx.restore();
  }
  drawPaddle(g);
  for (const q of g.particles) {
    const a = Math.max(0, q.life / q.max);
    if (q.kind === 'chip') sx.fillStyle = q.type === 'steel' ? `rgba(120,126,132,${a})` : `rgba(140,134,122,${a})`;
    else if (q.kind === 'shard') sx.fillStyle = `rgba(200,230,215,${a})`;
    else if (q.kind === 'steam') sx.fillStyle = `rgba(190,185,175,${a * 0.25})`;
    else continue;
    sx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  for (const b of g.balls) drawBall(b);

  // ---------- light ----------
  mx.setTransform(1, 0, 0, 1, 0, 0);
  mx.globalCompositeOperation = 'source-over';
  mx.clearRect(0, 0, LOW_W, LOW_H);
  mx.fillStyle = `rgba(0,0,0,${L.dark})`;
  mx.fillRect(0, 0, LOW_W, LOW_H);
  mx.setTransform(K, 0, 0, K, ox * K, oy * K);
  mx.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, power = 1) => {
    if (r <= 0) return;
    const gr = mx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${power})`);
    gr.addColorStop(0.5, `rgba(0,0,0,${power * 0.6})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    mx.fillStyle = gr;
    mx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const over = overheadPos(g);
  if (L.overhead > 0) hole(over.x, over.y + 10, 165 * L.overhead, 0.97);
  for (const b of g.balls) hole(b.x, b.y, L.ballLight, 0.95);
  for (const l of g.lights) hole(l.x, l.y, l.r, Math.min(1, l.life / l.max * 1.6));
  if (!L.black) for (const b of bulbs) if (b.lit) hole(b.x, b.y - 18, 105, 0.9);
  if (g.boss && !g.boss.dead && !L.black) {
    const ws = weakSpot(g);
    hole(ws.x, ws.y + 30, g.boss.key === 'caretaker' ? 85 : 55, 0.8);
  }
  if (g.run.mods.torch && !L.black) {
    const p = g.paddle;
    mx.save();
    mx.beginPath(); mx.moveTo(p.x - 8, PADDLE.y); mx.lineTo(p.x - 90, PADDLE.y - 300); mx.lineTo(p.x + 90, PADDLE.y - 300); mx.lineTo(p.x + 8, PADDLE.y); mx.closePath(); mx.clip();
    hole(p.x, PADDLE.y, 300, 0.8);
    mx.restore();
  }
  for (const q of g.particles) if (q.kind === 'spark') hole(q.x, q.y, 14, 0.6);

  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.drawImage(mask, 0, 0);

  // warm wash where the light falls
  sx.setTransform(K, 0, 0, K, ox * K, oy * K);
  sx.globalCompositeOperation = 'soft-light';
  const wash = (x, y, r, a) => {
    const gr = sx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgb(tint, a)); gr.addColorStop(1, rgb(tint, 0));
    sx.fillStyle = gr; sx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (L.overhead > 0) wash(over.x, over.y + 10, 150 * L.overhead, 0.5);
  sx.globalCompositeOperation = 'source-over';

  // ---------- things that glow on their own ----------
  sx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, color, a) => {
    const gr = sx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgb(color, a)); gr.addColorStop(1, rgb(color, 0));
    sx.fillStyle = gr; sx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // overhead bulb and its cord
  sx.globalCompositeOperation = 'source-over';
  sx.strokeStyle = 'rgba(30,27,23,0.9)'; sx.lineWidth = 1;
  sx.beginPath(); sx.moveTo(W / 2 + (over.x - W / 2) * 0.05, 0); sx.lineTo(over.x, over.y - 6); sx.stroke();
  bulbSprite(over.x, over.y, L.overhead > 0.05);
  sx.globalCompositeOperation = 'lighter';
  if (L.overhead > 0.05) glow(over.x, over.y, 22, [255, 200, 130], 0.45 * L.overhead);
  for (const b of bulbs) if (b.lit && !L.black) glow(b.x, b.y, 12, [255, 200, 130], 0.35);
  for (const q of g.particles) {
    if (q.kind === 'spark') { sx.fillStyle = `rgba(255,190,110,${q.life / q.max})`; sx.fillRect(q.x - 1, q.y - 1, 2.5, 2.5); }
  }
  if (g.boss && !g.boss.dead) {
    const ws = weakSpot(g);
    const pulse = 0.55 + Math.sin(g.t * 5) * 0.2;
    const col = g.boss.key === 'host' ? [160, 220, 140] : [255, 190, 110];
    glow(ws.x, ws.y, 18, col, pulse * 0.7);
    sx.fillStyle = rgb(col, pulse); sx.fillRect(ws.x - ws.half, ws.y - 2, ws.half * 2, 4);
  }
  // the crush line glows harder the closer the wall gets
  const d = g.danger || 0;
  if (d > 0) {
    const pa = d * (0.35 + 0.25 * Math.sin(g.t * (4 + d * 10)));
    sx.fillStyle = `rgba(200,40,30,${pa})`;
    for (let dx = 8; dx < W; dx += 16) sx.fillRect(dx, CRUSH_Y - 1, 9, 3);
  }
  sx.globalCompositeOperation = 'source-over';

  // keep the paddle edge and the ball just visible, even in the dark
  const p = g.paddle;
  sx.fillStyle = 'rgba(220,185,130,0.5)';
  sx.fillRect(p.x - p.w / 2, PADDLE.y, p.w, 2);
  for (const b of g.balls) if (L.ballLight === 0) {
    sx.fillStyle = 'rgba(220,214,200,0.45)';
    sx.beginPath(); sx.arc(b.x, b.y, BALL.r - 1, 0, Math.PI * 2); sx.fill();
  }
  for (const dr of g.drops) { sx.fillStyle = 'rgba(217,207,179,0.55)'; sx.fillRect(dr.x - 7, dr.y - 4, 14, 3); }

  sx.setTransform(1, 0, 0, 1, 0, 0);
  return scene;
}
