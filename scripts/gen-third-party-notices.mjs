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

// 引擎自带一整份私有 CPython：build-python-runtime.py 从 base prefix 复制 DLLs/、Lib/ 与 LICENSE*。
// 正文读 engine/dist/NolaPythonEngine/LICENSE.txt，即随安装包分发的那一份；
// 版本号另行核对 python3XX.dll 的 ABI 数字，见 collectPythonTree 末尾。
const CPYTHON_VERSION = '3.12.10'
const CPYTHON_ENGINE_DIR = join(ROOT, 'engine', 'dist', 'NolaPythonEngine')

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

// ---------------------------------------------------------------------------
// 上游有明确许可证声明、但分发包内不带许可证文件的组件。
// 正文逐字取自下列 URL 的对应文件，每条在「Embedded constant license text」
// 里单独报出来，便于核对来源。
// ---------------------------------------------------------------------------

// https://raw.githubusercontent.com/pyinstaller/pyinstaller/v6.21.0/COPYING.txt
// 浏览器宿主由 `PyInstaller --onefile` 打包（scripts/build-browser-host.ps1），
// bootloader（GPL-2.0-or-later WITH Bootloader-exception）与 run-time hooks（Apache-2.0）随 EXE 分发。
// 整份 COPYING.txt 原样内嵌：Bootloader Exception 正是 bootloader 能与 GPL-3.0 主程序合法共分的依据，
// 末尾的 MIT 段覆盖 isolated submodule，它不进入 EXE，保留仅为与上游文件保持一致。
const PYINSTALLER_LICENSE = `================================
 The PyInstaller licensing terms
================================
 

Copyright (c) 2010-2023, PyInstaller Development Team
Copyright (c) 2005-2009, Giovanni Bajo
Based on previous work under copyright (c) 2002 McMillan Enterprises, Inc.


PyInstaller is licensed under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2 of the License,
or (at your option) any later version.


Bootloader Exception
--------------------

In addition to the permissions in the GNU General Public License, the
authors give you unlimited permission to link or embed compiled bootloader
and related files into combinations with other programs, and to distribute
those combinations without any restriction coming from the use of those
files. (The General Public License restrictions do apply in other respects;
for example, they cover modification of the files, and distribution when
not linked into a combined executable.)
 
 
Bootloader and Related Files
----------------------------

Bootloader and related files are files which are embedded within the
final executable. This includes files in directories:

./bootloader/
./PyInstaller/loader


Run-time Hooks
----------------------------

Run-time Hooks are a different kind of files embedded within the final
executable. To ease moving them into a separate repository, or into the
respective project, these files are now licensed under the Apache License,
Version 2.0.

Run-time Hooks are in the directory
./PyInstaller/hooks/rthooks


The PyInstaller.isolated submodule
----------------------------------

By request, the PyInstaller.isolated submodule and its corresponding tests are
additionally licensed with the MIT license so that it may be reused outside of
PyInstaller under GPL 2.0 or MIT terms and conditions -- whichever is the most
suitable to the recipient downstream project. Affected files/directories are:

./PyInstaller/isolated/
./tests/unit/test_isolation.py


About the PyInstaller Development Team
--------------------------------------

The PyInstaller Development Team is the set of contributors
to the PyInstaller project. A full list with details is kept
in the documentation directory, in the file
\`\`doc/CREDITS.rst\`\`.

The core team that coordinates development on GitHub can be found here:
https://github.com/pyinstaller/pyinstaller.  As of 2021, it consists of:

* Hartmut Goebel
* Jasper Harrison
* Bryan Jones
* Brenainn Woodsend
* Rok Mandeljc

Our Copyright Policy
--------------------

PyInstaller uses a shared copyright model. Each contributor maintains copyright
over their contributions to PyInstaller. But, it is important to note that these
contributions are typically only changes to the repositories. Thus,
the PyInstaller source code, in its entirety is not the copyright of any single
person or institution.  Instead, it is the collective copyright of the entire
PyInstaller Development Team.  If individual contributors want to maintain
a record of what changes/contributions they have specific copyright on, they
should indicate their copyright in the commit message of the change, when they
commit the change to the PyInstaller repository.

With this in mind, the following banner should be used in any source code file
to indicate the copyright and license terms:


#-----------------------------------------------------------------------------
# Copyright (c) 2005-2023, PyInstaller Development Team.
#
# Distributed under the terms of the GNU General Public License (version 2
# or later) with exception for distributing the bootloader.
#
# The full license is in the file COPYING.txt, distributed with this software.
#
# SPDX-License-Identifier: (GPL-2.0-or-later WITH Bootloader-exception)
#-----------------------------------------------------------------------------


For run-time hooks, the following banner should be used:

#-----------------------------------------------------------------------------
# Copyright (c) 2005-2023, PyInstaller Development Team.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
#
# The full license is in the file COPYING.txt, distributed with this software.
#
# SPDX-License-Identifier: Apache-2.0
#-----------------------------------------------------------------------------


================================
GNU General Public License
================================

https://gnu.org/licenses/gpl-2.0.html


		    GNU GENERAL PUBLIC LICENSE
		       Version 2, June 1991

 Copyright (C) 1989, 1991 Free Software Foundation, Inc.
 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

			    Preamble

  The licenses for most software are designed to take away your
freedom to share and change it.  By contrast, the GNU General Public
License is intended to guarantee your freedom to share and change free
software--to make sure the software is free for all its users.  This
General Public License applies to most of the Free Software
Foundation's software and to any other program whose authors commit to
using it.  (Some other Free Software Foundation software is covered by
the GNU Library General Public License instead.)  You can apply it to
your programs, too.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
this service if you wish), that you receive source code or can get it
if you want it, that you can change the software or use pieces of it
in new free programs; and that you know you can do these things.

  To protect your rights, we need to make restrictions that forbid
anyone to deny you these rights or to ask you to surrender the rights.
These restrictions translate to certain responsibilities for you if you
distribute copies of the software, or if you modify it.

  For example, if you distribute copies of such a program, whether
gratis or for a fee, you must give the recipients all the rights that
you have.  You must make sure that they, too, receive or can get the
source code.  And you must show them these terms so they know their
rights.

  We protect your rights with two steps: (1) copyright the software, and
(2) offer you this license which gives you legal permission to copy,
distribute and/or modify the software.

  Also, for each author's protection and ours, we want to make certain
that everyone understands that there is no warranty for this free
software.  If the software is modified by someone else and passed on, we
want its recipients to know that what they have is not the original, so
that any problems introduced by others will not reflect on the original
authors' reputations.

  Finally, any free program is threatened constantly by software
patents.  We wish to avoid the danger that redistributors of a free
program will individually obtain patent licenses, in effect making the
program proprietary.  To prevent this, we have made it clear that any
patent must be licensed for everyone's free use or not licensed at all.

  The precise terms and conditions for copying, distribution and
modification follow.

		    GNU GENERAL PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. This License applies to any program or other work which contains
a notice placed by the copyright holder saying it may be distributed
under the terms of this General Public License.  The "Program", below,
refers to any such program or work, and a "work based on the Program"
means either the Program or any derivative work under copyright law:
that is to say, a work containing the Program or a portion of it,
either verbatim or with modifications and/or translated into another
language.  (Hereinafter, translation is included without limitation in
the term "modification".)  Each licensee is addressed as "you".

Activities other than copying, distribution and modification are not
covered by this License; they are outside its scope.  The act of
running the Program is not restricted, and the output from the Program
is covered only if its contents constitute a work based on the
Program (independent of having been made by running the Program).
Whether that is true depends on what the Program does.

  1. You may copy and distribute verbatim copies of the Program's
source code as you receive it, in any medium, provided that you
conspicuously and appropriately publish on each copy an appropriate
copyright notice and disclaimer of warranty; keep intact all the
notices that refer to this License and to the absence of any warranty;
and give any other recipients of the Program a copy of this License
along with the Program.

You may charge a fee for the physical act of transferring a copy, and
you may at your option offer warranty protection in exchange for a fee.

  2. You may modify your copy or copies of the Program or any portion
of it, thus forming a work based on the Program, and copy and
distribute such modifications or work under the terms of Section 1
above, provided that you also meet all of these conditions:

    a) You must cause the modified files to carry prominent notices
    stating that you changed the files and the date of any change.

    b) You must cause any work that you distribute or publish, that in
    whole or in part contains or is derived from the Program or any
    part thereof, to be licensed as a whole at no charge to all third
    parties under the terms of this License.

    c) If the modified program normally reads commands interactively
    when run, you must cause it, when started running for such
    interactive use in the most ordinary way, to print or display an
    announcement including an appropriate copyright notice and a
    notice that there is no warranty (or else, saying that you provide
    a warranty) and that users may redistribute the program under
    these conditions, and telling the user how to view a copy of this
    License.  (Exception: if the Program itself is interactive but
    does not normally print such an announcement, your work based on
    the Program is not required to print an announcement.)

These requirements apply to the modified work as a whole.  If
identifiable sections of that work are not derived from the Program,
and can be reasonably considered independent and separate works in
themselves, then this License, and its terms, do not apply to those
sections when you distribute them as separate works.  But when you
distribute the same sections as part of a whole which is a work based
on the Program, the distribution of the whole must be on the terms of
this License, whose permissions for other licensees extend to the
entire whole, and thus to each and every part regardless of who wrote it.

Thus, it is not the intent of this section to claim rights or contest
your rights to work written entirely by you; rather, the intent is to
exercise the right to control the distribution of derivative or
collective works based on the Program.

In addition, mere aggregation of another work not based on the Program
with the Program (or with a work based on the Program) on a volume of
a storage or distribution medium does not bring the other work under
the scope of this License.

  3. You may copy and distribute the Program (or a work based on it,
under Section 2) in object code or executable form under the terms of
Sections 1 and 2 above provided that you also do one of the following:

    a) Accompany it with the complete corresponding machine-readable
    source code, which must be distributed under the terms of Sections
    1 and 2 above on a medium customarily used for software interchange; or,

    b) Accompany it with a written offer, valid for at least three
    years, to give any third party, for a charge no more than your
    cost of physically performing source distribution, a complete
    machine-readable copy of the corresponding source code, to be
    distributed under the terms of Sections 1 and 2 above on a medium
    customarily used for software interchange; or,

    c) Accompany it with the information you received as to the offer
    to distribute corresponding source code.  (This alternative is
    allowed only for noncommercial distribution and only if you
    received the program in object code or executable form with such
    an offer, in accord with Subsection b above.)

The source code for a work means the preferred form of the work for
making modifications to it.  For an executable work, complete source
code means all the source code for all modules it contains, plus any
associated interface definition files, plus the scripts used to
control compilation and installation of the executable.  However, as a
special exception, the source code distributed need not include
anything that is normally distributed (in either source or binary
form) with the major components (compiler, kernel, and so on) of the
operating system on which the executable runs, unless that component
itself accompanies the executable.

If distribution of executable or object code is made by offering
access to copy from a designated place, then offering equivalent
access to copy the source code from the same place counts as
distribution of the source code, even though third parties are not
compelled to copy the source along with the object code.

  4. You may not copy, modify, sublicense, or distribute the Program
except as expressly provided under this License.  Any attempt
otherwise to copy, modify, sublicense or distribute the Program is
void, and will automatically terminate your rights under this License.
However, parties who have received copies, or rights, from you under
this License will not have their licenses terminated so long as such
parties remain in full compliance.

  5. You are not required to accept this License, since you have not
signed it.  However, nothing else grants you permission to modify or
distribute the Program or its derivative works.  These actions are
prohibited by law if you do not accept this License.  Therefore, by
modifying or distributing the Program (or any work based on the
Program), you indicate your acceptance of this License to do so, and
all its terms and conditions for copying, distributing or modifying
the Program or works based on it.

  6. Each time you redistribute the Program (or any work based on the
Program), the recipient automatically receives a license from the
original licensor to copy, distribute or modify the Program subject to
these terms and conditions.  You may not impose any further
restrictions on the recipients' exercise of the rights granted herein.
You are not responsible for enforcing compliance by third parties to
this License.

  7. If, as a consequence of a court judgment or allegation of patent
infringement or for any other reason (not limited to patent issues),
conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot
distribute so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you
may not distribute the Program at all.  For example, if a patent
license would not permit royalty-free redistribution of the Program by
all those who receive copies directly or indirectly through you, then
the only way you could satisfy both it and this License would be to
refrain entirely from distribution of the Program.

If any portion of this section is held invalid or unenforceable under
any particular circumstance, the balance of the section is intended to
apply and the section as a whole is intended to apply in other
circumstances.

It is not the purpose of this section to induce you to infringe any
patents or other property right claims or to contest validity of any
such claims; this section has the sole purpose of protecting the
integrity of the free software distribution system, which is
implemented by public license practices.  Many people have made
generous contributions to the wide range of software distributed
through that system in reliance on consistent application of that
system; it is up to the author/donor to decide if he or she is willing
to distribute software through any other system and a licensee cannot
impose that choice.

This section is intended to make thoroughly clear what is believed to
be a consequence of the rest of this License.

  8. If the distribution and/or use of the Program is restricted in
certain countries either by patents or by copyrighted interfaces, the
original copyright holder who places the Program under this License
may add an explicit geographical distribution limitation excluding
those countries, so that distribution is permitted only in or among
countries not thus excluded.  In such case, this License incorporates
the limitation as if written in the body of this License.

  9. The Free Software Foundation may publish revised and/or new versions
of the General Public License from time to time.  Such new versions will
be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

Each version is given a distinguishing version number.  If the Program
specifies a version number of this License which applies to it and "any
later version", you have the option of following the terms and conditions
either of that version or of any later version published by the Free
Software Foundation.  If the Program does not specify a version number of
this License, you may choose any version ever published by the Free Software
Foundation.

  10. If you wish to incorporate parts of the Program into other free
programs whose distribution conditions are different, write to the author
to ask for permission.  For software which is copyrighted by the Free
Software Foundation, write to the Free Software Foundation; we sometimes
make exceptions for this.  Our decision will be guided by the two goals
of preserving the free status of all derivatives of our free software and
of promoting the sharing and reuse of software generally.

			    NO WARRANTY

  11. BECAUSE THE PROGRAM IS LICENSED FREE OF CHARGE, THERE IS NO WARRANTY
FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW.  EXCEPT WHEN
OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES
PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED
OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.  THE ENTIRE RISK AS
TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU.  SHOULD THE
PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING,
REPAIR OR CORRECTION.

  12. IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MAY MODIFY AND/OR
REDISTRIBUTE THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES,
INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING
OUT OF THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED
TO LOSS OF DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY
YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER
PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

		     END OF TERMS AND CONDITIONS

================================
Apache License 2.0
================================

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

===========
MIT License
===========

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
SOFTWARE.
`

