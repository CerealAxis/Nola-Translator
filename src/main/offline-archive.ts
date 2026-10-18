import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { OfflineProgress } from './offline-manager'

// Stream ZIP64 entries instead of buffering multi-gigabyte model weights in Electron.
const script = String.raw`import json,os,pathlib,shutil,stat,sys,zipfile
mode,source,destination=sys.argv[1:]
done=0
def report(total,name):
 print(json.dumps({'current':done,'total':total,'detail':name}),flush=True)
if mode=='pack':
 root=pathlib.Path(source)
 files=sorted(p for p in root.rglob('*') if p.is_file())
 assert not any(p.is_symlink() for p in root.rglob('*')), 'Links are forbidden'
 total=sum(p.stat().st_size for p in files)
 report(total,'')
 with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as archive:
  for path in files:
   name=path.relative_to(root).as_posix()
   with path.open('rb') as src,archive.open(name,'w',force_zip64=True) as dst:
    while True:
     chunk=src.read(4*1024*1024)
     if not chunk: break
     dst.write(chunk)
     done+=len(chunk)
     report(total,name)
else:
 root=pathlib.Path(destination).resolve()
 with zipfile.ZipFile(source) as archive:
  members=archive.infolist()
  assert 0<len(members)<=100000, 'Invalid entry count'
  seen=set()
  for entry in members:
   name=entry.orig_filename
   assert name==entry.filename, 'Non-canonical path'
   parts=name.rstrip('/').split('/')
   assert name and not name.startswith('/') and '\\' not in name and ':' not in name and '\x00' not in name, 'Invalid path'
   assert all(p and p not in ('.','..') and p==p.rstrip(' .') and not any(c in p for c in '<>"|?*') and not any(ord(c)<32 for c in p) for p in parts), 'Invalid path'
   assert all(p.split('.')[0].upper() not in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]} for p in parts), 'Invalid device path'
   assert not stat.S_ISLNK(entry.external_attr>>16) and not (entry.flag_bits&1), 'Invalid entry type'
   key=name.rstrip('/').casefold()
   assert key not in seen, 'Duplicate path'
   seen.add(key)
   assert (root/pathlib.PurePosixPath(name)).resolve().is_relative_to(root), 'Path escapes package'
  total=sum(e.file_size for e in members)
  assert shutil.disk_usage(root).free>=total, 'insufficientSpace'
  report(total,'')
  for entry in members:
   target=root/pathlib.PurePosixPath(entry.filename)
   if entry.is_dir():
    target.mkdir(parents=True,exist_ok=True)
    continue
   target.parent.mkdir(parents=True,exist_ok=True)
   with archive.open(entry) as src,target.open('xb') as dst:
    while True:
     chunk=src.read(4*1024*1024)
     if not chunk: break
     dst.write(chunk)
     done+=len(chunk)
     report(total,entry.filename)
report(total,'')
`

export async function offlineArchive(python: string, mode: 'pack' | 'extract', source: string, destination: string, signal: AbortSignal, progress: OfflineProgress): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, ['-I', '-u', '-c', script, mode, source, destination], {
      windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' },
    })
    let error = ''
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => {
      try {
        const event: unknown = JSON.parse(line)
        if (event && typeof event === 'object' && 'current' in event && 'total' in event && typeof event.current === 'number' && typeof event.total === 'number') {
          progress(mode, event.current, event.total, 'detail' in event && typeof event.detail === 'string' ? event.detail : undefined)
        }
      } catch { /* Ignore incomplete worker diagnostics; exit status determines success. */ }
    })
    child.stderr.on('data', chunk => { error = (error + String(chunk)).slice(-4096) })
    let failure: Error | undefined
    child.once('error', error => { failure = error })
    child.once('close', code => {
      lines.close()
      if (failure) reject(failure)
      else if (code === 0) resolve()
      else reject(Object.assign(new Error(error || `ZIP worker exited with ${code}`), { issue: error.includes('insufficientSpace') ? 'insufficientSpace' : 'invalidPackage' }))
    })
  })
}
