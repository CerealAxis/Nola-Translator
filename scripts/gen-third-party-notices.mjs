/**
 * 生成 THIRD_PARTY_NOTICES.md（`npm run gen:notices`）。
 *
 * 归属声明里的每一条都必须是**从依赖元数据派生出来的事实**，不是人手抄的文本。
 * 本仓库已经吃过这个亏：手写 notices 里的 PyInstaller 条目是假的（引擎并非 PyInstaller 打包），
 * Fluent UI 条目早已过时，而 engine/requirements.lock 相对真实发布集早已过期。
 * 手写文件会把这些错误永久沉淀，且没有任何机制能发现。
 *
 * 三棵依赖树，各自的判定依据不同：
 *
 *   1. 渲染进程 JS —— electron.vite.config.ts 的 renderer 段既没有 externalizeDepsPlugin()
 *      也没有 rollupOptions.external，所以 Vite 会把 node_modules 全量 bundle 进 out/renderer；
 *      而 build.files 只含 out 目录与 package.json，node_modules 不进 asar。
 *      起点是 package.json 的 dependencies，递归展开已安装包的 dependencies/optionalDependencies。
 *
 *   2. 平台运行时 —— build.electronDist 指向 node_modules/electron/dist，Electron 随安装包分发。
 *      Chromium 与 Node.js 随 Electron 一同分发，各自单列。
 *
 *   3. Python 引擎 —— scripts/build-python-runtime.py 是 shutil.copytree 整份私有 CPython +
 *      site-packages 随包分发，**不是** PyInstaller 打包，所以 PyInstaller 及其 bootloader
 *      exception 不在本文件里。起点是 engine/pyproject.toml 的 [project].dependencies，
 *      闭包从 .venv 的 dist-info/METADATA 的 Requires-Dist 递归展开。
 *
 * 幂等：输出只依赖磁盘上的依赖元数据，同一状态下连续运行两次字节完全一致。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')
const SITE_PACKAGES = join(ROOT, '.venv', 'Lib', 'site-packages')
const OUTPUT = join(ROOT, 'THIRD_PARTY_NOTICES.md')

/**
 * `--check` reports whether the committed file still matches the dependencies and exits
 * non-zero when it does not, without touching it. The notice travels into the app through a
 * `?raw` import, so a stale file ships stale attribution rather than failing the build.
 */
const CHECK_ONLY = process.argv.includes('--check')

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** 收集过程中的异常，全部打印到 stderr 而不是静默丢弃 —— 漏报一条许可证是分发事故。 */
const unresolved = []
const manifestFallbacks = []
const embeddedTexts = []
const excluded = []

function report(kind, subject, detail) {
  if (kind === 'unresolved') unresolved.push(`${subject} —— ${detail}`)
  else if (kind === 'manifest') manifestFallbacks.push(`${subject} —— ${detail}`)
  else if (kind === 'embedded') embeddedTexts.push(`${subject} —— ${detail}`)
  else excluded.push(`${subject} —— ${detail}`)
}

function readText(path) {
  try {
    // 许可证正文一律按 LF 输出：源文件里 CRLF 与 LF 混杂（Pillow 系老包用 CRLF，
    // MarkupSafe 只在首行用 CRLF），原样透传会让同一份内容在不同机器上产生不同字节。
    // 只归一化行尾符，不动任何折行与措辞。
    return readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')
  } catch {
    return null
  }
}

function exists(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** 按后缀优先级取目录下的许可证文件；同一优先级内按文件名排序以保证幂等。 */
function findLicenseFile(directory, patterns) {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return null
  }
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  for (const pattern of patterns) {
    const matches = files.filter((name) => pattern(name)).sort()
    if (matches.length > 0) {
      return { name: matches[0], path: join(directory, matches[0]), siblings: matches }
    }
  }
  return null
}

const isLicenseName = (name) => /^(LICEN[CS]E|COPYING|NOTICE)/i.test(name)

// ---------------------------------------------------------------------------
// 内嵌常量：分发物里没有独立许可证文件、但确实随包分发的组件正文。
// 每段文本都注明了出处 URL 与对应版本，正文逐字照抄自该出处。
// ---------------------------------------------------------------------------

const CHROMIUM_VERSION = '150.0.7871.114'
const NODE_VERSION = '24.18.0'
const CPYTHON_VERSION = '3.13.9'
const LLAMA_BUILD = 'b11211'

