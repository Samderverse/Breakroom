// Breakroom: screens, input and the main loop. Rules live in game.js, drawing in render.js.

import { W, FLOORS, BOSSES, HOST, FLOOR_ROUNDS } from './config.js';
import * as G from './game.js';
import { render } from './render.js';
import { createPostFx } from './postfx.js';
import * as A from './audio.js';

const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const el = {
  stage: $('stage'), frame: $('frame'), canvas: $('screen'),
  osd: $('osd'), where: $('where'), clock: $('clock'), prompt: $('prompt'), match: $('matchBtn'), pauseBtn: $('pauseBtn'),
  host: document.querySelector('#host p'), banner: $('banner'),
  title: $('title'), deal: $('deal'), pause: $('pause'), over: $('over'),
  dealWhere: $('dealWhere'), dealSay: $('dealSay'), cards: $('cards'), dealBulbs: $('dealBulbs'), refuse: $('refuse'),
  overTitle: $('overTitle'), overSay: $('overSay'), overStats: $('overStats'), overClock: $('overClock'), pauseClock: $('pauseClock'),
  best: $('best'), credits: $('credits'),
};

// ---------- settings and best run ----------

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};
const reducedPref = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const settings = Object.assign({ sound: true, reduce: reducedPref }, store.get('breakroom.settings', {}));
let best = store.get('breakroom.best', null);

function applySettings() {
  for (const id of ['soundVal', 'soundVal2']) $(id).textContent = settings.sound ? 'ON' : 'OFF';
  for (const id of ['reduceVal', 'reduceVal2']) $(id).textContent = settings.reduce ? 'ON' : 'OFF';
  document.documentElement.classList.toggle('reduce', settings.reduce);
  A.setEnabled(settings.sound);
  store.set('breakroom.settings', settings);
}

const CREDITS = [
  ['Game', 'Breakroom by Samderverse'],
  ['Theme music', 'Potential Theme (add artist / source)'],
  ['Room drone', 'Dread Ambience (add artist / source)'],
  ['Drips', 'Water Drip Echo in Room (add source)'],
  ['Thuds, chain, clunk, tape buttons', 'adapted from sonidosKMD, via Tilt'],
  ['Glass', 'adapted from Epic Sound Effects, via Tilt'],
  ['Tape glitch', 'adapted from Edwardo Ching, via Tilt'],
];
el.credits.innerHTML = CREDITS.map(([a, b]) => `<li>${a}: ${b}</li>`).join('');

function showBest() {
  if (!best) { el.best.textContent = ''; return; }
  el.best.textContent = best.win ? `BEST: OUT IN ${fmt(best.time)}` : `BEST: ${best.where}`;
}

// ---------- sizing ----------

const fx = createPostFx(el.canvas);
// Phones get a touch pad under the game; mice and keyboards don't need one.
const touchFirst = matchMedia('(pointer: coarse)').matches;
document.documentElement.classList.toggle('has-pad', touchFirst);
const pad = $('pad');
const padMark = $('padMark');

