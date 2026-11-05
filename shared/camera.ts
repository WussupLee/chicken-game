import { HEIGHT, WIDTH } from './game';

export interface CameraFrame { x: number; y: number; zoom: number }

export function frameCombatants(points: ReadonlyArray<{x:number;y:number}>, viewWidth:number, viewHeight:number, maxZoom=1.55): CameraFrame {
  const fighters=points.length?points:[{x:WIDTH/2,y:HEIGHT/2}];
  const minX=Math.min(...fighters.map(p=>p.x)),maxX=Math.max(...fighters.map(p=>p.x));
  const minY=Math.min(...fighters.map(p=>p.y)),maxY=Math.max(...fighters.map(p=>p.y));
  const baseZoom=Math.min(viewWidth/WIDTH,viewHeight/HEIGHT);
  const zoom=Math.max(baseZoom,Math.min(maxZoom,viewWidth/Math.max(210,maxX-minX+180),viewHeight/Math.max(170,maxY-minY+140)));
  return containCombatants({x:(minX+maxX)/2,y:(minY+maxY)/2,zoom},fighters,viewWidth,viewHeight);
}

export function containCombatants(frame:CameraFrame, points:ReadonlyArray<{x:number;y:number}>, viewWidth:number, viewHeight:number): CameraFrame {
  const visibleWidth=viewWidth/frame.zoom,visibleHeight=viewHeight/frame.zoom;
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  const padX=Math.min(80,Math.max(0,(visibleWidth-(maxX-minX))/2));
  const padY=Math.min(65,Math.max(0,(visibleHeight-(maxY-minY))/2));
  const clamp=(n:number,low:number,high:number)=>Math.min(Math.max(n,low),high);
  const x=visibleWidth>=WIDTH?WIDTH/2:clamp(clamp(frame.x,maxX+padX-visibleWidth/2,minX-padX+visibleWidth/2),visibleWidth/2,WIDTH-visibleWidth/2);
  const y=visibleHeight>=HEIGHT?HEIGHT/2:clamp(clamp(frame.y,maxY+padY-visibleHeight/2,minY-padY+visibleHeight/2),visibleHeight/2,HEIGHT-visibleHeight/2);
  return {x,y,zoom:frame.zoom};
}
