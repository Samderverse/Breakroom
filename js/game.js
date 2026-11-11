// Breakroom game rules and physics. No DOM in here, so it can be simulated headless.
// The screen code reads `g` to draw, and drains `g.events` to play sounds and show text.

import {
  W, H, GRID, PADDLE, CRUSH_Y, BALL, START_BULBS, MAX_BULBS,
  FLOORS, BOSSES, DEALS, FLOOR_ROUNDS,
} from './config.js';

const STEP = 1 / 240;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ---------- the run ----------

export function newRun() {
  return {
    floor: 0, round: 0, roundsCleared: 0,
    bulbs: START_BULBS, deals: [], mods: computeMods([]),
    rewindLeft: 0, hostPicksNext: false, darkStartNext: false,
    tapes: 0, time: 0, outcome: null,
    plan: FLOORS.map((f) => shuffle(f.layouts.map((_, i) => i)).slice(0, FLOOR_ROUNDS - 1)),
  };
}

export function computeMods(dealIds) {
  const m = {
    lightMul: 0, paddleMul: 0, extraBalls: 0, ceilingMul: 0, torch: 0, speedMul: 0, lead: 0,
    steerMul: 0, magnet: 0, blackout: 0, spike: 0, glassDark: 0, rewind: 0, matches: 0,
    startDrop: 0, steady: 0, ballDark: 0, fuse: 0,
  };
  for (const id of dealIds) {
    const d = DEALS.find((x) => x.id === id);
    if (d && d.mods) for (const [k, v] of Object.entries(d.mods)) m[k] += v;
  }
  return m;
}

export const floorOf = (run) => FLOORS[Math.min(run.floor, FLOORS.length - 1)];
export const isBossRound = (run) => run.round === FLOOR_ROUNDS - 1;
export const roundNumber = (run) => run.floor * FLOOR_ROUNDS + run.round + 1;

// Three deals the player has not taken yet, each marked affordable or not.
export function offerDeals(run) {
  const open = DEALS.filter((d) => !run.deals.includes(d.id));
  return shuffle(open).slice(0, 3).map((d) => ({ ...d, affordable: !d.needsBulbs || run.bulbs >= d.needsBulbs }));
}

export function takeDeal(run, id) {
  const d = DEALS.find((x) => x.id === id);
  if (!d) return;
  run.deals.push(id);
  run.mods = computeMods(run.deals);
  if (d.now === 'spareBulb') { run.bulbs = Math.min(MAX_BULBS, run.bulbs + 1); run.darkStartNext = true; }
  if (d.now === 'loseBulb') run.bulbs = Math.max(1, run.bulbs - 1);
  if (d.now === 'hostPicks') { run.rewindLeft = 1; run.hostPicksNext = true; }
}

// Move the run on after a cleared round. Returns 'floor', 'round' or 'win'.
export function advance(run) {
  run.roundsCleared++;
  run.round++;
  if (run.round >= FLOOR_ROUNDS) {
    run.round = 0;
    run.floor++;
    if (run.floor >= FLOORS.length) { run.outcome = 'win'; return 'win'; }
    return 'floor';
  }
  return 'round';
}

// ---------- a round ----------

export function newRound(run) {
  const floor = floorOf(run);
  const boss = isBossRound(run);
  const m = run.mods;
  const g = {
    run, floor, t: 0, roundT: 0, state: 'serve', events: [],
    bricks: [], rows: 0, boss: null,
    wallY: 0, wallYTarget: 0, ceilingTimer: 0,
    balls: [], drops: [], particles: [], lights: [],
    paddle: { x: W / 2, target: W / 2, vx: 0, w: PADDLE.w * (1 + m.paddleMul), squash: 0 },
    shake: 0, glitch: 0, hitstop: 0,
    blackout: 0, blackoutTimer: 8, flicker: 0, flickerTimer: rand(10, 16),
    overhead: 1, matchesLeft: m.matches, matchLight: 0,
    darkStart: run.darkStartNext ? 5 : 0,
    chain: null, chainCooldown: 0, stuckTimer: 0, danger: 0,
  };
  run.darkStartNext = false;

  let rows;
  if (boss) {
    const def = BOSSES[floor.boss];
    g.boss = {
      ...def, key: floor.boss, x: W / 2, targetX: W / 2, hpMax: def.hp, flash: 0,
      regrowTimer: def.regrow, ventTimer: def.vent || 0, hopTimer: def.hop || 0, dead: false,
    };
    rows = ['........', '........', '........', ...def.shield];
    g.shieldRows = [3, 4];
  } else {
    rows = floor.layouts[run.plan[run.floor][run.round]];
  }
  g.rows = rows.length;
  rows.forEach((line, r) => {
    for (let c = 0; c < GRID.cols; c++) {
      const ch = line[c];
      if (ch && ch !== '.') g.bricks.push(makeBrick(ch, c, r));
    }
  });
  g.wallY = g.wallYTarget = Math.max(44, 232 - g.rows * GRID.cellH) + m.startDrop * GRID.cellH;
  g.ceilingTimer = ceilingInterval(g);
  serve(g);
  return g;
}

