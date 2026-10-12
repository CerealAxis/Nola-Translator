# AGENTS.md

> 写给 AI 编程助手的项目规范。视觉规范见 [DESIGN.MD](./DESIGN.MD)。
> 改项目结构的那一刀必须同步改本文件。

## 1. 技术栈

- 桌面应用：Electron + React + TypeScript
- 引擎：内置 Windows x64 Python 3.12；PyTorch 与 llama.cpp 由设置页按组合安装或复用本地组件（模型能力持久化在自定义模型注册表，启动与逐句翻译必须校验配置）
- Index-Translate：推荐官方 2B／9B／35B-A3B-preview Q4_K_M 文本权重，通过 llama.cpp 推理；独立免费 API 使用官方公开 35B-A3B 模型，无需密钥，支持 SSE 译文。
- Hy-MT2：推荐 1.8B 三个量化档位与腾讯官方 7B Q4_K_M；7B 显式使用官方独立 Jinja 对话模板。
- 云端识别：Aliyun LiveTranslate 3.5／3.8 使用 WebSocket 持续输入 PCM16；MiniMax Speech-to-Text 不接受音频流式输入，改由引擎侧 VAD 切段后逐段上传 WAV，SSE 只推送响应增量。云端翻译支持 MyMemory REST 与识别连接自带的流式译文（仅阿里云具备，MiniMax 无内置译文）。
- UI：Tailwind CSS + HeroUI
- 构建：electron-vite
- 测试：Vitest + Testing Library
- 诊断：主进程使用 Node 文件 API 每次启动保存一份不拆分的 JSONL 日志，自动脱敏、限制单条大小并保留最近启动记录。
- 浏览器：Chrome／Edge Manifest V3 + React／TypeScript；扩展独立版本由 browser/version.json 管理，CHANGELOG.md 记录发布；Python 标准库 Native Messaging 连接程序由 PyInstaller 打包

## 2. 目录结构

```
src/
├── main/        # Electron 主进程：IPC 注册、窗口、设置/凭据持久化、引擎子进程；session-log.ts 保存每次启动的诊断日志；runtime-manager.ts／python-environments.ts 管理组件，python-runtime-paths.ts 统一 Python 导入与 DLL 路径，runtime-files.ts 处理 Windows 目录切换；browser-integrations.ts 只读检测浏览器扩展状态并打开管理页
├── preload/     # 单文件，contextBridge 暴露 window.nolaTranslator
├── shared/      # 跨进程契约：类型 + zod + 默认值；error-catalog.ts 定义稳定用户支持码，languages.ts 为语言代码目录，cloud-config.ts 统一云端识别与翻译连接配置及语言限制，index-translate.ts 定义公开 API、模型及已核实语言预设，model-capabilities.ts 为模型能力与推荐预设。**改枚举必看这里**
└── renderer/    # React 应用
    ├── bridge/  # 渲染进程唯一的数据出口（NolaBridge）
    ├── assets/browsers/ # Chrome／Edge 图标，用于浏览器连接设置
    ├── assets/fonts/    # 随桌面应用打包的 Noto CJK 区域可变字体与 OFL 许可证
    ├── store/   # 4 个域 store，自研 useSyncExternalStore 实现
    ├── components/  # primitives/（封闭 8 个）+ caption/ home/ notes/ reading/
    ├── features/    # home/ workspace/ overlay/ records/ models/ settings/
    ├── i18n/         # zh-CN.ts 定义 Dictionary；locale-builder.ts 组装完整词典；browser-locales.ts 提供扩展文案；en／zh-TW／zh-HK／ko／ja 各有完整强类型词典
    └── theme/        # 设计 token 唯一来源（CSS）；cjk-fonts.css 仅由桌面渲染器加载区域字体
engine/nola_translator_engine/  # Python 引擎，协议定义在 protocol.py，model_capabilities.py 为引擎能力校验
├── recognition/aliyun.py       # LiveTranslate WebSocket、原文与内置译文关联及结束排空
├── recognition/minimax.py      # VAD 切段后逐段上传 WAV、SSE 增量、失败锁存与并发上限
├── translation/mymemory.py     # 公共 REST 翻译、UTF-8 请求分段及业务状态校验
└── translation/index_translate.py # 官方 Index-Translate 提示词、本地 GGUF 与无密钥公开 API
browser/
├── version.json / CHANGELOG.md # 独立扩展版本与发布记录；构建 manifest 与桌面兼容校验共用版本
├── extension/                 # MV3 扩展、播放器适配、临时 store、Shadow DOM；build.mjs 独立构建到 dist/
├── native_host/               # 标准库 stdio／当前用户命名管道连接程序及帧协议测试
└── tests/                     # 隔离配置的浏览器冒烟测试（Playwright，可选开发依赖）
scripts/                        # PowerShell 构建脚本；build-python-base.ps1 构建不含 Torch 的 Python 3.12，generate-runtime-catalog.py 维护组合清单
```