// https://raw.githubusercontent.com/antlr/antlr4/master/LICENSE.txt
// 仓库根级 LICENSE.txt 覆盖所有 runtime target（含 Python），子目录没有各自的副本。
// 元数据只写 "BSD" 未标条款数，正文第 3 条（禁止用作者名背书）确认是 BSD-3-Clause。
const ANTLR4_LICENSE = `Copyright (c) 2012-2022 The ANTLR Project. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

3. Neither name of copyright holders nor the names of its contributors
may be used to endorse or promote products derived from this software
without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
\`\`AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE REGENTS OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`

// Apache License 2.0 全文，三个包共用同一份标准文本。
// https://raw.githubusercontent.com/google/sentencepiece/master/LICENSE
// https://raw.githubusercontent.com/huggingface/tokenizers/main/LICENSE
// 三者都没有 NOTICE 文件，所以第 4(d) 条的 NOTICE 传递义务不适用。
const APACHE_2_0 = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction,
and distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by
the copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all
other entities that control, are controlled by, or are under common
control with that entity. For the purposes of this definition,
"control" means (i) the power, direct or indirect, to cause the
direction or management of such entity, whether by contract or
otherwise, or (ii) ownership of fifty percent (50%) or more of the
outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity
exercising permissions granted by this License.

