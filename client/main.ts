import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { ACTOR_BOXES, ARENAS, COLORS, HEIGHT, NO_INPUT, predictActorMovement, SWORD_COMBO, WIDTH, type Actor, type GameState, type Input, type Weapon } from '../shared/game';
import { containCombatants, frameCombatants, type CameraFrame } from '../shared/camera';
import HERO_MANIFEST from './public/assets/hero/manifest.json';
import './style.css';

type ViewState = GameState & { code: string; host: string; serverTick:number; inputAck?: Record<string, number> };
type Ack = { ok: boolean; code?: string; id?: string; token?: string; error?: string };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const app = document.querySelector<HTMLDivElement>('#app')!;
const socket = io({ autoConnect: true });
let state: ViewState | null = null;
let myId = '';
let code = '';
let error = '';
let screen: 'menu' | 'join' | 'lobby' | 'game' | 'controls' = 'menu';
let game: Phaser.Game | null = null;
let lastLobbyKey = '';
let lastOverlayKey = '';
let lastHudKey = '';
let lastSpectateKey = '';
const keys = new Set<string>();
const defaultBindings: Record<keyof Input, string> = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', jump: 'Space', fire: 'KeyK', grab: 'KeyJ', ragdoll: 'KeyL', cluck: 'KeyE' };
const savedBindings = JSON.parse(localStorage.getItem('chicken-bindings') || '{}') as Partial<Record<keyof Input,string>>;
let bindings: Record<keyof Input, string> = Object.fromEntries((Object.keys(defaultBindings) as (keyof Input)[]).map(k => [k, savedBindings[k] || defaultBindings[k]])) as Record<keyof Input,string>;
let rebinding: keyof Input | null = null;
let audio: AudioContext | null = null;
let previousPhase = '';
const snapshots:{tick:number;received:number;positions:Map<string,{x:number;y:number}>}[]=[];
let predictedAt=performance.now();
let inputSequence=0;
let pendingInputs:{seq:number;input:Input}[]=[];
let predictedActor:Actor|null=null;
let correctionX=0,correctionY=0;
let lanAddresses: string[] = [];
type TouchAction = keyof Input | 'upLeft' | 'upRight' | 'downLeft' | 'downRight';
const touchPointers = new Map<number, TouchAction>();
let spectateTarget: string | 'wide' | null = null;
let spectateRound = 0;
let spectateJumpHeld = false;
function spectateChoices(): string[] { return [...(state?.actors.filter(a=>a.alive).sort((a,b)=>a.slot-b.slot).map(a=>a.id) || []),'wide']; }
function syncSpectate(): void {
  if (!state) return;
  if (state.round !== spectateRound) { spectateRound=state.round; spectateTarget=null; spectateJumpHeld=false; }
  const mine=state.actors.find(a=>a.id===myId);
  if (state.phase!=='round'||!mine||mine.alive) {spectateTarget=null;return;}
  if (!spectateTarget || (spectateTarget!=='wide'&&!state.actors.some(a=>a.id===spectateTarget&&a.alive))) spectateTarget=spectateChoices()[0];
}
function cycleSpectate(): void {const choices=spectateChoices();spectateTarget=choices[(choices.indexOf(spectateTarget || '')+1)%choices.length];if(screen==='game')render();}
let installPrompt: InstallPrompt | null = null;
let installMessage = '';
function updateDisplayMode(): void {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  document.documentElement.classList.toggle('app-standalone', iosStandalone || !!document.fullscreenElement || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
}
updateDisplayMode();
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event as InstallPrompt; });
window.addEventListener('appinstalled', () => { installPrompt = null; installMessage = 'Chicken Game is on your Home Screen.'; if (screen === 'menu') render(); });
document.addEventListener('fullscreenchange', updateDisplayMode);
matchMedia('(display-mode: fullscreen), (display-mode: standalone)').addEventListener('change', updateDisplayMode);
async function addToHomeScreen(): Promise<void> {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      installMessage = (await prompt.userChoice).outcome === 'accepted' ? 'Open Chicken Game from your Home Screen for the full-screen layout.' : 'You can install later from your browser menu.';
    } catch { installMessage = 'Open your browser menu and choose Install app.'; }
  } else if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    installMessage = 'In Safari, tap Share, then Add to Home Screen. Open the new icon for edge-to-edge play.';
  } else if (!window.isSecureContext) {
    installMessage = 'Android app installation needs HTTPS. For this local network link, use Full screen now; an HTTPS link will enable Add to Home Screen.';
  } else {
    installMessage = 'Open your browser menu and choose Install app or Add to Home Screen.';
  }
  const help = document.querySelector('#install-help');
  if (help) help.textContent = installMessage;
}
async function enterFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else throw new Error('Fullscreen unavailable');
  } catch { installMessage = 'Use Add to Home Screen to launch without browser controls.'; const help = document.querySelector('#install-help'); if (help) help.textContent = installMessage; }
}
window.addEventListener('blur', () => {
  touchPointers.clear();
  document.querySelectorAll<HTMLButtonElement>('[data-touch]').forEach(button => button.classList.remove('pressed'));
});
void fetch('/api/network').then(r => r.json()).then((data: { addresses?: string[] }) => { lanAddresses = data.addresses || []; if (screen === 'lobby') render(); }).catch(() => {});
document.addEventListener('pointerdown', () => { audio ??= new AudioContext(); void audio.resume(); });
function sting(frequencies: number[]): void { if (!audio || audio.state !== 'running') return; frequencies.forEach((freq,i)=>{const o=audio!.createOscillator(),gain=audio!.createGain();o.type='square';o.frequency.value=freq;gain.gain.setValueAtTime(0.035,audio!.currentTime+i*0.11);gain.gain.exponentialRampToValueAtTime(0.001,audio!.currentTime+i*0.11+0.17);o.connect(gain).connect(audio!.destination);o.start(audio!.currentTime+i*0.11);o.stop(audio!.currentTime+i*0.11+0.18);}); }
function pinSound(): void { if(!audio||audio.state!=='running')return;const now=audio.currentTime;for(const [frequency,delay] of [[1800,0],[1150,0.045]]){const tone=audio.createOscillator(),gain=audio.createGain();tone.type='triangle';tone.frequency.setValueAtTime(frequency,now+delay);tone.frequency.exponentialRampToValueAtTime(frequency*0.55,now+delay+0.09);gain.gain.setValueAtTime(0.06,now+delay);gain.gain.exponentialRampToValueAtTime(0.001,now+delay+0.1);tone.connect(gain).connect(audio.destination);tone.start(now+delay);tone.stop(now+delay+0.1);}}