function makeBrick(ch, c, r) {
  const type = { '#': 'block', '=': 'steel', o: 'glass', X: 'pipe', t: 'tape' }[ch] || 'block';
  return { type, c, r, hp: type === 'steel' ? 2 : 1, alive: true, flash: 0, seed: Math.random() };
}

function ceilingInterval(g) {
  const base = g.floor.ceilingEvery * (g.boss ? 1.35 : 1);
  return base / (1 + g.run.mods.ceilingMul);
}

export function brickRect(g, b) {
  const x = GRID.offsetX + b.c * GRID.cellW + GRID.inset;
  const y = g.wallY + b.r * GRID.cellH + GRID.inset;
  return { x, y, w: GRID.cellW - GRID.inset * 2, h: GRID.cellH - GRID.inset * 2 };
}

export function bossRect(g) {
  const b = g.boss;
  return { x: b.x - b.w / 2, y: g.wallY + 4, w: b.w, h: b.h };
}

export function weakSpot(g) {
  const r = bossRect(g);
  return { x: g.boss.x, y: r.y + r.h - 7, half: 15 };
}

// Lowest point of anything solid hanging from the ceiling.
function wallBottom(g) {
  let low = g.wallY;
  for (const b of g.bricks) if (b.alive) low = Math.max(low, g.wallY + (b.r + 1) * GRID.cellH);
  if (g.boss && !g.boss.dead) low = Math.max(low, bossRect(g).y + g.boss.h);
  return low;
}

function speedNow(g) {
  const m = g.run.mods;
  const s = BALL.start * (1 + m.speedMul) + BALL.ramp * g.roundT;
  return Math.min(s, BALL.cap * (1 + m.speedMul), BALL.hardCap);
}

function serve(g) {
  g.balls = [{ x: g.paddle.x, y: PADDLE.y - BALL.r - 1, vx: 0, vy: 0, stuck: true, offset: 0, spike: false, trail: [] }];
  g.state = 'serve';
}

export function launch(g) {
  const stuck = g.balls.filter((b) => b.stuck);
  if (!stuck.length) return;
  const s = speedNow(g);
  for (const b of stuck) {
    const u = clamp(b.offset / (g.paddle.w / 2), -1, 1);
    const a = (u * 40 + rand(-8, 8)) * Math.PI / 180;
    b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s; b.stuck = false; b.spike = !!g.run.mods.spike;
  }
  // Extra balls only come with a fresh serve, not a magnet release.
  if (g.state === 'serve') {
    for (let i = 0; i < g.run.mods.extraBalls; i++) {
      const a = (i % 2 ? 1 : -1) * (28 + i * 6) * Math.PI / 180;
      g.balls.push({ x: g.paddle.x, y: PADDLE.y - BALL.r - 1, vx: Math.sin(a) * s, vy: -Math.cos(a) * s, stuck: false, offset: 0, spike: !!g.run.mods.spike, trail: [] });
    }
  }
  g.state = 'play';
  g.stuckTimer = 0;
  emit(g, 'launch');
}

export function useMatch(g) {
  if (g.matchesLeft <= 0 || g.matchLight > 0 || (g.state !== 'play' && g.state !== 'serve')) return false;
  g.matchesLeft--;
  g.matchLight = 1;
  emit(g, 'match');
  return true;
}

export function setPaddleTarget(g, x) {
  g.paddle.target = clamp(x, g.paddle.w / 2, W - g.paddle.w / 2);
}

const emit = (g, type, data = {}) => g.events.push({ type, ...data });

// ---------- update ----------

