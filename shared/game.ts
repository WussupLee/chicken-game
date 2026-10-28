export const WIDTH = 960;
export const HEIGHT = 540;
export const TICK = 1 / 60;
export const HATS = ['Bare', 'Top Hat', 'Cowboy', 'Crown', 'Chef', 'Propeller', 'Viking', 'Party'];
export const COLORS = [0xffdc59, 0xff8484, 0x85ddff, 0xb6f68e];
export const WEAPONS = ['pistol', 'shotgun', 'smg', 'rifle', 'rocket', 'grenade', 'sword', 'net', 'laser', 'sax'] as const;
export type Weapon = typeof WEAPONS[number];
export type Phase = 'lobby' | 'round' | 'presenter' | 'intermission' | 'winner';
export interface Input { left: boolean; right: boolean; down: boolean; jump: boolean; fire: boolean; grab: boolean; ragdoll: boolean; strafe: boolean; cluck: boolean }
export const NO_INPUT: Input = { left: false, right: false, down: false, jump: false, fire: false, grab: false, ragdoll: false, strafe: false, cluck: false };
export interface Box { x: number; y: number; w: number; h: number }
export interface Actor { id: string; name: string; bot: boolean; slot: number; hat: number; x: number; y: number; vx: number; vy: number; facing: number; alive: boolean; ragdoll: boolean; grounded: boolean; crouch: boolean; sliding: boolean; flap: boolean; weapon: Weapon | null; heldBody: string | null; ammo: number; wins: number; prev: Input; cooldown: number; cluck: boolean }
export interface Item { id: number; type: Weapon; x: number; y: number; heldBy: string | null }
export interface Shot { id: number; kind: Weapon; owner: string; x: number; y: number; vx: number; vy: number; ttl: number; radius: number }
export interface Arena { name: string; blocks: Box[]; platforms: Box[]; spawns: { x: number; y: number }[]; itemSpawns: { x: number; y: number; type: Weapon }[] }
export interface GameState { phase: Phase; round: number; timer: number; phaseTimer: number; arenaIndex: number; actors: Actor[]; items: Item[]; shots: Shot[]; message: string; winnerId: string | null; seed: number }

const floor = (y = 504): Box => ({ x: 0, y, w: WIDTH, h: HEIGHT - y });
const block = (x: number, y: number, w: number, h = 18): Box => ({ x, y, w, h });
const baseSpawns = [{ x: 104, y: 435 }, { x: 840, y: 435 }, { x: 285, y: 270 }, { x: 655, y: 270 }];
function arena(name: string, platforms: Box[], extra: Box[] = [], offset = 0): Arena {
  return { name, blocks: [floor(), ...extra], platforms, spawns: baseSpawns, itemSpawns: [
    { x: 475, y: 170, type: WEAPONS[offset % WEAPONS.length] },
    { x: 230, y: 280, type: WEAPONS[(offset + 2) % WEAPONS.length] },
    { x: 710, y: 280, type: WEAPONS[(offset + 5) % WEAPONS.length] }
  ] };
}
export const ARENAS: Arena[] = [
  arena('The Coop', [block(130, 365, 200), block(630, 365, 200), block(385, 245, 190)], [], 0),
  arena('Haywire', [block(80, 390, 190), block(350, 310, 260), block(690, 390, 190)], [block(465, 438, 30, 66)], 1),
  arena('Sky Roost', [block(65, 390, 220), block(365, 310, 230), block(675, 390, 220), block(405, 190, 150)], [], 2),
  arena('Barnstorm', [block(220, 390, 210), block(530, 390, 210), block(390, 255, 180)], [block(465, 390, 30, 114)], 3),
  arena('Crossfire', [block(95, 365, 225), block(640, 365, 225), block(385, 285, 190)], [block(345, 435, 24, 69), block(590, 435, 24, 69)], 4),
  arena('Scramble', [block(55, 410, 150), block(270, 335, 150), block(540, 335, 150), block(755, 410, 150)], [], 5),
  arena('Perch', [block(185, 410, 210), block(565, 410, 210), block(350, 270, 260)], [block(465, 428, 30, 76)], 6),
  arena('The Silo', [block(75, 330, 170), block(715, 330, 170), block(380, 400, 200), block(410, 225, 140)], [], 7),
  arena('Featherfall', [block(100, 400, 180), block(340, 320, 280), block(680, 400, 180)], [], 8),
  arena('Final Flock', [block(90, 375, 210), block(375, 290, 210), block(660, 375, 210)], [block(470, 420, 20, 84)], 9)
];