- 组件文件名 PascalCase，逻辑模块 camelCase，测试 `*.test.ts(x)` 与源文件同目录
- 组件目录带 `index.ts` barrel，同时导出组件与 `export type { XProps }`
- 路径别名 `@` / `@renderer` → `src/renderer`（**在 `electron.vite.config.ts` 与 `vitest.config.ts` 中各写一遍**）

## 3. 编码规范

**事件名**
- HeroUI v3 用 `onPress`，**全仓不用 `onClick`**（唯一例外是自建 `FeatureCard` 自己的 prop）
- 图标加 `aria-hidden="true"`

**组件**
- 只用具名导出，不用 default export
- Props 对象用 `export interface XProps`；变体联合用 `export type`
- 组件内不写用户可见字面量：`label: ReactNode` 由调用方传 `t(...)` 的结果
- 多 className 拼接用 `[...].filter(Boolean).join(' ')`

**状态**
- 组件**只**调 store action，**不直接调 `bridge.*`**（`settingsStore.ts:4-5`）
- store **不在模块顶层**触碰 bridge，bridge 由 `initStores()` 注入
- 禁止 `any`（全仓 `src/renderer` 零命中）
- 模块求值期**不得同步抛错**——顶层 throw 会连带 `createRoot` 失败；缺 IPC 时 reject 或降级为 no-op
- `src/main/session-controller.ts` 是桌面与浏览器单会话的唯一控制入口。浏览器临时会话不得创建记录、传 recordingPath 或打开悬浮窗。
- `src/shared/browser.ts` 定义受限的扩展契约、固定开发 ID 和 Native Messaging 名称；不得在该接口暴露凭据、文件或模型管理。

**i18n**
- 界面字符串走 `t()`；界面语言偏好为 `auto`、`zh-CN`、`zh-TW`、`zh-HK`、`ko`、`ja` 或 `en`，`auto` 按系统区域解析；`src/renderer/i18n/` 每个区域语言必须各有完整 `Dictionary` 文件
- `en.ts` 与 `zh-TW`／`zh-HK`／`ko`／`ja` 都必须填满 `Dictionary`；`t()` 收 `Leaves<Dictionary>`，写错 key 是**编译错误**
- 新增 key 只改 `zh-CN.ts`，`en.ts` 会因类型不匹配而报错

**样式**
- 颜色/间距/圆角/字号一律用 token（见 `renderer/theme/`），**不写字面值**
- 按钮统一使用 `--radius-xl` 大圆角，禁止 ghost 变体；图标按钮必须有区别于底层的可见底色，标题栏控件是唯一例外
- 非按钮圆角按语义使用 token，theme 里**没有** `rounded-pill` 这个档位
- 字阶压 HeroUI 原子组件时用 utilities 层任意值类（`text-[11px]`），`.nola-*` 在 base 层会被 components 层覆盖
- z-index 只用 `.z-*` 类（见 DESIGN.MD 第 8 节），**禁 `z-50` 字面量**

## 4. 注释规范

