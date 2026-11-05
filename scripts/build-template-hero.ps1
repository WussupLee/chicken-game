$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'art/source/template-pro/individual_sheets'
$target = Join-Path $root 'client/public/assets/hero'
$reference = Join-Path $target 'reference'
New-Item -ItemType Directory -Path $target,$reference -Force | Out-Null

Add-Type -ReferencedAssemblies System.Drawing,System.Drawing.Common,System.Drawing.Primitives,System.Collections,System.Runtime,System.Private.Windows.GdiPlus,System.Private.Windows.Core -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;

public static class ChickenTemplateArt {
  static readonly Color Clear = Color.FromArgb(0,0,0,0);
  static readonly Color Ink = Color.FromArgb(255,0,0,0);
  static readonly Color White = Color.FromArgb(255,248,249,245);
  static readonly Color Shade = Color.FromArgb(255,221,229,229);
  static readonly Color Comb = Color.FromArgb(255,190,43,50);
  static readonly Color Beak = Color.FromArgb(255,239,139,42);
  static readonly Color FrontArm = Color.FromArgb(255,169,66,119);
  static readonly Color Hand = Color.FromArgb(255,215,126,126);
  static bool Same(Color a, Color b) { return a.ToArgb()==b.ToArgb(); }
  static bool IsHead(Color c) { return c.A>0 && c.R==102 && c.G==190 && c.B==203; }
  static bool IsFrontArm(Color c) { return c.A>0 && c.R==169 && c.G==66 && c.B==119; }
  static bool IsRearArm(Color c) { return c.A>0 && c.R==215 && c.G==126 && c.B==126; }
  static bool IsInk(Color c) { return c.A>0 && c.R==0 && c.G==0 && c.B==0; }
  static Bitmap CopyFrame(Bitmap src, int frame) {
    var output=new Bitmap(128,128,PixelFormat.Format32bppArgb);
    for(int y=0;y<128;y++)for(int x=0;x<128;x++)output.SetPixel(x,y,src.GetPixel(frame*128+x,y));
    return output;
  }
  static bool ReplaceHead(Bitmap image, out int left, out int top, out int right, out int bottom) {
    left=128;top=128;right=-1;bottom=-1;
    for(int y=0;y<128;y++)for(int x=0;x<128;x++)if(IsHead(image.GetPixel(x,y))){
      left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);
    }
    if(right<0)return false;
    // The template head is 9x9. Only its cyan pixels and adjacent ink are removed.
    var old=new List<Point>();
    for(int y=Math.Max(0,top-1);y<=Math.Min(127,bottom+1);y++)
      for(int x=Math.Max(0,left-1);x<=Math.Min(127,right+1);x++){
        var color=image.GetPixel(x,y);
        if(IsHead(color)){old.Add(new Point(x,y));continue;}
        if(!IsInk(color))continue;
        bool beside=false;
        for(int dy=-1;dy<=1&&!beside;dy++)for(int dx=-1;dx<=1;dx++){
          int nx=x+dx,ny=y+dy;
          if(nx>=0&&nx<128&&ny>=0&&ny<128&&IsHead(image.GetPixel(nx,ny))){beside=true;break;}
        }
        if(beside)old.Add(new Point(x,y));
      }
    foreach(var pixel in old)image.SetPixel(pixel.X,pixel.Y,Clear);
    // Eleven-pixel head silhouette, aligned to the source neck and facing right.
    string[] rows={
      "...RRR......",
      "..RRRRK.....",
      ".KWWWWWWK...",
      "KWWWWWWWWK..",
      "KWWWWWWWWK..",
      "KWWWWWWKWO.",
      "KWWWWWWKOOO",
      "KWWWWWWKOOO",
      ".KWWWWWWK..",
      "..KWWWWSK..",
      "...KKKKK..."
    };
    int x0=left-3,y0=top-3;
    for(int y=0;y<13;y++)for(int x=0;x<13;x++){
      Color color=Clear;
      switch(rows[(int)Math.Round(y*10.0/12)][(int)Math.Round(x*10.0/12)]){case 'R':color=Comb;break;case 'K':color=Ink;break;case 'W':color=White;break;case 'S':color=Shade;break;case 'O':color=Beak;break;}
      int xx=x0+x,yy=y0+y;
      if(color.A>0&&xx>=0&&xx<128&&yy>=0&&yy<128)image.SetPixel(xx,yy,color);
    }
    return true;
  }
  static void Brush(Bitmap image,int x,int y,int radius,Color color){
    for(int yy=y-radius;yy<=y+radius;yy++)for(int xx=x-radius;xx<=x+radius;xx++)
      if(xx>=0&&xx<128&&yy>=0&&yy<128&&Math.Abs(xx-x)+Math.Abs(yy-y)<=radius+1)image.SetPixel(xx,yy,color);
  }
  static void Stroke(Bitmap image,int x0,int y0,int x1,int y1,int radius,Color color){
    int dx=Math.Abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.Abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
    while(true){Brush(image,x0,y0,radius,color);if(x0==x1&&y0==y1)break;int e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}
  }
  public static Bitmap Aim(Bitmap source,string aim,out int handX,out int handY){
    var image=(Bitmap)source.Clone();
    int left=128,top=128,right=-1,bottom=-1;
    for(int y=0;y<128;y++)for(int x=0;x<128;x++){
      var c=image.GetPixel(x,y);
      if(Same(c,White)||Same(c,Shade)||Same(c,Comb)||Same(c,Beak)){
        if(y<70&&x>25&&x<105){left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);}
      }
    }
    if(right<0){left=59;top=47;right=70;bottom=58;}
    var pink=new bool[128,128];
    for(int y=0;y<128;y++)for(int x=0;x<128;x++)pink[x,y]=IsFrontArm(image.GetPixel(x,y))||IsRearArm(image.GetPixel(x,y));
    var erase=new List<Point>();
    for(int y=0;y<128;y++)for(int x=0;x<128;x++){
      var c=image.GetPixel(x,y);
      if(pink[x,y]){erase.Add(new Point(x,y));continue;}
      if(!IsInk(c))continue;
      bool touches=false;
      for(int dy=-1;dy<=1&&!touches;dy++)for(int dx=-1;dx<=1;dx++){
        int nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<128&&ny>=0&&ny<128&&pink[nx,ny]){touches=true;break;}
      }
      if(touches)erase.Add(new Point(x,y));
    }
    foreach(var p in erase)image.SetPixel(p.X,p.Y,Clear);
    int shoulderX=left+8,shoulderY=bottom+5;
    Stroke(image,shoulderX-4,shoulderY+1,shoulderX-7,shoulderY+8,2,Ink);
    Stroke(image,shoulderX-4,shoulderY+1,shoulderX-7,shoulderY+8,1,Hand);
    for(int y=0;y<128;y++)for(int x=0;x<128;x++){var c=source.GetPixel(x,y);if(c.R==120&&c.G==166&&c.B==108&&c.A>0)image.SetPixel(x,y,c);}
    if(aim=="up"){handX=left+11;handY=top-1;}
    else if(aim=="diag"){handX=left+16;handY=top+3;}
    else {handX=left+16;handY=bottom+6;}
    Stroke(image,shoulderX,shoulderY,handX,handY,2,Ink);
    Stroke(image,shoulderX,shoulderY,handX,handY,1,FrontArm);
    Brush(image,handX,handY,1,Hand);
    return image;
  }
  static void KeepHeadInFront(Bitmap source,Bitmap variant,int left,int top){
    for(int y=Math.Max(0,top-3);y<Math.Min(128,top+10);y++)
      for(int x=Math.Max(0,left-3);x<Math.Min(128,left+10);x++)
        variant.SetPixel(x,y,source.GetPixel(x,y));
  }
  public static void EnlargeSheet(string file,bool combo,int[] shiftX,int[] shiftY){
    using(var source=new Bitmap(file)){
      var frames=new Bitmap[source.Width/128];
      for(int frame=0;frame<frames.Length;frame++){
        var old=CopyFrame(source,frame);
        var output=new Bitmap(128,128,PixelFormat.Format32bppArgb);
        var effect=new bool[128,128];
        if(combo){
          for(int y=0;y<128;y++)for(int x=0;x<128;x++){
            var c=old.GetPixel(x,y);
            effect[x,y]=c.A>0&&((c.R==255&&c.G==255&&c.B==255)||(c.R==166&&c.G==252&&c.B==219));
          }
          for(int y=0;y<128;y++)for(int x=0;x<128;x++)if(IsInk(old.GetPixel(x,y))){
            for(int dy=-1;dy<=1&&!effect[x,y];dy++)for(int dx=-1;dx<=1;dx++){
              int xx=x+dx,yy=y+dy;
              if(xx>=0&&xx<128&&yy>=0&&yy<128&&effect[xx,yy]){effect[x,y]=true;break;}
            }
          }
        }
        for(int y=0;y<128;y++)for(int x=0;x<128;x++){
          int xx=60+(int)Math.Floor((x-shiftX[frame]-60)/1.2),yy=80+(int)Math.Floor((y-shiftY[frame]-80)/1.2);
          if(xx>=0&&xx<128&&yy>=0&&yy<128&&!effect[xx,yy])output.SetPixel(x,y,old.GetPixel(xx,yy));
        }
        if(combo)for(int y=0;y<128;y++)for(int x=0;x<128;x++)if(effect[x,y]){
          var underneath=output.GetPixel(x,y);
          if(!Same(underneath,White)&&!Same(underneath,Shade)&&!Same(underneath,Comb)&&!Same(underneath,Beak))output.SetPixel(x,y,old.GetPixel(x,y));
        }
        frames[frame]=output;old.Dispose();
      }
      source.Dispose();SaveFrames(frames,file);foreach(var frame in frames)frame.Dispose();
    }
  }
  public static void CreateCorpse(string input,string output){
    using(var sheet=new Bitmap(input))using(var corpse=new Bitmap(128,128,PixelFormat.Format32bppArgb)){
      for(int y=0;y<128;y++)for(int x=0;x<128;x++){
        int xx=140-y,yy=x;
        if(xx>=0&&xx<128&&yy>=0&&yy<128)corpse.SetPixel(xx,yy,sheet.GetPixel(x,y));
      }
      corpse.Save(output,ImageFormat.Png);
    }
  }
  public static void FinishClimb(string climbPath,string idlePath){
    using(var climb=new Bitmap(climbPath))using(var idle=new Bitmap(idlePath))using(var result=new Bitmap(4*128,128,PixelFormat.Format32bppArgb))using(var graphics=Graphics.FromImage(result)){
      for(int frame=0;frame<3;frame++)graphics.DrawImage(climb,new Rectangle(frame*128,0,128,128),new Rectangle(frame*128,0,128,128),GraphicsUnit.Pixel);
      graphics.DrawImage(idle,new Rectangle(3*128,0,128,128),new Rectangle(0,0,128,128),GraphicsUnit.Pixel);
      climb.Dispose(); idle.Dispose();
      result.Save(climbPath,ImageFormat.Png);
    }
  }
  public static void SaveFrames(Bitmap[] frames,string target){
    using(var sheet=new Bitmap(frames.Length*128,128,PixelFormat.Format32bppArgb)){
      for(int i=0;i<frames.Length;i++)for(int y=0;y<128;y++)for(int x=0;x<128;x++)sheet.SetPixel(i*128+x,y,frames[i].GetPixel(x,y));
      sheet.Save(target,ImageFormat.Png);
    }
  }
  public static void Process(string input,string output,bool variants,string anchorOutput){
    using(var source=new Bitmap(input)){
      if(source.Height!=128||source.Width%128!=0)throw new Exception("Bad template sheet: "+input);
      int count=source.Width/128;
      var baseFrames=new Bitmap[count];
      var gun=new Bitmap[count];var up=new Bitmap[count];var diag=new Bitmap[count];
      var anchors=new string[count];
      for(int i=0;i<count;i++){
        baseFrames[i]=CopyFrame(source,i);
        int l,t,r,b;
        bool hasHead=ReplaceHead(baseFrames[i],out l,out t,out r,out b);
        if(variants&&!hasHead)throw new Exception("Missing template head: "+input+" frame "+i);
        if(variants){
          int gx,gy,ux,uy,dx,dy;
          gun[i]=Aim(baseFrames[i],"gun",out gx,out gy);
          up[i]=Aim(baseFrames[i],"up",out ux,out uy);
          diag[i]=Aim(baseFrames[i],"diag",out dx,out dy);
          KeepHeadInFront(baseFrames[i],gun[i],l,t);
          KeepHeadInFront(baseFrames[i],up[i],l,t);
          KeepHeadInFront(baseFrames[i],diag[i],l,t);
          anchors[i]="{\"gun\":["+gx+","+gy+"],\"up\":["+ux+","+uy+"],\"diag\":["+dx+","+dy+"]}";
        }
      }
      SaveFrames(baseFrames,output+".png");
      if(variants){
        SaveFrames(gun,output+"-gun.png");SaveFrames(up,output+"-up.png");SaveFrames(diag,output+"-diag.png");
        System.IO.File.WriteAllText(anchorOutput,"["+String.Join(",",anchors)+"]");
      }
      foreach(var f in baseFrames)f.Dispose();
      if(variants){foreach(var f in gun)f.Dispose();foreach(var f in up)f.Dispose();foreach(var f in diag)f.Dispose();}
    }
  }
  public static void RotateComboSlash(string input,string output,double degrees){
    using(var sheet=new Bitmap(input)){
      var frames=new Bitmap[sheet.Width/128];
      double angle=degrees*Math.PI/180,cos=Math.Cos(angle),sin=Math.Sin(angle);
      for(int frame=0;frame<frames.Length;frame++){
        var image=CopyFrame(sheet,frame);
        var bright=new bool[128,128];
        for(int y=0;y<128;y++)for(int x=0;x<128;x++){
          var c=image.GetPixel(x,y);
          bright[x,y]=c.A>0&&((c.R==255&&c.G==255&&c.B==255)||(c.R==166&&c.G==252&&c.B==219));
        }
        var slash=new Color[128,128];
        var slashMask=new bool[128,128];
        for(int y=0;y<128;y++)for(int x=0;x<128;x++){
          var c=image.GetPixel(x,y);
          bool part=bright[x,y];
          if(IsInk(c))for(int dy=-1;dy<=1&&!part;dy++)for(int dx=-1;dx<=1;dx++){
            int xx=x+dx,yy=y+dy;
            if(xx>=0&&xx<128&&yy>=0&&yy<128&&bright[xx,yy]){part=true;break;}
          }
          if(part){slashMask[x,y]=true;slash[x,y]=c;image.SetPixel(x,y,Clear);}
        }
        // Inverse sampling keeps the supplied pixel slash solid after rotation.
        for(int y=0;y<128;y++)for(int x=0;x<128;x++){
          int dx=x-76,dy=y-62;
          int xx=76+(int)Math.Round(dx*cos+dy*sin),yy=62+(int)Math.Round(-dx*sin+dy*cos);
          if(xx>=0&&xx<128&&yy>=0&&yy<128&&slashMask[xx,yy])image.SetPixel(x,y,slash[xx,yy]);
        }
        // The head is in front when a rotated slash passes through the face.
        for(int y=0;y<128;y++)for(int x=0;x<128;x++){
          var head=sheet.GetPixel(frame*128+x,y);
          if(Same(head,White)||Same(head,Shade)||Same(head,Comb)||Same(head,Beak))image.SetPixel(x,y,head);
        }
        frames[frame]=image;
      }
      SaveFrames(frames,output);
      foreach(var frame in frames)frame.Dispose();
    }
  }
}
'@

