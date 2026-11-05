import { describe, expect, it } from 'vitest';
import { containCombatants, frameCombatants } from './camera';
import { HEIGHT, WIDTH } from './game';

function visible(frame:{x:number;y:number;zoom:number},points:{x:number;y:number}[],width:number,height:number):boolean {
  return points.every(p=>Math.abs(p.x-frame.x)<=width/(2*frame.zoom)+0.001&&Math.abs(p.y-frame.y)<=height/(2*frame.zoom)+0.001);
}

describe('combat camera',()=>{
  it('shows four fighters at opposite arena edges on desktop and phone',()=>{
    const fighters=[{x:12,y:35},{x:948,y:35},{x:12,y:500},{x:948,y:500}];
    for(const width of [960,600]){
      const frame=frameCombatants(fighters,width,540);
      expect(visible(frame,fighters,width,540)).toBe(true);
      expect(frame.zoom).toBeCloseTo(width/WIDTH);
    }
  });
  it('zooms in on two nearby survivors and one fighter without exceeding its cap',()=>{
    const pair=[{x:420,y:350},{x:520,y:385}];
    for(const fighters of [pair,[pair[0]]]){
      const frame=frameCombatants(fighters,600,540);
      expect(frame.zoom).toBe(1.55);
      expect(visible(frame,fighters,600,540)).toBe(true);
    }
  });
  it('keeps moving combatants visible while a previous frame pans toward them',()=>{
    const fighters=[{x:735,y:100},{x:880,y:400}];
    const target=frameCombatants(fighters,600,HEIGHT);
    const current=containCombatants({x:300,y:250,zoom:target.zoom},fighters,600,HEIGHT);
    expect(visible(current,fighters,600,HEIGHT)).toBe(true);
    expect(current.x).toBeLessThanOrEqual(WIDTH-600/(2*current.zoom));
  });
});