"Source" form shall mean the preferred form for making modifications,
including but not limited to software source code, documentation
source, and configuration files.

"Object" form shall mean any form resulting from mechanical
transformation or translation of a Source form, including but
not limited to compiled object code, generated documentation,
and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or
Object form, made available under the License, as indicated by a
copyright notice that is included in or attached to the work
(an example is provided in the Appendix below).

"Derivative Works" shall mean any work, whether in Source or Object
form, that is based on (or derived from) the Work and for which the
editorial revisions, annotations, elaborations, or other modifications
represent, as a whole, an original work of authorship. For the purposes
of this License, Derivative Works shall not include works that remain
separable from, or merely link (or bind by name) to the interfaces of,
the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including
the original version of the Work and any modifications or additions
to that Work or Derivative Works thereof, that is intentionally
submitted to Licensor for inclusion in the Work by the copyright owner
or by an individual or Legal Entity authorized to submit on behalf of
the copyright owner. For the purposes of this definition, "submitted"
means any form of electronic, verbal, or written communication sent
to the Licensor or its representatives, including but not limited to
communication on electronic mailing lists, source code control systems,
and issue tracking systems that are managed by, or on behalf of, the
Licensor for the purpose of discussing and improving the Work, but
excluding communication that is conspicuously marked or otherwise
designated in writing by the copyright owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity
on behalf of whom a Contribution has been received by Licensor and
subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
this License, each Contributor hereby grants to You a perpetual,
worldwide, non-exclusive, no-charge, royalty-free, irrevocable
copyright license to reproduce, prepare Derivative Works of,
publicly display, publicly perform, sublicense, and distribute the
Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
this License, each Contributor hereby grants to You a perpetual,
worldwide, non-exclusive, no-charge, royalty-free, irrevocable
(except as stated in this section) patent license to make, have made,
use, offer to sell, sell, import, and otherwise transfer the Work,
where such license applies only to those patent claims licensable
by such Contributor that are necessarily infringed by their
Contribution(s) alone or by combination of their Contribution(s)
with the Work to which such Contribution(s) was submitted. If You
institute patent litigation against any entity (including a
cross-claim or counterclaim in a lawsuit) alleging that the Work
or a Contribution incorporated within the Work constitutes direct
or contributory patent infringement, then any patent licenses
granted to You under this License for that Work shall terminate
as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
Work or Derivative Works thereof in any medium, with or without
modifications, and in Source or Object form, provided that You
meet the following conditions:

