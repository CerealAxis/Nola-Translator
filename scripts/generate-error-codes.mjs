/**
 * The engine protocol owns the list of error codes the wire can carry, and the TypeScript copies
 * of that list used to be maintained by hand. A hand copy drifts silently: an engine code that
 * missed `src/shared/schemas.ts` was rejected by the runtime gate, and the engine was killed for
 * emitting a code it had just been taught. Both copies are therefore generated from
 * `engine/nola_translator_engine/protocol.py`, which is the only place the list is written.
 *
 * Usage:
 *   node scripts/generate-error-codes.mjs          # rewrite both TypeScript copies
 *   node scripts/generate-error-codes.mjs --check  # verify the copies match the engine table
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'engine/nola_translator_engine/protocol.py')
const CONTRACTS = join(ROOT, 'src/shared/contracts.ts')
const SCHEMAS = join(ROOT, 'src/shared/schemas.ts')
const CHECK_ONLY = process.argv.includes('--check')

const CONTRACTS_PATTERN = /export type EngineErrorCode =\r?\n(?:  \| '[^']+'\r?\n)+/
const SCHEMAS_PATTERN = /const errorCodes = \[\r?\n(?:  '[^']+',\r?\n)+\] as const/

/** Repository paths are written with forward slashes, whatever the host platform uses. */
function displayPath(path) {
  return relative(ROOT, path).split(sep).join('/')
}

function fail(message) {
  console.error(`generate-error-codes: ${message}`)
  process.exit(1)
}

/** Reads the `ErrorCode = Literal[...]` block and returns the code names in protocol order. */
function readEngineErrorCodes() {
  const source = readFileSync(SOURCE, 'utf8')
  const header = 'ErrorCode = Literal['
  const start = source.indexOf(header)
  if (start < 0) fail(`${displayPath(SOURCE)} has no "ErrorCode = Literal[" block`)
  const bodyStart = start + header.length
  const end = source.indexOf('\n]', bodyStart)
  if (end < 0) fail(`the "ErrorCode = Literal[" block in ${displayPath(SOURCE)} is not closed`)
  const codes = []
  for (const line of source.slice(bodyStart, end).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^"([A-Za-z][A-Za-z0-9]*)"/.exec(trimmed)
    if (!match) fail(`unexpected line in the error code block of ${displayPath(SOURCE)}: ${trimmed}`)
    codes.push(match[1])
  }
  if (codes.length === 0) fail(`the error code block in ${displayPath(SOURCE)} lists no codes`)
  const repeated = [...new Set(codes.filter((code, index) => codes.indexOf(code) !== index))]
  if (repeated.length > 0) fail(`the error code block in ${displayPath(SOURCE)} repeats: ${repeated.join(', ')}`)
  return codes
}

function contractsBlock(codes, eol) {
  return `export type EngineErrorCode =${eol}${codes.map(code => `  | '${code}'`).join(eol)}${eol}`
}

function schemasBlock(codes, eol) {
  return `const errorCodes = [${eol}${codes.map(code => `  '${code}',`).join(eol)}${eol}] as const`
}

/** The generated block keeps the line ending of the file it is written into. */
function detectEol(content) {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function readCodes(content, pattern) {
  const match = pattern.exec(content)
  if (!match) return []
  return [...match[0].matchAll(/'([^']+)'/g)].map(entry => entry[1])
}

function main() {
  const codes = readEngineErrorCodes()
  const targets = [
    { path: CONTRACTS, pattern: CONTRACTS_PATTERN, build: contractsBlock },
    { path: SCHEMAS, pattern: SCHEMAS_PATTERN, build: schemasBlock },
  ]
  const drifted = []
  for (const target of targets) {
    const name = displayPath(target.path)
    const content = readFileSync(target.path, 'utf8')
    if (!target.pattern.test(content)) fail(`${name} has no generated error code block to update`)
    const expected = content.replace(target.pattern, () => target.build(codes, detectEol(content)))
    if (expected === content) continue
    if (CHECK_ONLY) {
      drifted.push({
        name,
        missing: codes.filter(code => !readCodes(content, target.pattern).includes(code)),
        unexpected: readCodes(content, target.pattern).filter(code => !codes.includes(code)),
      })
      continue
    }
    writeFileSync(target.path, expected)
  }
  if (drifted.length > 0) {
    for (const entry of drifted) {
      console.error(`${entry.name} does not match the engine error code table`)
      if (entry.missing.length > 0) console.error(`  missing: ${entry.missing.join(', ')}`)
      if (entry.unexpected.length > 0) console.error(`  unexpected: ${entry.unexpected.join(', ')}`)
    }
    process.exit(1)
  }
  const action = CHECK_ONLY ? 'verified' : 'wrote'
  console.log(`error codes: ${codes.length} from ${displayPath(SOURCE)} → ${action} ${targets.map(target => displayPath(target.path)).join(', ')}`)
}

main()