export function update(g, dt, reduce) {
  dt = Math.min(dt, 0.05);
  g.t += dt;
  const live = g.state === 'play' || g.state === 'serve';

  // paddle follows its target quickly
  const p = g.paddle;
  const before = p.x;
  p.x += (p.target - p.x) * Math.min(1, dt * 30);
  p.x = clamp(p.x, p.w / 2, W - p.w / 2);
  p.vx = (p.x - before) / Math.max(dt, 1e-4);
  p.squash = Math.max(0, p.squash - dt * 6);
  for (const b of g.balls) if (b.stuck) { b.x = p.x + b.offset; b.y = PADDLE.y - BALL.r - 1; }

  // timers that run even between rounds
  g.shake = Math.max(0, g.shake - dt * 3);
  g.glitch = Math.max(0, g.glitch - dt * 1.4);
  g.wallY += (g.wallYTarget - g.wallY) * Math.min(1, dt * 7);
  updateParticles(g, dt);
  updateLights(g, dt);

  if (!live) return;

  g.roundT += dt;
  g.run.time += dt;
  g.matchLight = Math.max(0, g.matchLight - dt);
  g.darkStart = Math.max(0, g.darkStart - dt);
  g.blackout = Math.max(0, g.blackout - dt);
  g.chainCooldown = Math.max(0, g.chainCooldown - dt);
  for (const b of g.bricks) b.flash = Math.max(0, b.flash - dt * 4);

  updateHazards(g, dt, reduce);
  if (g.boss) updateBoss(g, dt, reduce);

  // the ceiling comes down on a timer
  g.ceilingTimer -= dt;
  if (g.ceilingTimer <= 0) {
    g.ceilingTimer = ceilingInterval(g);
    g.wallYTarget += GRID.cellH;
    g.shake = Math.max(g.shake, 0.35);
    g.glitch = Math.max(g.glitch, 0.25);
    emit(g, 'ceiling');
  }
  const low = wallBottom(g) + (g.wallYTarget - g.wallY);
  g.danger = clamp((low - (CRUSH_Y - 220)) / 220, 0, 1);
  if (low >= CRUSH_Y) { g.wallY = g.wallYTarget; return die(g, 'crushed'); }

  // magnet: release automatically after a moment
  if (g.state === 'play' && g.balls.some((b) => b.stuck)) {
    g.stuckTimer += dt;
    if (g.stuckTimer > 2.5) launch(g);
  }

  if (g.hitstop > 0) { g.hitstop -= dt; return; }

  if (g.state === 'play') {
    g.acc = (g.acc || 0) + dt;
    while (g.acc >= STEP) {
      g.acc -= STEP;
      step(g, STEP);
      if (g.state !== 'play') break;
    }
  }

  // tapes falling
  for (const d of g.drops) {
    d.y += 110 * dt;
    d.spin += dt * 4;
    if (d.y > PADDLE.y - 6 && d.y < PADDLE.y + PADDLE.h + 6 && Math.abs(d.x - p.x) < p.w / 2 + 6) {
      d.gone = true;
      g.run.tapes++;
      g.lights.push({ x: p.x, y: PADDLE.y - 40, r: 170, life: 2, max: 2 });
      emit(g, 'tape');
    }
    if (d.y > H + 10) d.gone = true;
  }
  g.drops = g.drops.filter((d) => !d.gone);

  for (const b of g.balls) {
    b.trail.push(b.x, b.y);
    if (b.trail.length > 12) b.trail.splice(0, 2);
  }
}

function updateHazards(g, dt, reduce) {
  const hz = g.floor.hazard;
  const m = g.run.mods;

  // B1: the overhead bulb flickers out now and then
  if (hz === 'flicker') {
    g.flickerTimer -= dt;
    if (g.flickerTimer <= 0) { g.flicker = 1.1; g.flickerTimer = rand(12, 20); emit(g, 'flicker'); }
  }
  if (g.flicker > 0) {
    g.flicker -= dt;
    const on = Math.sin(g.flicker * 38) > 0.2 || g.flicker < 0.15;
    g.overhead = on ? 1 : (reduce ? 0.55 : 0);
  } else g.overhead = 1;

  // Magnet's cost: a short blackout every 8 seconds
  if (m.blackout) {
    g.blackoutTimer -= dt;
    if (g.blackoutTimer <= 0) { g.blackoutTimer = 8; g.blackout = Math.max(g.blackout, 0.6); emit(g, 'blackout'); }
  }

  // B2: a chain swinging under the wall
  if (hz === 'chain') {
    const py = wallBottom(g) + 2;
    const len = Math.min(120, CRUSH_Y - 40 - py);
    if (len > 30) {
      const a = Math.sin(g.t * 1.1) * 0.85;
      g.chain = { px: W / 2, py, tx: W / 2 + Math.sin(a) * len, ty: py + Math.cos(a) * len, len };
    } else g.chain = null;
  }
}