(a) You must give any other recipients of the Work or
Derivative Works a copy of this License; and

(b) You must cause any modified files to carry prominent notices
stating that You changed the files; and

(c) You must retain, in the Source form of any Derivative Works
that You distribute, all copyright, patent, trademark, and
attribution notices from the Source form of the Work,
excluding those notices that do not pertain to any part of
the Derivative Works; and

(d) If the Work includes a "NOTICE" text file as part of its
distribution, then any Derivative Works that You distribute must
include a readable copy of the attribution notices contained
within such NOTICE file, excluding those notices that do not
pertain to any part of the Derivative Works, in at least one
of the following places: within a NOTICE text file distributed
as part of the Derivative Works; within the Source form or
documentation, if provided along with the Derivative Works; or,
within a display generated by the Derivative Works, if and
wherever such third-party notices normally appear. The contents
of the NOTICE file are for informational purposes only and
do not modify the License. You may add Your own attribution
notices within Derivative Works that You distribute, alongside
or as an addendum to the NOTICE text from the Work, provided
that such additional attribution notices cannot be construed
as modifying the License.

You may add Your own copyright statement to Your modifications and
may provide additional or different license terms and conditions
for use, reproduction, or distribution of Your modifications, or
for any such Derivative Works as a whole, provided Your use,
reproduction, and distribution of the Work otherwise complies with
the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
any Contribution intentionally submitted for inclusion in the Work
by You to the Licensor shall be under the terms and conditions of
this License, without any additional terms or conditions.
Notwithstanding the above, nothing herein shall supersede or modify
the terms of any separate license agreement you may have executed
with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
names, trademarks, service marks, or product names of the Licensor,
except as required for reasonable and customary use in describing the
origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
agreed to in writing, Licensor provides the Work (and each
Contributor provides its Contributions) on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied, including, without limitation, any warranties or conditions
of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
PARTICULAR PURPOSE. You are solely responsible for determining the
appropriateness of using or redistributing the Work and assume any
risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
whether in tort (including negligence), contract, or otherwise,
unless required by applicable law (such as deliberate and grossly
negligent acts) or agreed to in writing, shall any Contributor be
liable to You for damages, including any direct, indirect, special,
incidental, or consequential damages of any character arising as a
result of this License or out of the use or inability to use the
Work (including but not limited to damages for loss of goodwill,
work stoppage, computer failure or malfunction, or any and all
other commercial damages or losses), even if such Contributor
has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
the Work or Derivative Works thereof, You may choose to offer,
and charge a fee for, acceptance of support, warranty, indemnity,
or other liability obligations and/or rights consistent with this
License. However, in accepting such obligations, You may act only
on Your own behalf and on Your sole responsibility, not on behalf
of any other Contributor, and only if You agree to indemnify,
defend, and hold each Contributor harmless for any liability
incurred by, or claims asserted against, such Contributor by reason
of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

