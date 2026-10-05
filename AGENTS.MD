# AGENTS.md

> 写给 AI 编程助手的项目规范。视觉规范见 [DESIGN.MD](./DESIGN.MD)。
> 改项目结构的那一刀必须同步改本文件，否则 AI 拿着过时结构硬套比没有这份文件更糟。

## 1. 技术栈

- Electron 43.1.1 + React 19.2.7 + TypeScript 7.0.2，`electron-vite` 5 构建，`"type": "module"`
- 包管理器 npm 11.17.0（**不是 yarn/pnpm**），Node `>=24 <25`
- 样式：Tailwind v4（`@tailwindcss/vite`）+ CSS 自定义属性 token，**无 CSS Modules、无 Less/Sass**
- UI 库：HeroUI React v3.2.6 + `@heroui/styles`，图标 `lucide-react`
- 运行时校验：zod 4.4.3，**只存在于主进程侧**（`src/main` / `src/shared`）
- 引擎：Python 包 `engine/nola_translator_engine`，经 stdio JSON-lines 与主进程通信
- 测试：vitest 4 + @testing-library/react，jsdom 环境

## 2. 目录结构

```
src/
├── main/        # Electron 主进程：IPC 注册、窗口、设置/凭据持久化、引擎子进程
├── preload/     # 单文件，contextBridge 暴露 window.nolaTranslator
├── shared/      # 跨进程契约：类型 + zod + 默认值。**改枚举必看这里**
└── renderer/    # React 应用
    ├── bridge/  # 渲染进程唯一的数据出口（NolaBridge）
    ├── store/   # 4 个域 store，自研 useSyncExternalStore 实现
    ├── components/  # primitives/（封闭 8 个）+ caption/ home/ notes/ reading/
    ├── features/    # home/ workspace/ overlay/ records/ models/ settings/
    ├── i18n/         # zh-CN.ts 为 Dictionary 源，en.ts 受其类型约束
    └── theme/        # 设计 token 唯一来源（CSS）
engine/nola_translator_engine/  # Python 引擎，协议定义在 protocol.py
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

**i18n**
- 界面字符串走 `t()`，语言只有 `'zh-CN' | 'en'`
- `en.ts` 声明为 `const en: Dictionary`，`t()` 收 `Leaves<Dictionary>`，写错 key 是**编译错误**
- 新增 key 只改 `zh-CN.ts`，`en.ts` 会因类型不匹配而报错

**样式**
- 颜色/间距/圆角/字号一律用 token（见 `renderer/theme/`），**不写字面值**
- 圆角写数字任意值 `rounded-[8px]`，theme 里**没有** `rounded-pill` 这个档位
- 字阶压 HeroUI 原子组件时用 utilities 层任意值类（`text-[11px]`），`.nola-*` 在 base 层会被 components 层覆盖
- z-index 只用 `.z-*` 类（见 DESIGN.MD 第 8 节），**禁 `z-50` 字面量**

## 4. 构建命令

```
npm run dev            # 开发（electron-vite）
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run build          # typecheck && electron-vite build
npm run dist:win       # 完整发布：build → build:engine:cpu → prepare:llama:cpu → electron-builder
```

## 5. Never 规则

### 契约与枚举（本仓最大的缺陷来源）

- **Never 只改枚举的一部分声明。** 同一枚举在 TS/zod/Python 间手工同步、无生成器：
  - 翻译 provider：`shared/settings.ts:73,149`、`shared/schemas.ts:62`、`main/settings-schema.ts:71`、`engine/.../protocol.py:80`
  - 云端 API 格式：`shared/settings.ts:82,151`、`shared/schemas.ts:75`、`main/settings-schema.ts:80`、`engine/.../protocol.py:49`
  - 错误码（13 个）：`shared/contracts.ts:271`、`shared/schemas.ts:165-179`、`engine/.../protocol.py:367-381`
  - 识别/翻译模型 id：`shared/settings.ts`、`shared/schemas.ts`、`main/settings-schema.ts`、`engine/.../models/catalog.py`
  - compute 枚举：`shared/compute.ts:4-15` vs `engine/.../compute.py:16-27`（字段数还不一致）
  - loader（`llama.cpp`/`transformers`/`funasr`）：`shared/contracts.ts:220`、`shared/schemas.ts:212`、`engine/.../hub.py:40`
- **Never 只改一张 IPC channel 表。** 4 处：preload `index.ts:7-37`、main `ipc.ts:13-32`、
  `app-ipc.ts:19-28`、`runtime-ipc.ts:7`（该处是**位置索引数组**，重排即静默改错通道）
- **Never 给 `ResourceRecord.provider` 收窄成闭合联合。** 自装模型会带 `llama.cpp` 等适配器 id；
  收窄会让记录解析失败，而**事件解析失败 = 协议损坏 = 直接杀掉引擎进程**（`shared/schemas.ts:186-188`）
- **Never 在 `getEngineState` 里调 `ensureReady()`。** 该通道的全部意义就是回答「引擎现在怎么样」，
  自己会启动引擎就永远问不出「从没启动过」（`main/ipc.ts:356-365`）
- **Never 给 `AppSettingsPatch` 加字段却不同步 `main/settings-schema.ts`。** 注释已写明：
  两者之间没有任何机制强制一致，漏改则**静默丢弃**，设置永远不落盘（`settings-schema.ts:4-11`）
- **Never 发送 `translationOptions: {}`。** `provider === 'local'` 时该字段必须**整个缺席**，
  空对象会被引擎判为非法配置（`shared/contracts.ts:52-56`、`main/ipc.ts:275-284`）

### 进程边界

- **Never 在 `ipcBridge.ts` 之外触碰 `window.nolaTranslator`。** 该全局只允许在 `ipcBridge.ts:51-55` 读一次
  （现存越界：`OverlayRoot.tsx:118`、`TitleBar.tsx:105`、`i18n.tsx:94,127`）
- **Never 在组件里直接调 `bridge.*`**，走 store action
- **Never 把 API key 写进 `SecureCredentialStore`（`safeStorage` 加密 → `credentials.json`）以外的地方**
- **Never 假设 `engine:event` 只带引擎事件**，它也带主进程自己的 `engineStateChanged`

### 生成物与依赖

- **Never 手改 `engine/dist/`、`vendor/`、`out/`、`release/`、`build/runtime-*.json`**（均在 .gitignore）
- **Never 顺手改 `package-lock.json`**

### UI

- **Never 直接渲染 `state.error`。** 它是引擎抛的诊断原文（可能是中文），不走 i18n；
  界面必须用 `errorCode` / `errors.*` 去 `t()` 查（`store/index.ts:18-21`）
- **Never 加第 9 个 primitive。** `components/primitives/` 封闭 8 个，理由见 DESIGN.MD 第 11 节
- **Never 移动 `src/renderer/index.css` 或删掉 `source(none)`。** `@source` 路径相对 CSS 文件，
  挪走会让所有 `features/**` 的类**静默失效**且不报错（`index.css:8-25`）
- **Never 往 `index.html` 加内联 `<script>`。** CSP 是 `script-src 'self'`，
  需提前执行的脚本放 `public/theme-boot.js`（`index.html:21-28`）
- **Never 把 `renderer/index.css` 的导入顺序改乱**：`source(none)` → `@source` → `@heroui/styles` → `theme/index.css` → `theme/app.css`（`index.css:27-31`）
- **Never 加第二个渲染进程入口**，浮窗靠 `main.tsx:33` 的 `?overlay=1` 分支

### 协作

- **Never `git stash`、Never 切分支、Never commit 别人改过的文件**（多 Agent 并发时，stash 会吞掉对方的改动）
- **Never 未经用户确认就 commit。** 提交前先把提交信息发给用户确认，且**提交信息用英文**

## 6. 约定与协作

**Commit 规范**

- 格式：`<type>[optional scope][!]: <description>`
- 类型：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore`
- 破坏性变更：前缀加 `!`
- 描述用**英文**、祈使语气、小写开头、不加句号
- 提交前先主动发给用户确认，**提交信息请使用英文**
- 正文留空

**多 Agent 并发**

- 派活必须写清文件所有权边界，避免两个 worker 改同一个文件
- 并行前先 `git status --porcelain -uall` 确认目标文件不存在
- 审计与修复分开：Verifier 只出结论，修复派 Worker

**维护本文件**

- 每踩一个坑就往第 5 节加一条 Never 规则，并写清原因
- 项目结构变更必须同步更新第 1、2、4 节