function updateBoss(g, dt, reduce) {
  const b = g.boss;
  if (b.dead) return;
  b.flash = Math.max(0, b.flash - dt * 3);
  const range = W / 2 - b.w / 2 - 8;
  if (b.key === 'host') {
    b.hopTimer -= dt;
    if (b.hopTimer <= 0) { b.hopTimer = b.hop; b.targetX = W / 2 + rand(-range, range); emit(g, 'hop'); }
    b.x += (b.targetX - b.x) * Math.min(1, dt * 3);
  } else {
    b.x = W / 2 + Math.sin(g.t * b.speed) * range;
  }
  if (b.vent) {
    b.ventTimer -= dt;
    if (b.ventTimer <= 0) {
      b.ventTimer = b.vent;
      g.blackout = Math.max(g.blackout, reduce ? 0.5 : 1);
      g.glitch = Math.max(g.glitch, 0.5);
      const r = bossRect(g);
      for (let i = 0; i < 26; i++) g.particles.push({ kind: 'steam', x: r.x + rand(0, r.w), y: r.y + r.h, vx: rand(-40, 40), vy: rand(30, 90), life: rand(0.8, 1.6), max: 1.6, size: rand(4, 9) });
      emit(g, 'vent');
    }
  }
  // the shield grows back one brick at a time
  b.regrowTimer -= dt;
  if (b.regrowTimer <= 0) {
    b.regrowTimer = b.regrow;
    const dead = g.bricks.filter((k) => !k.alive && g.shieldRows.includes(k.r));
    if (dead.length) {
      const k = pick(dead);
      k.alive = true; k.hp = k.type === 'steel' ? 2 : 1; k.flash = 1;
      emit(g, 'regrow');
    }
  }
}

// ---------- physics ----------

function step(g, dt) {
  const s = speedNow(g);
  const m = g.run.mods;
  const minFlat = (m.steady ? 34 : 18) * Math.PI / 180;
  const ceiling = g.wallY;

  for (const ball of g.balls) {
    if (ball.stuck || ball.lost) continue;

    if (g.floor.hazard === 'draught') ball.vx += (Math.sin(g.t * 0.45) * 40 + Math.sin(g.t * 1.3) * 14) * dt;

    // hold a constant speed and stop it ever going flat
    let sp = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx = ball.vx / sp * s; ball.vy = ball.vy / sp * s;
    if (Math.abs(ball.vy) < Math.sin(minFlat) * s) {
      ball.vy = Math.sign(ball.vy || -1) * Math.sin(minFlat) * s;
      ball.vx = Math.sign(ball.vx || 1) * Math.cos(minFlat) * s;
    }
    // and never perfectly vertical, which can loop forever on one column
    if (Math.abs(ball.vx) < s * 0.07) {
      ball.vx = (ball.vx < 0 ? -1 : 1) * s * 0.07;
      ball.vy = Math.sign(ball.vy) * Math.sqrt(s * s - ball.vx * ball.vx);
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const r = BALL.r;

    if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx); emit(g, 'wall'); }
    if (ball.x > W - r) { ball.x = W - r; ball.vx = -Math.abs(ball.vx); emit(g, 'wall'); }
    if (ball.y - r < ceiling) { ball.y = ceiling + r; ball.vy = Math.abs(ball.vy); emit(g, 'wall'); }

    // paddle
    const p = g.paddle;
    if (ball.vy > 0 && ball.y + r >= PADDLE.y && ball.y - r <= PADDLE.y + PADDLE.h && Math.abs(ball.x - p.x) <= p.w / 2 + r) {
      const u = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
      const maxA = (m.steady ? 52 : 62) * (1 + m.steerMul);
      const a = (u * maxA + rand(-3, 3)) * Math.PI / 180;
      ball.vx = Math.sin(a) * s; ball.vy = -Math.cos(a) * s;
      ball.y = PADDLE.y - r;
      p.squash = 1;
      ball.spike = !!m.spike;
      emit(g, 'paddle', { u });
      if (m.magnet) { ball.stuck = true; ball.offset = ball.x - p.x; g.stuckTimer = 0; }
      continue;
    }

    if (ball.y - r > H) { ball.lost = true; continue; }

    // chain hazard: bounce off the swinging segment
    if (g.chain) hitChain(g, ball);

    // boss
    if (g.boss && !g.boss.dead) {
      const br = bossRect(g);
      const hit = circleRect(ball, br);
      if (hit) {
        const ws = weakSpot(g);
        const fromBelow = hit.axis === 'y' && ball.vy < 0;
        bounce(ball, hit);
        if (fromBelow && Math.abs(ball.x - ws.x) <= ws.half + r) hurtBoss(g, ball);
        else { emit(g, 'clang'); g.boss.flash = Math.max(g.boss.flash, 0.2); }
        continue;
      }
    }

    // bricks: one hit per step keeps the bounce clean
    for (const b of g.bricks) {
      if (!b.alive) continue;
      const hit = circleRect(ball, brickRect(g, b));
      if (!hit) continue;
      if (ball.spike && b.type !== 'pipe') {
        ball.spike = false;
        damage(g, b, true);
      } else {
        bounce(ball, hit);
        damage(g, b, false);
      }
      break;
    }
  }

  // dropped balls
  if (g.balls.some((b) => b.lost)) {
    g.balls = g.balls.filter((b) => !b.lost);
    if (!g.balls.length) dropped(g);
  }
}

