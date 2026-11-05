import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('client/public/assets');
const catalog=JSON.parse(await readFile(path.join(root,'studio/catalog.json'),'utf8'));
const anchors=JSON.parse(await readFile(path.join(root,'hero/anchors.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(root,'hero/manifest.json'),'utf8'));
const seen=new Set();
for(const item of catalog){
  if(seen.has(item.id))throw new Error(`Duplicate asset ID: ${item.id}`);seen.add(item.id);
  const png=await readFile(path.join(root,item.file));
  if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error(`Invalid PNG: ${item.file}`);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(width!==item.frameWidth*item.frames||height!==item.frameHeight)throw new Error(`Wrong dimensions: ${item.file} is ${width} × ${height}`);
  if(item.group==='Character'){
    const pose=path.basename(item.file,'.png').replace(/-(gun|up|diag)$/,'');
    const config=manifest.poses[pose];
    if(!config?.runtime||config.frames!==item.frames||config.fps!==item.fps)throw new Error(`Wrong character metadata: ${pose}`);
    if(config.variants.includes('-gun')&&anchors[pose]?.length!==item.frames)throw new Error(`Wrong anchor count: ${pose}`);
  }
  if(item.group==='Reference'&&(item.runtime!==false||!manifest.poses[path.basename(item.file,'.png')]))throw new Error(`Invalid reference: ${item.file}`);
  if(item.group==='Tiles'&&(item.frameWidth!==16||item.frameHeight!==16))throw new Error(`Tile is not 16 × 16: ${item.file}`);
}
for(const [pose,config] of Object.entries(manifest.poses))for(const suffix of config.variants){
  if(!seen.has(`hero-${pose}${suffix}`))throw new Error(`Missing catalog entry: ${pose}${suffix}`);
  if(!Number.isInteger(config.fps)||config.fps<1||config.fps>30)throw new Error(`Invalid FPS: ${pose}`);
}
console.log(`Checked ${catalog.length} game art assets, ${Object.keys(manifest.poses).length} poses, and ${Object.keys(anchors).length} anchor sets.`);
