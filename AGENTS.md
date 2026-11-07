# AGENTS.md

本文件定义 Nola Translator 仓库中 AI 编程助手的工作规范。

**核心原则：优先完成任务、遵循现有架构、控制修改范围、验证实际结果、尊重用户决策。**

相关资源：

- 视觉与组件规范：[DESIGN.md](./docs/design-system/DESIGN.md)
- 设计原则与文档目录：[设计文档](./docs/design-system/outline.md)
- 工程规约：[编码与工程规约目录](./docs/design-system/engineering/index.md)
- 产品帮助文档：[帮助文档](./docs/help-docs/zh-CN/docs.md)
- shadcn/ui 文档：[llms.txt](./llms.txt)
- assistant-ui 文档：https://www.assistant-ui.com/llms-full.txt
- 项目 Skills：`./skills/`

## 1. 工作原则

### 1.1 任务执行

- **任务优先**：先理解目标并定位相关代码，再开展修改。按需查阅文档，不必每次遍历整个仓库。
- **自主闭环**：对已授权任务，完成实现、必要验证及本次改动引发的修复，不停留在建议或半成品。
- **合理判断**：非关键细节可根据现有代码和项目惯例自主决定；涉及重要产品决策、破坏性操作或受保护文件时，必须取得授权。
- **最小完整改动**：优先复用现有抽象，不借机重构无关模块、不无故引入依赖、不改变未要求的行为。
- **保护工作区**：保留用户和其他 Agent 已有的修改，不擅自覆盖或清理。
- **善于借鉴**：优先研究成熟项目及已有实现，避免重复造轮子；借鉴外部代码时注意许可证及兼容性。

### 1.2 验证与交付

- 根据改动范围选择测试，而非每次执行完整测试套件。
- 发现本次改动导致的问题，应定位并修复。
- 测试通过后，无需无理由重复执行。
- 可能下载模型、调用付费云服务、覆盖数据或产生高成本的操作，先明确影响。
- 完成任务后简要说明：
  - 实际修改内容
  - 已执行的验证及结果
  - 尚未验证的内容或已知限制
- 严禁将未执行、未通过的检查描述为已通过。

## 2. 技术架构与代码入口

### 2.1 技术栈

| 领域 | 技术与架构 |
| --- | --- |
| 桌面端 | Electron + React + TypeScript，electron-vite |
| UI | Tailwind CSS v4 + shadcn/ui（Base UI） |
| 状态管理 | NolaBridge、5 个领域 Store、useSyncExternalStore |
| 进程通信 | contextBridge、IPC |
| 实时后端 | Electron 监督的 Python 3.12 + FastAPI，私有 v2 REST / WebSocket |
| 模型网关 | 能力匹配、模型租约、本地 Worker 生命周期 |
| 本地运行时 | PyTorch / llama.cpp / CrispASR |
| 本地 ASR | PyTorch、llama.cpp、CrispASR，按已安装加载器选择 |
| 本地 MT | PyTorch、llama.cpp、Index-Translate 官方权重 |
| 云端能力 | 阿里云 LiveTranslate S2S、阿里云与 MiniMax ASR、云端 MT、独立免费 API |
| 浏览器扩展 | Chrome / Edge / Firefox MV3 + Native Messaging |
| 文档系统 | VitePress 多语言站，Vue 容器挂载 React |
| 测试诊断 | Vitest、Testing Library、JSONL 诊断日志 |

悬浮字幕使用独立透明子窗口。浏览器扩展拥有独立的提供商配置和语言设置。

### 2.2 目录与入口索引

按任务查阅对应目录，不需要预先阅读全部代码。