let nextId = 1;
export function makeActor(id: string, name: string, bot: boolean, slot: number): Actor {
  return { id, name: name.slice(0, 18), bot, slot, hat: 0, x: 0, y: 0, vx: 0, vy: 0, facing: slot % 2 ? -1 : 1, alive: true, ragdoll: false, grounded: false, crouch: false, sliding: false, flap: false, weapon: null, heldBody: null, ammo: 0, wins: 0, prev: { ...NO_INPUT }, cooldown: 0, cluck: false };
}
export function newGame(seed = Date.now()): GameState { return { phase: 'lobby', round: 0, timer: 0, phaseTimer: 0, arenaIndex: 0, actors: [], items: [], shots: [], message: '', winnerId: null, seed }; }
function nextRandom(s: GameState): number { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const actorBox = (a: Actor): Box => ({ x: a.x - 11, y: a.y - (a.ragdoll || a.crouch ? 15 : 27), w: 22, h: a.ragdoll || a.crouch ? 15 : 27 });
export function startRound(s: GameState): void {
  s.phase = 'round'; s.round++; s.timer = 45; s.phaseTimer = 0; s.arenaIndex = (s.round - 1) % ARENAS.length; s.shots = [];
  const arena = ARENAS[s.arenaIndex];
  s.items = arena.itemSpawns.map((p) => ({ id: nextId++, type: p.type, x: p.x, y: p.y, heldBy: null }));
  s.actors.forEach((a, i) => { const p = arena.spawns[i]; Object.assign(a, { x: p.x, y: p.y, vx: 0, vy: 0, facing: i % 2 ? -1 : 1, alive: true, ragdoll: false, grounded: false, crouch: false, sliding: false, flap: false, weapon: null, heldBody: null, ammo: 0, cooldown: 0, prev: { ...NO_INPUT } }); });
  s.message = arena.name;
}
function move(a: Actor, input: Input, arena: Arena): void {
  const oldY = a.y;
  a.crouch = input.down && a.grounded && !a.ragdoll;
  a.sliding = a.crouch && Math.abs(a.vx) > 2;
  const axis = Number(input.right) - Number(input.left);
  if (axis && !a.ragdoll) { a.vx += axis * (a.grounded ? 0.75 : 0.44); a.vx = Math.max(-5.1, Math.min(5.1, a.vx)); if (!input.strafe) a.facing = axis; }
  else a.vx *= a.grounded ? 0.76 : 0.97;
  if (input.jump && !a.prev.jump && a.grounded && !a.ragdoll && !input.down) { a.vy = -12.4; a.grounded = false; a.flap = false; }
  else if (input.jump && !a.prev.jump && !a.grounded && a.vy > -4 && !a.ragdoll) a.flap = true;
  if (!input.jump) a.flap = false;
  a.vy += a.flap && a.vy > 0 ? 0.12 : 0.48;
  if (a.flap && a.vy > 1.5) a.vy = 1.5;
  a.vy = Math.min(a.vy, 13);
  if (input.down && a.grounded && Math.abs(a.vx) > 2.5) a.vx *= 1.014;
  a.x += a.vx;
  a.x = Math.max(11, Math.min(WIDTH - 11, a.x));
  for (const b of arena.blocks) {
    if (overlap(actorBox(a), b)) { if (a.vx > 0) a.x = b.x - 11; else if (a.vx < 0) a.x = b.x + b.w + 11; a.vx = 0; }
  }
  a.y += a.vy; a.grounded = false;
  for (const b of [...arena.blocks, ...arena.platforms]) {
    const isPlatform = arena.platforms.includes(b);
    if (isPlatform && (input.down || a.vy < 0 || oldY > b.y + 3)) continue;
    if (overlap(actorBox(a), b)) {
      if (a.vy >= 0 && oldY <= b.y + 4) { a.y = b.y; a.vy = 0; a.grounded = true; a.flap = false; }
      else if (!isPlatform && a.vy < 0) { a.y = b.y + b.h + 27; a.vy = 0; }
    }
  }
  if (a.y > HEIGHT + 45) a.alive = false;
}
const ammoFor = (w: Weapon): number => ({ pistol: 9, shotgun: 4, smg: 28, rifle: 5, rocket: 2, grenade: 3, sword: 999, net: 3, laser: 6, sax: 999 })[w];
function shoot(s: GameState, a: Actor): void {
  if (!a.weapon || a.cooldown > 0 || a.ammo <= 0) return;
  const w = a.weapon;
  a.cooldown = ({ pistol: 14, shotgun: 36, smg: 5, rifle: 42, rocket: 56, grenade: 38, sword: 22, net: 42, laser: 20, sax: 18 })[w];
  if (w === 'sax') { s.message = `${a.name} plays a triumphant note!`; return; }
  if (w === 'sword') {
    for (const other of s.actors) if (other.alive && other.id !== a.id && Math.abs(other.x - a.x) < 48 && Math.abs(other.y - a.y) < 35 && Math.sign(other.x - a.x) === a.facing) kill(other, a);
    return;
  }
  a.ammo--;
  const count = w === 'shotgun' ? 6 : 1;
  for (let i = 0; i < count; i++) {
    const spread = w === 'shotgun' ? (i - 2.5) * 0.055 : 0;
    const speed = ({ pistol: 14, shotgun: 13, smg: 14, rifle: 20, rocket: 7, grenade: 7, net: 9, laser: 17 })[w as Exclude<Weapon, 'sword' | 'sax'>];
    s.shots.push({ id: nextId++, kind: w, owner: a.id, x: a.x + a.facing * 17, y: a.y - 18, vx: a.facing * speed, vy: spread * speed + (w === 'grenade' ? -5 : 0), ttl: w === 'grenade' ? 100 : 90, radius: w === 'rocket' ? 6 : w === 'net' ? 8 : 3 });
  }
  a.vx -= a.facing * (w === 'shotgun' || w === 'rifle' ? 1.4 : 0.2);
  if (a.ammo <= 0) a.weapon = null;
}
function kill(victim: Actor, attacker?: Actor): void { victim.alive = false; victim.ragdoll = true; victim.flap = false; victim.heldBody = null; victim.vx = (attacker?.facing ?? 1) * 3; victim.vy = -4; }
function blast(s: GameState, x: number, y: number, owner: string, radius: number): void {
  const attacker = s.actors.find(a => a.id === owner);
  for (const a of s.actors) if (a.alive && Math.hypot(a.x - x, a.y - 15 - y) < radius) kill(a, attacker);
}
function updateShots(s: GameState, arena: Arena): void {
  for (const shot of s.shots) {
    shot.x += shot.vx; shot.y += shot.vy; shot.ttl--;
    if (shot.kind === 'grenade') shot.vy += 0.18;
    let hit = shot.x < 0 || shot.x > WIDTH || shot.y < 0 || shot.y > HEIGHT || arena.blocks.some(b => overlap({ x: shot.x - shot.radius, y: shot.y - shot.radius, w: shot.radius * 2, h: shot.radius * 2 }, b));
    for (const a of s.actors) if (a.alive && a.id !== shot.owner && overlap(actorBox(a), { x: shot.x - shot.radius, y: shot.y - shot.radius, w: shot.radius * 2, h: shot.radius * 2 })) { if (shot.kind === 'net') { a.ragdoll = true; a.cooldown = 90; } else if (shot.kind !== 'rocket' && shot.kind !== 'grenade') kill(a, s.actors.find(p => p.id === shot.owner)); hit = true; break; }
    if (hit || shot.ttl <= 0) { if (shot.kind === 'rocket' || shot.kind === 'grenade') blast(s, shot.x, shot.y, shot.owner, shot.kind === 'rocket' ? 55 : 65); shot.ttl = 0; }
  }
  s.shots = s.shots.filter(p => p.ttl > 0);
}
function interact(s: GameState, a: Actor, input: Input): void {
  if (input.ragdoll && !a.prev.ragdoll) { a.ragdoll = !a.ragdoll; a.flap = false; }
  if (a.ragdoll && a.cooldown <= 0 && !input.ragdoll && !a.prev.ragdoll && a.grounded) a.ragdoll = false;
  if (input.grab && !a.prev.grab && !a.ragdoll) {
    if (a.heldBody) { const body = s.actors.find(other => other.id === a.heldBody); if (body) { body.vx = a.facing * 10; body.vy = -5; body.x = a.x + a.facing * 28; body.y = a.y - 15; } a.heldBody = null; }
    else if (a.weapon) { const w = a.weapon; a.weapon = null; a.ammo = 0; s.shots.push({ id: nextId++, kind: w, owner: a.id, x: a.x + a.facing * 18, y: a.y - 18, vx: a.facing * 8, vy: -2, ttl: 28, radius: 7 }); }
    else {
      const item = s.items.find(it => !it.heldBy && Math.hypot(it.x - a.x, it.y - (a.y - 15)) < 38);
      if (item) { a.weapon = item.type; a.ammo = ammoFor(item.type); s.items = s.items.filter(it => it !== item); }
      else {
        const body = s.actors.find(other => !other.alive && other.id !== a.id && Math.hypot(other.x - a.x, other.y - a.y) < 36);
        if (body && !s.actors.some(other => other.heldBody === body.id)) { a.heldBody = body.id; body.vx = 0; body.vy = 0; }
      }
    }
  }
  if (input.fire && (!a.prev.fire || a.weapon === 'smg')) shoot(s, a);
  a.cluck = input.cluck;
}
export function tick(s: GameState, inputs: Record<string, Input>): void {
  if (s.phase !== 'round') {
    if (s.phase === 'presenter' || s.phase === 'intermission') {
      s.phaseTimer -= TICK;
      if (s.phaseTimer <= 0) {
        if (s.phase === 'intermission') { const leader = [...s.actors].sort((a,b) => b.wins - a.wins); if (leader[0] && leader[0].wins >= 10 && (!leader[1] || leader[0].wins > leader[1].wins)) { s.phase = 'winner'; s.winnerId = leader[0].id; s.message = `${leader[0].name} wins the whole show!`; return; } }
        startRound(s);
      }
    }
    return;
  }
  const ar = ARENAS[s.arenaIndex];
  for (const a of s.actors) {
    a.cooldown = Math.max(0, a.cooldown - 1);
    if (!a.alive) { const holder=s.actors.find(other=>other.alive&&other.heldBody===a.id); if(holder){a.x=holder.x+holder.facing*25;a.y=holder.y-14;a.vx=0;a.vy=0;} else { const oldY=a.y; a.vy = Math.min(12, a.vy + 0.48); a.x = Math.max(10,Math.min(WIDTH-10,a.x+a.vx)); a.y = Math.min(HEIGHT+30,a.y+a.vy); a.vx *= 0.96; for(const b of [...ar.blocks,...ar.platforms]) if(a.vy>=0&&oldY<=b.y+5&&a.x+10>b.x&&a.x-10<b.x+b.w&&a.y>=b.y&&a.y< b.y+20){a.y=b.y;a.vy=0;a.vx*=0.8;} if(Math.abs(a.vx)>5) for(const other of s.actors) if(other.alive&&Math.abs(other.x-a.x)<20&&Math.abs(other.y-a.y)<25){other.weapon=null;other.ammo=0;other.vx=a.vx*0.6;a.vx*=0.2;} } continue; }
    const input = inputs[a.id] ?? NO_INPUT;
    move(a, input, ar); interact(s, a, input); a.prev = { ...input };
  }
  updateShots(s, ar);
  s.timer -= TICK;
  const living = s.actors.filter(a => a.alive);
  if (living.length <= 1 || s.timer <= 0) {
    s.phaseTimer += TICK;
    if (s.phaseTimer < 1.5) return;
    const victor = living.length === 1 ? living[0] : null;
    if (victor) victor.wins++;
    const lines = [
      'That was a real feather-ruffler!',
      'The coop has never been louder!',
      'Somebody check the barn doors!',
      'Our crowd is going absolutely cluck-wild!'
    ];
    s.message = victor ? `${victor.name} wins round ${s.round}! ${lines[(s.round - 1) % lines.length]}` : `Round ${s.round} is a draw! The crowd demands another!`;
    if (s.round % 10 === 0) { s.phase = 'intermission'; s.phaseTimer = 8; }
    else if (s.round % 4 === 0) { s.phase = 'presenter'; s.phaseTimer = 5; }
    else { s.phase = 'presenter'; s.phaseTimer = 2; }
  } else s.phaseTimer = 0;
}