- Runtime catalogs record official wheel ABI, SHA-256 and backend combinations. Checks use built-in Python 3.12 without installing; repair ownership requires an app installation record.
- Index-Translate presets pin official GGUF revisions, sizes and SHA-256, downloading text weights without the vision projector. Both local and public inference use the official single-user translation prompt with thinking disabled. The public service fixes its endpoint and 35B-A3B model and never consumes a saved cloud credential. Language presets expose the 32 names verified in the official reference client rather than assuming the entire 150-language inventory; invalid public targets fail before capture starts.
- The official Hy-MT2 7B preset uses its separately published chat_template.jinja; its role tokens differ from ChatML. Switching to a different GGUF clears this template override.
- Cloud translation uses a session-scoped HTTP pool and streams Chat Completions / Anthropic text; final captions supersede obsolete network intermediates, while native inference retains its reservation. Timing diagnostics distinguish queue, first text, and request duration.
- Aliyun cloud recognition bypasses local ASR weights and component checks. LiveTranslate 3.8 uses delta events and auto source detection; 3.5 uses text/stash snapshots. Native translations join their source items; stream completion sends session.finish and awaits session.finished. Reset closes the old connection before opening another. Credentials remain in encrypted main-process slots, outside settings and browser contracts. MyMemory translates confirmed sentences through REST, checks embedded quota errors, and splits q by UTF-8 bytes; it does not provide token streaming.
- MiniMax speech-to-text accepts one complete audio file per request and has no audio streaming input, so its `stream=true` is response-side only and begins after the upload completes — captions therefore arrive at gate closures rather than mid-utterance. Segments reuse `VolumeGateSegmenter`, which splits on silence and keeps adjacent segments from overlapping, so no text is recognized twice and billing matches the audio. Its 6 s ceiling is a caption-lag budget for speech with no pause to close the gate on, not a service limit; billing follows audio duration, so splitting more often costs the same money. `accept` only hands finished segments to background tasks and returns immediately, because it runs inside the audio capture loop; `flush` drains those uploads so the tail caption lands, cancelling rather than orphaning one that outruns its budget. Deltas are keyed by the server's event `index` rather than arrival order, and a stream cut before its finish event still publishes the partial transcript it already carried. A failure latches on the first error, so one invalid key cannot repeat a billable call for every remaining segment. Its `language` travels as a request header, with app code `tl` rewritten to the provider's `fil`. HTTP 402 and 429 map to separate reason words because they call for opposite user action.
- Cloud recognition failures carry the cause in the engine's wire `code`, because `supportErrorCodeForCause()` and `errorCopyOf()` both read that field; `details.reason` only reaches the rendered message text and the launch log. Auth failures, a spent balance and a rate limit each emit their own code rather than the generic `modelUnavailable`, whose copy points at installing a local model and cannot help a cloud account problem.
- Meeting transcripts persist confirmed speech and settled translation changes, not streamed token revisions; segment counts count unique confirmed segments.
- `src/main/session-log.ts` records application activity in English JSONL under Electron userData/logs, with one unsplit file per app launch and the latest 20 launches retained. Entries are capped individually; there is no file rollover within a launch. `logged-ipc.ts` correlates every IPC operation and records sanitized results; engine commands/events and UI/browser activity share the launch trace. Credentials, audio, device IDs, captions, transcripts, prompts, translation text, free-form error reasons and renderer console message text are omitted; localized diagnostics that survive field redaction remain recoverable as UTF-8 base64. High-frequency audio, caption-update and model-progress events are summarized per second. Pipeline diagnostics travel over stderr to the main logger, which alone owns log retention. `src/shared/error-catalog.ts` owns stable user support codes separately from wire error names; copied feedback includes the support code, request correlation ID and current launch-log path, and is never uploaded automatically.
- Installation caches and staging files are temporary on success, failure, and cancellation; startup cleanup uses known artifact names, skips junctions, and recovers backups before deleting leftovers. Pip does not retain an additional user cache.
- Component DLL paths must match in probes and engine startup; keep Windows DLL-directory handles alive for inference. Older Torch uses MKL in the component's `Library/bin`, and the Python base bundles the VC++ OpenMP runtime.
- Caption startup reuses validated components and one recent device inventory. Recognition and enabled local translation models load concurrently without trial inference; only the selected configuration stays resident across stops. Native jobs retain their reservation until idle. Service close, model changes and shutdown release weights; dependency imports run in the background after the engine handshake and stage timings reach the launch log.