```text
src/
  main/                      Electron 主进程
    backend-supervisor.ts     v2 后端启动、鉴权、退出
    backend-session.ts        快速同传与浏览器字幕会话
    backend-browser-input.ts  浏览器音频接入
    backend-playback.ts       音频播放与确认
    backend-direct-model.ts   单次推理及本地 LLM 租约
    model-gateway.ts          v1 协议及旧 Worker 兼容
    screen-translation.ts     屏幕翻译与捕获
    game-translation.ts       游戏档案、OCR / Hook / 剪贴板翻译
    game-hook.ts              双位数 Hook 辅助进程与文本线程
    game-overlay.ts           游戏独立浮动字幕
    comic.ts                  漫画 IPC、工程及任务生命周期
    comic-reader.ts           工作台漫画只读工具
    glossary-store.ts         桌面术语库与原子保存
    desktop-data.ts           桌面数据登记、快照备份与恢复
    desktop-data-ipc.ts       数据操作权限及重启调度
    workbench.ts              独立工作台窗口
    latency-window.ts         延迟检测窗口
    latency-session.ts        延迟采集点与会话汇总
    meeting-mode.ts           会议口译会话组

  preload/                   contextBridge
  shared/                    类型、Zod、默认值与协议

  renderer/
    application.tsx          页面及导航注册
    available-models.ts      模型目录与选择回退
    bridge/                  NolaBridge 数据出口
    store/                   5 个领域 Store
    theme/                   设计 token 与 CJK 字体
    i18n/                    多语言字典

    components/
      ui/                    shadcn/ui Base UI 组件
      assistant-ui/
        native/              官方 Elements 源码
      primitives/            产品级组件及通知
      reading/               阅读与播放器
      notes/                 笔记
      home/                  首页

    features/
      home/                  首页
      workspace/             工作区
      overlay/               悬浮字幕
      workbench/             Agent 工作台
        NativeAgentSurface.tsx
        native-agent-tools.tsx
        NativeAgentSettings.tsx
      model-gateway/         模型网关 UI
      meeting/
        MeetingModePage.tsx  会议口译与音频路由
      screen/                屏幕翻译
      game/                  游戏库、文本来源与浮动字幕
      comic/                 漫画书架、编辑器与阅读器
      settings/glossary/     术语库配置与场景选库控件
      settings/DesktopDataGroup.tsx  数据占用、备份与恢复界面
      latency/               延迟检测 UI

    workbench.html           工作台独立入口
    workbench-entry.tsx
    workbench-entry.css
    latency.html             延迟检测独立入口
    latency-entry.tsx
    screen.html              屏幕翻译独立入口

    assets/
      browsers/              浏览器图标
      fonts/                 Noto CJK 可变字体

engine/
  nola_translator_engine/
    backend/
      gateway/               Provider、资源与 Worker
      screen_ocr.py          PP-OCRv5 mobile
      comic.py               漫画工程、任务、修图与排版
      comic_formats.py       PDF、图片型 EPUB 和 Kindle 漫画格式适配
      comic_inpaint.py       漫画神经修复 Worker 的加载与释放
      lama_network.py        LaMa Manga 网络实现
      glossary.py            后端术语匹配与请求上下文
      latency.py             延迟检测采集
      meeting.py             会议会话组
      meeting_audio.py       原声音频混合

    models/inpaint_catalog.py  LaMa Manga 权重版本与完整性校验信息

  contracts/v2/              生成的 v2 协议
  tests/backend/             后端与流水线测试

browser/
  version.json
  CHANGELOG.md
  extension/
    providers.ts             Provider 配置
    provider-runtime.ts      请求调度
    translation-cache.ts     持久翻译缓存
    glossary-store.ts        扩展私有术语库、迁移及恢复
    glossary-translation.ts  命中术语与翻译能力适配
    speech-runtime.ts        ASR / S2S 与字幕翻译
    offscreen.ts             独立音频采集与回放
    tab-audio-runtime.ts     PCM 与播放生命周期
    native-provider.ts       Native Messaging
    content.tsx              网页覆盖层
    content-lifecycle.ts     脚本清理与重注入
    popup.tsx                工具栏弹窗与原生侧栏共用界面
    sidepanel.html           Chrome / Edge / Firefox 原生侧栏入口
    floating/                悬浮按钮
    components/
      SettingsPreview.tsx    设置效果预览
    locale-base.ts           中英字典
    locale-regions.ts        其他区域字典
  native_host/               Native Messaging 主机
  tests/                     扩展测试

docs/
  help-docs/                 多语言帮助文档与产品首页
  design-system/             设计系统规范与组件示例文档
  .vitepress/                站点配置
  media-src/                 演示及截图素材
  scripts/                   文档构建脚本
  public/                    静态资源
  PRD/                       内部需求与架构文档

assets/brand/                品牌资源
native/game-hook/            Windows Hook 辅助进程源码
  advanced.h                 Hook 搜索、候选与内嵌回调
scripts/                     构建与运行时管理
  build-game-hook.ps1        双位数 Hook 构建及对应源码归档
skills/                      项目 Skills
```

### 2.3 特殊架构约束

**工作台**

- 工作台窗口由 `src/main/workbench.ts` 注册。
- 独立加载 `workbench.html`、`workbench-entry.tsx`、`workbench-entry.css`。
- 不加载主页面的 `index.css` 或 Nola 产品主题。
- 官方 Elements 源码位于 `components/assistant-ui/native/`。
- Agent 界面、原生工具卡片及设置分别由 `NativeAgentSurface.tsx`、`native-agent-tools.tsx`、`NativeAgentSettings.tsx` 管理。
- 旧聊天组件、旧侧栏和旧工作区组件已移除，不应重新依赖。

