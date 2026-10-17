# AGENTS.md

> 写给 AI 编程助手的项目规范。视觉规范见 [DESIGN.MD](./DESIGN.MD)。
> 改项目结构的那一刀必须同步改本文件。

## 1. 技术栈

- 桌面应用：Electron + React + TypeScript
- 音频测试：内存采集两秒 PCM，仅做格式转换，无模型加载
- 引擎：内置 Python 3.12；PyTorch/llama.cpp/CrispASR 按需安装或复用本地组件
- 识别后端：PyTorch、llama.cpp 或 CrispASR，根据安装的加载器自动选择
- 翻译后端：PyTorch 或 llama.cpp，支持 Index-Translate 官方权重与独立免费 API
- 云端识别：Aliyun WebSocket 流式输入；MiniMax VAD 切段上传 WAV
- 云端翻译：MyMemory REST 或阿里云流式译文
- UI：Tailwind CSS + HeroUI；悬浮字幕为独立透明子窗口
- 新手教程：HeroUI 欢迎弹窗引导，状态持久化保存
- 构建：electron-vite
- 产品与文档站：VitePress 多语言站点，Vue 容器挂载 React，共享主题与演示入口
- 中文帮助：沿用既定大纲，截图由脚本自动生成
- 测试：Vitest + Testing Library
- 诊断：JSONL 格式日志，自动脱敏并限制大小
- 浏览器：Chrome/Edge/Firefox MV3 扩展，Python Native Messaging 连接程序

## 2. 目录结构

src/
├── main/        # Electron 主进程：IPC、窗口、设置及引擎管理
├── preload/     # 单文件，contextBridge 暴露 window.nolaTranslator
├── shared/      # 跨进程契约：类型定义、Zod 校验与默认值
└── renderer/    # React 应用前端代码
    ├── application.tsx # 桌面、文档站与 Toy 共用的页面及导航注册
    ├── bridge/  # 渲染进程唯一的数据出口（NolaBridge）
    ├── assets/browsers/ # Chrome／Edge／Firefox 图标资源
    ├── assets/fonts/    # 随桌面应用打包的 Noto CJK 区域可变字体
    ├── store/   # 5 个域 store 及自研 useSyncExternalStore 实现
    ├── components/  # 基础组件 primitives 及业务功能组件
    ├── features/    # 各功能模块如 home, workspace, overlay 等
    ├── i18n/         # 多语言字典定义与组装逻辑
    └── theme/        # 设计 token 唯一来源及 CJK 字体样式
engine/nola_translator_engine/  # Python 翻译引擎核心代码
├── local_models.py             # 本地模型兼容性与自定义注册表导入
├── offline_models.py           # 离线模型预检、准备与导入逻辑
├── audio/capture.py            # WASAPI 与浏览器音频采集处理
├── recognition/aliyun.py       # 阿里云 LiveTranslate WebSocket 识别
├── recognition/minimax.py      # MiniMax VAD 切段与 SSE 增量识别
├── recognition/llama_asr.py    # Qwen3-ASR GGUF 语音识别服务
├── recognition/crisp_asr.py   # CrispASR GGUF 语音识别支持
├── models/crisp_catalog.py    # CrispASR GGUF 权重与 Tokenizer 清单
├── models/qwen_gguf_catalog.py # Qwen3-ASR llama.cpp GGUF 权重清单
├── translation/transformers_causal.py # 本地因果模型文本翻译
├── translation/mymemory.py     # MyMemory 公共 REST 翻译接口
└── translation/index_translate.py # Index-Translate 官方翻译协议
browser/
├── version.json / CHANGELOG.md # 扩展版本信息与发布记录
├── extension/                 # MV3 浏览器扩展核心代码
├── native_host/               # 标准库 stdio 连接程序及帧协议测试
└── tests/                     # 浏览器冒烟测试脚本
docs/                           # VitePress 文档站点工程
├── nola-docs/                   # 文档源码目录
├── .vitepress/                  # 站点配置、主题与多语言首页
├── media-src/                   # 演示环境与 Toy 包共用素材入口
├── scripts/                     # 构建演示与生成素材脚本
└── public/                      # 静态资源与截图展示
assets/brand/                   # 应用 Logo 与 GitHub 官方头像
scripts/                        # PowerShell 构建与运行时管理脚本

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
- 快速同传与悬浮字幕共用桌面服务，两者可同时使用；它们与浏览器字幕服务互斥。浏览器字幕从模型预热到服务关闭并释放模型期间保留占用，无需等待扩展连接；打开的悬浮字幕窗口（含最小化）或桌面会话也阻止浏览器字幕启动。主进程最终校验，渲染器通过 store action 处理拒绝并显示“{running}服务正在运行中，请先关闭{running}服务”的本地化 Toast，不能将冲突显示为模型缺失、浏览器弹窗限制或普通启动失败。
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
npm run build:toy      # 与文档站共用真实 UI，产物 artifacts/toy
npm run test:demo      # 构建 Toy 后检查子路径部署、17 页面／三种尺寸、会话与六语言深色 UI
npm run test:onboarding # 构建后检查首次引导、再次查看及六语言／深浅主题／三种窗口尺寸
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

- 未经用户修改，不准修改以上章节，请整理好后放在下面
- 未经用户同意，不要私自修改/docs/文档站的内容，以及README
- 所有关于文档的修改必须让用户确认后才能写入

## 章节名

- 分点