function fit() {
  const cs = getComputedStyle(el.stage);
  const w = el.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = el.stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  // keep at least 15% of the height (and 96px) for the pad on touch screens
  const padMin = touchFirst ? Math.max(96, h * 0.15) : 0;
  const fw = Math.floor(Math.min(w, (h - padMin) * 9 / 16));
  const fh = Math.floor(fw * 16 / 9);
  el.frame.style.width = fw + 'px';
  el.frame.style.height = fh + 'px';
  if (touchFirst) { pad.style.width = fw + 'px'; pad.style.height = Math.floor(h - fh) + 'px'; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.canvas.width = Math.round(fw * dpr);
  el.canvas.height = Math.round(fh * dpr);
}
window.addEventListener('resize', fit);
fit();

// ---------- state ----------

let screen = 'title';     // title | round | deal | pause | over
let run = null;
let g = null;
let introHold = 0;        // seconds the round waits while its banner shows
let busy = false;         // true while a scripted sequence runs (clear, death, deal)
const keys = { left: false, right: false };

function attract() {
  const demo = G.newRun();
  const r = G.newRound(demo);
  r.balls = [];
  r.state = 'attract';
  return r;
}
g = attract();

function fmt(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function show(name) {
  screen = name;
  el.title.hidden = name !== 'title';
  el.deal.hidden = name !== 'deal';
  el.pause.hidden = name !== 'pause';
  el.over.hidden = name !== 'over';
  el.osd.hidden = !(name === 'round' || name === 'pause');
}

// ---------- the Host's voice ----------

let sayToken = 0;
async function say(target, text, { hold = 2600, clear = true } = {}) {
  const token = ++sayToken;
  target.textContent = '';
  target.classList.add('caret');
  A.duck(Math.min(4, text.length * 0.03 + 1));
  for (let i = 0; i < text.length; i++) {
    if (token !== sayToken) return;
    target.textContent = text.slice(0, i + 1);
    if (i % 2 === 0 && text[i] !== ' ') A.play({ type: 'type' });
    await wait(text[i] === '.' || text[i] === ',' ? 120 : 26);
  }
  target.classList.remove('caret');
  if (clear && hold > 0) {
    await wait(hold);
    if (token === sayToken && target === el.host) target.textContent = '';
  }
}
const hostSays = (text, hold) => say(el.host, text, { hold });

let bannerTimer = 0;
function banner(main, sub = '', ms = 1400, danger = false) {
  el.banner.innerHTML = `<b>${main}</b>${sub ? `<span>${sub}</span>` : ''}`;
  el.banner.className = '';
  void el.banner.offsetWidth;
  el.banner.className = 'show' + (danger ? ' danger' : '');
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => { el.banner.innerHTML = ''; }, ms);
}

// ---------- flow ----------

async function startRun() {
  await A.unlock();
  A.setEnabled(settings.sound);
  run = G.newRun();
  startRound();
}

function startRound() {
  g = G.newRound(run);
  show('round');
  A.mood('round', 0);
  el.host.textContent = '';
  const floor = G.floorOf(run);
  const roundInFloor = run.round + 1;
  el.where.textContent = `${floor.id} · ${floor.name.toUpperCase()} · ${roundInFloor}/${FLOOR_ROUNDS}`;
  introHold = 1.5;
  if (g.boss) {
    banner(g.boss.name, `${floor.id} · ${floor.name}`, 1700, true);
    setTimeout(() => hostSays(BOSSES[floor.boss].line, 2600), 900);
  } else if (run.round === 0) {
    banner(floor.id, floor.name, 1700);
    setTimeout(() => hostSays(floor.host, 2600), 900);
  } else {
    banner(`Round ${G.roundNumber(run)}`, `${floor.id} · ${floor.name}`, 1300);
  }
  if (g.darkStart > 0) setTimeout(() => hostSays('Lights off. Just for a bit.', 2000), 2200);
}

async function roundCleared() {
  busy = true;
  banner('Clear', '', 1300);
  await wait(1300);
  const result = G.advance(run);
  if (result === 'win') { busy = false; return endRun('win'); }
  busy = false;
  openDeal();
}

async function endRun(how) {
  busy = true;
  const outcome = how === 'win' ? 'win' : how;
  if (outcome !== 'win') {
    banner(outcome === 'crushed' ? 'Crushed' : 'Dead', '', 1400, true);
    A.mood('over');
    await wait(1500);
  } else {
    banner('The glass breaks', '', 1600);
    await wait(1700);
  }
  const floor = G.floorOf(run);
  const where = outcome === 'win' ? 'ALL FLOORS' : `${floor.id} ROUND ${run.round + 1}`;
  el.over.classList.toggle('win', outcome === 'win');
  el.overTitle.textContent = outcome === 'win' ? 'You got out' : outcome === 'crushed' ? 'Crushed' : 'Dead';
  el.overClock.textContent = fmt(run.time);
  el.overStats.innerHTML = [
    ['TAPE LENGTH', fmt(run.time)],
    ['REACHED', where],
    ['ROUNDS CLEARED', `${run.roundsCleared}/${FLOORS.length * FLOOR_ROUNDS}`],
    ['DEALS TAKEN', run.deals.length],
    ['TAPES FOUND', run.tapes],
  ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');

  // keep the best: a win beats any loss, a faster win beats a slower one, otherwise more rounds
  const score = { win: outcome === 'win', rounds: run.roundsCleared, time: run.time, where };
  const better = !best || (score.win && (!best.win || score.time < best.time)) || (!score.win && !best.win && score.rounds > best.rounds);
  if (better) { best = score; store.set('breakroom.best', best); }
  showBest();

  show('over');
  el.host.textContent = '';
  A.mood('over');
  busy = false;
  say(el.overSay, outcome === 'win' ? HOST.win : pick(outcome === 'crushed' ? HOST.crushed : HOST.dead), { clear: false });
  $('againBtn').focus({ preventScroll: true });
}

// ---------- deals ----------

let offers = [];
let selected = -1;
let dealLocked = false;

function bulbsText() {
  let s = '';
  for (let i = 0; i < Math.max(run.bulbs, run.bulbsShown || 3); i++) s += i < run.bulbs ? '<span class="on">●</span>' : '<span class="off">○</span>';
  return `BULBS ${s}`;
}

async function openDeal() {
  show('deal');
  sayToken++;
  el.host.textContent = '';
  el.banner.innerHTML = '';
  A.mood('deal');
  offers = G.offerDeals(run);
  selected = -1;
  dealLocked = false;
  const floor = G.floorOf(run);
  const next = G.isBossRound(run) ? BOSSES[floor.boss].name.toUpperCase() : `${floor.id} ROUND ${run.round + 1}`;
  el.dealWhere.textContent = `DEAL ▷  NEXT: ${next}`;
  el.dealBulbs.innerHTML = bulbsText();
  el.cards.innerHTML = offers.map((d, i) => `
    <button class="card" data-i="${i}" style="--tilt:${[-0.8, 0.6, -0.4][i]}deg" ${d.affordable ? '' : 'disabled'}>
      <h3>${d.name}</h3>
      <p class="boon">${d.boon}</p>
      <p class="cost">${d.cost}</p>
      <span class="hint">${d.affordable ? 'TAP AGAIN TO TAKE IT' : 'NOT ENOUGH BULBS'}</span>
    </button>`).join('');
  el.refuse.hidden = false;

  if (run.hostPicksNext) {
    dealLocked = true;
    el.refuse.hidden = true;
    await say(el.dealSay, pick(HOST.picks), { clear: false });
    const choices = offers.map((d, i) => i).filter((i) => offers[i].affordable);
    if (!choices.length) { dealLocked = false; el.refuse.hidden = false; return; }
    // the Host's finger hovers, then lands
    for (let k = 0; k < 5; k++) { select(pick(choices), true); await wait(260); }
    const i = pick(choices);
    select(i, true);
    await wait(700);
    run.hostPicksNext = false;
    return take(i, true);
  }
  say(el.dealSay, pick(HOST.deal), { clear: false });
  const first = el.cards.querySelector('.card:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}

function select(i, quiet) {
  selected = i;
  el.cards.querySelectorAll('.card').forEach((c, k) => c.classList.toggle('sel', k === i));
  if (!quiet) A.play({ type: 'select' });
  else A.play({ type: 'ui' });
}

async function take(i, byHost) {
  const d = offers[i];
  if (!d || !d.affordable) return;
  dealLocked = true;
  G.takeDeal(run, d.id);
  A.play({ type: 'take' });
  el.dealBulbs.innerHTML = bulbsText();
  await say(el.dealSay, byHost ? `${d.name}. ${pick(HOST.take)}` : pick(HOST.take), { clear: false });
  await wait(600);
  startRound();
}

async function refuse() {
  if (dealLocked) return;
  dealLocked = true;
  A.play({ type: 'select' });
  await say(el.dealSay, pick(HOST.refuse), { clear: false });
  await wait(500);
  startRound();
}

el.cards.addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (!c || c.disabled || dealLocked) return;
  const i = Number(c.dataset.i);
  if (selected === i) take(i);
  else select(i);
});
el.refuse.addEventListener('click', refuse);

// ---------- game events ----------

function handleEvents() {
  for (const ev of g.events) {
    A.play(ev);
    switch (ev.type) {
      case 'bulb':
        if (ev.left > 0) hostSays(ev.left === 1 ? 'Last one. Careful now.' : pick(HOST.bulb), 1800);
        break;
      case 'tape': hostSays(pick(HOST.tapes), 3200); break;
      case 'rewind': banner('◀◀ Rewind', '', 900); break;
      case 'clear': roundCleared(); break;
      case 'dead': case 'crushed': endRun(ev.type); break;
      default: break;
    }
  }
  g.events.length = 0;
}

// ---------- input ----------

function fieldX(clientX) {
  const r = el.canvas.getBoundingClientRect();
  return ((clientX - r.left) / r.width) * W;
}

let ptr = null;
el.stage.addEventListener('pointerdown', (e) => {
  if (screen !== 'round' || e.target.closest('button')) return;
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, type: e.pointerType };
  try { el.stage.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  if (e.pointerType === 'mouse') G.setPaddleTarget(g, fieldX(e.clientX));
});
el.stage.addEventListener('pointermove', (e) => {
  if (screen !== 'round') return;
  if (e.pointerType === 'mouse') { G.setPaddleTarget(g, fieldX(e.clientX)); return; }
  if (!ptr || ptr.id !== e.pointerId) return;
  const r = el.canvas.getBoundingClientRect();
  const dx = e.clientX - ptr.x;
  ptr.moved += Math.abs(dx) + Math.abs(e.clientY - ptr.y);
  ptr.x = e.clientX; ptr.y = e.clientY;
  // relative drag on touch, so your thumb never has to sit on the paddle
  G.setPaddleTarget(g, g.paddle.target + (dx / r.width) * W * 1.25);
});
el.stage.addEventListener('pointerup', (e) => {
  if (screen !== 'round' || !ptr || ptr.id !== e.pointerId) return;
  const tap = ptr.moved < 12 && performance.now() - ptr.t < 350;
  ptr = null;
  if (tap && introHold <= 0) G.launch(g);
});
el.stage.addEventListener('pointercancel', () => { ptr = null; });

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (screen === 'round') {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
    else if ((k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') && introHold <= 0) G.launch(g);
    else if (k === 'm' || k === 'M') G.useMatch(g);
    else if (k === 'p' || k === 'P' || k === 'Escape') pause();
    else return;
    e.preventDefault();
  } else if (screen === 'pause' && (k === 'p' || k === 'P' || k === 'Escape')) { resume(); e.preventDefault(); }
  else if (screen === 'deal' && !dealLocked) {
    if (k >= '1' && k <= '3') { const i = Number(k) - 1; const c = el.cards.children[i]; if (c && !c.disabled) { if (selected === i) take(i); else { select(i); c.focus(); } } }
    else if (k === 'x' || k === 'X') refuse();
  } else if (screen === 'over' && (k === 'r' || k === 'R')) startRun();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

function pause() {
  if (screen !== 'round' || busy) return;
  show('pause');
  el.pauseClock.textContent = fmt(run.time);
  A.mood('pause');
  A.play({ type: 'ui' });
  $('resumeBtn').focus({ preventScroll: true });
}
function resume() {
  show('round');
  A.mood('round', g.danger);
  A.play({ type: 'ui' });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

$('playBtn').addEventListener('click', startRun);
$('againBtn').addEventListener('click', startRun);
$('titleBtn').addEventListener('click', toTitle);
$('quitBtn').addEventListener('click', toTitle);
$('resumeBtn').addEventListener('click', resume);
el.pauseBtn.addEventListener('click', pause);
el.match.addEventListener('click', () => G.useMatch(g));
for (const id of ['soundBtn', 'soundBtn2']) $(id).addEventListener('click', async () => { settings.sound = !settings.sound; await A.unlock(); applySettings(); A.play({ type: 'ui' }); });
for (const id of ['reduceBtn', 'reduceBtn2']) $(id).addEventListener('click', () => { settings.reduce = !settings.reduce; applySettings(); A.play({ type: 'ui' }); });

function toTitle() {
  sayToken++;
  el.host.textContent = '';
  el.banner.innerHTML = '';
  g = attract();
  show('title');
  A.mood('title');
  showBest();
  $('playBtn').focus({ preventScroll: true });
}

// ---------- loop ----------

let last = performance.now();
let moodTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (screen === 'round' && !busy) {
    if (keys.left || keys.right) G.setPaddleTarget(g, g.paddle.target + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 430 * dt);
    if (introHold > 0) introHold -= dt;
    else G.update(g, dt, settings.reduce);
    handleEvents();
    moodTimer -= dt;
    if (moodTimer <= 0) { moodTimer = 0.5; A.mood('round', g.danger); }
  } else if (screen === 'round' || screen === 'title' || screen === 'deal' || screen === 'over') {
    // keep the room alive behind menus and scripted moments
    G.update(g, dt, settings.reduce);
    if (screen === 'round') handleEvents();
    else g.events.length = 0;
  }
  A.tick(dt, screen !== 'pause');

  if (screen === 'round' || screen === 'pause') {
    el.clock.textContent = fmt(run.time);
    const showMatch = g.run.mods.matches > 0;
    el.match.hidden = !showMatch;
    if (showMatch) el.match.textContent = `MATCH ×${g.matchesLeft}`;
    const serving = g.state === 'serve' && introHold <= 0 && !busy;
    el.prompt.hidden = !serving;
  }

  if (touchFirst) {
    padMark.style.left = `${6 + (g.paddle.x / W) * 88}%`;
    padMark.style.width = `${(g.paddle.w / W) * 88}%`;
    pad.classList.toggle('pad-off', screen !== 'round');
  }

  const img = render(g, { reduce: settings.reduce });
  fx.draw(img, { time: now / 1000, glitch: Math.min(1, g.glitch + (screen === 'over' ? 0.15 : 0)), soft: settings.reduce });
  requestAnimationFrame(frame);
}

el.prompt.textContent = matchMedia('(pointer: coarse)').matches ? 'TAP TO LAUNCH' : 'CLICK OR SPACE TO LAUNCH';
// a small handle for testing in the browser console
window.__breakroom = {
  get g() { return g; }, get run() { return run; },
  jump(floor, round) { run.floor = floor; run.round = round; startRound(); },
  deal() { openDeal(); },
};
A.preload();
// the first touch anywhere on the title starts the music
el.title.addEventListener('pointerdown', () => { A.unlock(); }, { once: true });
applySettings();
showBest();
show('title');
A.mood('title');
requestAnimationFrame(frame);
