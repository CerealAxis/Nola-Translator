# AGENTS.md

本文件约束 Nola Translator 仓库中的 AI 编程助手。优先完成用户当前任务，遵守项目既有架构与明确的操作边界。视觉规范见 [DESIGN.MD](./DESIGN.MD)，shadcn-ui文档见 [./llms.txt]

## 1. 工作原则

- **以任务为中心**：先定位相关代码与约束，再修改；按需阅读本文列出的入口，不必在每次任务开始时遍历全仓或阅读所有文档。
- **完成闭环**：对于已明确授权的任务，自主完成实现、必要验证和由本次改动引起的修复；不要只给方案或完成一半便停下来。信息不足但不影响正确性时，基于现有代码作合理判断；关键产品决策、破坏性操作和受保护文件修改按下文确认。
- **控制范围**：优先做最小且完整的改动，沿用现有抽象；不借机重构无关模块、增加依赖或改变用户未要求的行为。保留工作区已有修改，不覆盖其他人或 Agent 的成果。
- **按风险验证**：运行与改动有关的检查；失败则定位并修复本次改动引入的问题。通过后无需无理由重复全套测试。可能下载模型、使用云服务、覆盖用户数据或产生高成本的操作，先核实影响。
- **说明结果**：结束时简述变更内容、验证结果及未验证事项，不把未执行的检查描述为已通过。

## 2. 技术栈与代码入口

| 领域 | 技术或入口 |
| --- | --- |
| 桌面端 | Electron + React + TypeScript；`electron-vite` 构建 |
| UI | Tailwind CSS v4 + shadcn/ui（Base UI）；`src/renderer/components/ui/` 为基础组件源码入口，独立透明子窗口承载悬浮字幕 |
| 状态与通信 | `NolaBridge`、5 个领域 Store、`useSyncExternalStore`、IPC |
| 引擎 | 内置 Python 3.12；PyTorch / llama.cpp / CrispASR 组件按需安装或复用 |
| 本地识别 | PyTorch、llama.cpp 或 CrispASR；根据已安装加载器选择 |
| 本地翻译 | PyTorch 或 llama.cpp；支持 Index-Translate 官方权重及独立免费 API |
| 云端能力 | 阿里云 WebSocket 流式识别与译文；MiniMax VAD 分段上传 WAV；MyMemory REST 翻译 |
| 浏览器扩展 | Chrome / Edge / Firefox MV3；Python Native Messaging 连接桌面程序 |
| 文档与演示 | VitePress 多语言站；Vue 容器挂载 React，复用桌面 UI、主题及演示入口 |
| 质量保障 | Vitest + Testing Library；JSONL 诊断日志 |

按任务定位以下目录；结构调整后必须同步更新本节索引。

```
src/
  main/                   Electron 主进程：IPC、窗口、设置、引擎与会话
  preload/                单文件 contextBridge → window.nolaTranslator
  shared/                 跨进程类型、Zod 校验、默认值和浏览器契约
  renderer/
    application.tsx       桌面、文档站、Toy 共用的页面及导航注册
    bridge/               渲染进程唯一数据出口（NolaBridge）
    store/                5 个领域 Store 与 useSyncExternalStore 实现
    components/
      assistant-ui/       官方聊天、附件、模型选择等组件源码（本地调用开发预览）
      ui/                 shadcn/ui Base UI 基础组件源码
      primitives/         Nola 产品级 primitives 与通知适配
      reading/            阅读与播放器组件
      notes/              笔记组件
      home/               首页展示组件
    features/             home、workspace、overlay 等功能模块
      local-call/         仅 Electron 开发模式可见的 assistant-ui 本地调用界面
    i18n/                 完整语言字典及组装逻辑
    theme/                设计 token 唯一来源及 CJK 字体样式
    assets/browsers/      Chrome / Edge / Firefox 图标
    assets/fonts/         随应用打包的 Noto CJK 区域可变字体
engine/nola_translator_engine/   Python 翻译引擎
browser/
  version.json            扩展版本信息
  CHANGELOG.md            扩展发布记录
  extension/              MV3 扩展
  native_host/            stdio Native Messaging 主机与帧协议测试
  tests/                  浏览器冒烟测试
docs/
  nola-docs/              终端用户文档及多语言首页
  .vitepress/             站点配置、主题和语言入口
  media-src/              演示环境与 Toy 共用素材
  scripts/                构建演示、生成素材及截图的脚本
  public/                 静态资源与文档配图
  PRD/                    内部需求与架构文档，不参与站点构建
assets/brand/             App Logo 与 GitHub 官方头像
scripts/                  PowerShell 构建与运行时管理脚本
```

