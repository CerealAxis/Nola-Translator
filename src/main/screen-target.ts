import { spawn } from 'node:child_process'
import { screen } from 'electron'
import type { Rectangle } from 'electron'

export interface ScreenTargetState {
  available: boolean; foreground: boolean; identity: string; bounds: Rectangle
  candidates: Array<{ bounds: Rectangle; width: number; height: number }>
}

/** Query native window identity and geometry in one hidden, long-lived Windows helper. */
export function observeScreenWindow(sourceId: string, changed: (state: ScreenTargetState) => void, failed: () => void): () => void {
  const handle = /^window:(\d+):\d+$/.exec(sourceId)?.[1]
  if (process.platform !== 'win32' || !handle) { failed(); return () => {} }
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class NolaScreenTarget {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out Rect rect, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Position; public uint Private; }
  public delegate void WinEventProc(IntPtr hook, uint eventType, IntPtr window, int objectId, int childId, uint threadId, uint time);
  [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc callback, uint processId, uint threadId, uint flags);
  [DllImport("user32.dll")] public static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
  public static long Destroyed;
  public static bool Watching;
  private static WinEventProc callback;
  public static void Watch(IntPtr target) {
    var started = new ManualResetEvent(false);
    callback = delegate(IntPtr hook, uint eventType, IntPtr window, int objectId, int childId, uint threadId, uint time) {
      if (window == target && objectId == 0) Interlocked.Increment(ref Destroyed);
    };
    var thread = new Thread(delegate() {
      Watching = SetWinEventHook(0x8001, 0x8001, IntPtr.Zero, callback, 0, 0, 0) != IntPtr.Zero;
      started.Set();
      Message message;
      while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) {}
    });
    thread.IsBackground = true; thread.Start(); started.WaitOne(3000);
  }
}
'@
[void][NolaScreenTarget]::SetProcessDPIAware()
$targetHandle = [IntPtr]${handle}
[NolaScreenTarget]::Watch($targetHandle)
while ($true) {
  $rect = New-Object NolaScreenTarget+Rect
  [uint32]$targetPid = 0
  [void][NolaScreenTarget]::GetWindowThreadProcessId($targetHandle, [ref]$targetPid)
  $valid = [NolaScreenTarget]::IsWindow($targetHandle) -and [NolaScreenTarget]::IsWindowVisible($targetHandle) -and -not [NolaScreenTarget]::IsIconic($targetHandle) -and [NolaScreenTarget]::GetWindowRect($targetHandle, [ref]$rect)
  $visual = New-Object NolaScreenTarget+Rect
  if ([NolaScreenTarget]::DwmGetWindowAttribute($targetHandle, 9, [ref]$visual, 16) -eq 0) { $rect = $visual }
  $client = New-Object NolaScreenTarget+Rect
  $origin = New-Object NolaScreenTarget+Point
  [void][NolaScreenTarget]::GetClientRect($targetHandle, [ref]$client)
  [void][NolaScreenTarget]::ClientToScreen($targetHandle, [ref]$origin)
  $class = New-Object System.Text.StringBuilder 256
  $title = New-Object System.Text.StringBuilder 1024
  [void][NolaScreenTarget]::GetClassName($targetHandle, $class, 256)
  [void][NolaScreenTarget]::GetWindowText($targetHandle, $title, 1024)
  $started = ''; try { $started = [System.Diagnostics.Process]::GetProcessById($targetPid).StartTime.ToUniversalTime().Ticks.ToString() } catch {}
  $identity = "$targetPid|$started|$class|$([NolaScreenTarget]::Destroyed)"
  @{ available=($valid -and [NolaScreenTarget]::Watching); foreground=([NolaScreenTarget]::GetForegroundWindow() -eq $targetHandle); identity=$identity; x=$rect.Left; y=$rect.Top; width=($rect.Right-$rect.Left); height=($rect.Bottom-$rect.Top); clientX=$origin.X; clientY=$origin.Y; clientWidth=$client.Right; clientHeight=$client.Bottom } | ConvertTo-Json -Compress
  Start-Sleep -Milliseconds 100
}`
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let buffer = '', disposed = false
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    buffer += chunk
    if (buffer.length > 65536) { child.kill(); return }
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1); newline = buffer.indexOf('\n')
      try {
        const value = JSON.parse(line)
        if (![value.x, value.y, value.width, value.height, value.clientX, value.clientY, value.clientWidth, value.clientHeight].every(Number.isFinite) || typeof value.identity !== 'string') continue
        const physical = { x: value.x, y: value.y, width: Math.max(1, value.width), height: Math.max(1, value.height) }
        const client = { x: value.clientX, y: value.clientY, width: Math.max(1, value.clientWidth), height: Math.max(1, value.clientHeight) }
        changed({ available: value.available === true && value.width > 0 && value.height > 0, foreground: value.foreground === true,
          identity: value.identity, bounds: screen.screenToDipRect(null, physical),
          candidates: [physical, client].map(bounds => ({ bounds: screen.screenToDipRect(null, bounds), width: bounds.width, height: bounds.height })),
        })
      } catch { /* Native initialization diagnostics are not protocol frames. */ }
    }
  })
  child.stderr.on('data', () => {})
  child.once('error', () => { if (!disposed) failed() })
  child.once('exit', () => { if (!disposed) failed() })
  return () => { disposed = true; child.kill() }
}