- 模型语言目录、推荐能力与运行引擎限制的注释须注明来源或限制原因；用户配置不代表模型自动获得新能力。
- 浏览器采集限制注释须注明浏览器 API 原因；`getDisplayMedia` 必须在用户动作的原调用栈发起，Capture Handle 校验后仅处理音频。
- 浏览器安装状态只读 Preferences／Secure Preferences 或以实际连接确认；不得修改浏览器受保护配置。每浏览器开关仅控制 Nola 连接权限，不能冒充浏览器扩展开关。
- Extension handshakes report the content bundle version compiled from the same source as the manifest; desktop checks it against browser/version.json before starting recognition. A reloaded background must not overwrite the version of an old page. Installation detection reads cached or registered manifests, while live handshakes take precedence. Missing or incompatible extensions produce deduplicated desktop toasts with a download action. Playback capture disables microphone voice processing; digital silence is a recoverable warning, not proof that sharing failed.
- 浏览器音频块为单声道 PCM16、约 100 ms，输入与确认各限两秒；epoch／sequence／session 校验与 TS、zod、Python 协议同步维护。视频时间通过 browserTimeline 映射，禁止直接使用会话相对时间。
- 重置保留加载的模型，隔离旧推理和翻译；停止回执不得等待不可取消的原生推理线程，后台原生任务结束前锁定资源。自然结束用 finishStream 排空尾句。

1. 基本原则
- 统一使用英文注释
- 注释说明“为什么”，代码本身说明“做什么”。
- 优先写清楚的代码，避免重复描述代码行为。
- 注释应准确、简洁，并与代码保持同步。

2. 行内注释
- 放在相关代码上方，说明特殊原因、限制或不明显的逻辑。
- 不为简单语句添加注释。
- 避免在行尾堆叠注释。

3. 函数与组件注释
- 对用途不明显、规则复杂或有副作用的函数添加说明。
- 说明重要参数、返回值、副作用和调用限制。
- 简单函数不必重复写注释。

4. 类型与常量注释
- 为不明显的类型约束、枚举含义和常量来源补充说明。
- 注明单位、范围或特殊取值规则。
- 不重复类型名称或变量名称已经表达的信息。

5. TODO 与 FIXME
- TODO：尚未完成的工作。
- FIXME：已知问题或需要修复的行为。
- 简要说明原因或后续方向；处理完成后删除注释。

6. 禁止事项
- 不保留过时、错误或与代码矛盾的注释。
- 不用注释大段复述实现过程。
- 不用注释代替变量名、函数名或必要的文档。
- 不添加无明确用途的作者、日期或变更历史。

## 5. 构建命令

```
npm run dev            # 开发（electron-vite）
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run build          # typecheck && electron-vite build
npm run build:browser  # 构建可手动加载的 MV3 扩展
npm run package:browser # release/Nola-Browser-Extension.zip
npm run build:browser-host # PyInstaller Native Messaging EXE
npm run build:python   # 内置 Python 3.12 基础组件，不包含 Torch／llama
npm run dist:win       # 完整发布：build → build:python → electron-builder（EXE + MSI）
node scripts/check-installer-paths.mjs [makensis.exe] # Windows NSIS 目录回归检查；可指定编译器路径
```

## 6. 约定与协作

**Commit 规范**

- 格式：`<type>[optional scope][!]: <description>`
- 类型：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore`
- 破坏性变更：前缀加 `!`
- 描述用**英文**、祈使语气、小写开头、不加句号
- 提交前先主动发给用户确认写好的提交信息（写在一个代码块中），**提交信息请使用英文**

**多 Agent 并发**

- 派活必须写清文件所有权边界，避免两个 worker 改同一个文件
- 并行前先 `git status --porcelain -uall` 确认目标文件不存在
- 审计与修复分开：Verifier 只出结论，修复派 Worker

**维护本文件**

- 项目结构变更必须同步更新第 1、2、4 节