### assistant-ui

This project uses assistant-ui for chat interfaces.

Documentation: https://www.assistant-ui.com/llms-full.txt

Key patterns:
- Use AssistantRuntimeProvider at the app root
- Thread component for full chat interface
- AssistantModal for floating chat widget
- useChatRuntime hook with AI SDK transport

## 3. React、i18n 与视觉规范

### 组件和事件

- 统一使用具名导出，禁止 `default export`；组件 Props 用 `export interface XProps`，变体联合用 `export type`。
- shadcn/ui（Base UI）原生按钮使用 `onClick`；复合控件按其实际 `onValueChange` 等接口处理。不要把旧 `onPress`、`selectedKeys`、`isPending` 机械替换；逐项映射禁用、键盘与异步状态。
- 装饰性图标添加 `aria-hidden="true"`。
- 可复用组件内不写用户可见文本字面量；由调用方通过 `t(...)` 生成后以 `label: ReactNode` 等 Prop 传入。
- 拼接多个 `className` 使用 `[...].filter(Boolean).join(' ')`。

### 国际化

- 所有界面字符串使用 `t()`；语言偏好可取 `auto`、`zh-CN`、`zh-TW`、`zh-HK`、`ko`、`ja`、`en`，`auto` 根据系统区域解析。
- 六个具体区域语言必须各有完整 `Dictionary`。`t()` 的 key 类型为 `Leaves<Dictionary>`，错误 key 应触发编译错误。
- 新增或修改 key 时同步更新六个区域语言。`zh-CN.ts` 从各 `*-ui.ts` 子字典组装，因此可在相应子字典定义新 key。
- TS2741 对单个对象可能只报告第一个缺失字段；改动字典时应执行**全语言 key 全量比对**，不能只依靠 `tsc`。

### 样式

- 需要变更 UI 时阅读 [DESIGN.MD](./DESIGN.MD)；颜色、间距、圆角和字号以 `src/renderer/theme/` 的 token 为准，不引入任意字面值。
- 按钮统一使用 `--radius-xl`，禁止 `ghost` 变体；图标按钮必须有区别于背景的可见底色，标题栏控件除外。
- 非按钮圆角按语义选 token；主题中没有 `rounded-pill` 档位。
- shadcn/ui 组件使用 Nola 语义 token，不使用默认黑白主题；同名语义变量须经独立映射，避免与既有全局 token 冲突。原子组件覆盖字阶时可在 utilities 层使用任意值类（例如 `text-[11px]`）；这仅是字号规则的特定例外。
- z-index 只使用 `DESIGN.MD` 第 8 节规定的 `.z-*` 类，禁止写 `z-50` 等字面层级。

## 4. 注释规范

- 代码注释统一使用**英文**。注释解释原因、边界、特殊取值和不明显的副作用，而非重复代码已经表达的行为。
- 仅对复杂函数、组件、类型或常量添加有价值的注释；需要时写明参数限制、返回值、副作用及单位或范围。行内注释放在对应代码上方，避免行尾堆叠。
- `TODO` 标记待完成事项，`FIXME` 标记已知问题；说明原因或下一步，解决后删除。
- 不保留过期、错误、与实现矛盾的注释；不写无用途的作者、日期、修改历史，也不机械要求每个函数或变量都有注释。

## 5. 构建与验证

按改动范围选择相关命令，无需每次全部执行：

