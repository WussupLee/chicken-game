Add-Type -AssemblyName System.Drawing
$outputDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'client\public\icons'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function Draw-Block($graphics, $brush, $x, $y, $width, $height, $scale) {
  $graphics.FillRectangle($brush, $x * $scale, $y * $scale, $width * $scale, $height * $scale)
}

foreach ($size in @(192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $scale = $size / 32
  $background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38, 49, 61))
  $shell = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(95, 108, 119))
  $yellow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 218, 106))
  $light = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 238, 176))
  $dark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35, 43, 52))
  $orange = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 134, 79))
  $red = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(219, 111, 139))
  $graphics.Clear($background.Color)
  Draw-Block $graphics $shell 2 2 28 28 $scale
  Draw-Block $graphics $background 4 4 24 24 $scale
  Draw-Block $graphics $yellow 8 12 17 13 $scale
  Draw-Block $graphics $yellow 11 8 13 6 $scale
  Draw-Block $graphics $light 11 13 9 8 $scale
  Draw-Block $graphics $red 14 5 4 5 $scale
  Draw-Block $graphics $red 19 7 4 4 $scale
  Draw-Block $graphics $orange 23 15 5 4 $scale
  Draw-Block $graphics $dark 20 12 3 3 $scale
  Draw-Block $graphics $light 20 12 1 1 $scale
  Draw-Block $graphics $orange 11 25 3 3 $scale
  Draw-Block $graphics $orange 20 25 3 3 $scale
  $file = Join-Path $outputDirectory "chicken-$size.png"
  $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  foreach ($brush in @($background, $shell, $yellow, $light, $dark, $orange, $red)) { $brush.Dispose() }
}
