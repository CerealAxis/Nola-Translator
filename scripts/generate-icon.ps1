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
$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 0, 103, 192))
$foreground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddArc(24, 24, 44, 44, 180, 90)
$path.AddArc(188, 24, 44, 44, 270, 90)
$path.AddArc(188, 188, 44, 44, 0, 90)
$path.AddArc(24, 188, 44, 44, 90, 90)
$path.CloseFigure()
$graphics.FillPath($background, $path)
$font = [System.Drawing.Font]::new('Segoe UI Variable Display', 132, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('F', $font, $foreground, [System.Drawing.RectangleF]::new(24, 14, 208, 218), $format)

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
$format.Dispose()
$font.Dispose()
$foreground.Dispose()
$background.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$png.Dispose()
