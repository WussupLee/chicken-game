import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('client/public/assets/hero');
const ordinary=['idle','walk','run','jump','fall','fall_loop','slide','wall_slide','ledge_hang','ledge_climb','idle_turn','walk_turn','run_turn','run_to_idle','wall_jump','crouch','flap','throw','cluck','ragdoll'];
const combos=['combo_1','combo_1_end','combo_2','combo_2_end','combo_3','combo_3_end'];
const reference=['dash','hurt','death','design'];
const fps={idle:8,walk:16,run:20,jump:16,fall:16,fall_loop:12,slide:18,wall_slide:12,ledge_hang:8,ledge_climb:18,idle_turn:20,walk_turn:20,run_turn:20,run_to_idle:24,wall_jump:18,crouch:8,flap:12,throw:16,cluck:8,ragdoll:8,combo_1:14,combo_1_end:16,combo_2:19,combo_2_end:18,combo_3:26,combo_3_end:26};
const loops=new Set(['idle','walk','run','fall_loop','wall_slide','ledge_hang','crouch','flap','cluck']);
let previous={poses:{}};
try{previous=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));}catch{/* first build */}
const poses={};
for(const pose of [...ordinary,...combos,...reference]){
  const runtime=!reference.includes(pose);
  const file=path.join(root,runtime?pose+'.png':'reference/'+pose+'.png');
  const png=await readFile(file);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(height!==128||width%128)throw new Error(`Invalid 128px sheet: ${file}`);
  poses[pose]={frames:width/128,fps:previous.poses?.[pose]?.fps||fps[pose]||8,loop:loops.has(pose),runtime,variants:ordinary.includes(pose)?['','-gun','-up','-diag']:combos.includes(pose)?['','-up','-diag']:['']};
}
await writeFile(path.join(root,'manifest.json'),JSON.stringify({frameWidth:128,frameHeight:128,origin:[60,80],poses},null,2));
console.log(`Wrote hero manifest with ${Object.keys(poses).length} poses.`);
