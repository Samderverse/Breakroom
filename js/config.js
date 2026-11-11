// Breakroom: all the game's data in one place. No logic lives here.
// The field is a logical 360 x 640 portrait space; the renderer scales it down.

export const W = 360;
export const H = 640;

export const GRID = { cols: 8, cellW: 44, cellH: 20, offsetX: 4, inset: 2 };
export const PADDLE = { y: 584, h: 10, w: 64 };
export const CRUSH_Y = 540;          // a brick reaching this line ends the run
export const BALL = { r: 5, start: 300, ramp: 5, cap: 470, hardCap: 560 };
export const START_BULBS = 3;
export const MAX_BULBS = 5;

// Brick legend for layouts:
// .  empty   #  breeze block (1 hit)   =  steel plate (2 hits)
// o  wired glass (lights the room when broken)   X  pipe (unbreakable)
// t  breeze block with a tape inside (drops a recording)
export const FLOORS = [
  {
    id: 'B1', name: 'Basement', hazard: 'flicker', ceilingEvery: 16,
    tint: { wall: [74, 70, 62], light: [255, 190, 110] },
    host: 'Morning. Your shift starts now. The wall comes down whether you work or not.',
    layouts: [
      ['########', '########', '#o####o#', '########', '==####=='],
      ['..####..', '.######.', '##o##o##', '########', '#==##==#', '.t####..'],
      ['X######X', '########', '##====##', '#o####o#', '###t####'],
      ['#.#.#.#.', '.#.#.#.#', '#o#.#=#.', '.#.#t#.#', '#.#.#.#.'],
    ],
    boss: 'caretaker',
  },
  {
    id: 'B2', name: 'Boiler Room', hazard: 'chain', ceilingEvery: 13,
    tint: { wall: [78, 58, 46], light: [255, 160, 90] },
    host: 'Lower. It gets warmer down here. That is not a good thing.',
    layouts: [
      ['XX####XX', '==o==o==', '########', '#=#==#=#', '########', '..####..'],
      ['########', '=X====X=', '#o####o#', '########', '===t====', '########'],
      ['#==##==#', '#==##==#', 'X.o##o.X', '########', '#=#=#=#=', '=#=#=#=#'],
      ['o######o', '#XX##XX#', '########', '==####==', '##=t==##', '########'],
    ],
    boss: 'boiler',
  },
  {
    id: 'B3', name: 'Cold Store', hazard: 'draught', ceilingEvery: 11,
    tint: { wall: [58, 70, 70], light: [200, 235, 190] },
    host: 'Mind the cold. The last one stopped feeling their hands about here.',
    layouts: [
      ['=o====o=', '########', '==XX==XX', '########', '#o#==#o#', '########', '===t===='],
      ['########', '#=o==o=#', '#=####=#', '#=#XX#=#', '#=####=#', '#=o==o=#', '########'],
      ['oooooooo', '########', '========', '########', 'X#t####X', '########'],
      ['##====##', '#o#==#o#', '########', '=X=##=X=', '########', '==####==', 'o######o'],
    ],
    boss: 'host',
  },
];

// Bosses hang from the ceiling behind a shield of bricks that grows back.
// Only the weak spot takes damage; it is the light on the underside.
export const BOSSES = {
  caretaker: {
    name: 'The Caretaker', hp: 5, w: 120, h: 50, speed: 0.55, regrow: 6.5,
    shield: ['.######.', '##====##'],
    line: 'This is the Caretaker. He keeps the place tidy. You are not tidy.',
  },
  boiler: {
    name: 'The Boiler', hp: 7, w: 128, h: 54, speed: 0.9, regrow: 5.5, vent: 9,
    shield: ['#=#==#=#', '########'],
    line: 'Keep an eye on the gauge. When it vents, you will not see a thing.',
  },
  host: {
    name: 'The Host', hp: 9, w: 112, h: 58, speed: 0, regrow: 4.5, hop: 3,
    shield: ['=o####o=', '########'],
    line: 'Hello. Yes, it is me behind the glass. Break it, if you want to leave.',
  },
};