$native = @('idle','walk','run','jump','fall','fall_loop','slide','wall_slide','ledge_hang','ledge_climb','idle_turn','walk_turn','run_turn','run_to_idle','wall_jump')
$combos = @('combo_1','combo_1_end','combo_2','combo_2_end','combo_3','combo_3_end')
$unused = @('dash','hurt','death','design')
$anchors = @{}
foreach ($pose in $native) {
  $anchorFile = Join-Path $target "$pose-anchors.tmp"
  [ChickenTemplateArt]::Process((Join-Path $source "male_hero_template-$pose.png"),(Join-Path $target $pose),$true,$anchorFile)
  $anchors[$pose] = Get-Content -LiteralPath $anchorFile -Raw | ConvertFrom-Json
  Remove-Item -LiteralPath $anchorFile
}
foreach ($pose in $combos) {
  [ChickenTemplateArt]::Process((Join-Path $source "male_hero_template-$pose.png"),(Join-Path $target $pose),$false,'')
  [ChickenTemplateArt]::RotateComboSlash((Join-Path $target "$pose.png"),(Join-Path $target "$pose-up.png"),-90)
  [ChickenTemplateArt]::RotateComboSlash((Join-Path $target "$pose.png"),(Join-Path $target "$pose-diag.png"),-45)
}
foreach ($pose in $unused) {
  [ChickenTemplateArt]::Process((Join-Path $source "male_hero_template-$pose.png"),(Join-Path $reference $pose),$false,'')
}

