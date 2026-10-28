import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { ARENAS, COLORS, HATS, HEIGHT, NO_INPUT, WIDTH, type Actor, type GameState, type Input, type Weapon } from '../shared/game';
import './style.css';

type ViewState = GameState & { code: string; host: string };
type Ack = { ok: boolean; code?: string; id?: string; token?: string; error?: string };
const app = document.querySelector<HTMLDivElement>('#app')!;
const socket = io({ autoConnect: true });
const touchCapable = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
let state: ViewState | null = null;
let myId = '';
let code = '';
let error = '';
let screen: 'menu' | 'join' | 'lobby' | 'game' | 'controls' = 'menu';
let game: Phaser.Game | null = null;
let lastLobbyKey = '';
let lastOverlayKey = '';
const keys = new Set<string>();
const defaultBindings: Record<keyof Input, string> = { left: 'KeyA', right: 'KeyD', down: 'KeyS', jump: 'Space', fire: 'KeyK', grab: 'KeyJ', ragdoll: 'KeyL', strafe: 'ShiftLeft', cluck: 'KeyE' };
let bindings: Record<keyof Input, string> = { ...defaultBindings, ...JSON.parse(localStorage.getItem('chicken-bindings') || '{}') };
let rebinding: keyof Input | null = null;
let audio: AudioContext | null = null;
let previousPhase = '';
let lanAddresses: string[] = [];
const touchPointers = new Map<number, keyof Input>();
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
  if (screen === 'menu') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Enter the coop</h2><div class="stack"><input id="name" maxlength="18" placeholder="Your name" value="${esc(localStorage.getItem('chicken-name') || '')}"/>${button('practice','Practice vs. bots')}${button('create','Host a room','secondary')}${button('showjoin','Join a room','ghost')}${button('showcontrols','Controls','ghost')}<div class="error">${esc(error)}</div></div></section><footer class="footer">2–4 chickens. One winner. Infinite clucking.</footer></main>`;
    document.querySelector('#practice')!.addEventListener('click', () => create(true)); document.querySelector('#create')!.addEventListener('click', () => create()); document.querySelector('#showjoin')!.addEventListener('click', () => { screen='join'; render(); }); document.querySelector('#showcontrols')!.addEventListener('click', () => { screen='controls'; render(); }); return; }
  if (screen === 'join') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Join a room</h2><div class="stack"><input id="name" maxlength="18" placeholder="Your name" value="${esc(localStorage.getItem('chicken-name') || '')}"/><input id="room" maxlength="6" placeholder="6-letter room code" value="${esc(new URLSearchParams(location.search).get('room') || '')}"/>${button('join','Join room')}${button('back','Back','ghost')}<div class="error">${esc(error)}</div></div></section></main>`; document.querySelector('#join')!.addEventListener('click',()=>join(document.querySelector<HTMLInputElement>('#room')!.value)); document.querySelector('#back')!.addEventListener('click',()=>{screen='menu';render();}); return; }
  if (screen === 'controls') { app.innerHTML = `<main class="shell">${title}<section class="panel menu"><h2>Controls</h2><p class="muted small">Click a key to change it. Gamepad: stick/D-pad, A jump, X fire, Y grab, B cluck, shoulder buttons strafe and ragdoll.</p><div class="control-grid">${(Object.keys(bindings) as (keyof Input)[]).map(k=>`<label>${k}<button class="ghost bind" data-action="${k}">${rebinding===k?'Press a key…':esc(bindings[k])}</button></label>`).join('')}</div>${button('back','Back','ghost')}</section></main>`; document.querySelectorAll<HTMLButtonElement>('.bind').forEach(b=>b.addEventListener('click',()=>{rebinding=b.dataset.action as keyof Input;render();})); document.querySelector('#back')!.addEventListener('click',()=>{screen='menu';render();}); return; }
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
  if (!hadCanvas) { app.innerHTML=`<main class="shell">${title}<div class="game-wrap"><div id="game"></div><div class="hud" id="hud"></div><div id="phase-overlay"></div>${touchCapable?`<div class="touch-controls" aria-label="Touch game controls"><div class="touch-move"><button data-touch="left" aria-label="Move left">◀</button><button data-touch="right" aria-label="Move right">▶</button><button data-touch="down" aria-label="Crouch or slide">▼</button></div><div class="touch-actions"><button data-touch="grab" aria-label="Grab or throw">GRAB</button><button data-touch="fire" aria-label="Fire weapon">FIRE</button><button data-touch="jump" aria-label="Jump or flap">JUMP</button><button data-touch="strafe" aria-label="Strafe">STRAFE</button><button data-touch="ragdoll" aria-label="Ragdoll">FLOP</button><button data-touch="cluck" aria-label="Cluck">CLUCK</button></div></div>`:''}</div><div class="footer">A/D move · Space jump/flap · S slide · J grab/throw · K fire · L ragdoll · E cluck</div></main>`; initGame(); bindTouchControls(); }
  document.querySelector('#hud')!.innerHTML=`<div>${scores}</div><div class="score">ROUND ${state.round} · ${Math.max(0,Math.ceil(state.timer))}s</div>`;
  if (overlay!==lastOverlayKey) {document.querySelector('#phase-overlay')!.innerHTML=overlay;lastOverlayKey=overlay;document.querySelector('#again')?.addEventListener('click',()=>socket.emit('start'));}
}

