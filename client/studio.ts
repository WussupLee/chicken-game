import './studio.css';

type Asset = { id:string; label:string; group:string; file:string; frameWidth:number; frameHeight:number; frames:number; fps?:number; runtime?:boolean };
type Anchor = { gun:[number,number]; up:[number,number]; diag:[number,number] };
type Anchors = Record<string, Anchor[]>;
type Tool = 'pencil' | 'eraser' | 'pick' | 'fill' | 'anchor';
const root = document.querySelector<HTMLDivElement>('#studio')!;
root.innerHTML = `<header><div><a href="/">← GAME</a><strong>CHICKEN GAME <span>PIXEL ART STUDIO</span></strong></div><div class="header-actions"><button id="save">Save to game</button><button id="export-sheet">Export sheet</button></div></header><main><aside class="library"><div class="aside-head"><h2>Asset library</h2><input id="search" placeholder="Find an animation or sprite" aria-label="Search assets"/></div><div id="assets"></div><button id="new-sprite" class="wide">+ Import new sprite</button></aside><section class="workspace"><div class="workspace-head"><div><div class="eyebrow" id="group-name">CHARACTER</div><h1 id="asset-name">Loading assets…</h1><div class="sub" id="asset-meta"></div></div><div class="play-controls"><button id="play" aria-label="Play animation">▶ Play</button><label>Animation FPS <input id="fps" type="number" min="1" max="30" value="8"/></label></div></div><div class="canvas-shell"><div class="checker"><canvas id="view" aria-label="Pixel editor"></canvas></div></div><div class="frame-head"><h2>Frames <span id="frame-number"></span></h2><div><button id="prev" aria-label="Previous frame">←</button><button id="next" aria-label="Next frame">→</button></div></div><div id="frames" class="frames"></div><div class="workspace-foot"><span id="status" role="status">Choose an asset.</span><span>128 × 128 character cells · 16 × 16 map tiles · nearest neighbor pixels</span></div></section><aside class="inspector"><h2>Tools</h2><div class="tools"><button data-tool="pencil" class="active">✎ Paint</button><button data-tool="eraser">◇ Erase</button><button data-tool="pick">◉ Pick</button><button data-tool="fill">▣ Fill</button><button data-tool="anchor">⌖ Hand</button></div><label class="field">Color <input id="color" type="color" value="#f8f9f5"/></label><div id="palette" class="palette"></div><div class="row"><label class="field">Zoom <select id="zoom"><option value="3">3×</option><option value="4" selected>4×</option><option value="6">6×</option><option value="8">8×</option><option value="12">12×</option><option value="16">16×</option></select></label><label class="check"><input id="grid" type="checkbox"/> Pixel grid</label></div><button id="undo" class="wide">↶ Undo</button><h2>Import / export</h2><input id="file" type="file" accept="image/png" hidden/><button id="import" class="wide">Import PNG / sheet</button><button id="export-frame" class="wide">Export current frame</button><p class="hint">Paste an image with Ctrl+V. An exact size sheet replaces the animation; an exact size frame replaces only this frame. Imported art keeps its native pixels.</p><div id="anchor-panel" hidden><h2>Weapon hand anchor</h2><p class="hint">Drag the crosshair with the Hand tool or enter a position. These coordinates place the gun in the game.</p><div class="row"><label class="field">X <input id="anchor-x" type="number" min="0" max="127"/></label><label class="field">Y <input id="anchor-y" type="number" min="0" max="127"/></label></div></div><div class="new-panel" id="new-panel" hidden><h2>New sprite</h2><label class="field">Name <input id="new-name" placeholder="Example: laser rifle"/></label><div class="row"><label class="field">Width <input id="new-width" type="number" min="1" max="512" value="16"/></label><label class="field">Height <input id="new-height" type="number" min="1" max="512" value="16"/></label><label class="field">Frames <input id="new-frames" type="number" min="1" max="64" value="1"/></label></div><button id="create-sprite" class="wide">Create and edit</button></div></aside></main>`;