// Every deal pairs a boon with a cost. Each can be taken once per run.
// `mods` are summed into the run's modifiers; `now` runs once when taken.
export const DEALS = [
  { id: 'flare', name: 'Flare', boon: "Ball's light radius +40%", cost: 'Paddle 15% shorter',
    mods: { lightMul: 0.4, paddleMul: -0.15 } },
  { id: 'second', name: 'Second Ball', boon: 'An extra ball every launch', cost: 'Ceiling drops 25% faster',
    mods: { extraBalls: 1, ceilingMul: 0.25 } },
  { id: 'torch', name: 'Head Torch', boon: 'A light cone shines up from the paddle', cost: 'Ball 10% faster',
    mods: { torch: 1, speedMul: 0.1 } },
  { id: 'bulb', name: 'Spare Bulb', boon: '+1 bulb', cost: 'Next round starts in total darkness for 5 seconds',
    now: 'spareBulb' },
  { id: 'lead', name: 'Lead Ball', boon: 'Breaks steel plates in one hit', cost: 'Paddle steers the bounce 30% less',
    mods: { lead: 1, steerMul: -0.3 } },
  { id: 'magnet', name: 'Magnet', boon: 'Ball sticks to the paddle. Aim, then tap to release', cost: 'Room blacks out briefly every 8 seconds',
    mods: { magnet: 1, blackout: 1 } },
  { id: 'grip', name: 'Wide Grip', boon: 'Paddle 25% wider', cost: 'Lose a bulb now',
    mods: { paddleMul: 0.25 }, now: 'loseBulb', needsBulbs: 2 },
  { id: 'spike', name: 'Spike', boon: 'Ball passes through the first brick of each launch', cost: 'Glass no longer lights up',
    mods: { spike: 1, glassDark: 1 } },
  { id: 'rewind', name: 'Rewind', boon: 'Once per run, a dropped ball comes back', cost: 'The Host picks your next deal for you',
    mods: { rewind: 1 }, now: 'hostPicks' },
  { id: 'matches', name: 'Matches', boon: 'Tap to light the whole room for 1 second, 3 per round', cost: 'Ceiling starts one row lower',
    mods: { matches: 3, startDrop: 1 } },
  { id: 'steady', name: 'Steady Hand', boon: 'Easier to aim: no more flat bounces', cost: 'Ball gives no light',
    mods: { steady: 1, ballDark: 1 } },
  { id: 'fuse', name: 'Fuse', boon: 'Each broken brick takes a neighbour with it', cost: 'Every chain shakes the room into a blackout',
    mods: { fuse: 1 } },
];

export const HOST = {
  deal: [
    'You look tired. I can help. I always help.',
    'Everything in here has a price. You knew that when you came in.',
    'Pick one. Or do not. The ceiling does not care either way.',
    'Overtime is available. Terms apply.',
    'I found these in lost property. Nobody came back for them.',
    'Go on. Treat yourself. You have earned something, probably.',
  ],
  refuse: ['Suit yourself.', 'Brave. Or stupid. The tape cannot tell the difference.', 'Noted. I note everything.'],
  take: ['Lovely. I will put it on your tab.', 'Good choice. They all say that, at first.', 'Signed and dated.'],
  picks: ['I will choose for you. You did ask, remember.', 'Let me. I know what you need better than you do.'],
  tapes: [
    'Tape four. Subject keeps looking at the camera. Subject should keep working.',
    'Day nine. The bulbs are cheaper than the staff. Order more bulbs.',
    'If you are hearing this, the last one did not finish their shift.',
    'Reminder: breaks are not paid. Breaking is.',
    'The ceiling is on a timer. So, technically, are you.',
    'Recording. Recording. Is this thing on. Good.',
    'Note to self: the new one is quicker than the last. Lower the ceiling.',
  ],
  bulb: ['That is one less.', 'Darker now, is it not.', 'Mind the glass.'],
  dead: ['End of shift.', 'Clock out.', 'That is the tape full.', 'We will start again. We always start again.'],
  crushed: ['The ceiling always wins in the end.', 'Flat-packed.', 'You should have worked faster.'],
  win: 'Well. Nobody has done that before. Leave the door how you found it.',
};

export const FLOOR_ROUNDS = 3;   // two rounds and a boss per floor
