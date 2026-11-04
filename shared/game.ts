export const WIDTH = 960;
export const HEIGHT = 540;
export const TICK = 1 / 60;
export const HATS = ['Bare', 'Top Hat', 'Cowboy', 'Crown', 'Chef', 'Propeller', 'Viking', 'Party'];
export const COLORS = [0xffdc59, 0xff8484, 0x85ddff, 0xb6f68e];
export const WEAPONS = ['pistol', 'submachine', 'grenade'] as const;
export type Weapon = typeof WEAPONS[number];
export type Phase = 'lobby' | 'round' | 'presenter' | 'intermission' | 'winner';
export interface Input { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean; fire: boolean; ragdoll: boolean; cluck: boolean }
export const NO_INPUT: Input = { left: false, right: false, up: false, down: false, jump: false, fire: false, ragdoll: false, cluck: false };
export interface Box { x: number; y: number; w: number; h: number }
export interface Actor { id: string; name: string; bot: boolean; slot: number; hat: number; x: number; y: number; vx: number; vy: number; rotation: number; angularVelocity: number; facing: number; aimUp: boolean; alive: boolean; ragdoll: boolean; grounded: boolean; crouch: boolean; sliding: boolean; flap: boolean; wall: number; jumpGrace: number; jumpBuffer: number; slideTicks: number; grenadeFuse: number; emptyTicks: number; chargeKind: 'none' | 'gun' | 'body' | 'grenade'; chargeTicks: number; weapon: Weapon | null; heldBody: string | null; ammo: number; wins: number; prev: Input; cooldown: number; cluck: boolean }
export interface Item { id: number; type: Weapon; x: number; y: number; ammo: number; heldBy: string | null; loose?: boolean; vx?: number; vy?: number }
export interface Shot { id: number; kind: Weapon; owner: string; x: number; y: number; vx: number; vy: number; ttl: number; radius: number }
export interface ThrownGun { id: number; type: Exclude<Weapon, 'grenade'>; owner: string; x: number; y: number; vx: number; vy: number; rotation: number; angularVelocity: number; spent: boolean }
export type CoverKind = 'crate' | 'door' | 'wall';
export interface CoverSeed extends Box { kind: CoverKind }
export interface Cover extends CoverSeed { hp: number; maxHp: number }
export interface Effect { id: number; type: 'shot' | 'hit' | 'blast' | 'dust' | 'empty' | 'pin' | 'jump'; x: number; y: number; ttl: number }
export interface Arena { name: string; theme: 'forest' | 'industrial' | 'space'; blocks: Box[]; platforms: Box[]; spawns: { x: number; y: number }[]; itemSpawns: { x: number; y: number }[]; cover: CoverSeed[]; openSides?: boolean }
export interface GameState { phase: Phase; round: number; timer: number; phaseTimer: number; arenaIndex: number; spawnOffsets: number[]; actors: Actor[]; items: Item[]; shots: Shot[]; thrownGuns: ThrownGun[]; cover: Cover[]; effects: Effect[]; message: string; winnerId: string | null; seed: number }