function circleRect(ball, r) {
  const nx = clamp(ball.x, r.x, r.x + r.w);
  const ny = clamp(ball.y, r.y, r.y + r.h);
  const dx = ball.x - nx, dy = ball.y - ny;
  if (dx * dx + dy * dy > BALL.r * BALL.r) return null;
  const ox = Math.min(ball.x + BALL.r - r.x, r.x + r.w - (ball.x - BALL.r));
  const oy = Math.min(ball.y + BALL.r - r.y, r.y + r.h - (ball.y - BALL.r));
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return ox < oy
    ? { axis: 'x', dir: Math.sign(ball.x - cx) || 1, depth: ox }
    : { axis: 'y', dir: Math.sign(ball.y - cy) || 1, depth: oy };
}

function bounce(ball, hit) {
  if (hit.axis === 'x') { ball.vx = Math.abs(ball.vx) * hit.dir; ball.x += hit.dir * hit.depth; }
  else { ball.vy = Math.abs(ball.vy) * hit.dir; ball.y += hit.dir * hit.depth; }
}

function hitChain(g, ball) {
  const c = g.chain;
  const ex = c.tx - c.px, ey = c.ty - c.py;
  const L2 = ex * ex + ey * ey;
  const t = clamp(((ball.x - c.px) * ex + (ball.y - c.py) * ey) / L2, 0, 1);
  const qx = c.px + ex * t, qy = c.py + ey * t;
  const dx = ball.x - qx, dy = ball.y - qy;
  const d = Math.hypot(dx, dy);
  if (d > BALL.r + 2.5 || d === 0) return;
  const nx = dx / d, ny = dy / d;
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) { ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny; }
  ball.x = qx + nx * (BALL.r + 2.6); ball.y = qy + ny * (BALL.r + 2.6);
  if (g.chainCooldown <= 0) { emit(g, 'chain'); g.chainCooldown = 0.25; }
}

function damage(g, b, pierced) {
  const m = g.run.mods;
  const rect = brickRect(g, b);
  if (b.type === 'pipe') { b.flash = 1; emit(g, 'pipe'); return; }
  b.hp -= (b.type === 'steel' && m.lead) ? 2 : 1;
  b.flash = 1;
  if (b.hp > 0) { emit(g, 'dent', { x: rect.x }); chips(g, rect, b.type, 4); return; }
  breakBrick(g, b, pierced);
  if (m.fuse) {
    const n = g.bricks.filter((k) => k.alive && k.type !== 'pipe' && Math.abs(k.c - b.c) + Math.abs(k.r - b.r) === 1);
    if (n.length) {
      breakBrick(g, pick(n), false);
      g.blackout = Math.max(g.blackout, 0.25);
      g.shake = Math.max(g.shake, 0.6);
      g.glitch = Math.max(g.glitch, 0.4);
      emit(g, 'fuse');
    }
  }
  checkClear(g);
}

function breakBrick(g, b, pierced) {
  const rect = brickRect(g, b);
  b.alive = false;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  chips(g, rect, b.type, b.type === 'glass' ? 14 : 10);
  g.hitstop = 0.035;
  g.shake = Math.max(g.shake, 0.18);
  if (b.type === 'glass') {
    if (!g.run.mods.glassDark) g.lights.push({ x: cx, y: cy, r: 115, life: 5, max: 5 });
    emit(g, 'glass', { x: cx });
  } else emit(g, 'break', { x: cx, brick: b.type, pierced });
  if (b.type === 'tape') g.drops.push({ x: cx, y: cy, spin: 0 });
}

