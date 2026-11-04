export const WIDTH = 960;
export const HEIGHT = 540;
export const TICK = 1 / 60;
export const HATS = ['Bare', 'Top Hat', 'Cowboy', 'Crown', 'Chef', 'Propeller', 'Viking', 'Party'];
export const COLORS = [0xffdc59, 0xff8484, 0x85ddff, 0xb6f68e];
export const WEAPONS = ['pistol', 'submachine', 'grenade'] as const;
export type Weapon = typeof WEAPONS[number];
export type Phase = 'lobby' | 'round' | 'presenter' | 'intermission' | 'winner';
export interface Input { left: boolean; right: boolean; down: boolean; jump: boolean; fire: boolean; grab: boolean; ragdoll: boolean; strafe: boolean; cluck: boolean }
export const NO_INPUT: Input = { left: false, right: false, down: false, jump: false, fire: false, grab: false, ragdoll: false, strafe: false, cluck: false };
export interface Box { x: number; y: number; w: number; h: number }
export interface Actor { id: string; name: string; bot: boolean; slot: number; hat: number; x: number; y: number; vx: number; vy: number; rotation: number; angularVelocity: number; facing: number; alive: boolean; ragdoll: boolean; grounded: boolean; crouch: boolean; sliding: boolean; flap: boolean; wall: number; jumpGrace: number; jumpBuffer: number; slideTicks: number; grenadeFuse: number; emptyTicks: number; weapon: Weapon | null; heldBody: string | null; ammo: number; wins: number; prev: Input; cooldown: number; cluck: boolean }
export interface Item { id: number; type: Weapon; x: number; y: number; heldBy: string | null }
export interface Shot { id: number; kind: Weapon; owner: string; x: number; y: number; vx: number; vy: number; ttl: number; radius: number }
export interface Cover extends Box { hp: number }
export interface Effect { id: number; type: 'shot' | 'hit' | 'blast' | 'dust' | 'empty' | 'pin' | 'jump'; x: number; y: number; ttl: number }
export interface Arena { name: string; blocks: Box[]; platforms: Box[]; spawns: { x: number; y: number }[]; itemSpawns: { x: number; y: number }[]; cover: Box[]; openSides?: boolean }
export interface GameState { phase: Phase; round: number; timer: number; phaseTimer: number; arenaIndex: number; actors: Actor[]; items: Item[]; shots: Shot[]; cover: Cover[]; effects: Effect[]; message: string; winnerId: string | null; seed: number }

const floor = (y = 504): Box => ({ x: 0, y, w: WIDTH, h: HEIGHT - y });
const block = (x: number, y: number, w: number, h = 18): Box => ({ x, y, w, h });
const baseSpawns = [{ x: 104, y: 435 }, { x: 840, y: 435 }, { x: 285, y: 270 }, { x: 655, y: 270 }];
function arena(name: string, blocks: Box[], platforms: Box[], itemSpawns: { x: number; y: number }[], cover: Box[], spawns = baseSpawns, openSides = false): Arena { return { name, blocks, platforms, spawns, itemSpawns, cover, openSides }; }
export const ARENAS: Arena[] = [
  arena('The Coop', [floor(),block(0,150,22,354),block(938,150,22,354),block(455,410,50,94)], [block(100,375,210),block(375,270,210),block(650,375,210)], [{x:125,y:489},{x:270,y:360},{x:420,y:255},{x:540,y:255},{x:690,y:360},{x:835,y:489}], [block(205,470,32,34),block(720,470,32,34),block(465,370,30,40)]),
  arena('Sky Roost', [], [block(80,450,240,24),block(360,450,240,24),block(640,450,240,24),block(220,335,180),block(560,335,180),block(385,215,190)], [{x:160,y:435},{x:470,y:435},{x:800,y:435},{x:300,y:320},{x:650,y:320},{x:480,y:200}], [block(245,415,30,35),block(685,415,30,35),block(465,180,30,35)], [{x:140,y:425},{x:810,y:425},{x:300,y:310},{x:650,y:310}], true),
  arena('The Silo', [floor(),block(60,235,28,269),block(872,235,28,269),block(465,390,30,114)], [block(90,405,230),block(640,405,230),block(355,340,250),block(160,265,190),block(610,265,190),block(390,170,180)], [{x:150,y:390},{x:760,y:390},{x:475,y:325},{x:250,y:250},{x:710,y:250},{x:480,y:155}], [block(270,370,28,35),block(685,370,28,35),block(465,305,30,35)])
];

