import { describe, expect, it } from 'vitest';
import { ARENAS, makeActor, newGame, startRound, tick, NO_INPUT, WEAPONS } from './game';
import { botInput } from '../server/bot';

describe('match simulation', () => {
  it('scores a surviving chicken and advances after the round', () => {
    const s = newGame(1);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', true, 1)];
    startRound(s);
    s.actors[1].alive = false;
    for (let i = 0; i < 100; i++) tick(s, { a: NO_INPUT });
    expect(s.actors[0].wins).toBe(1);
    expect(s.phase).toBe('presenter');
  });

  it('allows an airborne second jump press to start flapping', () => {
    const s = newGame(1);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', true, 1)];
    startRound(s);
    const a = s.actors[0]; a.y = 504; a.grounded = true;
    tick(s, { a: { ...NO_INPUT, jump: true } });
    expect(a.vy).toBeLessThan(0);
    tick(s, { a: NO_INPUT });
    a.vy = 2;
    tick(s, { a: { ...NO_INPUT, jump: true } });
    expect(a.flap).toBe(true);
    expect(a.vy).toBeLessThanOrEqual(1.5);
  });

  it('enters a slide when crouching at speed', () => {
    const s = newGame(1);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', true, 1)];
    startRound(s);
    const a = s.actors[0]; a.y = 504; a.grounded = true; a.vx = 3;
    tick(s, { a: { ...NO_INPUT, right: true, down: true } });
    expect(a.crouch).toBe(true);
    expect(a.sliding).toBe(true);
  });

  it('awards a ten-win match at intermission', () => {
    const s = newGame(1);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', true, 1)];
    s.actors[0].wins = 10; s.phase = 'intermission'; s.phaseTimer = 0.001;
    tick(s, {});
    expect(s.phase).toBe('winner');
    expect(s.winnerId).toBe('a');
  });

  it('lets a player pick up and throw a defeated body', () => {
    const s = newGame(1);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1), makeActor('c', 'C', false, 2)];
    startRound(s);
    const [a,b] = s.actors;
    a.x = 200; a.y = 504; a.grounded = true;
    b.x = 215; b.y = 504; b.alive = false;
    tick(s, { a: { ...NO_INPUT, grab: true } });
    expect(a.heldBody).toBe('b');
    tick(s, { a: NO_INPUT });
    tick(s, { a: { ...NO_INPUT, grab: true } });
    expect(a.heldBody).toBeNull();
    expect(b.vx).toBeGreaterThan(5);
  });

  it('starts every round unarmed and rolls each of three pickup pads independently', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const s = newGame(seed);
      s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1)];
      startRound(s);
      expect(s.actors.every(a => a.weapon === null && a.ammo === 0)).toBe(true);
      expect(s.items).toHaveLength(3);
      expect(s.items.every(item => WEAPONS.includes(item.type))).toBe(true);
      expect(new Set(s.items.map(item => item.x)).size).toBe(3);
    }
  });

  it('lets a chicken collect a pad weapon and fire it with its weapon-specific ammo', () => {
    const s = newGame(12);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1)]; startRound(s);
    const a = s.actors[0]; const item = s.items[0];
    a.x = item.x; a.y = item.y + 15; a.grounded = true;
    tick(s, { a: { ...NO_INPUT, grab: true } });
    expect(a.weapon).toBe(item.type);
    expect(a.ammo).toBe(item.type === 'pistol' ? 9 : item.type === 'shotgun' ? 4 : 3);
    tick(s, { a: NO_INPUT }); tick(s, { a: { ...NO_INPUT, fire: true } });
    expect(a.ammo).toBe(item.type === 'shotgun' ? 3 : item.type === 'grenade' ? 2 : 8);
    expect(s.shots.length).toBe(item.type === 'shotgun' ? 6 : 1);
  });

  it('moves bots toward a pickup and jumps or flaps toward a higher goal', () => {
    const s = newGame(20);
    s.actors = [makeActor('bot', 'Bot', true, 0), makeActor('foe', 'Foe', true, 1)]; startRound(s);
    const bot = s.actors[0], pad = s.items[0];
    bot.x = pad.x - 100; bot.y = pad.y + 15; bot.grounded = true;
    const seek = botInput(s, bot);
    expect(seek.right).toBe(true);
    // A pad above the current platform requires an initial jump; the airborne
    // follow-up press starts a flap when the chicken is still below its goal.
    s.items = [{ ...pad, x: bot.x, y: bot.y - 100 }];
    const jump = botInput(s, bot);
    expect(jump.jump).toBe(true);
    tick(s, { bot: jump });
    bot.vy = 1; bot.prev.jump = false;
    expect(botInput(s, bot).jump).toBe(true);
  });

  it('fires at a lined-up opponent and reverses into an escape jump when stuck', () => {
    const s = newGame(21);
    s.actors = [makeActor('stuck-bot', 'Bot', true, 0), makeActor('target', 'Target', false, 1)]; startRound(s);
    const bot = s.actors[0], target = s.actors[1];
    bot.weapon = 'pistol'; bot.ammo = 9; bot.x = 300; bot.y = 504; bot.grounded = true; bot.facing = 1;
    target.x = 390; target.y = 504;
    expect(botInput(s, bot).fire).toBe(true);
    // Keep the target to the right, but hold bot position to simulate a wall
    // or platform edge preventing movement progress.
    const before = botInput(s, bot);
    bot.prev = { ...NO_INPUT, right: true };
    for (let i = 0; i < 41; i++) botInput(s, bot);
    const escape = botInput(s, bot);
    expect(escape.left).toBe(true);
    expect(escape.jump).toBe(true);
    expect(before.right).toBe(true);
  });

  it('keeps a death pose still while its body spins, lands, and settles', () => {
    const s = newGame(22);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1)]; startRound(s);
    const body = s.actors[1]; body.alive = false; body.ragdoll = true;
    body.x = 450; body.y = 460; body.vx = 3; body.vy = -2; body.angularVelocity = 0.2;
    const initialRotation = body.rotation;
    for (let i = 0; i < 120; i++) tick(s, {});
    expect(body.rotation).not.toBe(initialRotation);
    expect(body.y).toBeLessThanOrEqual(504);
    expect(Math.abs(body.vx)).toBeLessThan(3);
    expect(body.angularVelocity).toBeLessThan(0.2);
  });

  it('has bots participate in a complete round', () => {
    const s = newGame(1);
    s.actors = [0,1,2,3].map(i => makeActor(`bot${i}`, `Bot ${i}`, true, i));
    startRound(s);
    let heldAWeapon = false;
    for (let i = 0; i < 60 * 47 && s.phase === 'round'; i++) {
      const inputs = Object.fromEntries(s.actors.map(a => [a.id, botInput(s, a)]));
      tick(s, inputs);
      if (s.actors.some(a => a.weapon)) heldAWeapon = true;
    }
    expect(heldAWeapon).toBe(true);
    expect(s.phase).toBe('presenter');
    expect(s.actors.reduce((total, a) => total + a.wins, 0)).toBeGreaterThan(0);
  });
});