function chips(g, rect, type, n) {
  for (let i = 0; i < n; i++) {
    g.particles.push({
      kind: type === 'glass' ? 'shard' : 'chip', type,
      x: rect.x + rand(0, rect.w), y: rect.y + rand(0, rect.h),
      vx: rand(-90, 90), vy: rand(-60, 70), life: rand(0.5, 1.1), max: 1.1, size: rand(1.5, 3.5),
    });
  }
}

function hurtBoss(g, ball) {
  const b = g.boss;
  b.hp--;
  b.flash = 1;
  g.hitstop = 0.08;
  g.shake = Math.max(g.shake, 0.5);
  g.glitch = Math.max(g.glitch, 0.3);
  const ws = weakSpot(g);
  g.lights.push({ x: ws.x, y: ws.y, r: 90, life: 0.6, max: 0.6 });
  for (let i = 0; i < 12; i++) g.particles.push({ kind: 'spark', x: ws.x, y: ws.y, vx: rand(-140, 140), vy: rand(-40, 160), life: rand(0.3, 0.8), max: 0.8, size: 2 });
  emit(g, 'bossHit', { hp: b.hp });
  if (b.hp <= 0) {
    b.dead = true;
    const r = bossRect(g);
    for (let i = 0; i < 50; i++) g.particles.push({ kind: b.key === 'host' ? 'shard' : 'chip', type: 'steel', x: r.x + rand(0, r.w), y: r.y + rand(0, r.h), vx: rand(-160, 160), vy: rand(-80, 160), life: rand(0.6, 1.6), max: 1.6, size: rand(2, 5) });
    for (const k of g.bricks) if (k.alive && k.type !== 'pipe') { k.alive = false; chips(g, brickRect(g, k), k.type, 3); }
    g.shake = 1;
    g.glitch = 0.8;
    emit(g, 'bossDead', { key: b.key });
  }
  checkClear(g);
}

function checkClear(g) {
  const done = g.boss ? g.boss.dead : !g.bricks.some((b) => b.alive && b.type !== 'pipe');
  if (!done) return;
  g.state = 'clear';
  g.balls = [];
  emit(g, 'clear');
}

function dropped(g) {
  const run = g.run;
  if (run.rewindLeft > 0) {
    run.rewindLeft--;
    g.glitch = 1;
    emit(g, 'rewind');
    serve(g);
    return;
  }
  run.bulbs--;
  g.glitch = 1;
  g.shake = 0.7;
  emit(g, 'bulb', { left: run.bulbs });
  if (run.bulbs <= 0) return die(g, 'dead');
  serve(g);
}

function die(g, how) {
  g.state = 'over';
  g.run.outcome = how;
  g.balls = [];
  g.glitch = 1;
  g.shake = 1;
  emit(g, how);
}

function updateParticles(g, dt) {
  for (const q of g.particles) {
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.kind === 'steam') { q.vx *= 0.97; q.vy *= 0.97; q.size += dt * 10; }
    else q.vy += 420 * dt;
  }
  g.particles = g.particles.filter((q) => q.life > 0 && q.y < H + 20);
  if (g.particles.length > 400) g.particles.splice(0, g.particles.length - 400);
}

function updateLights(g, dt) {
  for (const l of g.lights) l.life -= dt;
  g.lights = g.lights.filter((l) => l.life > 0);
}

// How dark the room is right now (0 = fully lit, 1 = black) and the overhead bulb's reach.
export function lighting(g) {
  const bulbs = g.run.bulbs;
  const base = [1, 0.94, 0.9, 0.86, 0.83, 0.8][clamp(bulbs, 0, 5)];
  const reach = [0, 0.6, 0.82, 1, 1.08, 1.15][clamp(bulbs, 0, 5)];
  const black = g.blackout > 0 || g.darkStart > 0;
  return {
    dark: g.matchLight > 0 ? 0.35 + 0.6 * (1 - g.matchLight) : (black ? 0.995 : base),
    overhead: black ? 0 : g.overhead * reach,
    ballLight: black || g.run.mods.ballDark ? 0 : 78 * (1 + g.run.mods.lightMul),
    black,
  };
}
