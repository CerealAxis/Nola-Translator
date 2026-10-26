import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppInfo } from 'app-builder-lib/out/appInfo.js'
import { getWindowsInstallationDirName } from 'app-builder-lib/out/targets/targetUtil.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { build } = metadata
const appInfo = new AppInfo({ metadata, config: build }, undefined, build.win)
const appFilename = getWindowsInstallationDirName(appInfo, !build.nsis.oneClick || build.nsis.perMachine === true)
const templates = join(root, 'node_modules/app-builder-lib/templates/nsis')
const include = resolve(root, build.nsis.include)

function findCompiler(directory, depth = 0) {
  if (!existsSync(directory)) return null
  const executable = join(directory, 'makensis.exe')
  if (existsSync(executable)) return executable
  if (depth === 2) return null
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const found = findCompiler(join(directory, entry.name), depth + 1)
      if (found) return found
    }
  }
  return null
}

const compiler = process.argv[2] || findCompiler(join(process.env.LOCALAPPDATA ?? '', 'electron-builder/Cache/nsis-3.0.4.1'))
assert.ok(process.platform === 'win32' && compiler, 'Run on Windows with cached NSIS, or pass the path to makensis.exe')
assert.equal(build.nsis.oneClick, false)
assert.equal(build.nsis.allowToChangeInstallationDirectory, true)

// Compile the installed electron-builder template and the project's actual include. The only
// template change captures its final callback so the harness can run it without an interactive UI.
const assisted = readFileSync(join(templates, 'assistedInstaller.nsh'), 'utf8')
const marker = '!insertmacro MUI_PAGE_INSTFILES'
assert.ok(assisted.includes(marker), 'electron-builder changed its install page; review this harness')
const patchedAssisted = assisted.replace(marker, `!define TEST_INSTALL_PRE "\${MUI_PAGE_CUSTOMFUNCTION_PRE}"\n  ${marker}`)
const customPages = [...readFileSync(include, 'utf8').matchAll(/^\s*Page custom (\w+)\s*$/gm)]
  .map(match => `Call ${match[1]}`).join('\n')

const cases = [
  ['registered install survives a directory-page edit', 'D:\\UserChanged', 'C:\\Program Files\\NolaTranslator\\App', 'C:\\Program Files\\NolaTranslator\\App'],
  ['existing compact name', 'C:\\Program Files\\NolaTranslator\\App', 'C:\\Program Files\\NolaTranslator\\App'],
  ['existing product name', 'C:\\Program Files\\Nola Translator\\App', 'C:\\Program Files\\Nola Translator\\App'],
  ['custom install root', 'D:\\Tools\\Captions', 'D:\\Tools\\Captions\\App'],
  ['parent containing product name', 'D:\\Nola Translator Archives\\Captions', 'D:\\Nola Translator Archives\\Captions\\App'],
  ['case insensitive App', 'D:\\Tools\\Captions\\app', 'D:\\Tools\\Captions\\app'],
  ['trailing separator', 'D:\\Tools\\Captions\\App\\', 'D:\\Tools\\Captions\\App'],
  ['multiple trailing separators', 'D:\\Tools\\Captions\\App\\\\', 'D:\\Tools\\Captions\\App'],
  ['drive root', 'D:\\', 'D:\\App'],
  ['UNC install root', '\\\\server\\share\\Captions', '\\\\server\\share\\Captions\\App'],
  ['literal dollar in root', 'D:\\Tools\\Nola $Archive', 'D:\\Tools\\Nola $Archive\\App'],
  ['Unicode install root', 'D:\\软件\\字幕工具', 'D:\\软件\\字幕工具\\App'],
]

function nsis(value) {
  return value.replaceAll('$', () => '$$').replaceAll('"', '$\\"')
}

mkdirSync(join(root, 'artifacts'), { recursive: true })
const directory = mkdtempSync(join(root, 'artifacts/installer-paths-'))
writeFileSync(join(directory, 'assistedInstaller.nsh'), patchedAssisted)
const checks = cases.map(([name, input, , existingInstallDir = '']) => `
  StrCpy $INSTDIR "${nsis(input)}"
  StrCpy $NolaExistingInstallDir "${nsis(existingInstallDir)}"
  !insertmacro testInstallPre
  FileWriteUTF16LE $R0 "${name}$\\t$INSTDIR$\\r$\\n"
  !insertmacro testInstallPre
  FileWriteUTF16LE $R0 "${name} repeated$\\t$INSTDIR$\\r$\\n"`).join('\n')

writeFileSync(join(directory, 'paths.nsi'), `
Unicode true
Name "Nola install path regression"
OutFile "paths.exe"
RequestExecutionLevel user
SilentInstall silent
!define APP_FILENAME "${nsis(appFilename)}"
!define INSTALL_MODE_PER_ALL_USERS
!define HIDE_RUN_AFTER_FINISH
!define allowToChangeInstallationDirectory
!include "MUI2.nsh"
!include "${nsis(include)}"
!macro skipPageIfUpdated
!macroend
!include "${nsis(join(directory, 'assistedInstaller.nsh'))}"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
!macro testInstallPre
  ${customPages}
  Call \${TEST_INSTALL_PRE}
!macroend
Function .onInit
  FileOpen $R0 "$EXEDIR\\result.tsv" w
  FileWriteUTF16LE $R0 "data root$\\t\${NOLA_DATA_ROOT}$\\r$\\n"
  ${checks}
  FileClose $R0
  SetErrorLevel 0
  Quit
FunctionEnd
Section
  DetailPrint "$(nolaUninstallDeleteData)"
  DetailPrint "$(nolaUninstallKeepingData)"
  DetailPrint "$(nolaUninstallRemovingData)"
SectionEnd
`)

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stdout + result.stderr)
}

run(compiler, ['/WX', '/INPUTCHARSET', 'UTF8', '/V2', `/X!addincludedir "${templates}"`, `/X!addincludedir "${join(templates, 'include')}"`, 'paths.nsi'])
run(join(directory, 'paths.exe'), ['/S'])
const results = new Map(readFileSync(join(directory, 'result.tsv'), 'utf16le').trim().split(/\r?\n/).map(line => line.split('\t')))
const failures = []
assert.equal(results.get('data root'), join(process.env.LOCALAPPDATA, 'Programs', appInfo.productName), 'Installer data root must match the application data root')
for (const [name, , expected] of cases) {
  for (const label of [name, `${name} repeated`]) {
    if (results.get(label) !== expected) failures.push(`${label}: expected ${expected}, received ${results.get(label)}`)
  }
}
assert.equal(failures.length, 0, failures.join('\n'))
console.log(`NSIS install paths: ${cases.length * 2 + 1} checks passed (${directory})`)