// https://chromium.googlesource.com/chromium/src/+/refs/tags/150.0.7871.114/LICENSE
// Chromium 150.0.7871.114（Electron 43.1.1 内置版本，见 https://releases.electronjs.org/release/v43.1.1）
const CHROMIUM_LICENSE = `// Copyright 2015 The Chromium Authors
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
//     * Neither the name of Google LLC nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`

// https://raw.githubusercontent.com/nodejs/node/v24.18.0/LICENSE
// Node.js 24.18.0（Electron 43.1.1 内置版本）。只取 Node 自身的 MIT 正文，
// Node LICENSE 里逐项罗列的 deps/* / tools/* 外部维护库由各自的发行包自行附带声明。
const NODE_LICENSE = `Node.js is licensed for use as follows:

"""
Copyright Node.js contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
"""

This license applies to parts of Node.js originating from the
https://github.com/joyent/node repository:

"""
Copyright Joyent, Inc. and other Node contributors. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
"""

The Node.js license applies to all parts of Node.js that are not externally
maintained libraries.`

// https://raw.githubusercontent.com/python/cpython/v3.13.9/LICENSE
// CPython 3.13.9，引擎自带一整份私有 CPython（scripts/build-python-runtime.py 复制 base prefix）。
// PSF License Version 2 为主体，连同随发行版携带的历史条款（BeOpen / CNRI / CWI / Zero-Clause BSD）。
const CPYTHON_LICENSE = `PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2
--------------------------------------------

1. This LICENSE AGREEMENT is between the Python Software Foundation
("PSF"), and the Individual or Organization ("Licensee") accessing and
otherwise using this software ("Python") in source or binary form and
its associated documentation.

2. Subject to the terms and conditions of this License Agreement, PSF hereby
grants Licensee a nonexclusive, royalty-free, world-wide license to reproduce,
analyze, test, perform and/or display publicly, prepare derivative works,
distribute, and otherwise use Python alone or in any derivative version,
provided, however, that PSF's License Agreement and PSF's notice of copyright,
i.e., "Copyright (c) 2001-2024 Python Software Foundation; All Rights Reserved"
are retained in Python alone or in any derivative version prepared by Licensee.

3. In the event Licensee prepares a derivative work that is based on
or incorporates Python or any part thereof, and wants to make
the derivative work available to others as provided herein, then
Licensee hereby agrees to include in any such work a brief summary of
the changes made to Python.

4. PSF is making Python available to Licensee on an "AS IS"
basis.  PSF MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, PSF MAKES NO AND
DISCLAIMS ANY REPRESENTATION OR WARRANTY OF MERCHANTABILITY OR FITNESS
FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF PYTHON WILL NOT
INFRINGE ANY THIRD PARTY RIGHTS.

5. PSF SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON
FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS
A RESULT OF MODIFYING, DISTRIBUTING, OR OTHERWISE USING PYTHON,
OR ANY DERIVATIVE THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

6. This License Agreement will automatically terminate upon a material
breach of its terms and conditions.

7. Nothing in this License Agreement shall be deemed to create any
relationship of agency, partnership, or joint venture between PSF and
Licensee. This License Agreement does not grant permission to use PSF
trademarks or trade name in a trademark sense to endorse or promote
products or services of Licensee, or any third party.

8. By copying, installing or otherwise using Python, Licensee
agrees to be bound by the terms and conditions of this License
Agreement.`

