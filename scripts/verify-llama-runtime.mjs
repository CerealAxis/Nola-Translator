// Verifies that the extracted llama.cpp runtime carries every library the server loads.
//
// The list of required files in the fetch script is a hand written summary and it drifts:
// llama.cpp renamed and split its libraries, and a check that names the wrong file reports
// a runtime that is present as missing while a library the server actually needs can be
// absent. Reading the import table of the executable answers the question directly, so a
// library that is not in the archive is named here instead of on a user's machine.
//
// Usage: node scripts/verify-llama-runtime.mjs <runtime-directory>

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const directory = resolve(process.argv[2] ?? '')
if (!existsSync(directory)) {
  console.error(`Runtime directory does not exist: ${directory}`)
  process.exit(1)
}

const runtimeFiles = new Map()
for (const name of readdirSync(directory)) runtimeFiles.set(name.toLowerCase(), join(directory, name))

// The CPU backend is one library per microarchitecture and the loader picks the one the
// running CPU supports, so the archive has to carry the family rather than a fixed name.
if (![...runtimeFiles.keys()].some((name) => name.startsWith('ggml-cpu') && name.endsWith('.dll'))) {
  console.error('Vulkan runtime archive has no CPU backend library.')
  process.exit(1)
}

function readImports(path) {
  const data = readFileSync(path)
  if (data.readUInt32LE(0x3c) + 4 > data.length) return []
  const peOffset = data.readUInt32LE(0x3c)
  if (data.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error(`Not a PE file: ${path}`)
  }
  const sectionCount = data.readUInt16LE(peOffset + 6)
  const optionalSize = data.readUInt16LE(peOffset + 20)
  const optionalOffset = peOffset + 24
  const magic = data.readUInt16LE(optionalOffset)
  // The import table is the second data directory, at a different offset in PE32 and PE32+.
  const directoryOffset = optionalOffset + (magic === 0x20b ? 112 : 96)
  const importRva = data.readUInt32LE(directoryOffset + 8)

  const sections = []
  const sectionOffset = optionalOffset + optionalSize
  for (let index = 0; index < sectionCount; index++) {
    const base = sectionOffset + index * 40
    const virtualSize = data.readUInt32LE(base + 8)
    const virtualAddress = data.readUInt32LE(base + 12)
    const rawSize = data.readUInt32LE(base + 16)
    const rawAddress = data.readUInt32LE(base + 20)
    sections.push({ virtualAddress, span: Math.max(virtualSize, rawSize), rawAddress })
  }
  const toOffset = (rva) => {
    for (const section of sections) {
      if (rva >= section.virtualAddress && rva < section.virtualAddress + section.span) {
        return section.rawAddress + (rva - section.virtualAddress)
      }
    }
    return -1
  }

  const imports = []
  let offset = toOffset(importRva)
  // The import directory ends with an all zero descriptor, and every read below stays inside
  // the file, so a malformed image fails the build instead of spinning.
  while (offset >= 0 && offset + 20 <= data.length) {
    const nameRva = data.readUInt32LE(offset + 12)
    if (nameRva === 0) break
    const nameOffset = toOffset(nameRva)
    if (nameOffset < 0 || nameOffset >= data.length) break
    const end = data.indexOf(0, nameOffset)
    if (end < 0) throw new Error(`Runtime library name is not terminated: ${path}`)
    imports.push(data.toString('ascii', nameOffset, end))
    offset += 20
  }
  return imports
}

// The Windows libraries the runtime is allowed to expect from the machine rather than the archive.
const systemDirectory = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
const visualCppRuntime = new Set([
  'vcruntime140.dll', 'vcruntime140_1.dll', 'vcruntime140_2.dll',
  'msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll',
])
const isSystemLibrary = (name) => {
  const lower = name.toLowerCase()
  if (lower.startsWith('api-ms-win-') || lower.startsWith('ext-ms-')) return true
  if (visualCppRuntime.has(lower)) return true
  return existsSync(join(systemDirectory, name))
}

const entry = 'llama-server.exe'
if (!runtimeFiles.has(entry)) {
  console.error(`Runtime archive has no ${entry}.`)
  process.exit(1)
}

const missing = new Set()
const visited = new Set()
const pending = [entry]
while (pending.length > 0) {
  const current = pending.pop()
  const key = current.toLowerCase()
  if (visited.has(key)) continue
  visited.add(key)
  const path = runtimeFiles.get(key)
  if (!path) {
    missing.add(current)
    continue
  }
  for (const dependency of readImports(path)) {
    if (isSystemLibrary(dependency)) continue
    if (runtimeFiles.has(dependency.toLowerCase())) pending.push(dependency)
    else missing.add(dependency)
  }
}

if (missing.size > 0) {
  console.error(`Runtime archive is missing libraries the server loads: ${[...missing].sort().join(', ')}`)
  process.exit(1)
}
console.log('llama server dependencies resolve inside the runtime directory.')
