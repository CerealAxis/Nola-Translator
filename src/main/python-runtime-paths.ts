import { join } from 'node:path'

/** Keep component imports and their Windows native dependencies on the same search roots. */
export function pythonRuntimePaths(importPaths: string[], pythonDirectory: string, componentDirectory?: string): string {
  const nativeDirectories = [pythonDirectory]
  if (componentDirectory) nativeDirectories.push(componentDirectory, join(componentDirectory, 'Library', 'bin'), join(componentDirectory, 'bin'))
  // Torch 2.3.x looks under sys.exec_prefix/Library/bin, which excludes pip --target installs.
  // Keep AddDllDirectory handles alive throughout inference, not just during the import.
  // Source: https://github.com/pytorch/pytorch/blob/v2.3.1/torch/__init__.py
  return `import os,sys; sys.path[:0] = ${JSON.stringify(importPaths)}; _nola_dll_handles = [os.add_dll_directory(p) for p in ${JSON.stringify(nativeDirectories)} if os.path.isdir(p)]`
}