let nextId = 1;
export function makeActor(id: string, name: string, bot: boolean, slot: number): Actor {
  return { id, name: name.slice(0, 18), bot, slot, hat: 0, x: 0, y: 0, vx: 0, vy: 0, rotation: 0, angularVelocity: 0, facing: slot % 2 ? -1 : 1, alive: true, ragdoll: false, grounded: false, crouch: false, sliding: false, flap: false, wall: 0, jumpGrace: 0, jumpBuffer: 0, slideTicks: 0, grenadeFuse: 0, emptyTicks: 0, weapon: null, heldBody: null, ammo: 0, wins: 0, prev: { ...NO_INPUT }, cooldown: 0, cluck: false };
}
export function newGame(seed = Date.now()): GameState { return { phase: 'lobby', round: 0, timer: 0, phaseTimer: 0, arenaIndex: 0, actors: [], items: [], shots: [], cover: [], effects: [], message: '', winnerId: null, seed }; }
function nextRandom(s: GameState): number { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const actorBox = (a: Actor): Box => ({ x: a.x - 11, y: a.y - (a.ragdoll || a.crouch ? 15 : 27), w: 22, h: a.ragdoll || a.crouch ? 15 : 27 });
export function startRound(s: GameState): void {
  s.phase = 'round'; s.round++; s.timer = 45; s.phaseTimer = 0; s.arenaIndex = (s.round - 1) % ARENAS.length; s.shots = [];
  const arena = ARENAS[s.arenaIndex];
  s.cover = arena.cover.map(c => ({ ...c, hp: 3 })); s.effects = [];
  s.items = arena.itemSpawns.map((p) => ({ id: nextId++, type: WEAPONS[Math.floor(nextRandom(s) * WEAPONS.length)], x: p.x, y: p.y, heldBy: null }));
  s.actors.forEach((a, i) => { const p = arena.spawns[i]; Object.assign(a, { x: p.x, y: p.y, vx: 0, vy: 0, rotation: 0, angularVelocity: 0, facing: i % 2 ? -1 : 1, alive: true, ragdoll: false, grounded: false, crouch: false, sliding: false, flap: false, wall: 0, jumpGrace: 0, jumpBuffer: 0, slideTicks: 0, grenadeFuse: 0, emptyTicks: 0, weapon: null, heldBody: null, ammo: 0, cooldown: 0, prev: { ...NO_INPUT } }); });
  s.message = arena.name;
}
function move(a: Actor, input: Input, arena: Arena, cover: Cover[], effects: Effect[]): void {
  const oldY = a.y, wasGrounded = a.grounded, oldWall = a.wall;
  const solids = [...arena.blocks, ...cover];
  if (input.jump && !a.prev.jump) a.jumpBuffer = 6;
  else a.jumpBuffer = Math.max(0, a.jumpBuffer - 1);
  a.jumpGrace = a.grounded ? 6 : Math.max(0, a.jumpGrace - 1);
  const axis = Number(input.right) - Number(input.left);
  if (input.down && a.grounded && Math.abs(a.vx) > 2 && !a.sliding) { a.slideTicks = 26; a.vx = a.facing * 8.8; }
  a.sliding = a.slideTicks > 0 && a.grounded && input.down;
  if (a.sliding) { a.slideTicks--; a.vx *= 0.975; if (axis && Math.sign(a.vx) !== axis) a.slideTicks = 0; }
  else { a.slideTicks = 0; if (axis && !a.ragdoll) { a.vx += axis * (a.grounded ? 1.55 : 0.82); a.vx = Math.max(-6.8, Math.min(6.8, a.vx)); if (!input.strafe) a.facing = axis; } else a.vx *= a.grounded ? 0.52 : 0.91; }
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
  if (!a.weapon || a.cooldown > 0 || a.ammo <= 0) return;
  const w = a.weapon;
  if (w === 'grenade' && !a.grenadeFuse) { a.grenadeFuse = 150; s.effects.push({ id: nextId++, type: 'pin', x: a.x, y: a.y - 18, ttl: 12 }); return; }
  a.cooldown = WEAPON_STATS[w].cooldown;
  a.ammo--;
  const speed = WEAPON_STATS[w].projectileSpeed;
  s.shots.push({ id: nextId++, kind: w, owner: a.id, x: a.x + a.facing * 17, y: a.y - 18, vx: a.facing * speed, vy: w === 'grenade' ? -5 : 0, ttl: w === 'grenade' ? a.grenadeFuse : 90, radius: w === 'grenade' ? 5 : 3 });
  s.effects.push({ id: nextId++, type: 'shot', x: a.x + a.facing * 22, y: a.y - 18, ttl: 8 });
  a.grenadeFuse = 0;
  a.vx -= a.facing * 0.2;
  if (a.ammo <= 0) { a.emptyTicks = 45; s.effects.push({ id: nextId++, type: 'empty', x: a.x, y: a.y - 18, ttl: 12 }); }
}
function kill(victim: Actor, attacker?: Actor): void { victim.alive = false; victim.ragdoll = true; victim.flap = false; victim.weapon = null; victim.ammo = 0; victim.heldBody = null; victim.vx = (attacker?.facing ?? 1) * 3; victim.vy = -4; victim.rotation = 0; victim.angularVelocity = (attacker?.facing ?? 1) * 0.17; }
function blast(s: GameState, x: number, y: number, owner: string, radius: number): void {
  const attacker = s.actors.find(a => a.id === owner);
  for (const a of s.actors) if (a.alive && Math.hypot(a.x - x, a.y - 15 - y) < radius) kill(a, attacker);
  s.cover = s.cover.filter(c => Math.hypot(c.x+c.w/2-x,c.y+c.h/2-y) >= radius + 18);
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
      else { hit = true; const cover = s.cover.find(c => c === solid); if (cover) { cover.hp--; if (cover.hp <= 0) s.cover = s.cover.filter(c => c !== cover); } s.effects.push({ id: nextId++, type: 'hit', x: shot.x, y: shot.y, ttl: 9 }); }
    }
    if (shot.kind !== 'grenade' && !hit) for (const a of s.actors) if (a.alive && a.id !== shot.owner && !a.sliding && overlap(actorBox(a), area)) { kill(a, s.actors.find(p => p.id === shot.owner)); hit = true; s.effects.push({ id: nextId++, type: 'hit', x: shot.x, y: shot.y, ttl: 9 }); break; }
    if (shot.ttl <= 0) { if (shot.kind === 'grenade') blast(s, shot.x, shot.y, shot.owner, 65); hit = true; }
    if (hit) shot.ttl = 0;
  }
  s.shots = s.shots.filter(p => p.ttl > 0);
}
function interact(s: GameState, a: Actor, input: Input): void {
  if (input.ragdoll && !a.prev.ragdoll) { a.ragdoll = !a.ragdoll; a.flap = false; }
  if (a.ragdoll && a.cooldown <= 0 && !input.ragdoll && !a.prev.ragdoll && a.grounded) a.ragdoll = false;
  if (input.grab && !a.prev.grab && !a.ragdoll) {
    if (a.heldBody) { const body = s.actors.find(other => other.id === a.heldBody); if (body) { body.vx = a.facing * 10; body.vy = -5; body.x = a.x + a.facing * 28; body.y = a.y - 15; body.angularVelocity = a.facing * 0.32; } a.heldBody = null; }
    else if (a.weapon) { a.weapon = null; a.ammo = 0; a.grenadeFuse = 0; a.emptyTicks = 0; }
    else {
      const item = s.items.find(it => !it.heldBy && Math.hypot(it.x - a.x, it.y - (a.y - 15)) < 38);
      if (item) { a.weapon = item.type; a.ammo = ammoFor(item.type); s.items = s.items.filter(it => it !== item); }
      else {
        const body = s.actors.find(other => !other.alive && other.id !== a.id && Math.hypot(other.x - a.x, other.y - a.y) < 36);
        if (body && !s.actors.some(other => other.heldBody === body.id)) { a.heldBody = body.id; body.vx = 0; body.vy = 0; body.angularVelocity = 0; }
      }
    }
  }
  if (input.fire && (!a.prev.fire || a.weapon === 'submachine')) { if (a.weapon && a.ammo <= 0 && !a.prev.fire) s.effects.push({ id: nextId++, type: 'empty', x: a.x, y: a.y - 18, ttl: 12 }); else shoot(s, a); }
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
    if (a.grenadeFuse > 0 && --a.grenadeFuse === 0) { blast(s,a.x,a.y-18,a.id,65); a.ammo--; if (a.ammo <= 0) a.emptyTicks = 45; if (!a.alive) continue; }
    if (a.emptyTicks > 0 && --a.emptyTicks === 0) { a.weapon = null; a.ammo = 0; }
    move(a, input, ar, s.cover, s.effects); interact(s, a, input); a.prev = { ...input };
    if (a.grounded && !a.sliding && Math.abs(a.vx) > 4 && Math.floor(s.timer*60)%9===0) s.effects.push({id:nextId++,type:'dust',x:a.x-a.facing*8,y:a.y,ttl:8});
  }
  updateShots(s, ar);
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