class ArenaScene extends Phaser.Scene {
  graphics!: Phaser.GameObjects.Graphics;
  foreground!: Phaser.GameObjects.Graphics;
  chickens = new Map<string, Phaser.GameObjects.Image>();
  weaponSprites = new Map<string, Phaser.GameObjects.Image>();
  constructor(){super('arena');}
  preload(){ const entries: [string,string,number,number][] = [ ['idle','ChickenIdle-Sheet.png',20,21],['walk','ChickenWalking.png',20,21],['jump','ChickenJumping-Sheet.png',20,21],['fly','ChickenFly-Sheet.png',32,21],['die','ChickenDie-Sheet.png',20,21],['attack','Sprite-ChickenAttack-Sheet.png',34,21] ]; for(const [key,file,w,h] of entries) this.load.spritesheet(key,`/assets/chicken/${file}`,{frameWidth:w,frameHeight:h}); this.load.image('weapon-pistol','/assets/weapons/glock-p80.png'); this.load.image('weapon-submachine','/assets/weapons/mp5a3.png'); }
  create(){ this.graphics=this.add.graphics(); this.foreground=this.add.graphics().setDepth(10); this.cameras.main.setBackgroundColor('#263c53'); }
  update(time:number){ if(!state) return; const s=state; const ar=ARENAS[s.arenaIndex]; const g=this.graphics; const f=this.foreground; g.clear(); f.clear();
    g.fillGradientStyle(0x547697,0x547697,0x1d3248,0x1d3248); g.fillRect(0,0,WIDTH,HEIGHT);
    g.fillStyle(0x304b62,0.5); for(let x=0;x<WIDTH;x+=100){g.fillTriangle(x,300,x+50,190,x+100,300);} g.fillStyle(0x1e3546); g.fillRect(0,490,WIDTH,50);
    g.fillStyle(0xb38555); for(const b of ar.blocks) {g.fillRect(b.x,b.y,b.w,b.h);g.fillStyle(0xe4b66f);g.fillRect(b.x,b.y,b.w,5);g.fillStyle(0xb38555);} g.fillStyle(0x9d754f); for(const b of ar.platforms){g.fillRect(b.x,b.y,b.w,b.h);g.fillStyle(0xdcb16b);g.fillRect(b.x,b.y,b.w,5);g.fillStyle(0x9d754f);}
    const activeWeaponSprites = new Set<string>();
    for(const item of s.items){g.fillStyle(0x0c1723,0.35);g.fillEllipse(item.x,item.y+8,36,7);if(item.type==='grenade')drawGrenade(g,item.x,item.y,1.15);else{const id=`item-${item.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,`weapon-${item.type}`,item.x,item.y,1,item.type==='pistol'?0.8:0.62);}}
    for(const p of s.shots){g.fillStyle(p.kind==='grenade'?0xff8a55:p.kind==='submachine'?0x8fe3ff:0xf9e2a1);if(p.kind==='grenade')g.fillCircle(p.x,p.y,p.radius+1);else g.fillRect(p.x-p.radius,p.y-2,p.radius*2+3,4);}
    for(const a of s.actors){let img=this.chickens.get(a.id); if(!img){img=this.add.image(a.x,a.y-13,'idle',0).setScale(2);this.chickens.set(a.id,img);} const texture=!a.alive?'die':a.flap?'fly':!a.grounded?'jump':Math.abs(a.vx)>0.8?'walk':'idle'; const tex=this.textures.get(texture); const frameCount=Math.max(1,tex.frameTotal-1); const frame=!a.alive?frameCount-1:Math.floor(time/(texture==='walk'?110:170))%frameCount; img.setTexture(texture,frame).setPosition(a.x,a.y-(a.ragdoll?8:a.crouch?10:18)).setScale(2,a.crouch?1.2:2).setFlipX(a.facing<0).setRotation(!a.alive?a.rotation:a.ragdoll?Math.PI/2:0).setVisible(true);
      g.fillStyle(COLORS[a.slot],0.8);g.fillRoundedRect(a.x-18,a.y+2,36,5,2); if(a.weapon){const id=`actor-${a.id}`;activeWeaponSprites.add(id);this.placeWeapon(id,`weapon-${a.weapon}`,a.x+a.facing*18,a.y-16,a.facing,a.weapon==='pistol'?0.64:0.52);} if(a.cluck){f.fillStyle(0xffefc0);f.fillCircle(a.x+a.facing*22,a.y-25,5);}
      if(a.hat){const x=a.x,y=a.y-(a.crouch?31:44);const color=[0,0x272d41,0x9c6042,0xffd769,0xf2f2e7,0x80d8d2,0x626f86,0xf87eae][a.hat];f.fillStyle(color);if(a.hat===1){f.fillRect(x-12,y,24,5);f.fillRect(x-7,y-17,14,17);}else if(a.hat===2){f.fillRect(x-15,y,30,4);f.fillRoundedRect(x-9,y-9,18,10,3);}else if(a.hat===3){f.fillRect(x-10,y-5,20,11);f.fillTriangle(x-10,y-5,x-7,y-16,x-3,y-5);f.fillTriangle(x-3,y-5,x,y-18,x+3,y-5);f.fillTriangle(x+3,y-5,x+7,y-16,x+10,y-5);}else if(a.hat===4){f.fillRect(x-9,y,18,5);f.fillRoundedRect(x-10,y-16,20,17,6);}else if(a.hat===5){f.fillRect(x-10,y,20,6);f.lineStyle(2,0x36495a);f.lineBetween(x,y,x,y-12);f.fillStyle(0xf7d45b);f.fillRect(x-11,y-14,22,3);}else if(a.hat===6){f.fillRoundedRect(x-9,y-7,18,12,4);f.fillTriangle(x-9,y,x-18,y-15,x-13,y+1);f.fillTriangle(x+9,y,x+18,y-15,x+13,y+1);}else{f.fillTriangle(x-10,y+4,x,y-17,x+10,y+4);f.fillStyle(0xffdf74);f.fillCircle(x,y-18,3);}}
    }
    for(const [id,img] of this.chickens) if(!s.actors.some(a=>a.id===id)){img.destroy();this.chickens.delete(id);}
    for(const [id,img] of this.weaponSprites)if(!activeWeaponSprites.has(id)){img.destroy();this.weaponSprites.delete(id);}
    if(s.phase==='intermission'||s.phase==='winner'){for(let i=0;i<28;i++){g.fillStyle(COLORS[i%4],0.8);g.fillCircle(25+i*34,480-(i%3)*7,8);}}
  }
  placeWeapon(id:string,key:string,x:number,y:number,facing:number,scale:number):void{let image=this.weaponSprites.get(id);if(!image){image=this.add.image(x,y,key).setDepth(1);this.weaponSprites.set(id,image);}image.setTexture(key).setPosition(x,y).setFlipX(facing<0).setScale(scale).setVisible(true);}
}
function initGame(){ game?.destroy(true); game=new Phaser.Game({type:Phaser.AUTO,width:WIDTH,height:HEIGHT,parent:'game',pixelArt:true,transparent:false,scene:[ArenaScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}}); }
function bindTouchControls():void { document.querySelectorAll<HTMLButtonElement>('[data-touch]').forEach(button=>{const action=button.dataset.touch as keyof Input;button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);touchPointers.set(event.pointerId,action);button.classList.add('pressed');});const release=(event:PointerEvent)=>{touchPointers.delete(event.pointerId);button.classList.toggle('pressed',[...touchPointers.values()].includes(action));};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);}); }
function collectInput():Input { const out={...NO_INPUT}; for(const k of Object.keys(bindings) as (keyof Input)[]) out[k]=keys.has(bindings[k])||[...touchPointers.values()].includes(k); const gp=navigator.getGamepads?.()[0]; if(gp){const b=(n:number)=>!!gp.buttons[n]?.pressed;out.left ||= gp.axes[0]<-.3||b(14);out.right ||= gp.axes[0]>.3||b(15);out.down ||= gp.axes[1]>.5||b(13);out.jump ||= b(0);out.fire ||= b(2);out.grab ||= b(3);out.cluck ||= b(1);out.strafe ||= b(4);out.ragdoll ||= b(5);} return out; }
setInterval(()=>{if(myId&&state?.phase==='round')socket.emit('input',collectInput());},1000/30);
socket.on('state',(s:ViewState)=>{if(code&&s.code!==code)return;if(previousPhase!==s.phase){if(s.phase==='round')sting([330,440,660]);else if(s.phase==='winner')sting([523,659,784,1047]);else if(s.phase==='intermission')sting([392,330,392]);else if(s.phase==='presenter')sting([440,330]);previousPhase=s.phase;}state=s;if(s.phase==='lobby'&&screen==='game'){screen='lobby';game?.destroy(true);game=null;lastLobbyKey='';lastOverlayKey='';} if(screen==='lobby'&&s.phase!=='lobby'){screen='game';lastOverlayKey='';} if(screen==='lobby'&&s.phase==='lobby'){const key=JSON.stringify([s.host,s.actors.map(a=>[a.id,a.name,a.slot,a.bot,a.hat])]);if(key===lastLobbyKey)return;lastLobbyKey=key;} render();});
socket.on('connect',()=>{if(error==='Connection lost. Reconnecting…'){error='';if(screen!=='game')render();}const c=new URLSearchParams(location.search).get('room');if(c)join(c);});
socket.on('disconnect',()=>{error='Connection lost. Reconnecting…'; if(screen!=='game')render();});
screen=new URLSearchParams(location.search).has('room')?'join':'menu'; render();
