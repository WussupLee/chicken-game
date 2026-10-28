import { io } from 'socket.io-client';

const url = process.env.GAME_URL || 'http://localhost:3000';
const host = io(url);
const guest = io(url);
const once = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 5000);
  socket.once(event, value => { clearTimeout(timer); resolve(value); });
});
const ack = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));
try {
  await Promise.all([once(host, 'connect'), once(guest, 'connect')]);
  const created = await ack(host, 'create', { name: 'Host', token: crypto.randomUUID() });
  if (!created.ok) throw new Error(`Create failed: ${created.error}`);
  const joined = await ack(guest, 'join', { code: created.code, name: 'Guest', token: crypto.randomUUID() });
  if (!joined.ok) throw new Error(`Join failed: ${joined.error}`);
  const bot = await new Promise(resolve => host.emit('addBot', resolve));
  if (!bot.ok) throw new Error('Could not add bot');
  host.emit('start');
  let state;
  do { state = await once(host, 'state'); } while (state.phase !== 'round');
  if (state.actors.length !== 3 || !state.actors.some(a => a.bot)) throw new Error('Wrong participant state');
  console.log(`PASS: room ${created.code} started with host, guest, and bot`);
} finally { host.disconnect(); guest.disconnect(); }
