import { ARENAS, NO_INPUT, type Actor, type GameState, type Input } from '../shared/game';

interface BotMemory {
  round: number;
  lastX: number;
  lastY: number;
  stuckTicks: number;
  escapeTicks: number;
  escapeDirection: number;
  rethinkTicks: number;
  goal: { x: number; y: number };
  goalItemId: number | null;
  targetId: string | null;
  strafe: number;
  random: number;
}

const memories = new Map<string, BotMemory>();
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);

function memoryFor(state: GameState, bot: Actor): BotMemory {
  let memory = memories.get(bot.id);
  if (!memory || memory.round !== state.round) {
    let hash = state.round || 1;
    for (const char of bot.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    memory = { round: state.round, lastX: bot.x, lastY: bot.y, stuckTicks: 0, escapeTicks: 0, escapeDirection: bot.slot % 2 ? -1 : 1, rethinkTicks: 0, goal: {x:bot.x,y:bot.y}, goalItemId: null, targetId: null, strafe: 1, random: hash || 1 };
    memories.set(bot.id, memory);
  }
  return memory;
}
function random(memory: BotMemory): number {memory.random ^= memory.random << 13;memory.random ^= memory.random >>> 17;memory.random ^= memory.random << 5;return (memory.random >>> 0) / 4294967296;}

function nearest<T extends {x:number;y:number}>(from: Actor, candidates: T[]): T | null {
  return candidates.reduce<T | null>((best, candidate) => !best || distance(from, candidate) < distance(from, best) ? candidate : best, null);
}

export function botInput(state: GameState, bot: Actor): Input {
  const input = { ...NO_INPUT };
  if (!bot.alive || state.phase !== 'round') return input;
  const memory = memoryFor(state, bot);
  const enemies = state.actors.filter(a => a.alive && a.id !== bot.id);
  if (!enemies.length) return input;

  const armed = !!bot.weapon && (bot.weapon === 'sword' || bot.ammo > 0);
  const availableItems = state.items.filter(item => !item.heldBy && (item.padIndex === undefined || state.pads[item.padIndex]?.appearing === 0));
  const item = !armed && !bot.heldBody ? availableItems.reduce<typeof availableItems[number] | null>((best,candidate)=>{
    const cost=(p:typeof candidate)=>Math.abs(p.x-bot.x)+Math.max(0,bot.y-p.y)*3+Math.max(0,p.y-bot.y)*0.6;
    return !best||cost(candidate)<cost(best)?candidate:best;
  },null) : null;
  if (--memory.rethinkTicks <= 0 || memory.goalItemId !== null && !availableItems.some(candidate => candidate.id === memory.goalItemId)) {
    const chosen = nearest(bot,enemies)!;
    memory.targetId = chosen.id;
    memory.goalItemId = item?.id ?? null;
    memory.rethinkTicks = 26 + Math.floor(random(memory) * 46);
    memory.strafe = random(memory) < 0.5 ? -1 : 1;
    if (item) memory.goal = { x: item.x, y: item.y + 15 };
    else {
      const toward = Math.sign(chosen.x-bot.x) || memory.strafe;
      const desired = bot.weapon === 'sword' ? 42 : bot.weapon === 'grenade' ? 165 : bot.weapon === 'submachine' ? 155 : 190;
      const gap = Math.abs(chosen.x-bot.x);
      const x = gap < desired * 0.6 ? bot.x - toward * (desired-gap+35)
        : gap > desired * 1.5 ? chosen.x - toward * desired
        : bot.x + memory.strafe * (35+random(memory)*55);
      memory.goal = { x: Math.max(25,Math.min(935,x)), y: chosen.y };
    }
  }
  const enemy = enemies.find(candidate => candidate.id === memory.targetId) ?? nearest(bot,enemies)!;
  let goal: {x:number;y:number} = memory.goal;
  const enemyDistance = distance(bot, enemy);
  const arena = ARENAS[state.arenaIndex];
  const direction = Math.sign(goal.x - bot.x) || (enemy.x < bot.x ? -1 : 1);

  // If the bot is blocked from making progress, change direction and jump out of the trap.
  if (Math.hypot(bot.x-memory.lastX, bot.y-memory.lastY) < 1.1 && Math.abs(goal.x-bot.x) > 42 && bot.grounded) memory.stuckTicks++;
  else memory.stuckTicks = Math.max(0, memory.stuckTicks - 3);
  if (memory.stuckTicks > 36) {
    memory.escapeTicks = 52;
    memory.escapeDirection = -direction;
    memory.stuckTicks = 0;
  }
  memory.lastX = bot.x; memory.lastY = bot.y;

  if (memory.escapeTicks > 0) {
    memory.escapeTicks--;
    goal = { x: bot.x + memory.escapeDirection * 100, y: bot.y - 60 };
  }

  const dx = goal.x - bot.x;
  const dy = goal.y - bot.y;
  const moveDirection = Math.sign(dx) || direction;
  const wallAhead = [...arena.blocks, ...state.cover].some(b =>
    b.x < bot.x + moveDirection * 30 && b.x + b.w > bot.x + moveDirection * 30 &&
    b.y < bot.y - 8 && b.y + b.h > bot.y - 26
  );
  const hasSupportAhead = [...arena.blocks, ...arena.platforms, ...state.cover].some(b =>
    b.x < bot.x + moveDirection * 43 + 10 && b.x + b.w > bot.x + moveDirection * 43 - 10 && Math.abs(b.y - bot.y) < 7
  );
  const needsJump = dy < -28 || wallAhead || (!hasSupportAhead && Math.abs(dx) > 52 && bot.grounded);

  input.left = dx < (bot.weapon ? -0.2 : -16);
  input.right = dx > (bot.weapon ? 0.2 : 16);
  input.down = dy > 45;
  if (memory.escapeTicks > 0) {
    input.left = memory.escapeDirection < 0;
    input.right = memory.escapeDirection > 0;
  }
  if (bot.grounded) input.jump = needsJump && !bot.prev.jump;
  else if (bot.wall && dy < 40 && !bot.prev.jump) input.jump = true;
  else if (bot.vy < -1 && dy < -28) input.jump = true;
  else if (bot.flap && dy < -12) input.jump = true;
  else if (!bot.prev.jump && bot.vy > -4 && dy < -28) input.jump = true;
  if (bot.ledgeSide && !bot.prev.jump) {
    input.jump = true;
    input.down = dy > 35;
  } else if (bot.grounded && bot.groundPlatform >= 0 && dy > 45 && !bot.prev.jump) {
    input.down = true;
    input.jump = true;
  }

  if (bot.chargeKind !== 'none') {
    input.up = enemy.y < bot.y - 50 && Math.abs(enemy.x-bot.x) < 65;
    input.grab = bot.chargeTicks < (bot.chargeKind === 'grenade' ? 18 : 30);
    return input;
  }
  if (item && distance(bot, item) < 39 && !bot.prev.grab) input.grab = true;
  if (bot.weapon && bot.weapon !== 'sword' && bot.ammo === 0 && !bot.prev.grab) input.grab = true;
  if (bot.heldBody && enemyDistance < 180 && Math.abs(enemy.y - bot.y) < 70 && !bot.prev.grab) input.grab = true;

  if (bot.weapon === 'sword') {
    input.up = enemy.y < bot.y - 30 && Math.abs(enemy.x-bot.x) < 22;
    if (Math.abs(enemy.x-bot.x) < 53 && Math.abs(enemy.y-bot.y) < 55 && bot.cooldown <= 0 && !bot.prev.fire) input.fire = true;
  } else if (bot.weapon && bot.ammo > 0) {
    const xDistance = Math.abs(enemy.x - bot.x);
    const yDistance = Math.abs(enemy.y - bot.y);
    const range = bot.weapon === 'submachine' ? 780 : bot.weapon === 'grenade' ? 250 : 800;
    const upwardShot = enemy.y < bot.y - 35 && xDistance < 48;
    input.up = upwardShot;
    const facesEnemy = upwardShot || Math.sign(enemy.x - bot.x) === bot.facing;
    const safeGrenade = bot.weapon !== 'grenade' || (enemyDistance > 95 && enemyDistance < 250 && bot.grenadeFuse < 110);
    // Fire through breakable cover to open a path; only permanent geometry blocks the shot.
    const clearShot = upwardShot || ![...arena.blocks,...arena.platforms].some(b => b.x < Math.max(bot.x,enemy.x) && b.x+b.w > Math.min(bot.x,enemy.x) && b.y < bot.y-15 && b.y+b.h > bot.y-20);
    if (!clearShot && xDistance < 140 && !bot.prev.jump) input.jump = true;
    if ((upwardShot || (xDistance < range && yDistance < (bot.weapon==='grenade'?85:42))) && facesEnemy && safeGrenade && bot.cooldown <= 0 && (!bot.prev.fire || bot.weapon === 'submachine') && (bot.weapon==='grenade'||clearShot)) input.fire = true;
    if (bot.weapon === 'grenade' && bot.grenadeFuse > 0 && !bot.prev.grab && enemyDistance > 80) input.grab = true;
  }

  memory.lastX = bot.x; memory.lastY = bot.y;
  return input;
}
