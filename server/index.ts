import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { makeActor, newGame, startRound, tick, HATS, NO_INPUT, type GameState, type Input } from '../shared/game';
import { botInput } from './bot';

interface Room { code: string; state: GameState; host: string; sockets: Map<string, string>; tokens: Map<string, string>; inputs: Record<string, Input>; emptySince: number }
const rooms = new Map<string, Room>();
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 100_000 });
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
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
function emitRoom(room: Room): void { io.to(room.code).emit('state', { ...room.state, code: room.code, host: room.host }); }
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
    const c = code(); const state = newGame(); const room: Room = { code: c, state, host: '', sockets: new Map(), tokens: new Map(), inputs: {}, emptySince: 0 };
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
  socket.on('input', (raw: Partial<Input>) => { const r = roomOf(socket.id); const id = r?.sockets.get(socket.id); if (r && id) r.inputs[id] = safeInput(raw); });
  socket.on('disconnect', () => { const r = roomOf(socket.id); if (!r) return; const id = r.sockets.get(socket.id)!; r.sockets.delete(socket.id); delete r.inputs[id];
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
}}, 1000 / 60);
setInterval(() => { for (const r of rooms.values()) emitRoom(r); }, 1000 / 20);
setInterval(() => { const now = Date.now(); for (const [c, r] of rooms) if (r.emptySince && now - r.emptySince > 10 * 60_000) rooms.delete(c); }, 60_000);
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Chicken Game on http://localhost:${port}`));