$derived = @{
  crouch = @(@('slide',0),@('slide',7))
  flap = @(@('jump',1),@('jump',2),@('jump',3))
  throw = @(@('idle',0),@('idle_turn',1),@('idle_turn',2),@('idle',0))
  cluck = @(@('idle',0),@('idle',4))
  ragdoll = @(@('fall',2),@('fall',3))
}
foreach ($pose in $derived.Keys) {
  foreach ($suffix in @('','-gun','-up','-diag')) {
    $frames = [System.Collections.Generic.List[System.Drawing.Bitmap]]::new()
    foreach ($sourceFrame in $derived[$pose]) {
      $path = Join-Path $target "$($sourceFrame[0])$suffix.png"
      $sheet = [System.Drawing.Bitmap]::FromFile($path)
      $frame = [System.Drawing.Bitmap]::new(128,128,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      for ($y=0;$y -lt 128;$y++) { for ($x=0;$x -lt 128;$x++) { $frame.SetPixel($x,$y,$sheet.GetPixel([int]$sourceFrame[1]*128+$x,$y)) } }
      $frames.Add($frame); $sheet.Dispose()
    }
    [ChickenTemplateArt]::SaveFrames($frames.ToArray(),(Join-Path $target "$pose$suffix.png"))
    foreach($frame in $frames){$frame.Dispose()}
  }
  $anchors[$pose] = @($derived[$pose] | ForEach-Object { $anchors[$_[0]][[int]$_[1]] | ConvertTo-Json -Compress | ConvertFrom-Json })
}
$anchors | ConvertTo-Json -Depth 10 -Compress | Set-Content -LiteralPath (Join-Path $target 'anchors.json') -Encoding utf8
$poseShiftX=@{};$poseShiftY=@{}
foreach ($pose in @($native)+@($combos)+@($derived.Keys)) {
  $suffixes = if($pose -in $combos){@('','-up','-diag')}else{@('','-gun','-up','-diag')}
  $base=[Drawing.Bitmap]::FromFile((Join-Path $target "$pose.png"))
  $shiftX=[int[]]::new($base.Width/128);$shiftY=[int[]]::new($base.Width/128)
  if($pose -notin $combos){for($frame=0;$frame -lt $shiftX.Length;$frame++){
    $minX=128;$maxX=-1;$minY=128;$maxY=-1
    for($y=0;$y -lt 128;$y++){for($x=0;$x -lt 128;$x++){if($base.GetPixel($frame*128+$x,$y).A -gt 0){$minX=[Math]::Min($minX,$x);$maxX=[Math]::Max($maxX,$x);$minY=[Math]::Min($minY,$y);$maxY=[Math]::Max($maxY,$y)}}}
    $scaledMinX=60+($minX-60)*1.2;$scaledMaxX=60+($maxX-60)*1.2
    $scaledMinY=80+($minY-80)*1.2;$scaledMaxY=80+($maxY-80)*1.2
    if($scaledMinX -lt 2){$shiftX[$frame]=[int][Math]::Ceiling(2-$scaledMinX)}elseif($scaledMaxX -gt 125){$shiftX[$frame]=[int][Math]::Floor(125-$scaledMaxX)}
    if($scaledMinY -lt 2){$shiftY[$frame]=[int][Math]::Ceiling(2-$scaledMinY)}elseif($scaledMaxY -gt 125){$shiftY[$frame]=[int][Math]::Floor(125-$scaledMaxY)}
  }}
  $base.Dispose();$poseShiftX[$pose]=$shiftX;$poseShiftY[$pose]=$shiftY
  foreach($suffix in $suffixes){[ChickenTemplateArt]::EnlargeSheet((Join-Path $target "$pose$suffix.png"),($pose -in $combos),$shiftX,$shiftY)}
}
foreach($pose in $anchors.Keys){for($index=0;$index -lt $anchors[$pose].Count;$index++){foreach($key in @('gun','up','diag')){$point=$anchors[$pose][$index].$key;$point[0]=[int][Math]::Round(60+($point[0]-60)*1.2+$poseShiftX[$pose][$index]);$point[1]=[int][Math]::Round(80+($point[1]-80)*1.2+$poseShiftY[$pose][$index])}}}
$anchors['ledge_climb'] = @($anchors['ledge_climb'][0..2]) + @($anchors['idle'][0])
foreach($suffix in @('','-gun','-up','-diag')){[ChickenTemplateArt]::FinishClimb((Join-Path $target "ledge_climb$suffix.png"),(Join-Path $target "idle$suffix.png"))}
$anchors | ConvertTo-Json -Depth 10 -Compress | Set-Content -LiteralPath (Join-Path $target 'anchors.json') -Encoding utf8
[ChickenTemplateArt]::CreateCorpse((Join-Path $target 'ragdoll.png'),(Join-Path $target 'corpse.png'))
$manual = Join-Path $root 'art/template-edits/hero'
if (Test-Path $manual) {
  Get-ChildItem -LiteralPath $manual -File -Recurse | ForEach-Object {
    $relative = [System.IO.Path]::GetRelativePath($manual,$_.FullName)
    $destination = Join-Path $target $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
  }
}
foreach ($obsolete in @('combo_1-gun.png','combo_1_end-gun.png','death.png','death-gun.png','death-up.png','death-diag.png')) {
  $path = Join-Path $target $obsolete
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
}
Write-Output "Built template-based chicken art in $target"
