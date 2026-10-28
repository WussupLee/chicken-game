import { describe, expect, it } from 'vitest';
import { makeActor, newGame, startRound, tick, NO_INPUT } from './game';
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
