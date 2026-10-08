# AGENTS.md

> 写给 AI 编程助手的项目规范。视觉规范见 [DESIGN.MD](./DESIGN.MD)。
> 改项目结构的那一刀必须同步改本文件。

## 1. 技术栈

- 桌面应用：Electron + React + TypeScript
- 引擎：Python（模型能力持久化在自定义模型注册表，启动与逐句翻译必须校验配置）
- UI：Tailwind CSS + HeroUI
- 构建：electron-vite
- 测试：Vitest + Testing Library
- 浏览器：Chrome／Edge Manifest V3 + React／TypeScript；Python 标准库 Native Messaging 连接程序由 PyInstaller 打包

## 2. 目录结构

```
src/
├── main/        # Electron 主进程：IPC 注册、窗口、设置/凭据持久化、引擎子进程；browser-integrations.ts 只读检测浏览器扩展状态并打开管理页
├── preload/     # 单文件，contextBridge 暴露 window.nolaTranslator
├── shared/      # 跨进程契约：类型 + zod + 默认值；languages.ts 为语言代码目录，model-capabilities.ts 为模型能力与推荐预设。**改枚举必看这里**
└── renderer/    # React 应用
    ├── bridge/  # 渲染进程唯一的数据出口（NolaBridge）
    ├── assets/browsers/ # Chrome／Edge 图标，用于浏览器连接设置
    ├── store/   # 4 个域 store，自研 useSyncExternalStore 实现
    ├── components/  # primitives/（封闭 8 个）+ caption/ home/ notes/ reading/
    ├── features/    # home/ workspace/ overlay/ records/ models/ settings/
    ├── i18n/         # zh-CN.ts 为 Dictionary 源，en.ts 受其类型约束
    └── theme/        # 设计 token 唯一来源（CSS）
engine/nola_translator_engine/  # Python 引擎，协议定义在 protocol.py，model_capabilities.py 为引擎能力校验
browser/
├── extension/                 # MV3 扩展、播放器适配、临时 store、Shadow DOM；build.mjs 独立构建到 dist/
├── native_host/               # 标准库 stdio／当前用户命名管道连接程序及帧协议测试
└── tests/                     # 隔离配置的浏览器冒烟测试（Playwright，可选开发依赖）
scripts/                        # PowerShell 构建脚本
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
- 界面字符串走 `t()`，语言只有 `'zh-CN' | 'en'`
- `en.ts` 声明为 `const en: Dictionary`，`t()` 收 `Leaves<Dictionary>`，写错 key 是**编译错误**
- 新增 key 只改 `zh-CN.ts`，`en.ts` 会因类型不匹配而报错

**样式**
- 颜色/间距/圆角/字号一律用 token（见 `renderer/theme/`），**不写字面值**
- 圆角写数字任意值 `rounded-[8px]`，theme 里**没有** `rounded-pill` 这个档位
- 字阶压 HeroUI 原子组件时用 utilities 层任意值类（`text-[11px]`），`.nola-*` 在 base 层会被 components 层覆盖
- z-index 只用 `.z-*` 类（见 DESIGN.MD 第 8 节），**禁 `z-50` 字面量**

## 4. 注释规范

- 模型语言目录、推荐能力与运行引擎限制的注释须注明来源或限制原因；用户配置不代表模型自动获得新能力。
- 浏览器采集限制注释须注明浏览器 API 原因；`getDisplayMedia` 必须在用户动作的原调用栈发起，Capture Handle 校验后仅处理音频。
- 浏览器安装状态只读 Preferences／Secure Preferences 或以实际连接确认；不得修改浏览器受保护配置。每浏览器开关仅控制 Nola 连接权限，不能冒充浏览器扩展开关。
- 浏览器音频块为单声道 PCM16、约 100 ms，输入与确认各限两秒；epoch／sequence／session 校验与 TS、zod、Python 协议同步维护。视频时间通过 browserTimeline 映射，禁止直接使用会话相对时间。
- 重置保留加载的模型，隔离旧推理和翻译；停止回执不得等待不可取消的原生推理线程，后台卸载完成前锁定资源。自然结束用 finishStream 排空尾句。

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
npm run dist:win       # 完整发布：build → build:engine:cpu → prepare:llama:cpu → electron-builder（EXE + MSI）
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