**实时后端与模型**

- 使用现有 FastAPI v2 会话与模型网关架构。
- 模型能力调用须遵循现有能力匹配、资源准入和租约生命周期。
- v1 接口属于兼容入口，不应未经要求扩大旧架构的使用范围。

**浏览器扩展**

- 扩展私有配置、语言及缓存与桌面端分离。
- Native Messaging 是浏览器调用桌面模型能力的既有通道。
- 修改音频路由时，保留既有防反馈及生命周期管理约束。

## 3. 前端与国际化规范

### 3.1 视觉规范

修改界面、文档示例或截图前，完整阅读 `docs/design-system/DESIGN.md`，并查阅设计文档中对应的原则与组件章节。

- 颜色、字号、间距、尺寸和圆角遵循该规范，通过 `src/renderer/theme/` 中的现有设计 token 实现。
- 现有实现与规范不一致时，指出具体差异；不沿用过时数值。
- 不新增无依据的硬编码视觉值。
- 按钮统一采用 `--radius-xl`，禁止 `ghost` 变体；图标按钮允许透明背景。
- 非按钮元素按语义选择圆角 token；不存在 `rounded-pill` 档位。
- 优先复用项目现有 shadcn/ui（Base UI）组件和 primitives，参考官方对应组件的示例代码，不自行实现重复基础组件。
- 排版示例采用静态展示；需要说明状态变化时，加入必要的简单交互。
- 完成后检查实际页面，包括浅色、深色、窄屏和 200% 缩放。
- 对受保护的视觉规范或设计系统变更，遵循第 6 节的授权要求。

### 3.2 前端设计原则

**让界面本身解释功能，而不是依赖大量说明文字。**

- 避免不必要的次要标签、辅助文案、重复描述及装饰元素。
- 利用布局、视觉层级、间距、分组和明确的操作名称表达信息。
- 不默认给每个区块添加说明、教学提示或“智能建议”。
- 简单补充信息优先使用 info 图标 + tooltip；复杂或关键内容仍应提供适当的可见说明。
- 保留必要的表单标签、状态反馈、错误信息和可访问性名称。
- 删除、支付、永久提交等不可逆操作必须经过明确确认。
- 移除说明文案后，首次使用者仍应能判断下一步操作及其结果。
- 重做界面时先识别冗余信息；必要内容应融入布局、控件文案或适当的帮助入口。
- 不以极简为由牺牲可发现性、操作反馈、可访问性和功能完整性。

### 3.3 国际化

支持以下语言偏好：

`auto`、`zh-CN`、`zh-TW`、`zh-HK`、`ko`、`ja`、`en`

## 4. 工程规约

编码、注释、提交信息及工程文档统一遵循以下规约。修改前按技术栈和任务阅读对应章节。

### 4.1 编码规约

- [通用编码规约](./docs/design-system/engineering/coding/common.md)
- [HTML 编码规约](./docs/design-system/engineering/coding/html.md)
- [CSS 编码规约](./docs/design-system/engineering/coding/css.md)
- [JavaScript 编码规约](./docs/design-system/engineering/coding/javascript.md)
- [React 编码规约](./docs/design-system/engineering/coding/react.md)
- [TypeScript 编码规约](./docs/design-system/engineering/coding/typescript.md)
- [Node.js 编码规约](./docs/design-system/engineering/coding/node.md)

### 4.2 工程实践

- [Git 规约](./docs/design-system/engineering/engineering/git.md)
- [文档通用规约](./docs/design-system/engineering/engineering/writing.md)
- [更新日志规约](./docs/design-system/engineering/engineering/changelog.md)
- [HTTP JSON API 规范](./docs/design-system/engineering/engineering/http-json-api.md)

## 5. 构建与验证

根据任务风险选择验证范围。

| 场景 | 优先验证 |
| --- | --- |
| 普通 TS / React 修改 | 相关单测、typecheck |
| UI 改动 | 页面、主题、窗口尺寸 |
| i18n 改动 | 六语言 key 比对与显示检查 |
| 首次引导 | test:onboarding |
| 文档站演示 | test:demo |
| 浏览器扩展 | build:browser 与相关测试 |
| 跨进程 / 后端 | IPC、协议及专项回归 |
| 模型网关 / 音频 | 资源生命周期与相关后端测试 |
| 安装器 / 发布 | 构建与安装路径专项检查 |

