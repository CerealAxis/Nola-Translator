$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'build'
$outputPath = Join-Path $outputDirectory 'icon.ico'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Point]::new(40, 28),
    [System.Drawing.Point]::new(216, 208),
    [System.Drawing.Color]::FromArgb(255, 22, 139, 217),
    [System.Drawing.Color]::FromArgb(255, 34, 85, 199)
)
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddLine(72, 24, 184, 24)
$path.AddBezier(184, 24, 210, 24, 232, 46, 232, 72)
$path.AddLine(232, 72, 232, 152)
$path.AddBezier(232, 152, 232, 179, 211, 200, 184, 200)
$path.AddLine(184, 200, 113, 200)
$path.AddLine(113, 200, 71.6, 231.05)
$path.AddBezier(71.6, 231.05, 68.3, 233.5, 63.6, 231, 63.6, 227)
$path.AddLine(63.6, 227, 63.6, 199)
$path.AddBezier(63.6, 199, 41, 195, 24, 176, 24, 152)
$path.AddLine(24, 152, 24, 72)
$path.AddBezier(24, 72, 24, 45, 45, 24, 72, 24)
$path.CloseFigure()
$graphics.FillPath($background, $path)
$nolaPen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 20)
$nolaPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$nolaPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$nolaPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawLine($nolaPen, 84, 152, 84, 72)
$graphics.DrawLine($nolaPen, 84, 72, 172, 152)
$graphics.DrawLine($nolaPen, 172, 152, 172, 72)
$replyPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 151, 240, 218), 20)
$replyPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$replyPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($replyPen, 172, 72, 172, 91.5)

$png = [System.IO.MemoryStream]::new()
$bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $png.ToArray()
$file = [System.IO.File]::Create($outputPath)
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$bytes.Length)
$writer.Write([uint32]22)
$writer.Write($bytes)
$writer.Dispose()
$replyPen.Dispose()
$nolaPen.Dispose()
$background.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$png.Dispose()