// https://raw.githubusercontent.com/ggml-org/llama.cpp/b11211/LICENSE
// llama.cpp b11211，CPU x64 轮次（scripts/fetch-llama-cpu.ps1 取 llama-b11211-bin-win-cpu-x64.zip）。
const LLAMA_LICENSE = `MIT License

Copyright (c) 2023-2024 The ggml authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

// ---------------------------------------------------------------------------
// 树 1：渲染进程 JS
// ---------------------------------------------------------------------------

/**
 * License headers are centred with leading spaces — Apache-2.0 indents its title by 33
 * columns — which reads as a ragged left edge once the notice is shown in the settings
 * dialog. Dropping the leading whitespace of every line leaves the terms unchanged and the
 * column flush left.
 */
const alignLeft = (text) => text.replace(/^[ \t]+/gm, '')

const entries = new Map()

function addEntry(name, version, licenseText, origin) {
  const key = `${name} ${version}`
  const existing = entries.get(key)
  if (existing) {
    // 同一「包名 + 版本」只出现一次；重复到达时保留先到的那份正文。
    existing.merged.push(origin)
    return
  }
  entries.set(key, { name, version, licenseText: alignLeft(licenseText), origin, merged: [] })
}

/**
 * @heroui/react 与 @heroui/styles 的 package.json 都还写着 "license": "MIT"，
 * 那是 v2 时代的过时元数据；随包的 LICENSE 是 Apache-2.0 全文。
 * 解析顺序把文件排在 manifest 字段之前，正是为了拿到这里的真实条款。
 * 下面这行是断言，不是注释：万一解析顺序被改坏，生成器会直接失败而不是静默写出错误的许可证。
 */
const HERUI_EXPECTATIONS = new Map([
  ['@heroui/react', 'Apache License'],
  ['@heroui/styles', 'Apache License'],
])

function collectRendererTree() {
  const roots = Object.keys(manifest.dependencies ?? {})
  const rootSet = new Set(roots)
  const devSet = new Set(Object.keys(manifest.devDependencies ?? {}))
  const included = new Set()

  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.shift()
    if (included.has(name)) continue
    included.add(name)

    const packageDir = join(ROOT, 'node_modules', name)
    let pkg
    try {
      pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    } catch {
      report('unresolved', name, 'node_modules 下没有可读的 package.json，无法确认版本')
      continue
    }

    if (devSet.has(name)) {
      report('excluded', name, '同时出现在 devDependencies 中，产物内不存在')
      continue
    }

    const found = findLicenseFile(packageDir, [
      (file) => file === 'LICENSE',
      (file) => file === 'LICENSE.md',
      (file) => file === 'LICENSE.txt',
      (file) => /^LICEN[CS]E/i.test(file),
      (file) => /^COPYING/i.test(file),
    ])

    let licenseText = null
    if (found) {
      licenseText = readText(found.path)
    }
    if (licenseText === null) {
      // 退化到 manifest 的 license 字段：只有标识符，没有正文，必须单独报出来。
      report('manifest', name, `未找到许可证文件，退化到 package.json 的 license 字段 "${pkg.license ?? '(缺失)'}"`)
      licenseText = pkg.license ?? null
    }
    if (licenseText === null) {
      report('unresolved', name, '既没有许可证文件，package.json 也没有 license 字段')
      continue
    }

    const expected = HERUI_EXPECTATIONS.get(name)
    if (expected && !licenseText.includes(expected)) {
      throw new Error(
        `${name} 的许可证正文不含 "${expected}"，解析顺序可能退化到了过时的 manifest license 字段。\n`
        + `实际取到：${licenseText.slice(0, 120)}`,
      )
    }

    addEntry(name, pkg.version ?? '(未知版本)', licenseText, 'renderer')

    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      queue.push(dependency)
    }
    for (const dependency of Object.keys(pkg.optionalDependencies ?? {})) {
      queue.push(dependency)
    }
    // peerDependencies 保守处理：只在它已进闭包、或本项目直接依赖它时才纳入，
    // 否则会收进 tailwindcss 这类只参与构建、产物里根本不存在的包。
    for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
      if (!included.has(peer) && !rootSet.has(peer)) {
        report('excluded', peer, `${name} 的 peerDependency，但既不在运行时闭包内也不是本项目直接依赖（仅构建期需要）`)
        continue
      }
      queue.push(peer)
    }
  }
}

// ---------------------------------------------------------------------------
// 树 2：平台运行时
// ---------------------------------------------------------------------------

function collectPlatformRuntime() {
  const electronDir = join(ROOT, 'node_modules', 'electron')
  const electronVersion = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version
  const electronLicense = readText(join(electronDir, 'LICENSE'))
  if (electronLicense === null) {
    report('unresolved', 'electron', 'node_modules/electron/LICENSE 不可读')
  } else {
    addEntry('Electron', electronVersion, electronLicense, 'platform')
  }

  addEntry('Chromium', CHROMIUM_VERSION, CHROMIUM_LICENSE, 'platform')
  report('embedded', `Chromium ${CHROMIUM_VERSION}`, 'BSD-3 正文内嵌，取自 https://chromium.googlesource.com/chromium/src/+/refs/tags/150.0.7871.114/LICENSE')
  addEntry('Node.js', NODE_VERSION, NODE_LICENSE, 'platform')
  report('embedded', `Node.js ${NODE_VERSION}`, 'MIT 正文内嵌，取自 https://raw.githubusercontent.com/nodejs/node/v24.18.0/LICENSE（Electron 43.1.1 内置版本）')

  // llama.cpp 随 extraResources 打包到 resources\llama\。优先读构建产物里的许可证文件，
  // 读不到才用内嵌常量（vendor\llama-cpu 由 prepare:llama:cpu 生成，未构建时不存在）。
  const llamaDirs = [join(ROOT, 'vendor', 'llama-cpu'), join(ROOT, 'vendor', 'llama')]
  let llamaLicense = null
  for (const dir of llamaDirs) {
    const found = findLicenseFile(dir, [
      (file) => file === 'LICENSE',
      (file) => file === 'LICENSE.md',
      (file) => file === 'LICENSE.txt',
      (file) => /^LICEN[CS]E$/i.test(file),
    ])
    if (found) {
      llamaLicense = readText(found.path)
      break
    }
  }
  addEntry('llama.cpp', LLAMA_BUILD, llamaLicense ?? LLAMA_LICENSE, 'platform')
  if (llamaLicense === null) {
    report('embedded', `llama.cpp ${LLAMA_BUILD}`, `MIT 正文内嵌，取自 https://raw.githubusercontent.com/ggml-org/llama.cpp/${LLAMA_BUILD}/LICENSE（vendor/llama-cpu 尚未构建）`)
  }
}