### 5.1 常用命令

```bash
npm run dev
npm run typecheck
npm test
npm run build

npm run test:demo
npm run test:onboarding

npm run build:browser
npm run package:browser
npm run build:browser-host

npm run build:python
npm run dist:win

node scripts/check-installer-paths.mjs [makensis.exe]
```

命令用途：

- `dev`：Electron 开发环境
- `typecheck`：TypeScript 类型检查
- `test`：Vitest
- `build`：类型检查及 electron-vite 构建
- `test:demo`：文档站演示回归
- `test:onboarding`：首次引导、语言、主题、尺寸
- `build:browser`：构建 MV3 扩展
- `package:browser`：扩展 ZIP 发布包
- `build:browser-host`：Native Messaging EXE
- `build:python`：Python 3.12 基础组件
- `dist:win`：Windows EXE + MSI
- `check-installer-paths`：NSIS 安装目录回归检查

### 5.2 验证边界

- 优先执行与修改直接相关的检查。
- 跨进程、安装器、模型运行时及发布链路改动，增加专项验证。
- 不因低风险文案调整机械执行完整打包。
- 测试失败须区分既有问题与本次引入的问题。
- 缺少环境、依赖或测试条件时，如实说明。
- 不以构建通过代替实际功能验证，也不声称未执行的测试已通过。

## 6. Git、协作与权限边界

### 6.1 工作区保护

修改前检查相关文件及工作区状态。

多 Agent 并行前执行：

```bash
git status --porcelain -uall
```

- 识别已有修改、未跟踪文件及潜在冲突。
- 不覆盖用户或其他 Agent 的成果。
- 并行任务须明确文件所有权；同一文件不可由多个 Worker 同时修改。
- Verifier 负责审计、提供问题与证据；Worker 负责修复。
- 仅在任务独立、并行有实际收益时拆分子 Agent。
- 简单任务无需强制并行。

### 6.2 Git Commit

提交信息、分支和标签命名遵循 [Git 规约](./docs/design-system/engineering/engineering/git.md)。

**未经用户确认，不得执行 Git Commit。**

需要提交时：

1. 完成修改及验证。
2. 在独立代码块中给出拟议提交信息。
3. 获得用户确认后再提交。

### 6.3 受保护文件

未经当前任务的明确授权，不修改：

- `AGENTS.md` 中的既有规则
- `docs/design-system/DESIGN.md`
- `README*`
- `docs/` 下的用户文档、内部 PRD 与其他文档
- 其他用户明确声明受保护的文件

需要修改时，先提出可审阅的变更内容。

用户已在当前任务中明确批准具体文件及修改内容时，无需重复确认。

### 6.4 项目结构与规则维护

- 项目结构变更必须同步维护第 2 节代码入口索引。
- 更新 `AGENTS.md` 前，提醒用户校对涉及的结构变化，并遵循受保护文件授权要求。
- 不因无关任务自行改写既有规则。
- 发现现有规范过时、矛盾或缺失时，先向用户说明并提出修改建议。
- 未经授权，不以“整理规则”为理由删除或弱化既有约束。
- 用户未批准的新增规则，记录在文末「待确认补充」中，不直接覆盖正式规则。

### 6.5 文档规范

- 简体中文用户文档位于 `docs/help-docs/zh-CN/`，使用 `/zh-CN/` URL 前缀。
- `docs/help-docs/index.md` 保留产品首页。
- 设计系统文档独立位于 `docs/design-system/`，使用 `/vis/` URL 前缀。
- 用户文档沿用既有大纲，截图通过脚本生成。
- 文档图片存放于：

```text
docs/public/docs-image/{语言代码}/{文档分类}/{文章名}/
```

- 图片采用有意义的文件名，通过 `/docs-image/` 引用。
- 不同语言分别保存图片副本。
- `docs/PRD/` 只存内部需求及架构文档。
- `docs/help-docs/` 只存终端用户指引与产品首页，设计系统文档放在 `docs/design-system/`。
- 不在用户文档与内部 PRD 之间混放内容。

## 7. 待确认补充

未经用户同意，不得直接修改前述正式规则。

需要新增、调整或记录规则时，先在本节按以下格式提出：

```markdown
### 章节名

- 拟新增或修改的规则
- 修改原因
- 涉及范围
```

获得用户明确批准后，方可合并至对应章节。

已纳入正式目录索引的工作台、延迟检测及会议口译入口，不再在此重复记录。