window.addEventListener('keydown', e => {
  if (screen === 'game' && !audio) { audio = new AudioContext(); void audio.resume(); }
  if (rebinding) { bindings[rebinding] = e.code; localStorage.setItem('chicken-bindings', JSON.stringify(bindings)); rebinding = null; render(); e.preventDefault(); return; }
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) && screen === 'game') e.preventDefault();
  keys.add(e.code);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const playerName = () => (document.querySelector<HTMLInputElement>('#name')?.value || localStorage.getItem('chicken-name') || 'Player').slice(0,18);
function newToken(): string { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes, b => b.toString(16).padStart(2,'0')).join(''); }
function rememberRoom(a: Ack): void { if (!a.ok) { error = a.error || 'Could not join'; render(); return; } myId = a.id!; code = a.code!; localStorage.setItem('chicken-name', playerName()); localStorage.setItem(`chicken-token-${code}`, a.token!); history.replaceState(null,'',`?room=${code}`); error = ''; screen = 'lobby'; render(); }
function create(practice = false): void { const token = newToken(); socket.emit('create', { name: playerName(), token }, (a: Ack) => { rememberRoom(a); if (practice && a.ok) { socket.emit('addBot'); socket.emit('addBot'); socket.emit('addBot'); } }); }
function join(c: string): void { c = c.trim().toUpperCase(); socket.emit('join', { code: c, name: playerName(), token: localStorage.getItem(`chicken-token-${c}`) || newToken() }, rememberRoom); }
function button(id: string, label: string, style = ''): string { return `<button id="${id}" class="${style}">${label}</button>`; }
function drawGrenade(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1): void {
  g.fillStyle(0x263244); g.fillCircle(x,y,8*scale); g.fillStyle(0x6d8291); g.fillCircle(x,y,5*scale); g.fillStyle(0xffd86c); g.fillRect(x-1*scale,y-12*scale,2*scale,5*scale); g.fillRect(x+2*scale,y-12*scale,4*scale,2*scale);
}
function inviteUrl(): string {
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? lanAddresses[0] : location.origin;
  return host ? `${host}/?room=${encodeURIComponent(code)}` : location.href;
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]!);
function render(): void {
  const title = `<h1 class="brand">CHICKEN GAME</h1><div class="tagline">Feathers will fly</div>`;
  if (screen === 'menu') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Enter the coop</h2><div class="stack"><input id="name" maxlength="18" placeholder="Your name" value="${esc(localStorage.getItem('chicken-name') || '')}"/>${button('practice','Practice vs. bots')}${button('create','Host a room','secondary')}${button('showjoin','Join a room','ghost')}${button('showcontrols','Controls','ghost')}<a class="studio-link" href="/studio.html">Open Pixel Art Studio</a><div class="install-actions">${button('addhome','Add to Home Screen','ghost')}${button('fullscreen','Full screen','ghost')}</div><div id="install-help" class="muted small" role="status">${esc(installMessage)}</div><div class="error">${esc(error)}</div></div></section><footer class="footer">2–4 chickens. One winner. Infinite clucking. · Animation by Ozzbit Games</footer></main>`;
    document.querySelector('#practice')!.addEventListener('click', () => create(true)); document.querySelector('#create')!.addEventListener('click', () => create()); document.querySelector('#showjoin')!.addEventListener('click', () => { screen='join'; render(); }); document.querySelector('#showcontrols')!.addEventListener('click', () => { screen='controls'; render(); }); document.querySelector('#addhome')!.addEventListener('click', () => { void addToHomeScreen(); }); document.querySelector('#fullscreen')!.addEventListener('click', () => { void enterFullscreen(); }); return; }
  if (screen === 'join') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Join a room</h2><div class="stack"><input id="name" maxlength="18" placeholder="Your name" value="${esc(localStorage.getItem('chicken-name') || '')}"/><input id="room" maxlength="6" placeholder="6-letter room code" value="${esc(new URLSearchParams(location.search).get('room') || '')}"/>${button('join','Join room')}${button('back','Back','ghost')}<div class="error">${esc(error)}</div></div></section></main>`; document.querySelector('#join')!.addEventListener('click',()=>join(document.querySelector<HTMLInputElement>('#room')!.value)); document.querySelector('#back')!.addEventListener('click',()=>{screen='menu';render();}); return; }
  if (screen === 'controls') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Controls</h2><p class="muted small">Use all eight D-pad directions. Up aims vertically; up with left or right aims diagonally. Down crouches or starts a moving slide; hold Down and press Jump to drop through a platform. Jump climbs from a ledge; Down alone releases it. B picks up when unarmed, fires a loaded gun, and throws an empty gun or body. For a grenade, tap B to pull its pin, then hold and release B to drop it nearby or throw toward a held direction. Grab/Throw picks up items and throws any carried item, even a loaded gun. Gamepad: D-pad/stick move and aim, A jump, B fire, X grab/throw, L quack, R ragdoll. When defeated, A changes spectator cameras. Slide a finger across the on-screen controls without lifting.</p><div class="control-grid">${(Object.keys(bindings) as (keyof Input)[]).map(k=>`<label>${k}<button class="ghost bind" data-action="${k}">${rebinding===k?'Press a key…':esc(bindings[k])}</button></label>`).join('')}</div>${button('back','Back','ghost')}</section></main>`; document.querySelectorAll<HTMLButtonElement>('.bind').forEach(b=>b.addEventListener('click',()=>{rebinding=b.dataset.action as keyof Input;render();})); document.querySelector('#back')!.addEventListener('click',()=>{screen='menu';render();}); return; }
  if (!state) return;
  if (screen === 'lobby' && state.phase === 'lobby') { const host = state.host===myId;
    const link=inviteUrl();
    app.innerHTML = `<main class="shell">${title}<section class="panel"><div class="row"><div><h2>Ready room</h2><p class="muted">Room code: <strong>${esc(code)}</strong></p></div>${button('copy','Copy LAN invite','secondary')}</div><p class="muted small">Friends on the same Wi-Fi or network can open this address, then enter the code. You can also send the full invite link.</p><input class="invite-url" id="invite-url" readonly value="${esc(link)}" aria-label="LAN invite link"/><div class="slots">${[0,1,2,3].map(i=>{const a=state!.actors.find(a=>a.slot===i);return `<div class="slot ${a?'filled':''}"><div class="num">SLOT ${i+1}</div>${a?`<div class="name" style="color:#${COLORS[i].toString(16)}">${esc(a.name)}</div><div class="type">${a.bot?'COMPUTER':'PLAYER'}</div>${a.bot&&host?`<button class="danger remove" data-slot="${i}">Remove bot</button>`:''}`:`<div class="muted">OPEN</div>`}</div>`}).join('')}</div><div class="row" style="margin-top:20px">${host?button('addbot','Add bot','secondary'):''}${host?button('start','Start match'):''}</div><p class="muted small">${host?'Add up to three bots or share the link with friends.':'Waiting for the host to start.'}</p><div class="error">${esc(error)}</div></section></main>`;
    document.querySelector('#copy')!.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);error='Invite link copied.';}catch{const field=document.querySelector<HTMLInputElement>('#invite-url')!;field.select();error='Select and copy the invite link above.';}document.querySelector('.error')!.textContent=error;}); document.querySelector('#addbot')?.addEventListener('click',()=>socket.emit('addBot')); document.querySelector('#start')?.addEventListener('click',()=>socket.emit('start')); document.querySelectorAll('.remove').forEach(el=>el.addEventListener('click',()=>socket.emit('removeBot',Number((el as HTMLElement).dataset.slot)))); return; }
  screen='game';
  const scores = state.actors.map(a=>`<span class="score" style="color:#${COLORS[a.slot].toString(16)}">${esc(a.name)} ${a.wins}</span>`).join('');
  const phase = state.phase;
  const overlay = phase==='round'?'':`<div class="overlay"><div class="overlay-card"><h2>${phase==='intermission'?'THE SCOREBOARD':phase==='winner'?'THE CHAMPION':'COOP NEWS'}</h2><p>${esc(state.message)}</p>${phase==='intermission'?state.actors.map(a=>`<div>${esc(a.name)} — ${a.wins} wins</div>`).join(''):''}${phase==='winner'&&state.host===myId?button('again','Play again'):''}</div></div>`;
  // Phaser attaches its canvas asynchronously. The socket can render again first;
  // rebuilding here would abort the loader on every snapshot, especially on phones.
  const hadGame = !!game && !!document.querySelector('#game');
  if (!hadGame) {
    app.innerHTML=`<main class="shell handheld-page">${title}<div class="handheld"><div class="handheld-top"><span class="power-led"></span><span>CHICKEN COLOR · LINK ARENA</span><span class="battery-label">POWER</span></div><div class="game-wrap"><div id="game"></div><div class="hud" id="hud"></div><div id="spectate-hud"></div><div id="phase-overlay"></div></div><div class="handheld-wordmark">CHICKEN <em>GAME</em><span>✦ 4 PLAYER LINK ✦</span></div><div class="touch-controls" aria-label="Handheld game controls"><button class="touch-shoulder shoulder-l" data-touch="cluck" aria-label="Quack"><strong>L</strong><small>QUACK</small></button><button class="touch-shoulder shoulder-r" data-touch="ragdoll" aria-label="Ragdoll"><strong>R</strong><small>RAGDOLL</small></button><div class="touch-move" aria-label="Eight-direction pad"><button class="dpad-up-left" data-touch="upLeft" aria-label="Move and aim up left">↖</button><button class="dpad-up" data-touch="up" aria-label="Aim up">▲</button><button class="dpad-up-right" data-touch="upRight" aria-label="Move and aim up right">↗</button><button class="dpad-left" data-touch="left" aria-label="Move left">◀</button><div class="dpad-center" aria-hidden="true"></div><button class="dpad-right" data-touch="right" aria-label="Move right">▶</button><button class="dpad-down-left" data-touch="downLeft" aria-label="Move and slide left">↙</button><button class="dpad-down" data-touch="down" aria-label="Crouch or slide">▼</button><button class="dpad-down-right" data-touch="downRight" aria-label="Move and slide right">↘</button></div><div class="touch-actions" aria-label="Action buttons"><button class="action-grab" data-touch="grab" aria-label="Grab or throw">GRAB / THROW</button><button class="action-b" data-touch="fire" aria-label="Fire or swing"><strong>B</strong><small>FIRE</small></button><button class="action-a" data-touch="jump" aria-label="Jump, flap, or change spectator camera"><strong>A</strong><small>JUMP</small></button></div></div><div class="handheld-bottom"><span>SELECT</span><i></i><i></i><span>START</span><div class="speaker" aria-hidden="true">▰ ▰ ▰ ▰ ▰</div></div></div><div class="footer">A/D move · W+A/D aim diagonally · S slide · S+Space drop · Space jump/flap · J grab/throw · K fire/swing · L ragdoll · E quack</div></main>`;
    initGame(); bindTouchControls();
  }
  const mine=state.actors.find(a=>a.id===myId);
  const weaponArt:Record<Weapon,string>={pistol:'glock-p80.png',submachine:'mp5a3.png',grenade:'grenade.png',sword:'sword.png'};
  const empty=!!mine?.weapon&&mine.weapon!=='sword'&&mine.ammo===0;
  const weaponCard=mine?.weapon?`<div class="weapon-card${empty?' empty':''}"><img src="/assets/weapons/${weaponArt[mine.weapon]}" alt=""/><span>${esc(mine.weapon.toUpperCase())}<strong>${mine.weapon==='sword'?'∞':mine.ammo}</strong>${empty?'<em>EMPTY</em>':mine.grenadeFuse?'<em>PIN OUT</em>':''}</span></div>`:mine?.heldBody?'<div class="weapon-card">BODY HELD</div>':'<div class="weapon-card">UNARMED</div>';
  const hudHtml=`<div class="scoreboard">${scores}</div><div class="hud-right"><div class="score">ROUND ${state.round} · ${Math.max(0,Math.ceil(state.timer))}s</div>${weaponCard}</div>`;
  if(!hadGame||hudHtml!==lastHudKey){document.querySelector('#hud')!.innerHTML=hudHtml;lastHudKey=hudHtml;}
  const watched=spectateTarget==='wide'?'WIDE ARENA':state.actors.find(a=>a.id===spectateTarget)?.name;
  const spectateHtml=mine&&!mine.alive&&state.phase==='round'?`<div class="spectate-card">SPECTATING ${esc(watched||'ARENA')} · A NEXT</div>`:'';
  if(!hadGame||spectateHtml!==lastSpectateKey){document.querySelector('#spectate-hud')!.innerHTML=spectateHtml;lastSpectateKey=spectateHtml;}
  if (overlay!==lastOverlayKey) {document.querySelector('#phase-overlay')!.innerHTML=overlay;lastOverlayKey=overlay;document.querySelector('#again')?.addEventListener('click',()=>socket.emit('start'));}
}

type HeroPose = keyof typeof HERO_MANIFEST.poses;
let heroTiming:Record<string,number>={};
type HeroAnchor = { gun:[number,number]; up:[number,number]; diag:[number,number] };
type HeroAnchors = Record<string, HeroAnchor[]>;
function heroPose(a: Actor): HeroPose {
  if (!a.alive) return a.settleTicks>=12?'corpse':'ragdoll';
  if (a.ragdoll) return 'ragdoll';
  if (a.swingTicks && a.comboStage) return (`combo_${a.comboStage}${a.swingTicks <= SWORD_COMBO[a.comboStage].endTicks ? '_end' : ''}`) as HeroPose;
  if (a.throwTicks) return 'throw';
  if (a.ledgeSide) return 'ledge_hang';
  if (a.climbTicks) return 'ledge_climb';
  if (a.wallSlide) return 'wall_slide';
  if (a.sliding) return 'slide';
  if (a.crouch) return 'crouch';
  if (a.flap) return 'flap';
  if (!a.grounded) return a.vy < 0 ? 'jump' : a.vy < 8 ? 'fall' : 'fall_loop';
  if (a.cluck) return 'cluck';
  return Math.abs(a.vx) > 3.5 ? 'run' : Math.abs(a.vx) > 0.7 ? 'walk' : 'idle';
}
function heroFrame(a: Actor, pose: HeroPose, elapsedMs: number): number {
  const config=HERO_MANIFEST.poses[pose];
  if (pose === 'ragdoll') return a.alive ? 0 : 1;
  if (pose === 'jump') return Math.max(0, Math.min(5, Math.floor((15.5 + a.vy) / 3.1)));
  if (pose === 'fall') return Math.max(0, Math.min(3, Math.floor(a.vy / 2)));
  if (pose === 'ledge_climb') return Math.min(config.frames-1, Math.floor((10-a.climbTicks)*config.frames/10));
  if (pose === 'throw') return Math.min(3, Math.floor((8 - a.throwTicks) / 2));
  const index=Math.floor(elapsedMs*(heroTiming[pose]||config.fps)/1000);
  return config.loop ? index%config.frames : Math.min(config.frames-1,index);
}

class ArenaScene extends Phaser.Scene {
  background!: Phaser.GameObjects.Graphics;
  renderedArena=-1;
  graphics!: Phaser.GameObjects.Graphics;
  foreground!: Phaser.GameObjects.Graphics;
  chickens = new Map<string, Phaser.GameObjects.Image>();
  animationStart = new Map<string, {pose: HeroPose; at: number}>();
  motion = new Map<string, {facing:number;vx:number;grounded:boolean;wallSlide:boolean;mode:HeroPose;transition?:HeroPose;at?:number}>();
  weaponSprites = new Map<string, Phaser.GameObjects.Image>();
  tiles = new Map<string, Phaser.GameObjects.TileSprite>();
  tileTextures = new Map<string, string>();
  seenEffects = new Set<number>();
  cameraFrame:CameraFrame|null=null;
  cameraRound=0;
  constructor(){super('arena');}
  visualPose(a:Actor,time:number):HeroPose {
    let base=heroPose(a);const before=this.motion.get(a.id);
    if(base==='run'&&before?.mode==='walk'&&Math.abs(a.vx)<4.2)base='walk';
    if(base==='walk'&&before?.mode==='run'&&Math.abs(a.vx)>2.8)base='run';
    if(base==='walk'&&before?.mode==='idle'&&Math.abs(a.vx)<1.2)base='idle';
    let transition=before?.transition,at=before?.at;
    if(before && ['idle','walk','run','jump','fall','fall_loop'].includes(base)){
      if(before.wallSlide&&!a.wallSlide&&a.vy<0)transition='wall_jump';
      else if(a.grounded&&before.grounded&&before.facing!==a.facing)transition=Math.abs(a.vx)>3.5?'run_turn':Math.abs(a.vx)>0.7?'walk_turn':'idle_turn';
      else if(a.grounded&&before.grounded&&Math.abs(before.vx)>3.5&&Math.abs(a.vx)<0.7)transition='run_to_idle';
      if(transition!==before.transition){at=time;this.animationStart.delete(a.id);}
    }else transition=undefined;
    if(transition){const config=HERO_MANIFEST.poses[transition],compatible=transition==='wall_jump'?!a.grounded:a.grounded;if(!compatible||time-(at??time)>=config.frames/(heroTiming[transition]||config.fps)*1000)transition=undefined;}
    this.motion.set(a.id,{facing:a.facing,vx:a.vx,grounded:a.grounded,wallSlide:a.wallSlide,mode:base,transition,at});
    return transition??base;
  }
  preload(){
    this.load.on('progress',(progress:number)=>{const status=document.querySelector<HTMLElement>('#scene-status');if(status&&!status.dataset.error)status.textContent=`Loading arena art… ${Math.round(progress*100)}%`;});
    this.load.on('loaderror',()=>{const status=document.querySelector<HTMLElement>('#scene-status');if(status){status.dataset.error='true';status.textContent='Arena art could not load. Reload the game to retry.';}});
    for (const pose of Object.keys(HERO_MANIFEST.poses) as HeroPose[]) for (const variant of HERO_MANIFEST.poses[pose].runtime ? HERO_MANIFEST.poses[pose].variants : []) {
      const key = `hero-${pose}${variant}`;
      this.load.spritesheet(key, `/assets/hero/${pose}${variant}.png`, {frameWidth:128,frameHeight:128});
    }
    this.load.json('hero-anchors','/assets/hero/anchors.json');
    this.load.json('hero-manifest','/assets/hero/manifest.json');
    this.load.image('weapon-pistol','/assets/weapons/glock-p80.png');
    this.load.image('weapon-submachine','/assets/weapons/mp5a3.png');
    this.load.image('weapon-sword','/assets/weapons/sword.png');
    this.load.image('weapon-grenade','/assets/weapons/grenade.png');
    for (const name of ['platform-forest','platform-industrial','platform-space','crate','door','wall']) this.load.image(`tile-${name}`, `/assets/tiles/${name}.png`);
  }
  create(){
    const liveManifest=this.cache.json.get('hero-manifest') as {poses:Record<string,{fps:number}>}|undefined;
    heroTiming=Object.fromEntries(Object.entries(liveManifest?.poses||{}).map(([pose,config])=>[pose,config.fps]));
    this.background=this.add.graphics();this.graphics=this.add.graphics(); this.foreground=this.add.graphics().setDepth(10); this.cameras.main.setBackgroundColor('#263c53');
  }
  update(time:number,delta:number){ if(!state) return; const s=state; const ar=ARENAS[s.arenaIndex]; const g=this.graphics; const f=this.foreground; g.clear(); f.clear();
    const camera=this.cameras.main, viewWidth=camera.width;
    const mine=s.actors.find(a=>a.id===myId);
    const alive=s.actors.filter(a=>a.alive).map(a=>a.id===myId&&predictedActor?{x:predictedActor.x+correctionX,y:predictedActor.y+correctionY}:{x:a.x,y:a.y});
    const spectating=!!mine&&!mine.alive;
    const watched=spectating&&spectateTarget!=='wide'?s.actors.find(a=>a.id===spectateTarget&&a.alive):null;
    const target=s.phase!=='round'||spectating&&spectateTarget==='wide'?frameCombatants([{x:0,y:0},{x:WIDTH,y:HEIGHT}],viewWidth,camera.height,1):watched?frameCombatants([watched],viewWidth,camera.height,1.35):frameCombatants(alive,viewWidth,camera.height);
    if(this.cameraRound!==s.round||!this.cameraFrame){this.cameraFrame=target;this.cameraRound=s.round;}
    else {
      const pan=1-Math.exp(-Math.min(delta,50)/120),zoom=1-Math.exp(-Math.min(delta,50)/220);
      const previous=this.cameraFrame;
      let next:CameraFrame={x:previous.x+(target.x-previous.x)*pan,y:previous.y+(target.y-previous.y)*pan,zoom:Math.min(target.zoom,previous.zoom+(target.zoom-previous.zoom)*zoom)};
      if(!spectating&&s.phase==='round'&&alive.length)next=containCombatants(next,alive,viewWidth,camera.height);
      this.cameraFrame=next;
    }
    camera.setZoom(this.cameraFrame.zoom);camera.centerOn(this.cameraFrame.x,this.cameraFrame.y);
    if(this.renderedArena!==s.arenaIndex){this.renderedArena=s.arenaIndex;const g=this.background;g.clear();
    if(ar.theme==='forest'){
      g.fillGradientStyle(0x8bc9df,0x8bc9df,0x467f9c,0x467f9c);g.fillRect(0,0,WIDTH,HEIGHT);
      g.fillStyle(0xffeab0,0.35);g.fillCircle(835,72,52);
      g.fillStyle(0x57849a,0.4);for(let x=-30;x<WIDTH;x+=86)g.fillTriangle(x,400,x+43,250,x+86,400);
      g.fillStyle(0x245e5b,0.55);for(let x=-20;x<WIDTH;x+=75){g.fillRect(x+32,290,9,160);g.fillCircle(x+37,288,28);g.fillCircle(x+16,303,21);g.fillCircle(x+59,308,22);}
      g.fillStyle(0x2b657a);g.fillRect(0,514,WIDTH,26);g.lineStyle(2,0x80c9d0,0.4);for(let x=0;x<WIDTH;x+=48)g.lineBetween(x,518,x+23,518);
    }else if(ar.theme==='industrial'){
      g.fillGradientStyle(0x274956,0x274956,0x112b38,0x112b38);g.fillRect(0,0,WIDTH,HEIGHT);
      g.lineStyle(1,0x5a8490,0.15);for(let x=0;x<WIDTH;x+=40)g.lineBetween(x,0,x,HEIGHT);for(let y=0;y<HEIGHT;y+=40)g.lineBetween(0,y,WIDTH,y);
      g.fillStyle(0x071e2b,0.6);for(let x=25;x<WIDTH;x+=150){g.fillRect(x,10,24,490);g.fillStyle(0x4596a0,0.22);g.fillRect(x+5,10,4,490);g.fillStyle(0x071e2b,0.6);}
      g.fillStyle(0x4ba1a1,0.2);g.fillRect(365,40,230,145);
    }else{
      g.fillGradientStyle(0x121e3d,0x121e3d,0x050b20,0x050b20);g.fillRect(0,0,WIDTH,HEIGHT);
      g.fillStyle(0xe2ecff,0.65);for(let i=0;i<85;i++){const x=(i*173+31)%WIDTH,y=(i*71+19)%410;g.fillCircle(x,y,i%7===0?2:1);}
      g.fillStyle(0xa34b3b,0.4);g.fillCircle(780,250,122);g.fillStyle(0xe8935d,0.35);g.fillCircle(790,238,92);g.fillStyle(0x1e375c,0.8);g.fillEllipse(180,100,230,32);
    }
    const base=ar.theme==='forest'?0x78594b:ar.theme==='industrial'?0x334f60:0x30455f;
    const top=ar.theme==='forest'?0x65a661:ar.theme==='industrial'?0xe2b74b:0x73b7cf;
    for(const b of [...ar.blocks,...ar.platforms]){
      g.fillStyle(base);g.fillRect(b.x,b.y,b.w,b.h);g.fillStyle(top);g.fillRect(b.x,b.y,b.w,Math.min(6,b.h));
      g.fillStyle(ar.theme==='forest'?0x436a49:0x172b40,0.65);for(let x=b.x+12;x<b.x+b.w-5;x+=24)g.fillRect(x,b.y+9,4,Math.max(1,b.h-12));
      if(ar.theme==='industrial'){g.fillStyle(0x233743);for(let x=b.x+8;x<b.x+b.w-5;x+=24)g.fillTriangle(x,b.y+1,x+12,b.y+1,x+7,b.y+5);}
      if(ar.theme==='space'){g.lineStyle(2,0x8bd5df,0.55);g.strokeRect(b.x+1,b.y+1,b.w-2,Math.min(b.h-2,13));}
      if(ar.theme==='forest'&&b.h>=40){g.fillStyle(0x416a4c,0.6);g.fillRect(b.x,b.y+6,b.w,5);}
    }
    }
    for(const b of s.cover){
      const damaged=b.hp<b.maxHp;
      if(b.kind==='crate'){
        g.fillStyle(damaged?0xa57550:0x806044);g.fillRect(b.x,b.y,b.w,b.h);
        g.lineStyle(2,0xe1b47a);g.strokeRect(b.x+1,b.y+1,b.w-2,b.h-2);
        g.lineStyle(2,0x4e392c);g.lineBetween(b.x+4,b.y+4,b.x+b.w-4,b.y+b.h-4);g.lineBetween(b.x+b.w-4,b.y+4,b.x+4,b.y+b.h-4);
      }else if(b.kind==='door'){
        g.fillStyle(damaged?0x92694b:0x654f43);g.fillRect(b.x,b.y,b.w,b.h);
        g.lineStyle(3,0xc99b6b);g.strokeRect(b.x+2,b.y+2,b.w-4,b.h-4);
        g.lineStyle(1,0x3c3230);g.lineBetween(b.x+5,b.y+10,b.x+b.w-5,b.y+10);g.lineBetween(b.x+5,b.y+b.h-10,b.x+b.w-5,b.y+b.h-10);
        g.fillStyle(0xffd58c);g.fillCircle(b.x+b.w-6,b.y+b.h/2,2);
      }else{
        g.fillStyle(damaged?0x78858a:0x566974);g.fillRect(b.x,b.y,b.w,b.h);
        g.lineStyle(2,0x9cabb0);g.strokeRect(b.x,b.y,b.w,b.h);
        g.lineStyle(1,0x34444c);for(let y=b.y+15;y<b.y+b.h;y+=16){g.lineBetween(b.x,y,b.x+b.w,y);g.lineBetween(b.x+b.w/2,y-15,b.x+b.w/2,y);}
      }
      if(damaged){f.lineStyle(2,0x271f1d);f.lineBetween(b.x+b.w*0.35,b.y+3,b.x+b.w*0.6,b.y+b.h*0.5);f.lineBetween(b.x+b.w*0.6,b.y+b.h*0.5,b.x+b.w*0.45,b.y+b.h-3);}
    }
    const activeTiles = new Set<string>();
    const placeTile = (id:string, texture:string, b:{x:number;y:number;w:number;h:number}, tint=0xffffff) => {
      activeTiles.add(id);
      let sprite=this.tiles.get(id);
      if (!sprite) { sprite=this.add.tileSprite(b.x,b.y,b.w,b.h,texture).setOrigin(0).setDepth(1); this.tiles.set(id,sprite); this.tileTextures.set(id,texture); }
      if (this.tileTextures.get(id) !== texture) { sprite.setTexture(texture); this.tileTextures.set(id,texture); }
      if (sprite.width !== b.w || sprite.height !== b.h) sprite.setSize(b.w,b.h);
      sprite.setPosition(b.x,b.y).setTint(tint);
    };
    [...ar.blocks,...ar.platforms].forEach((b,i)=>placeTile(`terrain-${s.arenaIndex}-${i}`,`tile-platform-${ar.theme}`,b));
    s.cover.forEach(b=>placeTile(`cover-${b.kind}-${b.x}-${b.y}`,`tile-${b.kind}`,b,b.hp<b.maxHp?0xcaa891:0xffffff));
    for(const [id,sprite] of this.tiles) if (!activeTiles.has(id)) { sprite.destroy(); this.tiles.delete(id); this.tileTextures.delete(id); }
    const activeWeaponSprites = new Set<string>();
    for(const pad of s.pads||[]){const active=pad.itemId!==null;const glow=active?Math.min(1,1-pad.appearing/30):0.12;g.fillStyle(0xbce9ff,0.06+glow*0.14);g.fillTriangle(pad.x-23,pad.y+15,pad.x+23,pad.y+15,pad.x,pad.y-32);g.fillStyle(0xffffff,0.04+glow*0.16);g.fillTriangle(pad.x-14,pad.y+13,pad.x+14,pad.y+13,pad.x,pad.y-24);g.fillStyle(0x4b6579);g.fillRoundedRect(pad.x-23,pad.y+12,46,7,3);g.fillStyle(0xd9f7ff,0.2+glow*0.8);g.fillRoundedRect(pad.x-19,pad.y+12,38,3,2);}
    for(const item of s.items){const pad=item.padIndex===undefined?null:s.pads?.[item.padIndex];const lift=pad?8+Math.sin(time/190+item.id)*3-pad.appearing/30*18:0;const visualY=item.y-lift;g.fillStyle(0x0c1723,0.35);g.fillEllipse(item.x,item.y+8,36,7);if(pad){g.fillStyle(0xffffff,Math.max(0.15,0.38-pad.appearing/90));g.fillCircle(item.x,visualY,16);}const id=`item-${item.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,`weapon-${item.type}`,item.x,visualY,1,item.type==='pistol'?0.8:item.type==='grenade'?1.15:0.62);}
    for(const gun of s.thrownGuns){const id=`thrown-${gun.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,`weapon-${gun.type}`,gun.x,gun.y,1,gun.type==='pistol'?0.72:0.58,gun.rotation,0xaeb8c1);}
    for(const p of s.shots){
      if(p.kind==='grenade'){const id=`grenade-${p.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,'weapon-grenade',p.x,p.y,1,0.7,p.rotation??0);continue;}
      const length=Math.hypot(p.vx,p.vy)||1,ux=p.vx/length,uy=p.vy/length;
      for(let i=5;i>=1;i--){const start=(i-1)*4,end=i*4;g.lineStyle(i>3?2:3,i>3?0x95a2a2:i>1?0xff9a58:0xffdf98,(6-i)*0.105);g.lineBetween(p.x-ux*end,p.y-uy*end,p.x-ux*start,p.y-uy*start);}
      g.fillStyle(0xff9a50,0.25);g.fillCircle(p.x,p.y,7);
      g.fillStyle(0xfff4bd);g.fillCircle(p.x,p.y,3);
    }
    for(const e of s.effects){
      if(!this.seenEffects.has(e.id)){this.seenEffects.add(e.id);if(this.seenEffects.size>2000)this.seenEffects.clear();if(e.type==='blast')this.cameras.main.shake(170,0.008);else if(e.type==='shot'||e.type==='hit')this.cameras.main.shake(45,0.001);if(e.type==='empty')sting([160]);else if(e.type==='blast')sting([90,65]);else if(e.type==='shot')sting([260]);else if(e.type==='pin')pinSound();}
      if(e.type==='pin'){const travel=20-e.ttl;g.lineStyle(2,0xe8e5d4,Math.min(1,e.ttl/8));g.strokeCircle(e.x+travel*1.4,e.y-travel*0.7,4);g.lineBetween(e.x+travel*1.4+4,e.y-travel*0.7,e.x+travel*1.4+7,e.y-travel*0.7+2);continue;}
      if(e.type==='blast'){
        const age=24-e.ttl,fade=e.ttl/24;
        if(age<4){g.fillStyle(0xffffff,(4-age)*0.19);g.fillCircle(e.x,e.y,15+age*7);g.fillStyle(0xffe391,0.85);g.fillCircle(e.x,e.y,8+age*4);}
        if(age>=2&&age<16){g.lineStyle(age<7?5:3,age<7?0xffd478:0xc3d1c7,Math.min(0.85,fade));g.strokeCircle(e.x,e.y,age*4.2);}
        for(let i=0;i<14;i++){const angle=(i*2.39996+e.id*0.37),speed=1.5+((e.id+i*7)%7)*0.35,d=age*speed;g.fillStyle(age<8?0xffb453:0x8798a0,fade*(0.45+(i%3)*0.12));g.fillCircle(e.x+Math.cos(angle)*d,e.y+Math.sin(angle)*d-age*0.25,i%4===0?4:2.5);}
        continue;
      }
      g.fillStyle(e.type==='shot'?0xffe7a3:0xd6bd91,Math.min(0.7,e.ttl/20));g.fillCircle(e.x,e.y,e.type==='shot'?5:3);
      if(e.type==='dust')for(let i=0;i<8;i++){const angle=i*Math.PI/4+e.id%9,d=(12-e.ttl)*2;g.fillCircle(e.x+Math.cos(angle)*d,e.y+Math.sin(angle)*d,2);}
    }
    for (const a of s.actors) {
      const latest=snapshots.at(-1),renderTick=latest?latest.tick-6+Math.min(3,(performance.now()-latest.received)/(1000/60)):0;
      const next=snapshots.find(frame=>frame.tick>=renderTick),previous=[...snapshots].reverse().find(frame=>frame.tick<=renderTick);
      const from=previous?.positions.get(a.id),to=next?.positions.get(a.id);
      const blend=previous&&next&&next.tick>previous.tick?Math.max(0,Math.min(1,(renderTick-previous.tick)/(next.tick-previous.tick))):1;
      const local=a.id===myId&&predictedActor,subTick=Math.max(0,Math.min(1,(performance.now()-predictedAt)/(1000/60)));
      let px=local?predictedActor!.x+predictedActor!.vx*subTick+correctionX:from&&to?from.x+(to.x-from.x)*blend:from?.x??to?.x??a.x;
      let py=local?predictedActor!.y+predictedActor!.vy*subTick+correctionY:from&&to?from.y+(to.y-from.y)*blend:from?.y??to?.y??a.y;
      if(a.id===myId&&predictedActor&&[...ar.blocks,...s.cover].some(b=>px+ACTOR_BOXES.standing.half>b.x&&px-ACTOR_BOXES.standing.half<b.x+b.w&&py>b.y&&py-ACTOR_BOXES.standing.height<b.y+b.h)){px=predictedActor.x;py=predictedActor.y;correctionX=0;correctionY=0;}
      if(a.id===myId){const decay=Math.exp(-Math.min(delta,50)/70);correctionX*=decay;correctionY*=decay;if(Math.abs(correctionX)<0.1)correctionX=0;if(Math.abs(correctionY)<0.1)correctionY=0;}
      const pose=this.visualPose(a.id===myId&&predictedActor?predictedActor:a,time);
      let animation=this.animationStart.get(a.id);
      if (!animation || animation.pose!==pose) {animation={pose,at:time};this.animationStart.set(a.id,animation);}
      const variant=a.weapon && HERO_MANIFEST.poses[pose].variants.includes('-gun') ? a.aimDiagonal?'-diag':a.aimUp?'-up':'-gun' : a.weapon==='sword'&&a.swingTicks&&pose.startsWith('combo_') ? a.swingDiagonal?'-diag':a.swingUp?'-up':'' : '';
      const texture='hero-'+pose+variant;
      let img=this.chickens.get(a.id);
      if (!img) {img=this.add.image(px,py,texture,0).setOrigin(60/128,80/128).setDepth(2);this.chickens.set(a.id,img);}
      const facing=a.swingTicks?a.swingFacing:a.facing;
      const frame=heroFrame(a,pose,time-animation.at);
      const bodyFlip=pose==='ledge_hang'?a.ledgeSide<0:pose==='ledge_climb'?a.climbTargetX<a.climbStartX:facing<0;
      img.setTexture(texture,frame).setPosition(px,py).setScale(1).setFlipX(bodyFlip).setRotation(pose==='corpse'?0:!a.alive?a.rotation:a.ragdoll?Math.PI/2:0).setVisible(true);
      g.fillStyle(COLORS[a.slot],0.8);g.fillRoundedRect(px-18,py+2,36,5,2);
      if (a.weapon) {
        const id='actor-'+a.id;
        const anchors=this.cache.json.get('hero-anchors') as HeroAnchors;
        const anchor=anchors?.[pose]?.[frame]?.[a.aimDiagonal?'diag':a.aimUp?'up':'gun'] ?? [78,62];
        const handX=px+(bodyFlip?60-anchor[0]:anchor[0]-60);
        const handY=py+anchor[1]-80;
        const rotation=a.aimDiagonal?(facing>0?-Math.PI/4:Math.PI/4):a.aimUp?-Math.PI/2:0;
        if (a.weapon==='grenade') { activeWeaponSprites.add(id); this.placeWeapon(id,'weapon-grenade',handX,handY,facing,0.65,rotation); }
        else if (a.weapon==='sword') {
          if (!a.swingTicks) {activeWeaponSprites.add(id);this.placeWeapon(id,'weapon-sword',handX,handY,a.aimUp&&!a.aimDiagonal?1:facing,0.9,rotation);}
        } else {
          activeWeaponSprites.add(id);
          this.placeWeapon(id,'weapon-'+a.weapon,handX,handY,a.aimUp&&!a.aimDiagonal?1:facing,a.weapon==='pistol'?0.45:0.38,rotation);
        }
      }
      if (a.cluck) {f.fillStyle(0xffefc0);f.fillCircle(px+facing*24,py-29,5);}
    }
    for(const [id,img] of this.chickens) if(!s.actors.some(a=>a.id===id)){img.destroy();this.chickens.delete(id);this.animationStart.delete(id);this.motion.delete(id);}
    for(const [id,img] of this.weaponSprites)if(!activeWeaponSprites.has(id)){img.destroy();this.weaponSprites.delete(id);}
    if(s.phase==='intermission'||s.phase==='winner'){for(let i=0;i<28;i++){g.fillStyle(COLORS[i%4],0.8);g.fillCircle(25+i*34,480-(i%3)*7,8);}}
    const status=document.querySelector<HTMLElement>('#scene-status');if(status&&!status.dataset.error)status.classList.add('hidden');
  }
  placeWeapon(id:string,key:string,x:number,y:number,facing:number,scale:number,rotation=0,tint=0xffffff):void{let image=this.weaponSprites.get(id);if(!image){image=this.add.image(x,y,key).setDepth(3);this.weaponSprites.set(id,image);}image.setTexture(key).setPosition(x,y).setFlipX(facing<0).setScale(scale).setRotation(rotation).setTint(tint).setVisible(true);}
}
let activeViewWidth=WIDTH;
function desiredViewWidth():number{return matchMedia('(max-width:700px) and (orientation:portrait)').matches?600:WIDTH;}
function initGame(){
  game?.destroy(true);
  const wrap=document.querySelector<HTMLElement>('.game-wrap');
  let status=document.querySelector<HTMLElement>('#scene-status');
  if(wrap&&!status){status=document.createElement('div');status.id='scene-status';status.className='scene-status';status.setAttribute('role','status');wrap.append(status);}
  if(status){status.classList.remove('hidden');status.textContent='Loading arena art…';delete status.dataset.error;}
  activeViewWidth=desiredViewWidth();
  game=new Phaser.Game({type:Phaser.AUTO,width:activeViewWidth,height:HEIGHT,parent:'game',pixelArt:true,transparent:false,scene:[ArenaScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
}
window.addEventListener('resize',()=>{if(game&&activeViewWidth!==desiredViewWidth())initGame();});
function bindTouchControls():void {
  touchPointers.clear();
  const controls=document.querySelector<HTMLElement>('.touch-controls');
  if(!controls)return;
  // iOS can still show Look Up or double-tap zoom despite touch-action on buttons.
  for(const type of ['contextmenu','dblclick','selectstart','dragstart'])controls.addEventListener(type,event=>event.preventDefault());
  for(const type of ['touchstart','touchmove'])controls.addEventListener(type,event=>event.preventDefault(),{passive:false});
  const refresh = () => document.querySelectorAll<HTMLButtonElement>('[data-touch]').forEach(button => button.classList.toggle('pressed',[...touchPointers.values()].includes(button.dataset.touch as TouchAction)));
  document.querySelectorAll<HTMLElement>('.touch-move,.touch-actions,.touch-shoulder').forEach(region => {
    const move = (event:PointerEvent) => {
      event.preventDefault();
      const hit = document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-touch]');
      if (hit && region.contains(hit)) touchPointers.set(event.pointerId,hit.dataset.touch as TouchAction);
      else touchPointers.delete(event.pointerId);
      refresh();
    };
    region.addEventListener('pointerdown',event => { region.setPointerCapture(event.pointerId); move(event); });
    region.addEventListener('pointermove',event => { if(region.hasPointerCapture(event.pointerId)) move(event); });
    const release = (event:PointerEvent) => { touchPointers.delete(event.pointerId); refresh(); };
    region.addEventListener('pointerup',release); region.addEventListener('pointercancel',release); region.addEventListener('lostpointercapture',release);
  });
}
function collectInput():Input {
  const out={...NO_INPUT};
  for(const k of Object.keys(bindings) as (keyof Input)[])out[k]=keys.has(bindings[k]);
  out.up ||= keys.has('ArrowUp');out.down ||= keys.has('ArrowDown');out.left ||= keys.has('ArrowLeft');out.right ||= keys.has('ArrowRight');
  for(const action of touchPointers.values()){
    if(action==='upLeft'||action==='downLeft')out.left=true;
    if(action==='upRight'||action==='downRight')out.right=true;
    if(action==='upLeft'||action==='upRight')out.up=true;
    if(action==='downLeft'||action==='downRight')out.down=true;
    if(action in out)out[action as keyof Input]=true;
  }
  const gp=navigator.getGamepads?.()[0];
  if(gp){const b=(n:number)=>!!gp.buttons[n]?.pressed;out.left ||= gp.axes[0]<-.3||b(14);out.right ||= gp.axes[0]>.3||b(15);out.up ||= gp.axes[1]<-.5||b(12);out.down ||= gp.axes[1]>.5||b(13);out.jump ||= b(0);out.fire ||= b(1);out.grab ||= b(2);out.cluck ||= b(4);out.ragdoll ||= b(5);}
  return out;
}
setInterval(()=>{if(myId&&state?.phase==='round'){const input=collectInput();const mine=state.actors.find(a=>a.id===myId);if(mine&&!mine.alive){if(input.jump&&!spectateJumpHeld)cycleSpectate();spectateJumpHeld=input.jump;}else spectateJumpHeld=false;const seq=++inputSequence;pendingInputs.push({seq,input});if(pendingInputs.length>18)pendingInputs.shift();if(predictedActor&&mine?.alive){predictActorMovement(predictedActor,input,ARENAS[state.arenaIndex],state.cover);predictedAt=performance.now();}socket.emit('input',{seq,controls:input});}},1000/60);
socket.on('state',(s:ViewState)=>{if(code&&s.code!==code)return;if(state?.round!==s.round){pendingInputs=[];predictedActor=null;correctionX=0;correctionY=0;}if(state?.round!==s.round)snapshots.length=0;if(!snapshots.length||snapshots.at(-1)!.tick!==s.serverTick){snapshots.push({tick:s.serverTick,received:performance.now(),positions:new Map(s.actors.map(a=>[a.id,{x:a.x,y:a.y}]))});if(snapshots.length>12)snapshots.shift();}if(previousPhase!==s.phase){if(s.phase==='round')sting([330,440,660]);else if(s.phase==='winner')sting([523,659,784,1047]);else if(s.phase==='intermission')sting([392,330,392]);else if(s.phase==='presenter')sting([440,330]);previousPhase=s.phase;}state=s;const mine=s.actors.find(a=>a.id===myId);if(s.phase==='round'&&mine?.alive){const old=predictedActor;const shownX=old?old.x+correctionX:mine.x,shownY=old?old.y+correctionY:mine.y;pendingInputs=pendingInputs.filter(frame=>frame.seq>(s.inputAck?.[myId]??inputSequence));const replay=structuredClone(mine);for(const frame of pendingInputs)predictActorMovement(replay,frame.input,ARENAS[s.arenaIndex],s.cover);predictedActor=replay;correctionX=Math.abs(shownX-replay.x)<30?shownX-replay.x:0;correctionY=Math.abs(shownY-replay.y)<30?shownY-replay.y:0;}else predictedActor=null;syncSpectate();if(s.phase==='lobby'&&screen==='game'){screen='lobby';game?.destroy(true);game=null;lastLobbyKey='';lastOverlayKey='';} if(screen==='lobby'&&s.phase!=='lobby'){screen='game';lastOverlayKey='';} if(screen==='lobby'&&s.phase==='lobby'){const key=JSON.stringify([s.host,s.actors.map(a=>[a.id,a.name,a.slot,a.bot,a.hat])]);if(key===lastLobbyKey)return;lastLobbyKey=key;} render();});
socket.on('connect',()=>{if(error==='Connection lost. Reconnecting…'){error='';if(screen!=='game')render();}const c=new URLSearchParams(location.search).get('room');if(c)join(c);});
socket.on('disconnect',()=>{error='Connection lost. Reconnecting…'; if(screen!=='game')render();});
screen=new URLSearchParams(location.search).has('room')?'join':'menu'; render();