```bash
npm run dev              # Electron 开发环境
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
npm run build            # typecheck + electron-vite build
npm run build:toy        # 真实 UI 的 Toy 演示构建 → artifacts/toy
npm run test:demo        # Toy 子路径、17 页面、三种尺寸、会话、六语言深色 UI
npm run test:onboarding  # 首次引导、再次查看、六语言、双主题、三种尺寸
npm run build:browser    # MV3 浏览器扩展
npm run package:browser  # release/Nola-Browser-Extension.zip
npm run build:browser-host # PyInstaller Native Messaging EXE
npm run build:python     # Python 3.12 基础组件，不含 Torch / llama
npm run dist:win         # build → build:python → electron-builder（EXE + MSI）
node scripts/check-installer-paths.mjs [makensis.exe] # NSIS 安装目录回归检查
```

- 普通代码更改：先做相关单测及类型检查；跨进程、安装器、模型运行时或发布链路变更，再执行对应专项检查。
- UI 或 i18n 更改：按影响范围检查相应页面、语言、主题与窗口尺寸；改动引导流程时使用 `test:onboarding`，改动演示环境时使用 `test:demo`。
- 不因纯文案或低风险局部调整机械执行完整打包。若环境缺失导致无法验证，应明确说明限制。

## 6. 协作、提交与文件权限

### Git 与多 Agent

- 修改前检查相关文件及工作区状态；进行并行任务时先运行 `git status --porcelain -uall`，识别现有修改与未跟踪文件，避免覆盖或路径冲突。
- 多 Agent 并行须明确**文件所有权边界**，同一文件不得交由两个 Worker 同时修改。
- 审计与修复分离：Verifier 只报告问题与证据，Worker 负责修复。任务足够独立且并行有收益时再拆分，无需为简单改动强制启动子 Agent。

### Commit

- 格式：`<type>[optional scope][!]: <description>`；类型为 `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore`。
- 破坏性变更使用 `!`；描述使用**英文祈使语气**，首字母小写，不以句号结尾。
- **不得自行提交。** 需要提交时先完成改动及验证，再把拟议提交信息放在**单独代码块**中发给用户，收到确认后才执行 Git Commit。

### 文档与规则维护

- 未经用户明确授权，不修改 `docs/`（含文档站与内部 PRD）、`README*` 或其他文档；先提出可审阅的修改内容。用户在当前任务中明确批准具体文件与改动时，不必重复确认。
- `AGENTS.md` 的既有规范不得因无关任务被擅自改写。项目结构变化时，**必须同步维护第 2 节的目录和入口索引，修改前提醒用户校对**；其他规范仅在用户要求或明确批准时更改。
- 简体中文帮助文档位于 `docs/nola-docs/zh-CN/`，使用 `/zh-CN/` URL 前缀；`docs/nola-docs/index.md` 保留产品首页。帮助内容沿用既定大纲，截图由脚本生成。
- 文档配图放在 `docs/public/docs-image/{语言代码}/{文档分类}/{文章名}/`，采用有意义文件名，以 `/docs-image/` 引用；不同语言分别保存图片副本。
- `docs/PRD/` 仅保存内部需求和架构文档；`docs/nola-docs/` 只放终端用户指引，不混放。

未经用户同意，不准修改以上章节的内容，如果却有需要记录的，请分点记录在下面。

```
### 章节名

- 分点
```

### 独立本地调用入口

- 本地调用开发窗口使用 `src/renderer/native-agent.html`、`native-agent-entry.tsx` 和 `native-agent-entry.css`，不加载主页面的 `index.css` 或 Nola 产品主题。窗口由 `src/main/local-call-demo.ts` 注册，仅 Electron 开发环境可打开。
- 官方 Elements 源码位于 `src/renderer/components/assistant-ui/native/`；实际界面组合、原生卡片工具和渲染状态分别位于 `features/local-call/NativeAgentSurface.tsx`、`native-agent-tools.tsx` 和 `NativeAgentSettings.tsx`。旧聊天组件、旧侧栏和旧工作区组件已移除。
