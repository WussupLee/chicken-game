import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { ARENAS, COLORS, HATS, HEIGHT, NO_INPUT, WIDTH, type Actor, type GameState, type Input, type Weapon } from '../shared/game';
import './style.css';

type ViewState = GameState & { code: string; host: string };
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
const keys = new Set<string>();
const defaultBindings: Record<keyof Input, string> = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', jump: 'Space', fire: 'KeyK', ragdoll: 'KeyL', cluck: 'KeyE' };
const savedBindings = JSON.parse(localStorage.getItem('chicken-bindings') || '{}') as Partial<Record<keyof Input,string>>;
let bindings: Record<keyof Input, string> = Object.fromEntries((Object.keys(defaultBindings) as (keyof Input)[]).map(k => [k, savedBindings[k] || defaultBindings[k]])) as Record<keyof Input,string>;
let rebinding: keyof Input | null = null;
let audio: AudioContext | null = null;
let previousPhase = '';
let snapshotAt = performance.now();
let priorPositions = new Map<string,{x:number;y:number}>();
let lanAddresses: string[] = [];
const touchPointers = new Map<number, keyof Input>();
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

window.addEventListener('keydown', e => {
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
  if (screen === 'menu') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Enter the coop</h2><div class="stack"><input id="name" maxlength="18" placeholder="Your name" value="${esc(localStorage.getItem('chicken-name') || '')}"/>${button('practice','Practice vs. bots')}${button('create','Host a room','secondary')}${button('showjoin','Join a room','ghost')}${button('showcontrols','Controls','ghost')}<div class="install-actions">${button('addhome','Add to Home Screen','ghost')}${button('fullscreen','Full screen','ghost')}</div><div id="install-help" class="muted small" role="status">${esc(installMessage)}</div><div class="error">${esc(error)}</div></div></section><footer class="footer">2–4 chickens. One winner. Infinite clucking.</footer></main>`;
    document.querySelector('#practice')!.addEventListener('click', () => create(true)); document.querySelector('#create')!.addEventListener('click', () => create()); document.querySelector('#showjoin')!.addEventListener('click', () => { screen='join'; render(); }); document.querySelector('#showcontrols')!.addEventListener('click', () => { screen='controls'; render(); }); document.querySelector('#addhome')!.addEventListener('click', () => { void addToHomeScreen(); }); document.querySelector('#fullscreen')!.addEventListener('click', () => { void enterFullscreen(); }); return; }
  if (screen === 'join') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Join a room</h2><div class="stack"><input id="name" maxlength="18" placeholder="Your name" value="${esc(localStorage.getItem('chicken-name') || '')}"/><input id="room" maxlength="6" placeholder="6-letter room code" value="${esc(new URLSearchParams(location.search).get('room') || '')}"/>${button('join','Join room')}${button('back','Back','ghost')}<div class="error">${esc(error)}</div></div></section></main>`; document.querySelector('#join')!.addEventListener('click',()=>join(document.querySelector<HTMLInputElement>('#room')!.value)); document.querySelector('#back')!.addEventListener('click',()=>{screen='menu';render();}); return; }
  if (screen === 'controls') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Controls</h2><p class="muted small">Up aims straight up. Gamepad: D-pad/stick move and aim, A jump, B fire/grab/throw, L quack, R ragdoll. Hold and release B to throw farther. When defeated, A changes spectator cameras. Slide a finger across the on-screen D-pad or A/B buttons without lifting.</p><div class="control-grid">${(Object.keys(bindings) as (keyof Input)[]).map(k=>`<label>${k}<button class="ghost bind" data-action="${k}">${rebinding===k?'Press a key…':esc(bindings[k])}</button></label>`).join('')}</div>${button('back','Back','ghost')}</section></main>`; document.querySelectorAll<HTMLButtonElement>('.bind').forEach(b=>b.addEventListener('click',()=>{rebinding=b.dataset.action as keyof Input;render();})); document.querySelector('#back')!.addEventListener('click',()=>{screen='menu';render();}); return; }
  if (!state) return;
  if (screen === 'lobby' && state.phase === 'lobby') { const me = state.actors.find(a=>a.id===myId); const host = state.host===myId;
    const link=inviteUrl();
    app.innerHTML = `<main class="shell">${title}<section class="panel"><div class="row"><div><h2>Ready room</h2><p class="muted">Room code: <strong>${esc(code)}</strong></p></div>${button('copy','Copy LAN invite','secondary')}</div><p class="muted small">Friends on the same Wi-Fi or network can open this address, then enter the code. You can also send the full invite link.</p><input class="invite-url" id="invite-url" readonly value="${esc(link)}" aria-label="LAN invite link"/><div class="slots">${[0,1,2,3].map(i=>{const a=state!.actors.find(a=>a.slot===i);return `<div class="slot ${a?'filled':''}"><div class="num">SLOT ${i+1}</div>${a?`<div class="name" style="color:#${COLORS[i].toString(16)}">${esc(a.name)}</div><div class="type">${a.bot?'COMPUTER':'PLAYER'} · ${esc(HATS[a.hat])}</div>${a.bot&&host?`<button class="danger remove" data-slot="${i}">Remove bot</button>`:''}`:`<div class="muted">OPEN</div>`}</div>`}).join('')}</div><div class="row"><div><strong>Your hat:</strong> ${esc(HATS[me?.hat || 0])}</div>${button('prevhat','◀ Hat','ghost')}${button('nexthat','Hat ▶','ghost')}</div><div class="row" style="margin-top:20px">${host?button('addbot','Add bot','secondary'):''}${host?button('start','Start match'):''}</div><p class="muted small">${host?'Add up to three bots or share the link with friends.':'Waiting for the host to start.'}</p><div class="error">${esc(error)}</div></section></main>`;
    document.querySelector('#copy')!.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);error='Invite link copied.';}catch{const field=document.querySelector<HTMLInputElement>('#invite-url')!;field.select();error='Select and copy the invite link above.';}document.querySelector('.error')!.textContent=error;}); document.querySelector('#prevhat')!.addEventListener('click',()=>socket.emit('hat',((me?.hat||0)+HATS.length-1)%HATS.length)); document.querySelector('#nexthat')!.addEventListener('click',()=>socket.emit('hat',((me?.hat||0)+1)%HATS.length)); document.querySelector('#addbot')?.addEventListener('click',()=>socket.emit('addBot')); document.querySelector('#start')?.addEventListener('click',()=>socket.emit('start')); document.querySelectorAll('.remove').forEach(el=>el.addEventListener('click',()=>socket.emit('removeBot',Number((el as HTMLElement).dataset.slot)))); return; }
  screen='game';
  const scores = state.actors.map(a=>`<span class="score" style="color:#${COLORS[a.slot].toString(16)}">${esc(a.name)} ${a.wins}</span>`).join('');
  const phase = state.phase;
  const overlay = phase==='round'?'':`<div class="overlay"><div class="overlay-card"><h2>${phase==='intermission'?'THE SCOREBOARD':phase==='winner'?'THE CHAMPION':'COOP NEWS'}</h2><p>${esc(state.message)}</p>${phase==='intermission'?state.actors.map(a=>`<div>${esc(a.name)} — ${a.wins} wins</div>`).join(''):''}${phase==='winner'&&state.host===myId?button('again','Play again'):''}</div></div>`;
  const hadCanvas = !!document.querySelector('#game canvas');
  if (!hadCanvas) {
    app.innerHTML=`<main class="shell handheld-page">${title}<div class="handheld"><div class="handheld-top"><span class="power-led"></span><span>CHICKEN COLOR · LINK ARENA</span><span class="battery-label">POWER</span></div><div class="game-wrap"><div id="game"></div><div class="hud" id="hud"></div><div id="spectate-hud"></div><div id="phase-overlay"></div></div><div class="handheld-wordmark">CHICKEN <em>GAME</em><span>✦ 4 PLAYER LINK ✦</span></div><div class="touch-controls" aria-label="Handheld game controls"><button class="touch-shoulder shoulder-l" data-touch="cluck" aria-label="Quack"><strong>L</strong><small>QUACK</small></button><button class="touch-shoulder shoulder-r" data-touch="ragdoll" aria-label="Ragdoll"><strong>R</strong><small>RAGDOLL</small></button><div class="touch-move" aria-label="Directional pad"><button class="dpad-up" data-touch="up" aria-label="Aim up">▲</button><button class="dpad-left" data-touch="left" aria-label="Move left">◀</button><div class="dpad-center" aria-hidden="true"></div><button class="dpad-right" data-touch="right" aria-label="Move right">▶</button><button class="dpad-down" data-touch="down" aria-label="Crouch or slide">▼</button></div><div class="touch-actions" aria-label="Action buttons"><button class="action-b" data-touch="fire" aria-label="Fire, grab, or throw"><strong>B</strong><small>FIRE</small></button><button class="action-a" data-touch="jump" aria-label="Jump, flap, or change spectator camera"><strong>A</strong><small>JUMP</small></button></div></div><div class="handheld-bottom"><span>SELECT</span><i></i><i></i><span>START</span><div class="speaker" aria-hidden="true">▰ ▰ ▰ ▰ ▰</div></div></div><div class="footer">A/D move · W aim up · Space jump/flap · S slide · K fire/grab/throw · L ragdoll · E quack</div></main>`;
    initGame(); bindTouchControls();
  }
  const mine=state.actors.find(a=>a.id===myId); const ammo=mine?.weapon?`${mine.weapon.toUpperCase()} ${mine.ammo}${mine.grenadeFuse?' · PIN OUT':''}${mine.chargeKind!=='none'?' · CHARGING':''}`:mine?.heldBody?'BODY HELD':'UNARMED';
  document.querySelector('#hud')!.innerHTML=`<div>${scores}<span class="score">${ammo}</span></div><div class="score">ROUND ${state.round} · ${Math.max(0,Math.ceil(state.timer))}s</div>`;
  const watched=spectateTarget==='wide'?'WIDE ARENA':state.actors.find(a=>a.id===spectateTarget)?.name;
  document.querySelector('#spectate-hud')!.innerHTML=mine&&!mine.alive&&state.phase==='round'?`<div class="spectate-card">SPECTATING ${esc(watched||'ARENA')} · A NEXT</div>`:'';
  if (overlay!==lastOverlayKey) {document.querySelector('#phase-overlay')!.innerHTML=overlay;lastOverlayKey=overlay;document.querySelector('#again')?.addEventListener('click',()=>socket.emit('start'));}
}

class ArenaScene extends Phaser.Scene {
  graphics!: Phaser.GameObjects.Graphics;
  foreground!: Phaser.GameObjects.Graphics;
  chickens = new Map<string, Phaser.GameObjects.Image>();
  weaponSprites = new Map<string, Phaser.GameObjects.Image>();
  seenEffects = new Set<number>();
  constructor(){super('arena');}
  preload(){ const entries: [string,string,number,number][] = [ ['idle','ChickenIdle-Sheet.png',20,21],['walk','ChickenWalking.png',20,21],['jump','ChickenJumping-Sheet.png',20,21],['fly','ChickenFly-Sheet.png',32,21],['die','ChickenDie-Sheet.png',20,21],['attack','Sprite-ChickenAttack-Sheet.png',34,21] ]; for(const [key,file,w,h] of entries) this.load.spritesheet(key,`/assets/chicken/${file}`,{frameWidth:w,frameHeight:h}); this.load.image('weapon-pistol','/assets/weapons/glock-p80.png'); this.load.image('weapon-submachine','/assets/weapons/mp5a3.png'); }
  create(){ this.graphics=this.add.graphics(); this.foreground=this.add.graphics().setDepth(10); this.cameras.main.setBackgroundColor('#263c53'); }
  update(time:number){ if(!state) return; const s=state; const ar=ARENAS[s.arenaIndex]; const g=this.graphics; const f=this.foreground; g.clear(); f.clear();
    const camera=this.cameras.main, viewWidth=camera.width;
    const mine=s.actors.find(a=>a.id===myId);
    if(mine&&!mine.alive&&spectateTarget==='wide'){camera.setZoom(viewWidth/WIDTH);camera.centerOn(WIDTH/2,HEIGHT/2);}
    else {camera.setZoom(1);const watched=mine&&!mine.alive?s.actors.find(a=>a.id===spectateTarget):mine;if(watched&&viewWidth<WIDTH){const projected=watched.x+watched.vx*Math.min(2,(performance.now()-snapshotAt)/(1000/60));const target=Math.max(0,Math.min(WIDTH-viewWidth,projected-viewWidth/2));const current=camera.scrollX;camera.scrollX=Math.abs(target-current)>220?target:current+(target-current)*0.22;}camera.scrollY=0;}
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
      if(damaged){g.lineStyle(2,0x271f1d);g.lineBetween(b.x+b.w*0.35,b.y+3,b.x+b.w*0.6,b.y+b.h*0.5);g.lineBetween(b.x+b.w*0.6,b.y+b.h*0.5,b.x+b.w*0.45,b.y+b.h-3);}
    }
    const activeWeaponSprites = new Set<string>();
    for(const item of s.items){g.fillStyle(0x0c1723,0.35);g.fillEllipse(item.x,item.y+8,36,7);if(item.type==='grenade')drawGrenade(g,item.x,item.y,1.15);else{const id=`item-${item.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,`weapon-${item.type}`,item.x,item.y,1,item.type==='pistol'?0.8:0.62);}}
    for(const gun of s.thrownGuns){const id=`thrown-${gun.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,`weapon-${gun.type}`,gun.x,gun.y,1,gun.type==='pistol'?0.72:0.58,gun.rotation,0xaeb8c1);}
    for(const p of s.shots){if(p.kind==='grenade'){drawGrenade(g,p.x,p.y,0.7);}else{g.fillStyle(0xff8d50,0.28);g.fillCircle(p.x,p.y,8);g.fillStyle(0xffeab1);g.fillCircle(p.x,p.y,3);}}
    for(const e of s.effects){if(!this.seenEffects.has(e.id)){this.seenEffects.add(e.id);if(this.seenEffects.size>2000)this.seenEffects.clear();if(e.type==='blast')this.cameras.main.shake(170,0.008);else if(e.type==='shot'||e.type==='hit')this.cameras.main.shake(45,0.001);if(e.type==='empty')sting([160]);else if(e.type==='blast')sting([90,65]);else if(e.type==='shot')sting([260]);}g.fillStyle(e.type==='blast'?0xffba53:e.type==='shot'?0xffe7a3:0xd6bd91,Math.min(0.7,e.ttl/20));const r=e.type==='blast'?(24-e.ttl)*3:e.type==='shot'?5:3;g.fillCircle(e.x,e.y,r);if(e.type==='blast'||e.type==='dust')for(let i=0;i<8;i++){const angle=i*Math.PI/4+e.id%9;const d=(e.type==='blast'?24-e.ttl:8-e.ttl)*2;g.fillCircle(e.x+Math.cos(angle)*d,e.y+Math.sin(angle)*d,2);}}
    for(const a of s.actors){const elapsed=Math.min(3,(performance.now()-snapshotAt)/(1000/60));const previous=priorPositions.get(a.id);const local=a.id===myId?collectInput():NO_INPUT;const axis=Number(local.right)-Number(local.left);const acceleration=axis*(a.grounded?1.55:0.82);const px=a.id===myId?a.x+a.vx*elapsed+acceleration*elapsed*elapsed/2:previous?previous.x+(a.x-previous.x)*Math.min(1,elapsed/3):a.x;const py=a.id===myId?a.y+a.vy*elapsed+(a.grounded?0:0.31*elapsed*elapsed):previous?previous.y+(a.y-previous.y)*Math.min(1,elapsed/3):a.y;let img=this.chickens.get(a.id); if(!img){img=this.add.image(px,py-13,'idle',0).setScale(2);this.chickens.set(a.id,img);} const texture=!a.alive?'die':a.flap?'fly':!a.grounded?'jump':Math.abs(a.vx)>0.8?'walk':'idle'; const tex=this.textures.get(texture); const frameCount=Math.max(1,tex.frameTotal-1); const frame=!a.alive?frameCount-1:Math.floor(time/(texture==='walk'?110:170))%frameCount;const bob=a.grounded&&Math.abs(a.vx)>2&&!a.sliding?Math.sin(time/85)*1.5:0; img.setTexture(texture,frame).setPosition(px,py-(a.ragdoll?8:a.crouch?10:18)+bob).setScale(2,a.crouch?1.2:2).setFlipX(a.facing<0).setRotation(!a.alive?a.rotation:a.ragdoll?Math.PI/2:0).setVisible(true);
      if(a.alive&&a.aimUp&&!a.ragdoll){f.fillStyle(0xf1eee4);f.fillRoundedRect(px-10,py-49,20,18,5);f.fillStyle(0x263244);f.fillRect(px-2,py-46,4,3);f.fillStyle(0xf1ae67);f.fillTriangle(px-4,py-49,px+4,py-49,px,py-55);}
      g.fillStyle(COLORS[a.slot],0.8);g.fillRoundedRect(px-18,py+2,36,5,2); if(a.weapon){const wx=a.aimUp?px:px+a.facing*(a.sliding?24:18),wy=py-(a.aimUp?43:a.sliding?10:16);if(a.weapon==='grenade')drawGrenade(f,wx,wy,0.65);else{const id=`actor-${a.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,`weapon-${a.weapon}`,wx,wy,a.aimUp?1:a.facing,a.weapon==='pistol'?0.64:0.52,a.aimUp?-Math.PI/2:0);}} if(a.cluck){f.fillStyle(0xffefc0);f.fillCircle(px+a.facing*22,py-25,5);}
      if(a.hat){const x=a.x,y=a.y-(a.crouch?31:44);const color=[0,0x272d41,0x9c6042,0xffd769,0xf2f2e7,0x80d8d2,0x626f86,0xf87eae][a.hat];f.fillStyle(color);if(a.hat===1){f.fillRect(x-12,y,24,5);f.fillRect(x-7,y-17,14,17);}else if(a.hat===2){f.fillRect(x-15,y,30,4);f.fillRoundedRect(x-9,y-9,18,10,3);}else if(a.hat===3){f.fillRect(x-10,y-5,20,11);f.fillTriangle(x-10,y-5,x-7,y-16,x-3,y-5);f.fillTriangle(x-3,y-5,x,y-18,x+3,y-5);f.fillTriangle(x+3,y-5,x+7,y-16,x+10,y-5);}else if(a.hat===4){f.fillRect(x-9,y,18,5);f.fillRoundedRect(x-10,y-16,20,17,6);}else if(a.hat===5){f.fillRect(x-10,y,20,6);f.lineStyle(2,0x36495a);f.lineBetween(x,y,x,y-12);f.fillStyle(0xf7d45b);f.fillRect(x-11,y-14,22,3);}else if(a.hat===6){f.fillRoundedRect(x-9,y-7,18,12,4);f.fillTriangle(x-9,y,x-18,y-15,x-13,y+1);f.fillTriangle(x+9,y,x+18,y-15,x+13,y+1);}else{f.fillTriangle(x-10,y+4,x,y-17,x+10,y+4);f.fillStyle(0xffdf74);f.fillCircle(x,y-18,3);}}
    }
    for(const [id,img] of this.chickens) if(!s.actors.some(a=>a.id===id)){img.destroy();this.chickens.delete(id);}
    for(const [id,img] of this.weaponSprites)if(!activeWeaponSprites.has(id)){img.destroy();this.weaponSprites.delete(id);}
    if(s.phase==='intermission'||s.phase==='winner'){for(let i=0;i<28;i++){g.fillStyle(COLORS[i%4],0.8);g.fillCircle(25+i*34,480-(i%3)*7,8);}}
  }
  placeWeapon(id:string,key:string,x:number,y:number,facing:number,scale:number,rotation=0,tint=0xffffff):void{let image=this.weaponSprites.get(id);if(!image){image=this.add.image(x,y,key).setDepth(1);this.weaponSprites.set(id,image);}image.setTexture(key).setPosition(x,y).setFlipX(facing<0).setScale(scale).setRotation(rotation).setTint(tint).setVisible(true);}
}
let activeViewWidth=WIDTH;
function desiredViewWidth():number{return matchMedia('(max-width:700px) and (orientation:portrait)').matches?600:WIDTH;}
function initGame(){ game?.destroy(true); activeViewWidth=desiredViewWidth(); game=new Phaser.Game({type:Phaser.AUTO,width:activeViewWidth,height:HEIGHT,parent:'game',pixelArt:true,transparent:false,scene:[ArenaScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}}); }
window.addEventListener('resize',()=>{if(game&&activeViewWidth!==desiredViewWidth())initGame();});
function bindTouchControls():void {
  touchPointers.clear();
  const controls=document.querySelector<HTMLElement>('.touch-controls');
  if(!controls)return;
  // iOS can still show Look Up or double-tap zoom despite touch-action on buttons.
  for(const type of ['contextmenu','dblclick','selectstart','dragstart'])controls.addEventListener(type,event=>event.preventDefault());
  for(const type of ['touchstart','touchmove'])controls.addEventListener(type,event=>event.preventDefault(),{passive:false});
  const refresh = () => document.querySelectorAll<HTMLButtonElement>('[data-touch]').forEach(button => button.classList.toggle('pressed',[...touchPointers.values()].includes(button.dataset.touch as keyof Input)));
  document.querySelectorAll<HTMLElement>('.touch-move,.touch-actions,.touch-shoulder').forEach(region => {
    const move = (event:PointerEvent) => {
      event.preventDefault();
      const hit = document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-touch]');
      if (hit && region.contains(hit)) touchPointers.set(event.pointerId,hit.dataset.touch as keyof Input);
      else touchPointers.delete(event.pointerId);
      refresh();
    };
    region.addEventListener('pointerdown',event => { region.setPointerCapture(event.pointerId); move(event); });
    region.addEventListener('pointermove',event => { if(region.hasPointerCapture(event.pointerId)) move(event); });
    const release = (event:PointerEvent) => { touchPointers.delete(event.pointerId); refresh(); };
    region.addEventListener('pointerup',release); region.addEventListener('pointercancel',release); region.addEventListener('lostpointercapture',release);
  });
}
function collectInput():Input { const out={...NO_INPUT}; for(const k of Object.keys(bindings) as (keyof Input)[]) out[k]=keys.has(bindings[k])||[...touchPointers.values()].includes(k);out.up ||= keys.has('ArrowUp');const gp=navigator.getGamepads?.()[0]; if(gp){const b=(n:number)=>!!gp.buttons[n]?.pressed;out.left ||= gp.axes[0]<-.3||b(14);out.right ||= gp.axes[0]>.3||b(15);out.up ||= gp.axes[1]<-.5||b(12);out.down ||= gp.axes[1]>.5||b(13);out.jump ||= b(0);out.fire ||= b(1);out.cluck ||= b(4);out.ragdoll ||= b(5);} return out; }
setInterval(()=>{if(myId&&state?.phase==='round'){const input=collectInput();const mine=state.actors.find(a=>a.id===myId);if(mine&&!mine.alive){if(input.jump&&!spectateJumpHeld)cycleSpectate();spectateJumpHeld=input.jump;}else spectateJumpHeld=false;socket.emit('input',input);}},1000/60);
socket.on('state',(s:ViewState)=>{if(code&&s.code!==code)return;priorPositions=new Map(state?.actors.map(a=>[a.id,{x:a.x,y:a.y}])||[]);snapshotAt=performance.now();if(previousPhase!==s.phase){if(s.phase==='round')sting([330,440,660]);else if(s.phase==='winner')sting([523,659,784,1047]);else if(s.phase==='intermission')sting([392,330,392]);else if(s.phase==='presenter')sting([440,330]);previousPhase=s.phase;}state=s;syncSpectate();if(s.phase==='lobby'&&screen==='game'){screen='lobby';game?.destroy(true);game=null;lastLobbyKey='';lastOverlayKey='';} if(screen==='lobby'&&s.phase!=='lobby'){screen='game';lastOverlayKey='';} if(screen==='lobby'&&s.phase==='lobby'){const key=JSON.stringify([s.host,s.actors.map(a=>[a.id,a.name,a.slot,a.bot,a.hat])]);if(key===lastLobbyKey)return;lastLobbyKey=key;} render();});
socket.on('connect',()=>{if(error==='Connection lost. Reconnecting…'){error='';if(screen!=='game')render();}const c=new URLSearchParams(location.search).get('room');if(c)join(c);});
socket.on('disconnect',()=>{error='Connection lost. Reconnecting…'; if(screen!=='game')render();});
screen=new URLSearchParams(location.search).has('room')?'join':'menu'; render();
