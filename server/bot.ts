import { ARENAS, NO_INPUT, type Actor, type GameState, type Input } from '../shared/game';

export function botInput(state: GameState, bot: Actor): Input {
  const input = { ...NO_INPUT };
  if (!bot.alive || state.phase !== 'round') return input;
  const targets = state.actors.filter(a => a.alive && a.id !== bot.id);
  if (!targets.length) return input;
  const enemy = targets.reduce((best, a) => Math.abs(a.x - bot.x) < Math.abs(best.x - bot.x) ? a : best);
  const items = state.items.filter(i => !i.heldBy);
  const item = items.length ? items.reduce((best, i) => Math.hypot(i.x - bot.x, i.y - bot.y) < Math.hypot(best.x - bot.x, best.y - bot.y) ? i : best) : null;
  const body = state.actors.find(a => !a.alive && a.id !== bot.id && !state.actors.some(h => h.heldBody === a.id));
  const goalX = !bot.weapon && !bot.heldBody && item ? item.x : !bot.weapon && !bot.heldBody && body ? body.x : enemy.x;
  const goalY = !bot.weapon && !bot.heldBody && item ? item.y : !bot.weapon && !bot.heldBody && body ? body.y : enemy.y;
  const dx = goalX - bot.x;
  input.left = dx < -18; input.right = dx > 18;
  const arena = ARENAS[state.arenaIndex];
  const wallAhead = arena.blocks.some(b => b.x < bot.x + Math.sign(dx) * 32 && b.x + b.w > bot.x + Math.sign(dx) * 32 && b.y < bot.y && b.y + b.h > bot.y - 23);
  const ledgeAhead = ![...arena.blocks, ...arena.platforms].some(b => b.x < bot.x + Math.sign(dx) * 42 && b.x + b.w > bot.x + Math.sign(dx) * 42 && Math.abs(b.y - bot.y) < 5);
  input.jump = (goalY < bot.y - 28 || wallAhead || (ledgeAhead && bot.grounded)) && (bot.grounded || bot.vy > 0);
  if (!bot.grounded && bot.vy > 1.2 && goalY < bot.y) input.jump = state.round % 2 === 0 || Math.floor(state.timer * 10) % 3 !== 0;
  if (!bot.weapon && item && Math.hypot(item.x - bot.x, item.y - (bot.y - 15)) < 38) input.grab = Math.floor(state.timer * 8) % 2 === 0;
  if (!bot.weapon && !item && body && Math.hypot(body.x - bot.x, body.y - bot.y) < 36) input.grab = Math.floor(state.timer * 8) % 2 === 0;
  if (bot.heldBody && Math.abs(enemy.x - bot.x) < 200 && Math.abs(enemy.y - bot.y) < 50) input.grab = Math.floor(state.timer * 8) % 2 === 0;
  if (bot.weapon && Math.abs(enemy.y - bot.y) < 45 && Math.abs(enemy.x - bot.x) < (bot.weapon === 'sword' ? 45 : 570)) {
    input.fire = Math.floor(state.timer * 5 + bot.slot) % 3 !== 0;
  }
  if (!bot.weapon && !item && Math.abs(enemy.x - bot.x) < 34 && Math.abs(enemy.y - bot.y) < 30) input.grab = Math.floor(state.timer * 7) % 2 === 0;
  return input;
}
