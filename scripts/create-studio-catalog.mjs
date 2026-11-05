import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('client/public/assets/studio');
const manifest=JSON.parse(await readFile(path.resolve('client/public/assets/hero/manifest.json'),'utf8'));
const items=[];
for(const [pose,settings] of Object.entries(manifest.poses))for(const suffix of settings.variants){
  const reference=!settings.runtime;
  items.push({
    id:`hero-${pose}${suffix}`,
    label:`${pose.replaceAll('_',' ')} · ${reference?'Reference only':suffix==='-gun'?'Forward aim':suffix==='-up'?'Up aim':suffix==='-diag'?'Diagonal aim':'Base'}`,
    group:reference?'Reference':'Character',
    file:`hero/${reference?'reference/':''}${pose}${suffix}.png`,
    frameWidth:128,frameHeight:128,frames:settings.frames,fps:settings.fps,
    runtime:settings.runtime
  });
}
items.push(
  {id:'weapon-pistol',label:'Pistol · Glock P80',group:'Weapons',file:'weapons/glock-p80.png'},
  {id:'weapon-submachine',label:'Submachine · MP5A3',group:'Weapons',file:'weapons/mp5a3.png'},
  {id:'weapon-sword',label:'Sword',group:'Weapons',file:'weapons/sword.png',frameWidth:32,frameHeight:32,frames:1},
  {id:'weapon-grenade',label:'Grenade',group:'Weapons',file:'weapons/grenade.png',frameWidth:16,frameHeight:16,frames:1},
  ...['forest','industrial','space'].map(theme=>({id:`tile-platform-${theme}`,label:`${theme} platform`,group:'Tiles',file:`tiles/platform-${theme}.png`,frameWidth:16,frameHeight:16,frames:1})),
  ...['crate','door','wall'].map(kind=>({id:`tile-${kind}`,label:kind,group:'Tiles',file:`tiles/${kind}.png`,frameWidth:16,frameHeight:16,frames:1}))
);
for(const item of items)if(!item.frameWidth){const png=await readFile(path.resolve('client/public/assets',item.file));item.frameWidth=png.readUInt32BE(16);item.frameHeight=png.readUInt32BE(20);item.frames=1;}
try{const previous=JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));items.push(...previous.filter(item=>item.group==='Imported'&&!items.some(existing=>existing.id===item.id)));}catch{/* initial catalog */}
await mkdir(root,{recursive:true});
await writeFile(path.join(root,'catalog.json'),JSON.stringify(items,null,2));
console.log(`Wrote Studio catalog with ${items.length} assets.`);