// ---------------------------------------------------------------------------
// 树 3：Python 引擎运行时闭包
// ---------------------------------------------------------------------------

const PEP508_NAME = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?/

/** 取 Requires-Dist 里的包名：先剥 extras，再在分隔符处断开。 */
function parseRequirementName(requirement) {
  const withoutExtras = requirement.split('[')[0].trim()
  const match = withoutExtras.match(PEP508_NAME)
  return match ? match[0] : null
}

/**
 * 展开 PEP 508 marker。引擎发布时按 CPU / x64 / cp313 / win32 单一轮次安装，
 * 平台恒为真；只有 `extra == "..."` 的条件为假，因为 pip install engine 不装 optional extra。
 */
function markerApplies(marker) {
  if (!marker) return true
  const normalized = marker.replace(/'/g, '"')
  if (/extra\s*==/.test(normalized)) return false
  return true
}

function readDistInfo(name) {
  const normalized = name.toLowerCase().replace(/[-_.]+/g, '-')
  let entries
  try {
    entries = readdirSync(SITE_PACKAGES, { withFileTypes: true })
  } catch {
    report('unresolved', name, `.venv/Lib/site-packages 不可读：${SITE_PACKAGES}`)
    return null
  }
  // dist-info 目录名是 `<规范化名>-<版本>.dist-info`，版本号本身也可能含 '-'
  // （如 `2.13.0+cu126`），所以按「去掉 .dist-info 后是否以规范化名 + '-' 开头」判定。
  const prefix = `${normalized}-`
  const match = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.dist-info'))
    .map((entry) => entry.name)
    .filter((dir) => {
      // wheel 名的规范化会把 '-'、'_'、'.' 全部折叠成 '-'，比较前先做同样的折叠。
      const stem = dir.slice(0, -'.dist-info'.length).toLowerCase().replace(/[-_.]+/g, '-')
      return stem.startsWith(prefix)
    })
    .sort()[0]
  if (!match) return null
  return { dir: join(SITE_PACKAGES, match), name: match }
}

function collectPythonTree() {
  const pyproject = readFileSync(join(ROOT, 'engine', 'pyproject.toml'), 'utf8')
  // 只取 [project].dependencies 这一段；[project.optional-dependencies] 下的 extra 不参与发布安装。
  const projectSection = pyproject.split('[project.optional-dependencies]')[0]
  const dependencyBlock = projectSection.split('dependencies = [')[1]
  if (!dependencyBlock) {
    throw new Error('engine/pyproject.toml 里找不到 [project].dependencies')
  }
  const roots = [...dependencyBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1].split(/[<>=!~;[]/)[0].trim())

  const seen = new Map()
  const queue = roots
  while (queue.length > 0) {
    const name = queue.shift()
    const key = name.toLowerCase().replace(/[-_.]+/g, '-')
    if (seen.has(key)) continue
    seen.set(key, name)

    const distInfo = readDistInfo(name)
    if (!distInfo) {
      report('unresolved', name, '运行时依赖闭包里的包在 .venv 中没有安装，取不到许可证正文')
      continue
    }

    const metadataText = readText(join(distInfo.dir, 'METADATA'))
    if (metadataText === null) {
      report('unresolved', name, `${distInfo.name}/METADATA 不可读`)
      continue
    }
    const metadata = metadataText.split(/\r?\n\r?\n/)[0]

    const declaredName = (metadata.match(/^Name:\s*(.+)$/m)?.[1] ?? name).trim()
    const version = (metadata.match(/^Version:\s*(.+)$/m)?.[1] ?? '').trim()
    if (!version) {
      report('unresolved', name, `${distInfo.name}/METADATA 里没有 Version 字段`)
      continue
    }
    // torch 在 .venv 里装的是 CUDA 轮次，版本号带 +cu126；发布时装的是 CPU 轮次，
    // 归属声明里不能出现加速器相关的字样，因此只保留上游版本号。
    const displayVersion = version.replace(/\+.*$/, '')

    let licenseText = null
    const licenseField = (metadata.match(/^License-Expression:\s*(.+)$/m)?.[1]
      ?? metadata.match(/^License:\s*(.+)$/m)?.[1] ?? '').trim()
    const licenseFiles = [...metadata.matchAll(/^License-File:\s*(.+)$/gm)].map((match) => match[1].trim())

    for (const relative of licenseFiles) {
      // License-File 允许登记非许可证文件（若干包把 AUTHORS/COPYING 也登记进去）。
      // 贡献者名单不是许可证条款，拿它当正文会让输出丢掉真正的授权条件。
      if (!/\.(md|txt|rst)?$/i.test(relative) || /^(AUTHORS?|CONTRIBUTORS?|THANKS?|CODEOWNERS)/i.test(relative)) {
        continue
      }
      // 同一个 License-File 在四种布局下都可能出现：PEP 639 的 licenses/ 子目录、
      // dist-info 根（老 wheel）、包目录本身，以及 flatten 之后的散落路径。
      for (const candidate of [
        join(distInfo.dir, 'licenses', relative),
        join(distInfo.dir, relative),
        join(SITE_PACKAGES, relative),
        join(SITE_PACKAGES, declaredName, relative),
      ]) {
        const content = readText(candidate)
        if (content !== null) {
          licenseText = content
          break
        }
      }
      if (licenseText !== null) break
    }

    // 并非每个 wheel 都在 METADATA 里登记 License-File（httpx / RapidFuzz / soxr 就没有），
    // 所以还要在 dist-info 根、dist-info/licenses/ 与包目录里直接找。
    if (licenseText === null) {
      for (const directory of [
        distInfo.dir,
        join(distInfo.dir, 'licenses'),
        join(SITE_PACKAGES, declaredName),
        join(SITE_PACKAGES, declaredName, 'licenses'),
      ]) {
        const found = findLicenseFile(directory, [
          (file) => file === 'LICENSE',
          (file) => file === 'LICENSE.md',
          (file) => file === 'LICENSE.txt',
          (file) => /^LICEN[CS]E$/i.test(file),
          (file) => /^COPYING/i.test(file),
        ])
        const content = found ? readText(found.path) : null
        if (content !== null) {
          licenseText = content
          break
        }
      }
    }

    if (licenseText === null) {
      report('manifest', declaredName, `包内没有可用的许可证文件，退化到 METADATA 的 License 字段 "${licenseField || '(缺失)'}"`)
      licenseText = licenseField
    }
    if (licenseText === null) {
      report('unresolved', declaredName, '既没有许可证文件，METADATA 也没有 License / License-Expression 字段')
      continue
    }

    addEntry(declaredName, displayVersion, licenseText, 'python')

    for (const line of metadata.split(/\r?\n/)) {
      if (!line.startsWith('Requires-Dist:')) continue
      const requirement = line.slice('Requires-Dist:'.length).trim()
      if (!markerApplies(requirement.split(';').slice(1).join(';'))) continue
      const dependencyName = parseRequirementName(requirement)
      if (dependencyName) queue.push(dependencyName)
    }
  }

  addEntry('CPython', CPYTHON_VERSION, CPYTHON_LICENSE, 'python')
  report('embedded', `CPython ${CPYTHON_VERSION}`, 'PSF License Version 2 正文内嵌，取自 https://raw.githubusercontent.com/python/cpython/v3.13.9/LICENSE')
}

// ---------------------------------------------------------------------------

collectRendererTree()
collectPlatformRuntime()
collectPythonTree()

// 字母序；`@` 前缀的包按原样参与排序。同名同版本已按 name+version 去重，
// 排序键再补上 origin 与首行正文，保证任何输入顺序下输出都稳定。
const sorted = [...entries.values()].sort((a, b) => {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  if (a.version !== b.version) return a.version < b.version ? -1 : 1
  if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1
  if (a.licenseText !== b.licenseText) return a.licenseText < b.licenseText ? -1 : 1
  return 0
})

const HEADER = 'THE FOLLOWING SETS FORTH ATTRIBUTION NOTICES FOR THIRD PARTY SOFTWARE THAT MAY BE CONTAINED IN PORTIONS OF THIS PRODUCT'

const blocks = sorted.map((entry) => [
  `The following software may be included in this product: ${entry.name} (${entry.version})`,
  'This software contains the following license and notice below:',
  '',
  entry.licenseText,
  '---',
].join('\n'))

const document = `${HEADER}\n\n${blocks.join('\n\n')}\n`

const counts = { renderer: 0, platform: 0, python: 0 }
for (const entry of sorted) counts[entry.origin] += 1

const lineCount = document.split('\n').length - 1
const regenerated = sorted.map((entry) => `${entry.name}@${entry.version}`)

/**
 * Entry identities as written in an existing notice file, so `--check` can name the packages
 * that moved rather than only reporting that the bytes differ.
 */
const readEntryIdentities = (text) =>
  [...text.matchAll(/^The following software may be included in this product: (.+?) \((.+?)\)\r?$/gm)]
    .map((match) => `${match[1]}@${match[2]}`)

const reportSections = [
  '',
  'Unresolved (no license text found):',
  ...(unresolved.length > 0 ? unresolved.map((line) => `  - ${line}`) : ['  (none)']),
  '',
  'Fell back to a manifest license identifier:',
  ...(manifestFallbacks.length > 0 ? manifestFallbacks.map((line) => `  - ${line}`) : ['  (none)']),
  '',
  'Embedded constant license text:',
  ...(embeddedTexts.length > 0 ? embeddedTexts.map((line) => `  - ${line}`) : ['  (none)']),
  '',
  'Excluded from the notice:',
  ...(excluded.length > 0 ? excluded.map((line) => `  - ${line}`) : ['  (none)']),
  '',
]

if (CHECK_ONLY) {
  const current = readText(OUTPUT)
  if (current === document) {
    process.stdout.write([
      `OK ${OUTPUT} matches the current dependencies`,
      `  bytes: ${Buffer.byteLength(document, 'utf8')}, lines: ${lineCount}, entries: ${sorted.length}`,
      ...reportSections,
    ].join('\n'))
    process.exit(0)
  }

  const currentIdentities = current === null ? [] : readEntryIdentities(current)
  const known = new Set(currentIdentities)
  const wanted = new Set(regenerated)
  const added = regenerated.filter((key) => !known.has(key))
  const removed = currentIdentities.filter((key) => !wanted.has(key))

  process.stdout.write([
    `STALE ${OUTPUT} does not match the current dependencies`,
    current === null
      ? '  the file does not exist'
      : `  on disk: ${Buffer.byteLength(current, 'utf8')} bytes, ${currentIdentities.length} entries` +
        ` / regenerated: ${Buffer.byteLength(document, 'utf8')} bytes, ${sorted.length} entries`,
    ...(added.length > 0 ? ['', `Added (${added.length}):`, ...added.map((key) => `  + ${key}`)] : []),
    ...(removed.length > 0 ? ['', `Removed (${removed.length}):`, ...removed.map((key) => `  - ${key}`)] : []),
    added.length === 0 && removed.length === 0
      ? ['', 'Entry identities match, so the difference is inside license texts or their formatting.']
      : [],
    '',
    'Run `npm run gen:notices` and commit the result.',
    ...reportSections,
  ].join('\n'))
  process.exit(1)
}

writeFileSync(OUTPUT, document, 'utf8')

process.stdout.write([
  `Wrote ${OUTPUT}`,
  `  bytes: ${Buffer.byteLength(document, 'utf8')}, lines: ${lineCount}, entries: ${sorted.length}`,
  `  renderer JS: ${counts.renderer}, platform runtime: ${counts.platform}, Python engine: ${counts.python}`,
  ...reportSections,
].join('\n'))