const $ = <T extends HTMLElement>(selector:string) => root.querySelector<T>(selector)!;
const view = $<HTMLCanvasElement>('#view');
const display = view.getContext('2d', { willReadFrequently:true })!;
const sheet = document.createElement('canvas');
const ctx = sheet.getContext('2d', { willReadFrequently:true })!;
let catalog:Asset[] = [], asset:Asset, anchors:Anchors = {}, frame = 0, zoom = 4, tool:Tool = 'pencil';
let dirty = false, anchorDirty = false, timingDirty=false, playing = false, playTimer:number|undefined, drawing = false, lastPoint:{x:number;y:number}|null=null;
let originalPixels:ImageData|null=null;
let undoStack:ImageData[] = [];
const palette = ['#30343a','#f8f9f5','#dee5e5','#becdd1','#be2b32','#e54d44','#ef8b2a','#ad531e','#78594b','#65a661','#334f60','#e2b74b','#73b7cf','#806044','#654f43','#566974'];
function status(message:string, error=false) { const el=$<HTMLElement>('#status'); el.textContent=message; el.classList.toggle('error',error); }
function selectedAnchor():{point:[number,number];key:'gun'|'up'|'diag'}|null {
  if (!asset || asset.group !== 'Character') return null;
  const name=asset.file.split('/').pop()!.replace('.png','');
  const pose=name.replace(/-(gun|up|diag)$/,'');
  const key=name.endsWith('-up')?'up':name.endsWith('-diag')?'diag':'gun';
  return anchors[pose]?.[frame] ? { point:anchors[pose][frame][key], key } : null;
}
function renderCanvas() {
  if (!asset) return;
  view.width=asset.frameWidth*zoom; view.height=asset.frameHeight*zoom;
  display.imageSmoothingEnabled=false; display.clearRect(0,0,view.width,view.height);
  display.drawImage(sheet,frame*asset.frameWidth,0,asset.frameWidth,asset.frameHeight,0,0,view.width,view.height);
  if ($<HTMLInputElement>('#grid').checked && zoom>=6) { display.strokeStyle='rgba(80,105,122,.32)'; display.lineWidth=1; display.beginPath(); for(let x=0;x<=asset.frameWidth;x++){display.moveTo(x*zoom+.5,0);display.lineTo(x*zoom+.5,view.height);} for(let y=0;y<=asset.frameHeight;y++){display.moveTo(0,y*zoom+.5);display.lineTo(view.width,y*zoom+.5);} display.stroke(); }
  const anchor=selectedAnchor();
  if(anchor && asset.file.endsWith(`-${anchor.key}.png`) && $<HTMLElement>('#anchor-panel').hidden===false){const [x,y]=anchor.point;display.strokeStyle='#ffdb66';display.lineWidth=2;display.beginPath();display.moveTo((x+.5)*zoom-9,(y+.5)*zoom);display.lineTo((x+.5)*zoom+9,(y+.5)*zoom);display.moveTo((x+.5)*zoom,(y+.5)*zoom-9);display.lineTo((x+.5)*zoom,(y+.5)*zoom+9);display.stroke();}
  $<HTMLElement>('#frame-number').textContent=`${frame+1} / ${asset.frames}`;
  $<HTMLInputElement>('#anchor-x').value=String(anchor?.point[0] ?? 0); $<HTMLInputElement>('#anchor-y').value=String(anchor?.point[1] ?? 0);
}
function renderFrames(){const el=$<HTMLElement>('#frames');el.replaceChildren();for(let i=0;i<asset.frames;i++){const button=document.createElement('button');button.className='frame'+(i===frame?' active':'');button.type='button';const c=document.createElement('canvas');c.width=asset.frameWidth;c.height=asset.frameHeight;c.getContext('2d')!.drawImage(sheet,i*asset.frameWidth,0,asset.frameWidth,asset.frameHeight,0,0,c.width,c.height);button.append(c,document.createElement('span'));button.lastElementChild!.textContent=String(i+1).padStart(2,'0');button.onclick=()=>selectFrame(i);el.append(button);}}
function selectFrame(index:number){frame=(index+asset.frames)%asset.frames;renderCanvas();renderFrames();}
function renderLibrary(){const needle=$<HTMLInputElement>('#search').value.toLowerCase();const el=$<HTMLElement>('#assets');el.replaceChildren();for(const group of ['Character','Reference','Tiles','Weapons','Imported']){const found=catalog.filter(a=>a.group===group && a.label.toLowerCase().includes(needle));if(!found.length)continue;const heading=document.createElement('h3');heading.textContent=group;el.append(heading);for(const item of found){const button=document.createElement('button');button.className='asset'+(item.id===asset?.id?' active':'');button.textContent=item.label;button.onclick=()=>void selectAsset(item);el.append(button);}}}
async function selectAsset(next:Asset){if(dirty||anchorDirty||timingDirty){if(!confirm('Leave this sprite without saving your changes?'))return;}
  stop(); asset=next;frame=0;dirty=false;anchorDirty=false;timingDirty=false;undoStack=[]; sheet.width=asset.frameWidth*asset.frames;sheet.height=asset.frameHeight;ctx.clearRect(0,0,sheet.width,sheet.height);
  try { const image=new Image();image.src=`/assets/${asset.file}?t=${Date.now()}`;await image.decode();if(image.width!==sheet.width||image.height!==sheet.height)throw new Error(`Asset dimensions are ${image.width} × ${image.height}; expected ${sheet.width} × ${sheet.height}.`);ctx.drawImage(image,0,0);status('Ready. Select a frame to edit.'); } catch(e){if(asset.group==='Imported')status('New blank sprite. Import a PNG or start painting.');else status(String(e),true);}
  originalPixels=ctx.getImageData(0,0,sheet.width,sheet.height);
  $<HTMLElement>('#group-name').textContent=asset.group.toUpperCase();$<HTMLElement>('#asset-name').textContent=asset.label;$<HTMLElement>('#asset-meta').textContent=`${asset.frameWidth} × ${asset.frameHeight} px per frame · ${asset.frames} frame${asset.frames===1?'':'s'} · ${asset.file}${asset.runtime===false?' · Reference only':''}`;$<HTMLInputElement>('#fps').value=String(asset.fps||8);$<HTMLElement>('#anchor-panel').hidden=asset.group!=='Character'||!selectedAnchor()||!/-gun\.png$|-up\.png$|-diag\.png$/.test(asset.file);zoom=asset.frameWidth<=32?12:4;$<HTMLSelectElement>('#zoom').value=String(zoom);renderLibrary();renderCanvas();renderFrames();
}
function snapshot(){undoStack.push(ctx.getImageData(0,0,sheet.width,sheet.height));if(undoStack.length>20)undoStack.shift();}
function markDirty(){dirty=true;status('Unsaved pixel changes. Save to update the game.');}
function point(event:PointerEvent){const rect=view.getBoundingClientRect();return {x:Math.floor((event.clientX-rect.left)/rect.width*asset.frameWidth),y:Math.floor((event.clientY-rect.top)/rect.height*asset.frameHeight)};}
function putPixel(x:number,y:number,erase=false){if(x<0||y<0||x>=asset.frameWidth||y>=asset.frameHeight)return;const hex=$<HTMLInputElement>('#color').value;ctx.fillStyle=hex;if(erase)ctx.clearRect(frame*asset.frameWidth+x,y,1,1);else ctx.fillRect(frame*asset.frameWidth+x,y,1,1);}
function stroke(target:{x:number;y:number}){const to={x:Math.max(0,Math.min(asset.frameWidth-1,target.x)),y:Math.max(0,Math.min(asset.frameHeight-1,target.y))};const from=lastPoint||to;let x=from.x,y=from.y;const dx=Math.abs(to.x-x),dy=Math.abs(to.y-y),sx=x<to.x?1:-1,sy=y<to.y?1:-1;let error=dx-dy;while(true){putPixel(x,y,tool==='eraser');if(x===to.x&&y===to.y)break;const twice=2*error;if(twice>-dy){error-=dy;x+=sx;}if(twice<dx){error+=dx;y+=sy;}}lastPoint=to;markDirty();renderCanvas();}
function pick(x:number,y:number){const p=ctx.getImageData(frame*asset.frameWidth+x,y,1,1).data;if(p[3])$<HTMLInputElement>('#color').value='#'+[p[0],p[1],p[2]].map(n=>n.toString(16).padStart(2,'0')).join('');}
function fill(x:number,y:number){const ox=frame*asset.frameWidth, image=ctx.getImageData(ox,0,asset.frameWidth,asset.frameHeight),data=image.data,w=asset.frameWidth,h=asset.frameHeight,start=(y*w+x)*4,old=[...data.slice(start,start+4)];const hex=$<HTMLInputElement>('#color').value;const replacement=[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),255];if(old.every((n,i)=>n===replacement[i]))return;const queue=[y*w+x],seen=new Uint8Array(w*h);while(queue.length){const p=queue.pop()!;if(p<0||p>=w*h||seen[p])continue;seen[p]=1;const i=p*4;if(!old.every((n,k)=>data[i+k]===n))continue;data.set(replacement,i);const px=p%w,py=Math.floor(p/w);if(px>0)queue.push(p-1);if(px<w-1)queue.push(p+1);if(py>0)queue.push(p-w);if(py<h-1)queue.push(p+w);}ctx.putImageData(image,ox,0);markDirty();renderCanvas();renderFrames();}
function updateAnchor(x:number,y:number){const a=selectedAnchor();if(!a)return;a.point[0]=Math.max(0,Math.min(127,Math.round(x)));a.point[1]=Math.max(0,Math.min(127,Math.round(y)));anchorDirty=true;status('Unsaved hand position. Save to update the game.');renderCanvas();}
view.addEventListener('pointerdown',event=>{if(!asset)return;const p=point(event);if(p.x<0||p.y<0||p.x>=asset.frameWidth||p.y>=asset.frameHeight)return;view.setPointerCapture(event.pointerId);drawing=true;lastPoint=null;if(tool==='pick'){pick(p.x,p.y);drawing=false;return;}if(tool==='fill'){snapshot();fill(p.x,p.y);drawing=false;return;}if(tool==='anchor'){updateAnchor(p.x,p.y);return;}snapshot();stroke(p);});
view.addEventListener('pointermove',event=>{if(!drawing||!asset)return;const p=point(event);if(tool==='anchor')updateAnchor(p.x,p.y);else if(tool==='pencil'||tool==='eraser')stroke(p);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])view.addEventListener(name,()=>{if(drawing)renderFrames();drawing=false;lastPoint=null;});
function stop(){playing=false;window.clearInterval(playTimer);$<HTMLButtonElement>('#play').textContent='▶ Play';}
function start(){if(!asset||asset.frames===1)return;playing=true;$<HTMLButtonElement>('#play').textContent='■ Stop';playTimer=window.setInterval(()=>selectFrame(frame+1),1000/Math.max(1,Math.min(30,Number($<HTMLInputElement>('#fps').value)||8)));}
function download(canvas:HTMLCanvasElement,name:string){canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');}
async function loadPng(blob:Blob){if(!asset)return;try{const bitmap=await createImageBitmap(blob);const whole=bitmap.width===sheet.width&&bitmap.height===sheet.height;const single=bitmap.width===asset.frameWidth&&bitmap.height===asset.frameHeight;if(!whole&&!single)throw new Error(`Use a ${asset.frameWidth} × ${asset.frameHeight} frame or ${sheet.width} × ${sheet.height} sheet. Resizing would change the pixel grid.`);snapshot();if(whole){ctx.clearRect(0,0,sheet.width,sheet.height);ctx.drawImage(bitmap,0,0);}else{ctx.clearRect(frame*asset.frameWidth,0,asset.frameWidth,asset.frameHeight);ctx.drawImage(bitmap,frame*asset.frameWidth,0);}bitmap.close();markDirty();renderCanvas();renderFrames();}catch(e){status(String(e),true);}}
async function savePng(item:Asset,canvas:HTMLCanvasElement){
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed')),'image/png'));
  const response=await fetch(`/api/studio/asset/${encodeURIComponent(item.id)}`,{method:'PUT',headers:{'Content-Type':'image/png'},body:png});
  const data=await response.json();if(!response.ok)throw new Error(data.error||`Save failed (${response.status})`);
}
async function propagateBase(){
  if(asset.group!=='Character'||!/^hero\/[a-z0-9_]+\.png$/.test(asset.file)||!originalPixels)return;
  const before=originalPixels.data,after=ctx.getImageData(0,0,sheet.width,sheet.height).data;
  for(const suffix of ['-gun','-up','-diag']){
    const variant=catalog.find(item=>item.id===asset.id+suffix);
    if(!variant)continue;
    const image=new Image();image.src=`/assets/${variant.file}?t=${Date.now()}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=sheet.width;canvas.height=sheet.height;
    const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
    let changed=false;
    for(let i=0;i<data.length;i+=4){
      const baseChanged=before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2]||before[i+3]!==after[i+3];
      const untouched=data[i]===before[i]&&data[i+1]===before[i+1]&&data[i+2]===before[i+2]&&data[i+3]===before[i+3];
      if(baseChanged&&untouched){data[i]=after[i];data[i+1]=after[i+1];data[i+2]=after[i+2];data[i+3]=after[i+3];changed=true;}
    }
    if(changed){context.putImageData(pixels,0,0);await savePng(variant,canvas);}
  }
}
async function save(){
  if(!asset)return;
  try{
    if(dirty){await propagateBase();await savePng(asset,sheet);dirty=false;originalPixels=ctx.getImageData(0,0,sheet.width,sheet.height);}
    if(anchorDirty){const r=await fetch('/api/studio/anchors',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(anchors)});const data=await r.json();if(!r.ok)throw new Error(data.error||`Anchor save failed (${r.status})`);anchorDirty=false;}
    if(timingDirty&&(asset.group==='Character'||asset.group==='Reference')){
      const pose=asset.file.split('/').pop()!.replace('.png','').replace(/-(gun|up|diag)$/,'');
      const fps=Number($<HTMLInputElement>('#fps').value);
      const r=await fetch(`/api/studio/timing/${encodeURIComponent(pose)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({fps})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||`Timing save failed (${r.status})`);
      for(const item of catalog)if(item.file===`hero/${pose}.png`||item.file.startsWith(`hero/${pose}-`)||item.file===`hero/reference/${pose}.png`)item.fps=fps;
      timingDirty=false;
    }
    status('Saved to the game. Refresh the game page to load the new art.');
  }catch(e){status(`${e} Export the PNG as a backup.`,true);}
}
async function createSprite(){const label=$<HTMLInputElement>('#new-name').value.trim();const id=label.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');const body={id,label,frameWidth:Number($<HTMLInputElement>('#new-width').value),frameHeight:Number($<HTMLInputElement>('#new-height').value),frames:Number($<HTMLInputElement>('#new-frames').value)};try{const r=await fetch('/api/studio/custom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||`Could not create sprite (${r.status})`);catalog.push(data as Asset);$<HTMLElement>('#new-panel').hidden=true;await selectAsset(data as Asset);dirty=true;status('Blank sprite created. Import a PNG or paint it, then save to game.');}catch(e){status(String(e),true);}}
for(const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tool]')))button.onclick=()=>{tool=button.dataset.tool as Tool;root.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b===button));view.style.cursor=tool==='anchor'?'crosshair':'cell';};
for(const color of palette){const button=document.createElement('button');button.style.background=color;button.title=color;button.onclick=()=>$<HTMLInputElement>('#color').value=color;$<HTMLElement>('#palette').append(button);}
$<HTMLButtonElement>('#play').onclick=()=>playing?stop():start();$<HTMLInputElement>('#fps').onchange=()=>{if(asset&&(asset.group==='Character'||asset.group==='Reference')){timingDirty=true;status('Unsaved animation timing. Save to update the game.');}if(playing){stop();start();}};
$<HTMLButtonElement>('#prev').onclick=()=>selectFrame(frame-1);$<HTMLButtonElement>('#next').onclick=()=>selectFrame(frame+1);
$<HTMLSelectElement>('#zoom').onchange=e=>{zoom=Number((e.target as HTMLSelectElement).value);renderCanvas();};$<HTMLInputElement>('#grid').onchange=renderCanvas;
$<HTMLButtonElement>('#undo').onclick=()=>{const prior=undoStack.pop();if(prior){ctx.putImageData(prior,0,0);markDirty();renderCanvas();renderFrames();}};
$<HTMLButtonElement>('#import').onclick=()=>$<HTMLInputElement>('#file').click();$<HTMLInputElement>('#file').onchange=e=>{const file=(e.target as HTMLInputElement).files?.[0];if(file)void loadPng(file);(e.target as HTMLInputElement).value='';};
$<HTMLButtonElement>('#export-sheet').onclick=()=>asset&&download(sheet,`${asset.id}.png`);
$<HTMLButtonElement>('#export-frame').onclick=()=>{if(!asset)return;const out=document.createElement('canvas');out.width=asset.frameWidth;out.height=asset.frameHeight;out.getContext('2d')!.drawImage(sheet,frame*asset.frameWidth,0,asset.frameWidth,asset.frameHeight,0,0,out.width,out.height);download(out,`${asset.id}-frame-${String(frame+1).padStart(2,'0')}.png`);};
$<HTMLButtonElement>('#save').onclick=()=>void save();$<HTMLInputElement>('#search').oninput=renderLibrary;
$<HTMLButtonElement>('#new-sprite').onclick=()=>$<HTMLElement>('#new-panel').hidden=false;$<HTMLButtonElement>('#create-sprite').onclick=()=>void createSprite();
for(const key of ['x','y'] as const)$<HTMLInputElement>(`#anchor-${key}`).onchange=()=>{const a=selectedAnchor();if(a)updateAnchor(key==='x'?Number($<HTMLInputElement>('#anchor-x').value):a.point[0],key==='y'?Number($<HTMLInputElement>('#anchor-y').value):a.point[1]);};
document.addEventListener('paste',event=>{const image=Array.from(event.clipboardData?.items||[]).find(item=>item.type==='image/png');if(image){const file=image.getAsFile();if(file){event.preventDefault();void loadPng(file);}}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$<HTMLButtonElement>('#undo').click();}if(document.activeElement?.tagName==='INPUT')return;if(event.key==='ArrowRight')selectFrame(frame+1);if(event.key==='ArrowLeft')selectFrame(frame-1);});
window.addEventListener('beforeunload',event=>{if(dirty||anchorDirty||timingDirty)event.preventDefault();});
async function init(){try{const [c,a]=await Promise.all([fetch('/assets/studio/catalog.json').then(r=>r.json()) as Promise<Asset[]>,fetch('/assets/hero/anchors.json').then(r=>r.json()) as Promise<Anchors>]);catalog=c;anchors=a;renderLibrary();await selectAsset(catalog[0]);}catch(e){status(`Could not load the asset library: ${e}`,true);}}
void init();
