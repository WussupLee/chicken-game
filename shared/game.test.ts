import { describe, expect, it } from 'vitest';
import { ARENAS, makeActor, newGame, predictActorMovement, startRound, tick, NO_INPUT, WEAPONS } from './game';
import { botInput } from '../server/bot';

describe('match simulation', () => {
  it("randomizes unique spawn points and changes each player's spawn when an arena returns", () => {
    const s=newGame(43);
    s.actors=[0,1,2,3].map(i=>makeActor(`player-${i}`,`Player ${i}`,false,i));
    const lastByArena=new Map<number,string[]>();
    for(let round=0;round<18;round++){
      startRound(s);
      const positions=s.actors.map(a=>`${a.x},${a.y}`);
      expect(new Set(positions).size).toBe(4);
      const previous=lastByArena.get(s.arenaIndex);
      if(previous)positions.forEach((position,i)=>expect(position).not.toBe(previous[i]));
      lastByArena.set(s.arenaIndex,positions);
    }
  });

  it('leaves the forest center open beneath its raised platform', () => {
    const centerWall=ARENAS[0].blocks.some(b=>b.y<500&&b.y+b.h>450&&b.x<425&&b.x+b.w>125);
    expect(centerWall).toBe(false);
  });

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

  it('starts a slide with a lower diagonal from rest and keeps it while aiming diagonally', () => {
    const s=newGame(7);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=230;a.y=500;a.grounded=true;a.vx=0;
    tick(s,{a:{...NO_INPUT,right:true,down:true}});
    expect(a.sliding).toBe(true);expect(a.vx).toBeGreaterThan(6);
    tick(s,{a:{...NO_INPUT,right:true,up:true}});
    expect(a.sliding).toBe(true);expect(a.aimDiagonal).toBe(true);
    tick(s,{a:{...NO_INPUT,left:true}});
    expect(a.sliding).toBe(false);
  });

  it('slows a fall against a wall and jumps away from it', () => {
    const s=newGame(31);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=925;a.y=200;a.vx=2;a.vy=8;a.grounded=false;
    tick(s,{a:{...NO_INPUT,right:true}});
    expect(a.wallSlide).toBe(true);expect(a.vy).toBe(2.5);
    tick(s,{a:{...NO_INPUT,jump:true}});
    expect(a.vx).toBeLessThan(0);expect(a.vy).toBeLessThan(-10);expect(a.wallSlide).toBe(false);
  });

  it('catches a ledge when moving toward it, climbs smoothly, and drops with Down', () => {
    const s=newGame(32);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];s.cover=[];a.x=59;a.y=382;a.vy=2;a.grounded=false;
    tick(s,{a:{...NO_INPUT,right:true}});
    expect(a.ledgeSide).toBe(1);expect(a.ledgeY).toBe(375);
    tick(s,{a:{...NO_INPUT,jump:true}});
    expect(a.ledgeSide).toBe(0);expect(a.climbTicks).toBe(10);
    const hangingY=a.y;
    tick(s,{a:NO_INPUT});expect(a.y).toBeLessThan(hangingY);expect(a.y).toBeGreaterThan(375);
    for(let i=0;i<9;i++)tick(s,{a:NO_INPUT});
    expect(a.grounded).toBe(true);expect(a.y).toBe(375);
    a.x=59;a.y=382;a.vy=2;a.grounded=false;a.ledgeLock=0;
    tick(s,{a:{...NO_INPUT,right:true}});
    expect(a.ledgeSide).toBe(1);
    tick(s,{a:{...NO_INPUT,down:true}});
    expect(a.ledgeSide).toBe(0);expect(a.ledgeLock).toBeGreaterThan(0);
  });

  it('catches a ledge within the wider hand-reach window', () => {
    const s=newGame(34);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];s.cover=[];a.x=47;a.y=382;a.vy=2;a.grounded=false;
    tick(s,{a:{...NO_INPUT,right:true}});
    expect(a.ledgeSide).toBe(1);expect(a.x).toBe(59);
  });

  it('uses the sword swing to defeat an exposed opponent but stops at cover', () => {
    const s=newGame(33);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const [a,b]=s.actors;a.x=400;a.y=504;a.grounded=true;a.facing=1;a.weapon='sword';b.x=445;b.y=504;b.grounded=true;
    s.cover=[{x:420,y:470,w:20,h:34,kind:'crate',hp:3,maxHp:3}];
    tick(s,{a:{...NO_INPUT,fire:true}});for(let i=0;i<5;i++)tick(s,{});
    expect(b.alive).toBe(true);expect(s.cover[0].hp).toBe(2);
    s.cover=[];a.cooldown=0;a.swingTicks=0;
    tick(s,{a:{...NO_INPUT,fire:true}});for(let i=0;i<5;i++)tick(s,{});
    expect(b.alive).toBe(false);
  });
  it('advances through three sword stages only after separate Fire presses', () => {
    const s=newGame(51);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=480;a.y=504;a.grounded=true;a.weapon='sword';s.cover=[];s.actors[1].x=800;
    tick(s,{a:{...NO_INPUT,fire:true}});expect(a.comboStage).toBe(1);
    for(let i=0;i<8;i++)tick(s,{a:{...NO_INPUT,fire:true}});
    expect(a.comboQueued).toBe(false);
    tick(s,{a:NO_INPUT});tick(s,{a:{...NO_INPUT,fire:true}});expect(a.comboQueued).toBe(true);
    while(a.comboStage===1)tick(s,{a:NO_INPUT});
    expect(a.comboStage).toBe(2);
    for(let i=0;i<8;i++)tick(s,{a:NO_INPUT});
    tick(s,{a:{...NO_INPUT,fire:true}});expect(a.comboQueued).toBe(true);
    while(a.comboStage===2)tick(s,{a:NO_INPUT});
    expect(a.comboStage).toBe(3);
    while(a.comboStage===3)tick(s,{a:NO_INPUT});
    expect(a.comboStage).toBe(0);
  });
  it('does not chain a held sword button and clears combos on ragdoll', () => {
    const s=newGame(52);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=480;a.y=504;a.grounded=true;a.weapon='sword';s.cover=[];s.actors[1].x=800;
    for(let i=0;i<40;i++)tick(s,{a:{...NO_INPUT,fire:true}});
    expect(a.comboStage).toBe(0);
    tick(s,{a:NO_INPUT});tick(s,{a:{...NO_INPUT,fire:true}});expect(a.comboStage).toBe(1);
    tick(s,{a:{...NO_INPUT,ragdoll:true}});
    expect(a.comboStage).toBe(0);expect(a.swingTicks).toBe(0);expect(a.ragdoll).toBe(true);
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
    for (let i = 0; i < 12; i++) tick(s, { a: { ...NO_INPUT, grab: true } });
    tick(s, { a: NO_INPUT });
    expect(a.heldBody).toBeNull();
    expect(b.vx).toBeGreaterThan(5);
  });

  it('starts every round unarmed with one sword and five other weapon pads', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const s = newGame(seed);
      s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1)];
      startRound(s);
      expect(s.actors.every(a => a.weapon === null && a.ammo === 0)).toBe(true);
      expect(s.items).toHaveLength(6);
      expect(s.items.every(item => WEAPONS.includes(item.type))).toBe(true);
      expect(s.items.filter(item => item.type === 'sword')).toHaveLength(1);
      expect(new Set(s.items.map(item => item.x)).size).toBe(6);
    }
  });

  it('lets a chicken collect a pad weapon and fire it with its weapon-specific ammo', () => {
    const s = newGame(12);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1)]; startRound(s);
    const a = s.actors[0]; const item = s.items[0]; item.type='pistol'; item.ammo=9;
    a.x = item.x; a.y = item.y + 15; a.grounded = true;
    tick(s, { a: { ...NO_INPUT, grab: true } });
    expect(a.weapon).toBe(item.type);
    expect(a.ammo).toBe(9);
    tick(s, { a: NO_INPUT }); tick(s, { a: { ...NO_INPUT, fire: true } });
    expect(a.ammo).toBe(8);
    expect(s.shots.length).toBe(1);
  });

  it('picks up with B without firing a held SMG until B is released and pressed again', () => {
    const s=newGame(63);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const item=s.items[0],a=s.actors[0];item.type='submachine';item.ammo=24;a.x=item.x;a.y=item.y+15;a.grounded=true;
    for(let i=0;i<12;i++)tick(s,{a:{...NO_INPUT,fire:true}});
    expect(a.weapon).toBe('submachine');expect(a.ammo).toBe(24);
    tick(s,{a:NO_INPUT});tick(s,{a:{...NO_INPUT,fire:true}});expect(a.ammo).toBe(23);
  });

  it('allows stationary crouched firing without falling through a one-way platform', () => {
    const s=newGame(64);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=100;a.y=250;a.grounded=true;a.groundPlatform=2;a.weapon='pistol';a.ammo=9;s.cover=[];
    tick(s,{a:{...NO_INPUT,down:true,fire:true}});
    expect(a.crouch).toBe(true);expect(a.y).toBe(250);expect(a.grounded).toBe(true);expect(a.ammo).toBe(8);
  });

  it('allows the submachine gun to fire automatically while fire is held', () => {
    const s = newGame(13);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1)]; startRound(s);
    const a = s.actors[0]; a.weapon = 'submachine'; a.ammo = 24; a.x = 600; a.y = 300;
    for (let i = 0; i < 8; i++) tick(s, { a: { ...NO_INPUT, fire: true } });
    expect(a.ammo).toBe(22);
    expect(s.shots.length).toBeGreaterThan(1);
  });

  it('pins a grenade with Fire and throws it with Grab', () => {
    const s = newGame(14); s.actors = [makeActor('a','A',false,0),makeActor('b','B',false,1)]; startRound(s);
    const a=s.actors[0]; a.weapon='grenade';a.ammo=1;
    tick(s,{a:{...NO_INPUT,fire:true}});
    expect(a.grenadeFuse).toBe(150);expect(s.shots).toHaveLength(0);
    tick(s,{a:NO_INPUT});tick(s,{a:{...NO_INPUT,grab:true}});tick(s,{a:NO_INPUT});
    expect(a.grenadeFuse).toBe(0);expect(a.ammo).toBe(0);
    expect(s.shots.some(p=>p.kind==='grenade'&&p.ttl>0)).toBe(true);
  });

  it('drops an un-aimed grenade and throws it in all eight held directions with B', () => {
    const directions=[NO_INPUT,{...NO_INPUT,up:true},{...NO_INPUT,right:true,up:true},{...NO_INPUT,right:true},{...NO_INPUT,right:true,down:true},{...NO_INPUT,down:true},{...NO_INPUT,left:true,down:true},{...NO_INPUT,left:true},{...NO_INPUT,left:true,up:true}];
    for(const direction of directions){
      const s=newGame(54);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
      const a=s.actors[0];a.x=480;a.y=504;a.grounded=true;a.weapon='grenade';a.ammo=1;s.cover=[];
      tick(s,{a:{...NO_INPUT,fire:true}});expect(s.effects.some(e=>e.type==='pin')).toBe(true);
      tick(s,{a:NO_INPUT});for(let i=0;i<12;i++)tick(s,{a:{...direction,fire:true}});
      tick(s,{a:direction});
      const grenade=s.shots.find(shot=>shot.kind==='grenade');expect(grenade).toBeDefined();
      expect(Math.sign(grenade!.vx)).toBe(Math.sign(Number(direction.right)-Number(direction.left)));
      if(direction.up)expect(grenade!.vy).toBeLessThan(0);
      if(direction.down)expect(grenade!.vy).toBeGreaterThan(0);
      expect(Math.abs(grenade!.vx)).toBeLessThan(11);
      expect(a.weapon).toBeNull();expect(a.ammo).toBe(0);
    }
  });

  it('lets Grab throw a loaded gun and pin and launch a grenade', () => {
    const s=newGame(65);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=450;a.y=504;a.grounded=true;a.weapon='pistol';a.ammo=5;s.cover=[];
    tick(s,{a:{...NO_INPUT,grab:true}});tick(s,{a:NO_INPUT});
    expect(a.weapon).toBeNull();expect(s.thrownGuns[0].ammo).toBe(5);
    a.weapon='grenade';a.ammo=1;a.prev={...NO_INPUT};
    tick(s,{a:{...NO_INPUT,grab:true,right:true}});expect(a.grenadeFuse).toBeGreaterThan(0);
    tick(s,{a:{...NO_INPUT,right:true}});
    expect(s.shots.some(shot=>shot.kind==='grenade'&&shot.vx>0)).toBe(true);
  });

  it('keeps a pulled grenade fuse running until it explodes in hand', () => {
    const s=newGame(66);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=450;a.y=504;a.grounded=true;a.weapon='grenade';a.ammo=1;
    tick(s,{a:{...NO_INPUT,fire:true}});
    for(let i=0;i<150&&a.alive;i++)tick(s,{});
    expect(a.alive).toBe(false);expect(s.effects.some(effect=>effect.type==='blast')).toBe(true);
  });

  it('detonates a grenade immediately when it directly hits another chicken', () => {
    const s=newGame(55);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const [a,b]=s.actors;a.x=350;a.y=504;b.x=420;b.y=504;s.cover=[];
    s.shots=[{id:9200,kind:'grenade',owner:'a',x:405,y:486,vx:10,vy:0,ttl:100,radius:5}];
    tick(s,{});
    expect(b.alive).toBe(false);expect(s.shots).toHaveLength(0);expect(s.effects.some(e=>e.type==='blast')).toBe(true);
  });

  it('dims a collected pad for twelve seconds and animates its rerolled weapon', () => {
    const s=newGame(56);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const item=s.items.find(item=>item.type!=='sword')!,pad=s.pads[item.padIndex!],a=s.actors[0];
    a.x=item.x;a.y=item.y+15;a.grounded=true;tick(s,{a:{...NO_INPUT,fire:true}});
    expect(pad.itemId).toBeNull();expect(pad.cooldown).toBe(719);
    for(let i=0;i<718;i++)tick(s,{});
    expect(pad.itemId).toBeNull();expect(pad.cooldown).toBe(1);
    tick(s,{});expect(pad.cooldown).toBe(0);expect(pad.appearing).toBe(30);
    const refill=s.items.find(current=>current.id===pad.itemId)!;expect(refill).toBeDefined();
    a.weapon=null;a.ammo=0;a.prev={...NO_INPUT};tick(s,{a:{...NO_INPUT,fire:true}});expect(a.weapon).toBeNull();
    for(let i=0;i<30;i++)tick(s,{});
    expect(pad.appearing).toBe(0);expect(s.items.filter(current=>current.padIndex!==undefined&&current.type==='sword').length).toBeLessThanOrEqual(1);
  });

  it('aims upward independently of jumping and fires vertically', () => {
    const s=newGame(40);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];a.x=500;a.y=400;a.weapon='pistol';a.ammo=9;
    tick(s,{a:{...NO_INPUT,up:true,fire:true}});
    expect(a.aimUp).toBe(true);expect(a.vy).toBeGreaterThanOrEqual(0);
    expect(s.shots[0].vx).toBe(0);expect(s.shots[0].vy).toBeLessThan(0);
  });

  it('charges an empty gun throw and disarms a target while preserving its ammo', () => {
    const s=newGame(41);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const [a,b]=s.actors;a.x=400;a.y=504;a.grounded=true;a.weapon='pistol';a.ammo=0;b.x=520;b.y=504;b.grounded=true;b.weapon='submachine';b.ammo=17;
    tick(s,{a:{...NO_INPUT,grab:true}});
    for(let i=0;i<45;i++)tick(s,{a:{...NO_INPUT,grab:true}});
    tick(s,{a:NO_INPUT});
    expect(a.weapon).toBeNull();expect(s.thrownGuns).toHaveLength(1);
    expect(s.thrownGuns[0].vx).toBeGreaterThan(15);
    for(let i=0;i<12&&b.weapon;i++)tick(s,{});
    expect(b.weapon).toBeNull();
    expect(s.items.some(item=>item.type==='submachine'&&item.ammo===17&&item.loose)).toBe(true);
  });

  it('lets high bullets pass over a slide while low bullets can still hit', () => {
    const s=newGame(15);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const b=s.actors[1];b.x=300;b.y=504;b.vx=3;b.grounded=true;
    s.shots=[{id:900,kind:'pistol',owner:'a',x:296,y:480,vx:14,vy:0,ttl:20,radius:3}];
    tick(s,{b:{...NO_INPUT,right:true,down:true}});expect(b.alive).toBe(true);expect(b.sliding).toBe(true);
    s.shots=[{id:901,kind:'pistol',owner:'a',x:b.x-10,y:497,vx:14,vy:0,ttl:20,radius:3}];
    tick(s,{b:NO_INPUT});expect(b.sliding).toBe(true);expect(b.alive).toBe(false);
  });

  it('chips cover and allows a wall jump', () => {
    const s=newGame(16);s.round=1;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const c=s.cover[0];s.shots=[{id:902,kind:'pistol',owner:'a',x:c.x-7,y:c.y+10,vx:14,vy:0,ttl:20,radius:3}];
    tick(s,{});expect(c.hp).toBe(2);
    const a=s.actors[0];a.x=36;a.y=350;a.vx=-4;a.vy=1;a.grounded=false;
    tick(s,{a:{...NO_INPUT,left:true}});expect(a.wall).toBe(-1);
    tick(s,{a:{...NO_INPUT,jump:true,right:true}});expect(a.vy).toBeLessThan(-10);expect(a.vx).toBeGreaterThan(0);
  });

  it('requires Down plus a fresh Jump press to pass through a one-way platform', () => {
    const s=newGame(18);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];s.cover=[];a.x=150;a.y=375;a.vy=0;a.grounded=true;a.groundPlatform=1;
    tick(s,{a:{...NO_INPUT,down:true}});
    expect(a.y).toBe(375);expect(a.grounded).toBe(true);
    tick(s,{a:{...NO_INPUT,down:true,jump:true}});
    expect(a.y).toBeGreaterThan(375);expect(a.dropPlatform).toBe(1);
    a.x=150;a.y=375;a.vy=0;a.grounded=true;a.groundPlatform=1;a.dropPlatform=-1;a.prev={...NO_INPUT};
    tick(s,{a:{...NO_INPUT,down:true,right:true,jump:true}});
    expect(a.y).toBeGreaterThan(375);
  });

  it('fires in both upper diagonals and keeps the shot direction aligned with movement', () => {
    const s=newGame(19);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const a=s.actors[0];s.cover=[];a.x=400;a.y=300;a.weapon='pistol';a.ammo=9;
    tick(s,{a:{...NO_INPUT,up:true,right:true,fire:true}});
    expect(a.aimDiagonal).toBe(true);expect(s.shots[0].vx).toBeGreaterThan(0);expect(s.shots[0].vy).toBeLessThan(0);
    a.cooldown=0;a.prev={...NO_INPUT};s.shots=[];
    tick(s,{a:{...NO_INPUT,up:true,left:true,fire:true}});
    expect(s.shots[0].vx).toBeLessThan(0);expect(s.shots[0].vy).toBeLessThan(0);
  });

  it('can fire while sliding, falling, wall sliding, and hanging from a ledge', () => {
    const scenarios: Array<'slide'|'fall'|'wall'|'ledge'>=['slide','fall','wall','ledge'];
    for(const mode of scenarios){
      const s=newGame(21);s.round=mode==='wall'?1:0;s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
      const a=s.actors[0];s.cover=[];a.weapon='pistol';a.ammo=9;
      if(mode==='slide'){a.x=230;a.y=500;a.grounded=true;a.vx=2;tick(s,{a:{...NO_INPUT,down:true,right:true,fire:true}});expect(a.sliding).toBe(true);}
      if(mode==='fall'){a.x=500;a.y=300;a.vy=3;tick(s,{a:{...NO_INPUT,fire:true}});expect(a.grounded).toBe(false);}
      if(mode==='wall'){a.x=35;a.y=200;a.vx=-2;a.vy=8;tick(s,{a:{...NO_INPUT,left:true,fire:true}});expect(a.wallSlide).toBe(true);expect(s.shots[0].vx).toBeGreaterThan(0);}
      if(mode==='ledge'){a.x=59;a.y=382;a.vy=2;tick(s,{a:{...NO_INPUT,right:true}});expect(a.ledgeSide).toBe(1);tick(s,{a:{...NO_INPUT,fire:true}});expect(a.ledgeSide).toBe(1);expect(s.shots[0].vx).toBeLessThan(0);}
      expect(s.shots.length).toBeGreaterThan(0);
    }
  });

  it('has solid side walls in Factory and Orbital while Canopy remains open', () => {
    expect(ARENAS[0].openSides).toBe(true);
    for(const arena of ARENAS.slice(1)){
      expect(arena.blocks.some(b=>b.x===0&&b.h>=504)).toBe(true);
      expect(arena.blocks.some(b=>b.x+b.w===960&&b.h>=504)).toBe(true);
    }
  });

  it('gives every arena four climbable tiers and many breakable routes', () => {
    for (const arena of ARENAS) {
      expect(arena.platforms.length).toBeGreaterThanOrEqual(7);
      expect(new Set(arena.platforms.map(p => Math.round(p.y / 35))).size).toBeGreaterThanOrEqual(4);
      expect(arena.cover.length).toBeGreaterThanOrEqual(12);
      expect(new Set(arena.cover.map(c => c.kind))).toEqual(new Set(['crate', 'door', 'wall']));
      for (const pad of arena.itemSpawns) {
        expect([...arena.blocks, ...arena.platforms].some(p => pad.x >= p.x && pad.x <= p.x+p.w && Math.abs(p.y-(pad.y+15)) < 2)).toBe(true);
        expect(arena.cover.some(c => pad.x >= c.x && pad.x <= c.x+c.w && pad.y >= c.y && pad.y <= c.y+c.h)).toBe(false);
      }
    }
  });

  it('lets bullets break crates, doors, and walls at different strengths', () => {
    const s=newGame(31);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    for (const kind of ['crate','door','wall'] as const) {
      const cover=s.cover.find(c=>c.kind===kind)!;
      const health=cover.maxHp;
      expect(health).toBe(kind==='wall'?5:kind==='door'?4:3);
      for(let i=0;i<health;i++){
        s.shots=[{id:1000+i,kind:'pistol',owner:'a',x:cover.x-7,y:cover.y+12,vx:14,vy:0,ttl:20,radius:3}];
        tick(s,{});
      }
      expect(s.cover.includes(cover)).toBe(false);
    }
  });

  it('lets a grenade remove several nearby pieces of cover', () => {
    const s=newGame(32);s.actors=[makeActor('a','A',false,0),makeActor('b','B',false,1)];startRound(s);
    const nearby=s.cover.filter(c=>c.kind==='crate').slice(0,2);
    nearby[0].x=220;nearby[0].y=470;nearby[1].x=252;nearby[1].y=470;
    expect(nearby).toHaveLength(2);
    s.shots=[{id:1200,kind:'grenade',owner:'a',x:240,y:487,vx:0,vy:0,ttl:1,radius:5}];
    tick(s,{});
    expect(nearby.every(c=>!s.cover.includes(c))).toBe(true);
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
    s.items = [{ ...pad, id: pad.id + 100, x: bot.x, y: bot.y - 100 }];
    const jump = botInput(s, bot);
    expect(jump.jump).toBe(true);
    tick(s, { bot: jump });
    bot.vy = 1; bot.prev.jump = false;
    expect(botInput(s, bot).jump).toBe(true);
  });

  it('fires at a lined-up opponent and reverses into an escape jump when stuck', () => {
    const s = newGame(21);s.round=1;
    s.actors = [makeActor('stuck-bot', 'Bot', true, 0), makeActor('target', 'Target', false, 1)]; startRound(s);
    const bot = s.actors[0], target = s.actors[1];
    bot.weapon = 'pistol'; bot.ammo = 9; bot.x = 400; bot.y = 504; bot.grounded = true; bot.facing = 1;
    target.x = 500; target.y = 504;
    expect(botInput(s, bot).fire).toBe(true);
    // Keep the target to the right, but hold bot position to simulate a wall
    // or platform edge preventing movement progress.
    const before = botInput(s, bot);
    bot.prev = { ...NO_INPUT, right: true };
    for (let i = 0; i < 41; i++) botInput(s, bot);
    const escape = botInput(s, bot);
    expect(escape.left || escape.right).toBe(true);
    expect(escape.jump).toBe(true);
    expect(escape.left).not.toBe(before.left);
  });

  it('keeps a short tactical goal instead of mirroring an opponent every tick', () => {
    const s=newGame(62);s.round=1;s.actors=[makeActor('goal-bot','Bot',true,0),makeActor('moving-foe','Foe',false,1)];startRound(s);
    const [bot,foe]=s.actors;bot.x=400;bot.y=504;bot.grounded=true;bot.weapon='pistol';bot.ammo=9;foe.x=650;foe.y=504;
    const first=botInput(s,bot);foe.x=170;
    const second=botInput(s,bot);
    expect([second.left,second.right]).toEqual([first.left,first.right]);
  });

  it('keeps a predicted chicken blocked at a solid wall', () => {
    const a=makeActor('prediction','Prediction',false,0),ar=ARENAS[1];a.x=35;a.y=504;a.grounded=true;
    const input={...NO_INPUT,left:true};
    const positions:number[]=[];
    for(let i=0;i<20;i++){predictActorMovement(a,input,ar,[]);positions.push(a.x);}
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(35);
    expect(new Set(positions.slice(5)).size).toBe(1);
  });

  it('keeps a death pose still while its body spins, lands, and settles', () => {
    const s = newGame(22);
    s.actors = [makeActor('a', 'A', false, 0), makeActor('b', 'B', false, 1), makeActor('c','C',false,2)]; startRound(s);
    const body = s.actors[1]; body.alive = false; body.ragdoll = true;
    body.x = 450; body.y = 460; body.vx = 3; body.vy = -2; body.angularVelocity = 0.2;
    const initialRotation = body.rotation;
    for (let i = 0; i < 240; i++) tick(s, {});
    expect(body.rotation).not.toBe(initialRotation);
    expect(body.y).toBeLessThanOrEqual(504);
    expect(Math.abs(body.vx)).toBeLessThan(3);
    expect(body.angularVelocity).toBeLessThan(0.2);
    expect(body.rotation === 0 || body.rotation === Math.PI).toBe(true);
  });

  it('has bots finish rounds by elimination on each arena', () => {
    for (const arenaIndex of [0,1,2]) {
      let eliminationWins = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const s = newGame(seed); s.round = arenaIndex;
        s.actors = [0,1,2,3].map(i => makeActor(`map${arenaIndex}seed${seed}bot${i}`, `Bot ${i}`, true, i));
        startRound(s);
        let heldAWeapon = false;
        for (let i = 0; i < 60 * 47 && s.phase === 'round'; i++) {
          const inputs = Object.fromEntries(s.actors.map(a => [a.id, botInput(s, a)]));
          tick(s, inputs);
          if (s.actors.some(a => a.weapon)) heldAWeapon = true;
        }
        expect(heldAWeapon).toBe(true);
        expect(s.phase).toBe('presenter');
        eliminationWins += s.actors.reduce((total, a) => total + a.wins, 0);
      }
      expect(eliminationWins).toBeGreaterThanOrEqual(3);
    }
  });
});