const floor = (y = 504): Box => ({ x: 0, y, w: WIDTH, h: HEIGHT - y });
const block = (x: number, y: number, w: number, h = 18): Box => ({ x, y, w, h });
const crate = (x: number, y: number, w = 34, h = 34): CoverSeed => ({ ...block(x, y, w, h), kind: 'crate' });
const door = (x: number, y: number, h = 76): CoverSeed => ({ ...block(x, y, 26, h), kind: 'door' });
const wall = (x: number, y: number, w: number, h: number): CoverSeed => ({ ...block(x, y, w, h), kind: 'wall' });
function arena(name: string, theme: Arena['theme'], blocks: Box[], platforms: Box[], itemSpawns: { x: number; y: number }[], cover: CoverSeed[], spawns: { x: number; y: number }[], openSides = false): Arena { return { name, theme, blocks, platforms, spawns, itemSpawns, cover, openSides }; }
export const ARENAS: Arena[] = [
  arena('Canopy Clash','forest',
    [block(125,500,300,40),block(455,500,235,40),block(785,500,175,40),block(710,350,32,150)],
    [block(0,440,100),block(70,375,165),block(180,295,170),block(405,390,115),block(565,350,395),block(490,230,330),block(770,165,150)],
    [{x:250,y:485},{x:575,y:485},{x:655,y:335},{x:280,y:280},{x:600,y:215},{x:825,y:150}],
    [crate(350,466),crate(475,466),crate(810,466),door(390,424),wall(685,300,26,50),crate(570,316),crate(880,316),wall(500,180,25,50),door(760,154),crate(210,261),crate(92,341),wall(315,225,22,70),crate(710,196)],
    [{x:230,y:500},{x:570,y:500},{x:660,y:350},{x:270,y:295}],true),
  arena('Factory Frenzy','industrial',
    [floor(),block(0,0,24,504),block(936,0,24,504)],
    [block(30,110,325),block(605,110,325),block(30,250,325),block(605,250,325),block(395,185,170),block(30,390,325),block(605,390,325),block(385,335,190),block(425,80,110)],
    [{x:125,y:489},{x:835,y:489},{x:250,y:375},{x:710,y:375},{x:480,y:320},{x:480,y:170}],
    [crate(250,470),crate(680,470),door(350,428),door(584,428),crate(60,216),crate(865,216),wall(210,185,24,65),wall(750,185,24,65),crate(305,76),crate(620,76),door(430,259),door(505,109),crate(55,356),crate(865,356),wall(395,285,24,50)],
    [{x:110,y:504},{x:850,y:504},{x:100,y:250},{x:860,y:250}]),
  arena('Orbital Nest','space',
    [floor()],
    [block(0,145,710),block(740,90,135),block(110,285,210),block(405,285,210),block(750,370,210),block(355,390,120),block(70,430,190),block(565,430,150)],
    [{x:120,y:489},{x:860,y:489},{x:200,y:270},{x:500,y:270},{x:800,y:355},{x:800,y:75}],
    [crate(260,466),crate(490,466),crate(690,466),door(335,424),wall(615,430,25,70),crate(150,251),crate(545,251),door(300,209),door(610,209),wall(750,310,25,60),crate(820,336),crate(840,56),wall(440,95,25,50),crate(90,111)],
    [{x:110,y:500},{x:875,y:500},{x:200,y:285},{x:500,y:285}])
];