To apply the Apache License to your work, attach the following
boilerplate notice, with the fields enclosed by brackets "[]"
replaced with your own identifying information. (Don't include
the brackets!)  The text should be enclosed in the appropriate
comment syntax for the file format. We also recommend that a
file or class name and description of purpose be included on the
same "printed page" as the copyright notice for easier
identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`

/**
 * METADATA 的 Name → 许可证正文。collectPythonTree 在包内找不到任何许可证文件时先查这里，
 * 再退化到 License 字段的标识符。
 */
const UPSTREAM_LICENSES = new Map([
  ['sentencepiece', {
    url: 'https://raw.githubusercontent.com/google/sentencepiece/master/LICENSE',
    text: APACHE_2_0,
  }],
  ['tokenizers', {
    url: 'https://raw.githubusercontent.com/huggingface/tokenizers/main/LICENSE',
    text: APACHE_2_0,
  }],
  ['antlr4-python3-runtime', {
    url: 'https://raw.githubusercontent.com/antlr/antlr4/master/LICENSE.txt',
    text: ANTLR4_LICENSE,
  }],
  // 上游 kamo-naoyuki/pytorch_complex 没有发布任何 LICENSE 文件，仓库根目录与 sdist 源码树里
  // 都没有；Apache-2.0 来自 PyPI classifier 与 conda-forge recipe 两处一致的元数据声明。
  ['torch-complex', {
    url: 'https://pypi.org/pypi/torch-complex/0.4.4/json（License :: OSI Approved :: Apache Software License）',
    text: APACHE_2_0,
  }],
])


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
    } catch (error) {
      // 依赖声明里存在、磁盘上并未安装的包只出现在构建期链路，Vite 不会把它们打进产物。
      if (error.code === 'ENOENT' && !exists(packageDir)) {
        report('excluded', name, '仅出现在依赖声明里，磁盘上未安装，不进入产物')
      } else {
        report('unresolved', name, 'node_modules 下没有可读的 package.json，无法确认版本')
      }
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

  // 浏览器宿主由 `PyInstaller --onefile` 打包，bootloader 随 EXE 进入安装包（extraResources）。
  // 版本从 .venv 的 dist-info 读，跟随 build-browser-host.ps1 实际使用的解释器。
  const pyinstallerDist = readDistInfo('pyinstaller')
  const pyinstallerMetadata = pyinstallerDist ? readText(join(pyinstallerDist.dir, 'METADATA')) : null
  const pyinstallerVersion = pyinstallerMetadata?.match(/^Version:\s*(.+)$/m)?.[1]?.trim()
  if (pyinstallerVersion) {
    addEntry('PyInstaller', pyinstallerVersion, PYINSTALLER_LICENSE, 'platform')
    report('embedded', `PyInstaller ${pyinstallerVersion}`, 'COPYING.txt 正文内嵌，取自 https://raw.githubusercontent.com/pyinstaller/pyinstaller/v6.21.0/COPYING.txt（wheel 内不带许可证文件）')
  } else {
    report('unresolved', 'PyInstaller', '.venv 里没有可读的 pyinstaller METADATA，无法确认版本；浏览器宿主构建需要它')
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
 * 发布轮次是 CPU / x64 / cp312 / win32 的单一组合。pyvenv.cfg 里的开发用解释器（当前是
 * 3.13.x）与它无关，marker 必须按发布轮次而不是开发机求值。
 */
const RELEASE_PYTHON_VERSION = '3.12'
const RELEASE_PLATFORM = {
  sys_platform: 'win32',
  platform_system: 'Windows',
  os_name: 'nt',
  platform_machine: 'AMD64',
  platform_python_implementation: 'CPython',
}

/** 逐段比较版本号，缺失的段按 0 处理，这样 `3.12` 与 `3.12.0` 相等。 */
function compareRelease(left, right) {
  const l = left.split('.').map(Number)
  const r = right.split('.').map(Number)
  for (let i = 0; i < Math.max(l.length, r.length); i += 1) {
    const a = l[i] ?? 0
    const b = r[i] ?? 0
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

/** 求值单个 marker 原子条件；无法识别的写法保守放行，以免漏掉真正的依赖。 */
function atomApplies(atom) {
  const match = atom.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=|<=|>=|~=|<|>)\s*"([^"]*)"$/)
  if (!match) return true
  const [, key, operator, value] = match
  if (key === 'extra') return false

  const isVersion = key === 'python_version' || key === 'python_full_version'
  const actual = isVersion ? RELEASE_PYTHON_VERSION : RELEASE_PLATFORM[key]
  if (actual === undefined) return true

  if (!isVersion) {
    if (operator === '==') return actual === value
    if (operator === '!=') return actual !== value
    return true
  }

  const order = compareRelease(actual, value)
  switch (operator) {
    case '==': return order === 0
    case '!=': return order !== 0
    case '<': return order < 0
    case '<=': return order <= 0
    case '>': return order > 0
    case '>=': return order >= 0
    default: return order >= 0
  }
}

/**
 * 展开 PEP 508 marker。`extra == "..."` 恒为假，因为发布安装不带 optional extra；
 * 版本与平台条件按发布轮次求值 —— `python_version < "3.9"` 这类条件依赖在 CPython 3.12 下
 * 根本不会安装，放行它们会让闭包多出 dist-info 查不到的包。
 */
function markerApplies(marker) {
  if (!marker) return true
  const normalized = marker.replace(/'/g, '"').trim()
  return normalized.split(/\s+or\s+/).some((branch) =>
    branch.split(/\s+and\s+/).every((atom) => atomApplies(atom.trim())),
  )
}


/**
 * 按 METADATA 声明的 Name 精确匹配 dist-info。
 * 目录名只是「规范化名-版本.dist-info」，靠前缀匹配会让互为前缀的名字互相命中：
 * `pyinstaller-6.21.0` 与 `pyinstaller-hooks-contrib-2026.6`、`torch-2.3.1` 与 `torch-complex-0.4.4`
 * 都是这种关系，取错目录会直接把一个包的许可证标到另一个包头上。
 */
function readDistInfo(name) {
  const wanted = name.toLowerCase().replace(/[-_.]+/g, '-')
  let entries
  try {
    entries = readdirSync(SITE_PACKAGES, { withFileTypes: true })
  } catch {
    report('unresolved', name, `.venv/Lib/site-packages 不可读：${SITE_PACKAGES}`)
    return null
  }
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory() || !entry.name.endsWith('.dist-info')) continue
    const dir = join(SITE_PACKAGES, entry.name)
    const metadata = readText(join(dir, 'METADATA'))
    const declared = metadata?.match(/^Name:\s*(.+)$/m)?.[1]?.trim().toLowerCase().replace(/[-_.]+/g, '-')
    if (declared === wanted) {
      return { dir, name: entry.name }
    }
  }
  return null
}

function collectPythonTree() {
  const pyproject = readFileSync(join(ROOT, 'engine', 'pyproject.toml'), 'utf8')
  // 只取 [project].dependencies 这一段；[project.optional-dependencies] 下的 extra 不参与发布安装。
  const projectSection = pyproject.split('[project.optional-dependencies]')[0]
  const dependencyBlock = projectSection.split('dependencies = [')[1]
  if (!dependencyBlock) {
    throw new Error('engine/pyproject.toml 里找不到 [project].dependencies')
  }
  const roots = [...dependencyBlock.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((requirement) => markerApplies(requirement.split(';').slice(1).join(';')))
    .map((requirement) => parseRequirementName(requirement))
    .filter((name) => name !== null)

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

    // 包内没有任何许可证文件时，先查上游常量表，再退化到 METADATA 的标识符。
    if (licenseText === null) {
      const upstream = UPSTREAM_LICENSES.get(declaredName)
      if (upstream) {
        licenseText = upstream.text
        report('embedded', declaredName, `正文内嵌，取自 ${upstream.url}（分发包内无许可证文件）`)
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

  // 引擎根目录的 LICENSE.txt 由 build-python-runtime.py 从 base prefix 复制而来，是随包分发的那一份；
  // artifacts/python312 是它的构建来源，内容一致，仅在引擎尚未构建时作为退路。
  let cpythonLicense = null
  for (const candidate of [
    join(CPYTHON_ENGINE_DIR, 'LICENSE.txt'),
    join(ROOT, 'artifacts', 'python312', 'tools', 'LICENSE.txt'),
  ]) {
    cpythonLicense = readText(candidate)
    if (cpythonLicense !== null) break
  }
  if (cpythonLicense === null) {
    report('unresolved', 'CPython', 'engine/dist 与 artifacts/python312 下都没有 LICENSE.txt，引擎尚未构建')
    return
  }
  addEntry('CPython', CPYTHON_VERSION, cpythonLicense, 'python')

  // 版本号是内嵌常量，用引擎里 ABI dll 的数字段兜一道，升级 Python 后不至于静默错位。
  let abiDll = null
  try {
    abiDll = readdirSync(CPYTHON_ENGINE_DIR).find((name) => /^python3\d+\.dll$/i.test(name)) ?? null
  } catch {
    abiDll = null
  }
  if (abiDll !== null) {
    const expectedAbi = CPYTHON_VERSION.split('.').slice(0, 2).join('')
    if (!abiDll.toLowerCase().includes(expectedAbi)) {
      throw new Error(`${abiDll} 的 ABI 与 CPYTHON_VERSION ${CPYTHON_VERSION} 不一致`)
    }
  }
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
