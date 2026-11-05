import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Server } from 'socket.io';
import { makeActor, newGame, startRound, tick, HATS, NO_INPUT, setWeaponAnchors, type GameState, type Input } from '../shared/game';
import { botInput } from './bot';

interface Room { code: string; state: GameState; serverTick:number; host: string; sockets: Map<string, string>; tokens: Map<string, string>; inputs: Record<string, Input>; inputSeq: Record<string, number>; inputAck: Record<string, number>; emptySince: number }
const rooms = new Map<string, Room>();
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 100_000 });
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const assetRoot = path.resolve(here, '../client/public/assets');
const catalogPath = path.join(assetRoot, 'studio/catalog.json');
type StudioAsset = { id: string; label: string; group: string; file: string; frameWidth: number; frameHeight: number; frames: number; fps?: number };
function localStudio(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const address = req.socket.remoteAddress || '';
  const origin = req.get('origin');
  const localAddress = address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
  let localOrigin = !origin;
  try { if (origin) localOrigin = ['localhost', '127.0.0.1'].includes(new URL(origin).hostname); } catch { /* reject */ }
  if (!localAddress || !localOrigin) { res.status(403).json({ error: 'Studio saving is available only on this computer.' }); return; }
  next();
}
async function studioCatalog(): Promise<StudioAsset[]> { return JSON.parse(await readFile(catalogPath, 'utf8')) as StudioAsset[]; }
function assetPath(file: string): string | null {
  const full = path.resolve(assetRoot, file);
  return full.startsWith(assetRoot + path.sep) && !file.includes('..') ? full : null;
}
app.put('/api/studio/asset/:id', localStudio, express.raw({ type: 'image/png', limit: '8mb' }), async (req, res) => {
  try {
    const asset = (await studioCatalog()).find(item => item.id === req.params.id);
    if (!asset || !Buffer.isBuffer(req.body) || req.body.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return void res.status(400).json({ error: 'Unknown asset or invalid PNG.' });
    const width = req.body.readUInt32BE(16), height = req.body.readUInt32BE(20);
    if (width !== asset.frameWidth * asset.frames || height !== asset.frameHeight) return void res.status(400).json({ error: `Expected ${asset.frameWidth * asset.frames} × ${asset.frameHeight} PNG.` });
    const target = assetPath(asset.file); if (!target) return void res.status(400).json({ error: 'Invalid asset path.' });
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, req.body);
    const built = path.join(dist, 'assets', asset.file);
    await mkdir(path.dirname(built), { recursive: true }); await writeFile(built, req.body);
    if (asset.group !== 'Imported') {
      const folder = asset.group === 'Character' || asset.group === 'Reference' ? '../art/template-edits' : '../art/overrides';
      const override = path.resolve(here, folder, asset.file);
      await mkdir(path.dirname(override), { recursive: true }); await writeFile(override, req.body);
    }
    res.json({ ok: true });
  } catch (cause) { res.status(500).json({ error: String(cause) }); }
});
app.put('/api/studio/anchors', localStudio, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const original = JSON.parse(await readFile(path.join(assetRoot, 'hero/anchors.json'), 'utf8')) as Record<string, unknown[]>;
    const incoming = req.body as Record<string, unknown[]>;
    if (!incoming || typeof incoming !== 'object') return void res.status(400).json({ error: 'Invalid anchors.' });
    for (const [pose, frames] of Object.entries(original)) {
      if (!Array.isArray(incoming[pose]) || incoming[pose].length !== frames.length) return void res.status(400).json({ error: `Invalid ${pose} anchors.` });
      for (const frame of incoming[pose] as Record<string, unknown>[]) for (const key of ['gun', 'up', 'diag']) {
        const point = frame?.[key];
        if (!Array.isArray(point) || point.length !== 2 || point.some(n => !Number.isInteger(n) || n < 0 || n >= 128)) return void res.status(400).json({ error: `Invalid ${pose} ${key} anchor.` });
      }
    }
    const data = JSON.stringify(incoming);
    for (const target of [path.join(assetRoot, 'hero/anchors.json'), path.join(dist, 'assets/hero/anchors.json'), path.resolve(here, '../art/template-edits/hero/anchors.json')]) {
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, data);
    }
    setWeaponAnchors(incoming as Parameters<typeof setWeaponAnchors>[0]);
    res.json({ ok: true });
  } catch (cause) { res.status(500).json({ error: String(cause) }); }
});
app.put('/api/studio/timing/:pose', localStudio, express.json({limit:'1kb'}), async (req,res) => {
  try {
    const manifestPath=path.join(assetRoot,'hero/manifest.json');
    const manifest=JSON.parse(await readFile(manifestPath,'utf8')) as {poses:Record<string,{fps:number}>};
    const pose=String(req.params.pose),fps=Number(req.body?.fps);
    if (!manifest.poses[pose] || !Number.isInteger(fps) || fps<1 || fps>30) return void res.status(400).json({error:'Unknown pose or invalid FPS.'});
    manifest.poses[pose].fps=fps;
    const data=JSON.stringify(manifest,null,2);
    for(const target of [manifestPath,path.join(dist,'assets/hero/manifest.json')]){await mkdir(path.dirname(target),{recursive:true});await writeFile(target,data);}
    const catalog=await studioCatalog();
    for(const item of catalog)if(item.file===`hero/${pose}.png`||item.file.startsWith(`hero/${pose}-`)||item.file===`hero/reference/${pose}.png`)item.fps=fps;
    const catalogData=JSON.stringify(catalog,null,2);
    for(const target of [catalogPath,path.join(dist,'assets/studio/catalog.json')]){await mkdir(path.dirname(target),{recursive:true});await writeFile(target,catalogData);}
    res.json({ok:true});
  } catch(cause){res.status(500).json({error:String(cause)});}
});
app.post('/api/studio/custom', localStudio, express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const id = String(req.body?.id || '').toLowerCase();
    const label = String(req.body?.label || '').trim().slice(0, 60);
    const width = Number(req.body?.frameWidth), height = Number(req.body?.frameHeight), frames = Number(req.body?.frames);
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(id) || !label || ![width, height, frames].every(n => Number.isInteger(n) && n > 0) || width > 512 || height > 512 || frames > 64 || width * frames > 8192) return void res.status(400).json({ error: 'Invalid sprite name or dimensions.' });
    const catalog = await studioCatalog();
    if (catalog.some(item => item.id === id)) return void res.status(409).json({ error: 'That sprite ID already exists.' });
    const item: StudioAsset = { id, label, group: 'Imported', file: `custom/${id}.png`, frameWidth: width, frameHeight: height, frames, fps: 8 };
    catalog.push(item); const data = JSON.stringify(catalog, null, 2);
    for (const target of [catalogPath, path.join(dist, 'assets/studio/catalog.json')]) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, data); }
    res.json(item);
  } catch (cause) { res.status(500).json({ error: String(cause) }); }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('/api/network', (req, res) => {
  const port = Number(process.env.PORT || 3000);
  const addresses = Object.values(networkInterfaces()).flatMap(entries => entries || [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => `http://${entry.address}:${port}`);
  res.json({ addresses, current: `${req.protocol}://${req.get('host')}` });
});
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

function code(): string { let c = ''; do { c = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(c)); return c; }
function emitRoom(room: Room): void { io.to(room.code).emit('state', { ...room.state, code: room.code, host: room.host, inputAck: room.inputAck, serverTick:room.serverTick }); }
function respond(cb: unknown, data: unknown): void { if (typeof cb === 'function') cb(data); }
function addHuman(room: Room, socketId: string, name: string, token: string): string | null {
  const existing = room.tokens.get(token);
  if (existing && room.state.actors.some(a => a.id === existing)) { room.sockets.set(socketId, existing); return existing; }
  if (room.state.phase !== 'lobby' || room.state.actors.length >= 4) return null;
  const slot = [0,1,2,3].find(n => !room.state.actors.some(a => a.slot === n))!;
  const id = randomBytes(6).toString('hex');
  room.state.actors.push(makeActor(id, name || `Player ${slot + 1}`, false, slot));
  if (!room.state.actors.some(a => a.id === room.host)) room.host = id;
  room.tokens.set(token, id); room.sockets.set(socketId, id); return id;
}
function roomOf(socketId: string): Room | undefined { return [...rooms.values()].find(r => r.sockets.has(socketId)); }
function safeInput(raw: Partial<Input>): Input { const out = { ...NO_INPUT }; for (const key of Object.keys(out) as (keyof Input)[]) out[key] = raw?.[key] === true; return out; }

io.on('connection', socket => {
  socket.on('create', (payload: { name?: string; token?: string }, cb: unknown) => {
    const c = code(); const state = newGame(); const room: Room = { code: c, state, serverTick:0, host: '', sockets: new Map(), tokens: new Map(), inputs: {}, inputSeq: {}, inputAck: {}, emptySince: 0 };
    rooms.set(c, room);
    const token = String(payload?.token || randomBytes(12).toString('hex'));
    const id = addHuman(room, socket.id, String(payload?.name || 'Host'), token)!;
    room.host = id; socket.join(c); respond(cb, { ok: true, code: c, id, token }); emitRoom(room);
  });
  socket.on('join', (payload: { code?: string; name?: string; token?: string }, cb: unknown) => {
    const c = String(payload?.code || '').trim().toUpperCase(); const room = rooms.get(c);
    if (!room) return respond(cb, { ok: false, error: 'Room not found' });
    const token = String(payload?.token || randomBytes(12).toString('hex'));
    const id = addHuman(room, socket.id, String(payload?.name || ''), token);
    if (!id) return respond(cb, { ok: false, error: 'Room full or match in progress' });
    socket.join(c); room.emptySince = 0; respond(cb, { ok: true, code: c, id, token }); emitRoom(room);
  });
  socket.on('addBot', (cb: unknown) => { const r = roomOf(socket.id); if (!r || r.host !== r.sockets.get(socket.id) || r.state.phase !== 'lobby' || r.state.actors.length >= 4) return respond(cb, { ok: false });
    const slot = [0,1,2,3].find(n => !r.state.actors.some(a => a.slot === n))!; r.state.actors.push(makeActor(`bot-${randomBytes(4).toString('hex')}`, `Bot ${slot + 1}`, true, slot)); emitRoom(r); respond(cb, { ok: true });
  });
  socket.on('removeBot', (slot: number) => { const r = roomOf(socket.id); if (!r || r.host !== r.sockets.get(socket.id) || r.state.phase !== 'lobby') return; r.state.actors = r.state.actors.filter(a => !(a.bot && a.slot === slot)); emitRoom(r); });
  socket.on('hat', (hat: number) => { const r = roomOf(socket.id); const a = r?.state.actors.find(a => a.id === r.sockets.get(socket.id)); if (!r || !a || r.state.phase !== 'lobby') return; a.hat = Math.max(0, Math.min(HATS.length - 1, Math.floor(Number(hat) || 0))); emitRoom(r); });
  socket.on('start', () => { const r = roomOf(socket.id); if (!r || r.host !== r.sockets.get(socket.id) || r.state.actors.length < 2 || !['lobby','winner'].includes(r.state.phase)) return;
    if (r.state.phase === 'winner') { r.state.round = 0; r.state.actors.forEach(a => a.wins = 0); r.state.winnerId = null; }
    startRound(r.state); emitRoom(r);
  });
  socket.on('input', (raw: Partial<Input> | {seq:number;controls:Partial<Input>}) => { const r = roomOf(socket.id); const id = r?.sockets.get(socket.id); if (r && id) { const framed='controls' in raw; r.inputs[id] = safeInput(framed?raw.controls:raw); if(framed&&Number.isSafeInteger(raw.seq)&&raw.seq>=0)r.inputSeq[id]=raw.seq; } });
  socket.on('disconnect', () => { const r = roomOf(socket.id); if (!r) return; const id = r.sockets.get(socket.id)!; r.sockets.delete(socket.id); delete r.inputs[id]; delete r.inputSeq[id]; delete r.inputAck[id];
    if (r.state.phase === 'lobby') { r.state.actors = r.state.actors.filter(a => a.id !== id); for (const [t, v] of r.tokens) if (v === id) r.tokens.delete(t); }
    const connected = [...r.sockets.values()]; if (r.host === id && connected.length) r.host = connected[0];
    if (!r.sockets.size) r.emptySince = Date.now(); emitRoom(r);
  });
});

setInterval(() => { for (const r of rooms.values()) {
  if (r.state.phase !== 'round' && r.state.phase !== 'presenter' && r.state.phase !== 'intermission') continue;
  const all = { ...r.inputs };
  for (const a of r.state.actors) if (a.bot) all[a.id] = botInput(r.state, a);
  tick(r.state, all);
  r.serverTick++;
  for (const id of Object.keys(r.inputSeq)) r.inputAck[id] = r.inputSeq[id];
}}, 1000 / 60);
setInterval(() => { for (const r of rooms.values()) emitRoom(r); }, 1000 / 20);
setInterval(() => { const now = Date.now(); for (const [c, r] of rooms) if (r.emptySince && now - r.emptySince > 10 * 60_000) rooms.delete(c); }, 60_000);
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Chicken Game on http://localhost:${port}`));