let nextId = 1;
export function makeActor(id: string, name: string, bot: boolean, slot: number): Actor {
  return { id, name: name.slice(0, 18), bot, slot, hat: 0, x: 0, y: 0, vx: 0, vy: 0, rotation: 0, angularVelocity: 0, facing: slot % 2 ? -1 : 1, aimUp: false, alive: true, ragdoll: false, grounded: false, crouch: false, sliding: false, flap: false, wall: 0, jumpGrace: 0, jumpBuffer: 0, slideTicks: 0, grenadeFuse: 0, emptyTicks: 0, chargeKind: 'none', chargeTicks: 0, weapon: null, heldBody: null, ammo: 0, wins: 0, prev: { ...NO_INPUT }, cooldown: 0, cluck: false };
}
export function newGame(seed = Date.now()): GameState { return { phase: 'lobby', round: 0, timer: 0, phaseTimer: 0, arenaIndex: 0, spawnOffsets: [], actors: [], items: [], shots: [], thrownGuns: [], cover: [], effects: [], message: '', winnerId: null, seed }; }
function nextRandom(s: GameState): number { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const actorBox = (a: Actor): Box => ({ x: a.x - 11, y: a.y - (a.ragdoll || a.crouch ? 15 : 27), w: 22, h: a.ragdoll || a.crouch ? 15 : 27 });
export function startRound(s: GameState): void {
  s.phase = 'round'; s.round++; s.timer = 45; s.phaseTimer = 0; s.arenaIndex = (s.round - 1) % ARENAS.length; s.shots = []; s.thrownGuns = [];
  const arena = ARENAS[s.arenaIndex];
  const previousOffset = s.spawnOffsets[s.arenaIndex];
  const spawnOffset = previousOffset === undefined
    ? Math.floor(nextRandom(s) * arena.spawns.length)
    : (previousOffset + 1 + Math.floor(nextRandom(s) * (arena.spawns.length - 1))) % arena.spawns.length;
  s.spawnOffsets[s.arenaIndex] = spawnOffset;
  s.cover = arena.cover.map(c => { const hp = c.kind === 'wall' ? 5 : c.kind === 'door' ? 4 : 3; return { ...c, hp, maxHp: hp }; }); s.effects = [];
  s.items = arena.itemSpawns.map((p) => { const type = WEAPONS[Math.floor(nextRandom(s) * WEAPONS.length)]; return { id: nextId++, type, x: p.x, y: p.y, ammo: ammoFor(type), heldBy: null }; });
  s.actors.forEach((a, i) => { const p = arena.spawns[(i + spawnOffset) % arena.spawns.length]; Object.assign(a, { x: p.x, y: p.y, vx: 0, vy: 0, rotation: 0, angularVelocity: 0, facing: i % 2 ? -1 : 1, aimUp: false, alive: true, ragdoll: false, grounded: false, crouch: false, sliding: false, flap: false, wall: 0, jumpGrace: 0, jumpBuffer: 0, slideTicks: 0, grenadeFuse: 0, emptyTicks: 0, chargeKind: 'none', chargeTicks: 0, weapon: null, heldBody: null, ammo: 0, cooldown: 0, prev: { ...NO_INPUT } }); });
  s.message = arena.name;
}
function move(a: Actor, input: Input, arena: Arena, cover: Cover[], effects: Effect[]): void {
  const oldY = a.y, wasGrounded = a.grounded, oldWall = a.wall;
  a.aimUp = input.up;
  const solids = [...arena.blocks, ...cover];
  if (input.jump && !a.prev.jump) a.jumpBuffer = 6;
  else a.jumpBuffer = Math.max(0, a.jumpBuffer - 1);
  a.jumpGrace = a.grounded ? 6 : Math.max(0, a.jumpGrace - 1);
  const axis = Number(input.right) - Number(input.left);
  if (input.down && a.grounded && Math.abs(a.vx) > 2 && !a.sliding) { a.slideTicks = 26; a.vx = a.facing * 8.8; }
  a.sliding = a.slideTicks > 0 && a.grounded && input.down;
  if (a.sliding) { a.slideTicks--; a.vx *= 0.975; if (axis && Math.sign(a.vx) !== axis) a.slideTicks = 0; }
  else { a.slideTicks = 0; if (axis && !a.ragdoll) { a.vx += axis * (a.grounded ? 1.55 : 0.82); a.vx = Math.max(-6.8, Math.min(6.8, a.vx)); a.facing = axis; } else a.vx *= a.grounded ? 0.52 : 0.91; }
  a.crouch = input.down && a.grounded && !a.ragdoll;
  if (a.jumpBuffer && !a.ragdoll && !input.down && (a.jumpGrace || oldWall)) {
    if (oldWall && !a.grounded) { a.vx = -oldWall * 8; a.facing = -oldWall; a.vy = -15.5; }
    else a.vy = -15.5;
    effects.push({ id: nextId++, type: 'jump', x: a.x, y: a.y, ttl: 12 });
    a.jumpBuffer = 0; a.jumpGrace = 0; a.grounded = false; a.flap = false;
  } else if (input.jump && !a.prev.jump && !a.grounded && a.vy > -3 && !a.ragdoll) a.flap = true;
  if (!input.jump) { if (a.vy < -4) a.vy *= 0.78; a.flap = false; }
  a.vy += a.flap && a.vy > 0 ? 0.12 : 0.62;
  if (a.flap && a.vy > 1.5) a.vy = 1.5;
  a.vy = Math.min(a.vy, 14);
  a.x += a.vx; a.wall = 0;
  if (!arena.openSides) a.x = Math.max(11, Math.min(WIDTH - 11, a.x));
  for (const b of solids) if (overlap(actorBox(a), b)) { if (a.vx > 0) { a.x = b.x - 11; a.wall = 1; } else if (a.vx < 0) { a.x = b.x + b.w + 11; a.wall = -1; } a.vx = 0; }
  a.y += a.vy; a.grounded = false;
  for (const b of [...solids, ...arena.platforms]) {
    const isPlatform = arena.platforms.includes(b);
    if (isPlatform && (input.down || a.vy < 0 || oldY > b.y + 3)) continue;
    if (overlap(actorBox(a), b)) {
      if (a.vy >= 0 && oldY <= b.y + 4) { a.y = b.y; a.vy = 0; a.grounded = true; a.flap = false; }
      else if (!isPlatform && a.vy < 0) { a.y = b.y + b.h + 27; a.vy = 0; }
    }
  }
  if (!wasGrounded && a.grounded) effects.push({ id: nextId++, type: 'dust', x: a.x, y: a.y, ttl: 10 });
  if (a.sliding && Math.abs(a.vx) > 3 && a.slideTicks % 4 === 0) effects.push({ id: nextId++, type: 'dust', x: a.x - a.facing * 8, y: a.y, ttl: 8 });
  if (a.y > HEIGHT + 45 || (arena.openSides && (a.x < -25 || a.x > WIDTH + 25))) a.alive = false;
}
export const WEAPON_STATS: Record<Weapon, { ammo: number; cooldown: number; projectileSpeed: number }> = {
  pistol: { ammo: 9, cooldown: 14, projectileSpeed: 14 },
  submachine: { ammo: 24, cooldown: 6, projectileSpeed: 14 },
  grenade: { ammo: 3, cooldown: 38, projectileSpeed: 7 }
};
const ammoFor = (w: Weapon): number => WEAPON_STATS[w].ammo;
function shoot(s: GameState, a: Actor): void {
  if (!a.weapon || a.weapon === 'grenade' || a.cooldown > 0 || a.ammo <= 0) return;
  const w = a.weapon;
  a.cooldown = WEAPON_STATS[w].cooldown;
  a.ammo--;
  const speed = WEAPON_STATS[w].projectileSpeed;
  const x = a.x + (a.aimUp ? 0 : a.facing * 17), y = a.y - (a.aimUp ? 32 : 18);
  s.shots.push({ id: nextId++, kind: w, owner: a.id, x, y, vx: a.aimUp ? 0 : a.facing * speed, vy: a.aimUp ? -speed : 0, ttl: 90, radius: 3 });
  s.effects.push({ id: nextId++, type: 'shot', x, y, ttl: 8 });
  if (!a.aimUp) a.vx -= a.facing * 0.2;
  if (a.ammo <= 0) { a.emptyTicks = 45; s.effects.push({ id: nextId++, type: 'empty', x: a.x, y: a.y - 18, ttl: 12 }); }
}
function kill(victim: Actor, attacker?: Actor): void { victim.alive = false; victim.ragdoll = true; victim.flap = false; victim.weapon = null; victim.ammo = 0; victim.heldBody = null; victim.chargeKind = 'none'; victim.chargeTicks = 0; victim.vx = (attacker?.facing ?? 1) * 3; victim.vy = -4; victim.rotation = 0; victim.angularVelocity = (attacker?.facing ?? 1) * 0.17; }
function blast(s: GameState, x: number, y: number, owner: string, radius: number): void {
  const attacker = s.actors.find(a => a.id === owner);
  for (const a of s.actors) if (a.alive && Math.hypot(a.x - x, a.y - 15 - y) < radius) kill(a, attacker);
  s.cover = s.cover.filter(c => {
    if (Math.hypot(c.x+c.w/2-x,c.y+c.h/2-y) >= radius + 18) return true;
    s.effects.push({ id: nextId++, type: 'dust', x: c.x+c.w/2, y: c.y+c.h/2, ttl: 12 });
    return false;
  });
  s.effects.push({ id: nextId++, type: 'blast', x, y, ttl: 24 });
}
function updateShots(s: GameState, arena: Arena): void {
  for (const shot of s.shots) {
    const oldX = shot.x, oldY = shot.y;
    shot.x += shot.vx; shot.y += shot.vy; shot.ttl--;
    if (shot.kind === 'grenade') shot.vy += 0.2;
    const area = { x: shot.x - shot.radius, y: shot.y - shot.radius, w: shot.radius * 2, h: shot.radius * 2 };
    const solid = [...arena.blocks, ...arena.platforms, ...s.cover].find(b => overlap(area,b) && (shot.kind !== 'grenade' || !arena.platforms.includes(b) || (oldY <= b.y && shot.vy >= 0)));
    let hit = shot.x < -30 || shot.x > WIDTH+30 || shot.y < -30 || shot.y > HEIGHT+30;
    if (solid) {
      if (shot.kind === 'grenade') { if (oldY <= solid.y) { shot.y = solid.y - shot.radius; shot.vy = -Math.abs(shot.vy)*0.55; shot.vx *= 0.8; } else { shot.x = oldX; shot.vx *= -0.5; } }
      else { hit = true; const cover = s.cover.find(c => c === solid); if (cover) { cover.hp--; if (cover.hp <= 0) { s.cover = s.cover.filter(c => c !== cover); s.effects.push({ id: nextId++, type: 'dust', x: cover.x+cover.w/2, y: cover.y+cover.h/2, ttl: 12 }); } } s.effects.push({ id: nextId++, type: 'hit', x: shot.x, y: shot.y, ttl: 9 }); }
    }
    if (shot.kind !== 'grenade' && !hit) for (const a of s.actors) if (a.alive && a.id !== shot.owner && !a.sliding && overlap(actorBox(a), area)) { kill(a, s.actors.find(p => p.id === shot.owner)); hit = true; s.effects.push({ id: nextId++, type: 'hit', x: shot.x, y: shot.y, ttl: 9 }); break; }
    if (shot.ttl <= 0) { if (shot.kind === 'grenade') blast(s, shot.x, shot.y, shot.owner, 65); hit = true; }
    if (hit) shot.ttl = 0;
  }
  s.shots = s.shots.filter(p => p.ttl > 0);
}
function updateLooseItems(s: GameState, arena: Arena): void {
  for (const item of s.items) if (item.loose) {
    const oldY = item.y;
    item.vy = Math.min(12, (item.vy ?? 0) + 0.42);
    item.x += item.vx ?? 0; item.y += item.vy;
    for (const b of [...arena.blocks, ...arena.platforms, ...s.cover]) if (item.x > b.x - 8 && item.x < b.x + b.w + 8 && oldY <= b.y && item.y >= b.y) {
      item.y = b.y - 8; item.vy = Math.abs(item.vy) > 2 ? -item.vy * 0.25 : 0; item.vx = (item.vx ?? 0) * 0.72; break;
    }
    item.vx = (item.vx ?? 0) * 0.985;
  }
  s.items = s.items.filter(item => !item.loose || (item.y < HEIGHT + 30 && item.x > -30 && item.x < WIDTH + 30));
}
function updateThrownGuns(s: GameState, arena: Arena): void {
  for (const gun of s.thrownGuns) {
    const oldX = gun.x, oldY = gun.y;
    gun.x += gun.vx; gun.y += gun.vy; gun.vy = Math.min(13, gun.vy + 0.35);
    gun.rotation += gun.angularVelocity; gun.angularVelocity *= 0.99;
    for (const b of [...arena.blocks, ...arena.platforms, ...s.cover]) if (overlap({x:gun.x-7,y:gun.y-5,w:14,h:10},b)) {
      if (oldY + 5 <= b.y && gun.vy >= 0) { gun.y = b.y - 5; gun.vy = Math.abs(gun.vy) > 2 ? -gun.vy * 0.3 : 0; gun.vx *= 0.72; }
      else if (!arena.platforms.includes(b)) { gun.x = oldX; gun.vx *= -0.45; }
      break;
    }
    gun.vx *= 0.992;
    if (!gun.spent) for (const target of s.actors) if (target.alive && target.id !== gun.owner && Math.abs(target.x-gun.x)<20 && Math.abs(target.y-18-gun.y)<20) {
      gun.spent = true; target.vx += gun.vx * 0.35;
      if (target.weapon) {
        s.items.push({id:nextId++,type:target.weapon,x:target.x,y:target.y-22,ammo:target.ammo,heldBy:null,loose:true,vx:gun.vx*0.25,vy:-4});
        target.weapon = null; target.ammo = 0; target.grenadeFuse = 0; target.chargeKind = 'none'; target.chargeTicks = 0;
      }
      s.effects.push({id:nextId++,type:'hit',x:gun.x,y:gun.y,ttl:10});
      gun.vx *= -0.35; gun.vy = -3;
      break;
    }
  }
  s.thrownGuns = s.thrownGuns.filter(gun => gun.y < HEIGHT + 40 && gun.x > -40 && gun.x < WIDTH + 40);
}
function releaseThrow(s: GameState, a: Actor): void {
  const power = Math.min(1, a.chargeTicks / 45);
  const upward = a.aimUp;
  if (a.chargeKind === 'gun' && a.weapon && a.weapon !== 'grenade') {
    const speed = 7 + 10 * power;
    s.thrownGuns.push({id:nextId++,type:a.weapon,owner:a.id,x:a.x+(upward?0:a.facing*18),y:a.y-(upward?31:18),vx:upward?0:a.facing*speed,vy:upward?-speed:-2-power,rotation:0,angularVelocity:a.facing*(0.15+power*0.2),spent:false});
    a.weapon = null; a.ammo = 0; a.emptyTicks = 0;
  } else if (a.chargeKind === 'body' && a.heldBody) {
    const body = s.actors.find(other => other.id === a.heldBody);
    if (body) {const speed=6+9*power;body.x=a.x+(upward?0:a.facing*28);body.y=a.y-16;body.vx=upward?0:a.facing*speed;body.vy=upward?-speed:-5-power*3;body.angularVelocity=a.facing*(0.2+power*0.25);}
    a.heldBody = null;
  } else if (a.chargeKind === 'grenade' && a.weapon === 'grenade' && a.ammo > 0 && a.grenadeFuse > 0) {
    const speed = 6 + 8 * power;
    s.shots.push({id:nextId++,kind:'grenade',owner:a.id,x:a.x+(upward?0:a.facing*17),y:a.y-(upward?30:18),vx:upward?0:a.facing*speed,vy:upward?-speed:-5-power*3,ttl:a.grenadeFuse,radius:5});
    s.effects.push({id:nextId++,type:'shot',x:a.x,y:a.y-18,ttl:8});
    a.grenadeFuse = 0; a.ammo--; a.cooldown = WEAPON_STATS.grenade.cooldown;
    if (a.ammo <= 0) a.weapon = null;
  }
  a.chargeKind = 'none'; a.chargeTicks = 0;
}
function interact(s: GameState, a: Actor, input: Input): void {
  if (input.ragdoll && !a.prev.ragdoll) { a.ragdoll = !a.ragdoll; a.flap = false; }
  if (a.ragdoll && a.cooldown <= 0 && !input.ragdoll && !a.prev.ragdoll && a.grounded) a.ragdoll = false;
  if (!input.fire && a.prev.fire && a.chargeKind !== 'none') releaseThrow(s,a);
  if (input.fire && !a.prev.fire && !a.ragdoll) {
    if (a.heldBody) { a.chargeKind='body'; a.chargeTicks=0; }
    else if (!a.weapon) {
      const item=s.items.find(it=>!it.heldBy && Math.hypot(it.x-a.x,it.y-(a.y-15))<38);
      if (item) {a.weapon=item.type;a.ammo=item.ammo;s.items=s.items.filter(it=>it!==item);}
      else {const body=s.actors.find(other=>!other.alive&&other.id!==a.id&&Math.hypot(other.x-a.x,other.y-a.y)<36&&!s.actors.some(holder=>holder.heldBody===other.id));if(body){a.heldBody=body.id;body.vx=0;body.vy=0;body.angularVelocity=0;}}
    } else if (a.weapon==='grenade' && a.ammo>0) {
      if (!a.grenadeFuse) {a.grenadeFuse=150;s.effects.push({id:nextId++,type:'pin',x:a.x,y:a.y-18,ttl:12});}
      else {a.chargeKind='grenade';a.chargeTicks=0;}
    } else if (a.ammo<=0) {a.chargeKind='gun';a.chargeTicks=0;}
    else shoot(s,a);
  } else if (input.fire && a.prev.fire && a.weapon==='submachine' && a.ammo>0 && a.chargeKind==='none' && !a.ragdoll) shoot(s,a);
  if (input.fire && a.chargeKind!=='none') a.chargeTicks=Math.min(45,a.chargeTicks+1);
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
    if (!a.alive) {
      if (a.grenadeFuse > 0 && --a.grenadeFuse === 0) blast(s,a.x,a.y-18,a.id,65);
      const holder = s.actors.find(other => other.alive && other.heldBody === a.id);
      if (holder) {
        a.x = holder.x + holder.facing * 25; a.y = holder.y - 14;
        a.vx = 0; a.vy = 0; a.rotation = holder.facing < 0 ? Math.PI : 0; a.angularVelocity = 0;
      } else {
        const oldX = a.x, oldY = a.y;
        a.vy = Math.min(14, a.vy + 0.48);
        a.x += a.vx; a.y = Math.min(HEIGHT + 30, a.y + a.vy);
        a.rotation += a.angularVelocity;
        const boxes = [...ar.blocks, ...ar.platforms];
        let landed = false;
        for (const b of boxes) {
          const overlapsX = a.x + 14 > b.x && a.x - 14 < b.x + b.w;
          if (overlapsX && a.vy >= 0 && oldY <= b.y && a.y >= b.y) {
            a.y = b.y; a.vy = Math.abs(a.vy) > 2.2 ? -Math.abs(a.vy) * 0.2 : 0;
            a.vx *= 0.78; a.angularVelocity *= 0.68; landed = true;
          } else if (!ar.platforms.includes(b) && a.y > b.y && a.y - 14 < b.y + b.h) {
            if (oldX + 14 <= b.x && a.x + 14 > b.x) { a.x = b.x - 14; a.vx = -Math.abs(a.vx) * 0.32; a.angularVelocity -= 0.12; }
            else if (oldX - 14 >= b.x + b.w && a.x - 14 < b.x + b.w) { a.x = b.x + b.w + 14; a.vx = Math.abs(a.vx) * 0.32; a.angularVelocity += 0.12; }
          }
        }
        if (a.x < 14 || a.x > WIDTH - 14) { a.x = Math.max(14, Math.min(WIDTH - 14, a.x)); a.vx *= -0.3; a.angularVelocity += Math.sign(a.vx) * 0.1; }
        a.angularVelocity *= landed ? 0.84 : 0.995;
        a.vx *= landed ? 0.94 : 0.99;
        if (Math.abs(a.angularVelocity) < 0.008) a.angularVelocity = 0;
        if (Math.abs(a.vx) > 5) for (const other of s.actors) if (other.alive && Math.abs(other.x - a.x) < 20 && Math.abs(other.y - a.y) < 25) { other.weapon = null; other.ammo = 0; other.vx = a.vx * 0.6; a.vx *= 0.2; }
      }
      continue;
    }
    const input = inputs[a.id] ?? NO_INPUT;
    if (a.grenadeFuse > 0 && --a.grenadeFuse === 0) { blast(s,a.x,a.y-18,a.id,65); a.ammo--; a.chargeKind='none'; a.chargeTicks=0; if (a.ammo <= 0) a.weapon=null; if (!a.alive) continue; }
    if (a.emptyTicks > 0) a.emptyTicks--;
    move(a, input, ar, s.cover, s.effects); interact(s, a, input); a.prev = { ...input };
    if (a.grounded && !a.sliding && Math.abs(a.vx) > 4 && Math.floor(s.timer*60)%9===0) s.effects.push({id:nextId++,type:'dust',x:a.x-a.facing*8,y:a.y,ttl:8});
  }
  updateShots(s, ar);
  updateThrownGuns(s, ar);
  updateLooseItems(s, ar);
  s.effects = s.effects.filter(e => --e.ttl > 0);
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
