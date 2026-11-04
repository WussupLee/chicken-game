import { ARENAS, NO_INPUT, type Actor, type GameState, type Input } from '../shared/game';

interface BotMemory {
  round: number;
  lastX: number;
  lastY: number;
  stuckTicks: number;
  escapeTicks: number;
  escapeDirection: number;
}

const memories = new Map<string, BotMemory>();
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);

function memoryFor(state: GameState, bot: Actor): BotMemory {
  let memory = memories.get(bot.id);
  if (!memory || memory.round !== state.round) {
    memory = { round: state.round, lastX: bot.x, lastY: bot.y, stuckTicks: 0, escapeTicks: 0, escapeDirection: bot.slot % 2 ? -1 : 1 };
    memories.set(bot.id, memory);
  }
  return memory;
}

function nearest<T extends {x:number;y:number}>(from: Actor, candidates: T[]): T | null {
  return candidates.reduce<T | null>((best, candidate) => !best || distance(from, candidate) < distance(from, best) ? candidate : best, null);
}

export function botInput(state: GameState, bot: Actor): Input {
  const input = { ...NO_INPUT };
  if (!bot.alive || state.phase !== 'round') return input;
  const memory = memoryFor(state, bot);
  const enemies = state.actors.filter(a => a.alive && a.id !== bot.id);
  if (!enemies.length) return input;

  const enemy = bot.weapon ? enemies.reduce((best,a)=>Math.abs(a.x-bot.x)+Math.abs(a.y-bot.y)*8 < Math.abs(best.x-bot.x)+Math.abs(best.y-bot.y)*8?a:best) : nearest(bot,enemies)!;
  const availableItems = state.items.filter(item => !item.heldBy);
  const item = !bot.weapon ? nearest(bot, availableItems) : null;
  let goal: {x:number;y:number} = item ?? enemy;
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

  input.left = dx < -20;
  input.right = dx > 20;
  input.down = !item && dy > 45 && bot.grounded;
  if (memory.escapeTicks > 0) {
    input.left = memory.escapeDirection < 0;
    input.right = memory.escapeDirection > 0;
  }
  if (bot.grounded) input.jump = needsJump && !bot.prev.jump;
  else if (bot.wall && dy < 40 && !bot.prev.jump) input.jump = true;
  else if (bot.vy < -1 && dy < -28) input.jump = true;
  else if (bot.flap && dy < -12) input.jump = true;
  else if (!bot.prev.jump && bot.vy > -4 && dy < -28) input.jump = true;

  if (item && distance(bot, item) < 39 && !bot.weapon && !bot.prev.grab) input.grab = true;
  if (bot.weapon && bot.ammo === 0 && !bot.prev.grab) input.grab = true;
  if (bot.weapon === 'grenade' && enemyDistance < 95 && availableItems.some(i => i.type !== 'grenade') && !bot.prev.grab) input.grab = true;
  if (bot.heldBody && enemyDistance < 180 && Math.abs(enemy.y - bot.y) < 70 && !bot.prev.grab) input.grab = true;

  if (bot.weapon) {
    const xDistance = Math.abs(enemy.x - bot.x);
    const yDistance = Math.abs(enemy.y - bot.y);
    const range = bot.weapon === 'submachine' ? 780 : bot.weapon === 'grenade' ? 250 : 800;
    const facesEnemy = Math.sign(enemy.x - bot.x) === bot.facing;
    const safeGrenade = bot.weapon !== 'grenade' || (enemyDistance > 95 && enemyDistance < 250 && bot.grenadeFuse < 110);
    const clearShot = ![...arena.blocks,...state.cover].some(b => b.x < Math.max(bot.x,enemy.x) && b.x+b.w > Math.min(bot.x,enemy.x) && b.y < bot.y-15 && b.y+b.h > bot.y-20);
    if (xDistance < range && yDistance < (bot.weapon==='grenade'?85:42) && facesEnemy && safeGrenade && bot.cooldown <= 0 && (!bot.prev.fire || bot.weapon === 'submachine') && (bot.weapon==='grenade'||clearShot)) input.fire = true;
    if (bot.weapon === 'grenade' && bot.grenadeFuse > 0 && !bot.prev.fire && enemyDistance > 80) input.fire = true;
  }

  memory.lastX = bot.x; memory.lastY = bot.y;
  return input;
}
