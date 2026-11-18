import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

export async function startScreenCaptureBackend() {
  const script = `
import socket
import sys
from fastapi import FastAPI
import uvicorn
sys.path.insert(0, "engine")
from nola_translator_engine.backend.screen_capture import build_screen_capture_router
app = FastAPI()
app.include_router(build_screen_capture_router(), prefix="/api/v2")
with socket.socket() as socket:
    socket.bind(("127.0.0.1", 0))
    socket.listen()
    print(socket.getsockname()[1], flush=True)
    uvicorn.Server(uvicorn.Config(app, log_level="error")).run(sockets=[socket])
`
  const python = process.env.NOLA_SCREEN_TEST_PYTHON || resolve('.venv/Scripts/python.exe')
  const child = spawn(python, ['-u', '-c', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let diagnostics = ''
  child.stderr.on('data', chunk => { diagnostics += chunk })
  const lines = createInterface({ input: child.stdout })
  let port
  try {
    port = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`Capture backend exited (${code}): ${diagnostics}`)))
      lines.once('line', line => /^\d+$/.test(line) ? resolve(Number(line)) : reject(new Error(line)))
    })
  } catch (error) {
    child.kill()
    throw error
  } finally {
    lines.close()
  }
  const url = `http://127.0.0.1:${port}/api/v2/screen/capture`
  return {
    async capture(request, signal) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    },
    close() { child.kill() },
  }
}
