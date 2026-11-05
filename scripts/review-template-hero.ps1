$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$asset = Join-Path $root 'client/public/assets/hero'
$review = Join-Path $root '.art-review'
New-Item -ItemType Directory -Path $review -Force | Out-Null
$manifest = Get-Content -LiteralPath (Join-Path $asset 'manifest.json') -Raw | ConvertFrom-Json
$anchors = Get-Content -LiteralPath (Join-Path $asset 'anchors.json') -Raw | ConvertFrom-Json
$checked = 0
$contactNames = @('idle','walk','run','jump','slide','wall_slide','ledge_climb','combo_1','combo_2','combo_3','crouch','flap','throw','ragdoll')

foreach ($entry in $manifest.poses.PSObject.Properties) {
  $pose = $entry.Name
  $config = $entry.Value
  $folder = if ($config.runtime) { $asset } else { Join-Path $asset 'reference' }
  foreach ($variant in $config.variants) {
    $name = "$pose$variant"
    $path = Join-Path $folder "$name.png"
    $sheet = [Drawing.Bitmap]::FromFile($path)
    try {
      if ($sheet.Width -ne $config.frames * 128 -or $sheet.Height -ne 128) { throw "Wrong dimensions: $name" }
      $sheetFront = 0; $sheetRear = 0
      for ($frame = 0; $frame -lt $config.frames; $frame++) {
        $opaque = 0; $transparent = 0; $white = 0; $comb = 0; $beak = 0
        $torso = 0; $frontArm = 0; $rearArm = 0; $legs = 0
        for ($y = 0; $y -lt 128; $y++) {
          for ($x = 0; $x -lt 128; $x++) {
            $c = $sheet.GetPixel($frame * 128 + $x,$y)
            if ($c.A -eq 0) { $transparent++; continue }
            if ($c.A -ne 255) { throw "Partial alpha: $name frame $frame at $x,$y" }
            $opaque++
            $rgb = (([int]$c.R -shl 16) -bor ([int]$c.G -shl 8) -bor [int]$c.B)
            switch ($rgb) {
              0xF8F9F5 { $white++ }
              0xBE2B32 { $comb++ }
              0xEF8B2A { $beak++ }
              0x78A66C { $torso++ }
              0xA94277 { $frontArm++ }
              0xB75579 { $frontArm++ }
              0xD77E7E { $rearArm++ }
              0xCB6F7D { $rearArm++ }
              0x5489B1 { $legs++ }
              0x283584 { $legs++ }
              0x4973A5 { $legs++ }
              0x3A5796 { $legs++ }
            }
          }
        }
        if ($config.runtime -and ($opaque -lt 60 -or $opaque -gt 1900 -or $transparent -lt 14000)) { throw "Pixel coverage: $name frame $frame ($opaque opaque)" }
        if ($config.runtime -and ($white -lt 6 -or $comb -lt 2 -or $beak -lt 2 -or $torso -lt 1 -or $legs -lt 5)) { throw "Missing head or body color: $name frame $frame (white=$white comb=$comb beak=$beak torso=$torso arms=$frontArm/$rearArm legs=$legs)" }
        $sheetFront += $frontArm; $sheetRear += $rearArm
        $checked++
      }
      if ($config.runtime -and ($sheetFront -lt 2 -or $sheetRear -lt 2)) { throw "Missing distinct arm colors: $name" }
      if ($config.runtime -and $config.variants -contains '-gun') {
        $points = $anchors.$pose
        if ($points.Count -ne $config.frames) { throw "Wrong anchor count: $pose" }
        foreach ($point in $points) {
          foreach ($key in @('gun','up','diag')) {
            $xy = $point.$key
            if ($xy.Count -ne 2 -or $xy[0] -lt 0 -or $xy[0] -ge 128 -or $xy[1] -lt 0 -or $xy[1] -ge 128) { throw "Invalid anchor: $pose/$key" }
          }
        }
      }
    } finally { $sheet.Dispose() }
  }
  if ($pose -notin $contactNames) { continue }
  $variants = if ($config.variants -contains '-gun') { @('','-gun','-up','-diag') } else { @('','-up','-diag') }
  $cellW = 200; $cellH = 140; $scale = 3
  $contact = [Drawing.Bitmap]::new([int]($cellW * $config.frames * 2),[int]($cellH * $variants.Count))
  $graphics = [Drawing.Graphics]::FromImage($contact)
  try {
    $graphics.Clear([Drawing.Color]::FromArgb(38,52,70))
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    for ($row=0; $row -lt $variants.Count; $row++) {
      $sheet = [Drawing.Bitmap]::FromFile((Join-Path $asset "$pose$($variants[$row]).png"))
      try {
        for ($frame=0; $frame -lt $config.frames; $frame++) {
          $source = [Drawing.Rectangle]::new($frame*128+40,34,65,46)
          $left = [Drawing.Rectangle]::new($frame*$cellW,$row*$cellH,195,138)
          $right = [Drawing.Rectangle]::new(($config.frames+$frame)*$cellW,$row*$cellH,195,138)
          $graphics.DrawImage($sheet,$left,$source,[Drawing.GraphicsUnit]::Pixel)
          $graphics.TranslateTransform($right.X+$right.Width,0)
          $graphics.ScaleTransform(-1,1)
          $flipped = [Drawing.Rectangle]::new(0,$right.Y,$right.Width,$right.Height)
          $graphics.DrawImage($sheet,$flipped,$source,[Drawing.GraphicsUnit]::Pixel)
          $graphics.ResetTransform()
        }
      } finally { $sheet.Dispose() }
    }
    $contact.Save((Join-Path $review "$pose.png"),[Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $contact.Dispose() }
}
Write-Output "Checked $checked frames. Contact sheets: $review"
