import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve('client/public/assets');
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function chunk(type, data) { const name = Buffer.from(type); const size = Buffer.alloc(4), check = Buffer.alloc(4); size.writeUInt32BE(data.length); let crc = 0xffffffff; for (const byte of Buffer.concat([name, data])) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); check.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([size, name, data, check]); }
function canvas(w, h) {
  const rgba = Buffer.alloc(w * h * 4);
  const dot = (x, y, hex) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const n = (y * w + x) * 4; const color = hex.replace('#', ''); rgba[n] = parseInt(color.slice(0, 2), 16); rgba[n+1] = parseInt(color.slice(2, 4), 16); rgba[n+2] = parseInt(color.slice(4, 6), 16); rgba[n+3] = color.length === 8 ? parseInt(color.slice(6), 16) : 255; };
  const rect = (x, y, width, height, color) => { for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) dot(xx, yy, color); };
  const png = () => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; const scan = Buffer.alloc(h * (1 + w * 4)); for (let y = 0; y < h; y++) rgba.copy(scan, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4); return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]); };
  return { dot, rect, png };
}
async function save(file, art) { const target = path.join(root, file); await mkdir(path.dirname(target), { recursive: true }); let png=art.png(); try { png=await readFile(path.resolve('art/overrides',file)); } catch { /* no manual edit */ } await writeFile(target, png); }
for (const [theme, base, top, line] of [
  ['forest', '#78594b', '#65a661', '#416a4c'],
  ['industrial', '#334f60', '#e2b74b', '#233743'],
  ['space', '#30455f', '#73b7cf', '#8bd5df']
]) { const a = canvas(16,16); a.rect(0,0,16,16,base); a.rect(0,0,16,5,top); a.rect(2,7,2,8,line); a.rect(10,7,2,8,line); a.rect(0,15,16,1,line); await save(`tiles/platform-${theme}.png`,a); }
{ const a=canvas(16,16);a.rect(0,0,16,16,'#4e392c');a.rect(1,1,14,14,'#806044');a.rect(2,2,12,1,'#e1b47a');a.rect(2,13,12,1,'#e1b47a');for(let i=3;i<13;i++){a.dot(i,i,'#4e392c');a.dot(15-i,i,'#4e392c');}await save('tiles/crate.png',a); }
{ const a=canvas(16,16);a.rect(0,0,16,16,'#3c3230');a.rect(2,1,12,14,'#c99b6b');a.rect(3,2,10,12,'#654f43');a.rect(4,4,8,1,'#92694b');a.rect(4,11,8,1,'#92694b');a.rect(10,7,2,2,'#ffd58c');await save('tiles/door.png',a); }
{ const a=canvas(16,16);a.rect(0,0,16,16,'#566974');a.rect(0,0,16,2,'#9cabb0');a.rect(0,8,16,1,'#34444c');a.rect(8,1,1,7,'#34444c');a.rect(3,9,1,7,'#34444c');await save('tiles/wall.png',a); }
{ const a=canvas(32,32);a.rect(3,13,28,7,'#313841');a.rect(11,14,17,4,'#f5f7f4');a.rect(11,18,17,1,'#b5cbd0');a.rect(4,15,8,3,'#ea9b39');a.rect(10,11,2,11,'#313841');await save('weapons/sword.png',a); }
{ const a=canvas(16,16);a.rect(3,5,10,9,'#313841');a.rect(4,6,8,7,'#6b845f');a.rect(5,4,6,2,'#98a779');a.rect(7,2,2,3,'#313841');a.rect(6,1,4,1,'#d8caa2');a.rect(5,8,1,2,'#b9c894');await save('weapons/grenade.png',a); }
