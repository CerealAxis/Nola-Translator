# FluentCaptions

FluentCaptions 是一款面向 Windows 11 的本地实时字幕与翻译工具。目前处于早期开发阶段，Electron + React 主界面已经可以运行，Electron 与 Python 引擎的通信底座已经接通；音频、识别和翻译能力将在此基础上逐步接入。

## 当前能力

- Windows 11 Fluent 风格的主界面；
- 主窗口自由拉伸，默认 `1180 × 780`，最小 `760 × 560`；
- 窄窗口自动收起导航文字，宽窗口自动扩展内容布局；
- 实时字幕、语音识别、翻译、外观、历史记录和诊断页面；
- 开始/停止字幕的界面状态与字幕浮层预览；
- 浅色、深色、高对比度、系统文字缩放和减少动画适配；
- Electron 渲染进程沙箱、上下文隔离和内容安全策略。
- TypeScript/Zod 与 Python/Pydantic 双端校验的版本化 JSONL 协议；
- Python sidecar 握手、串行写入、字幕中间结果合并、异常退避重启和优雅退出。

## 本机开发环境

- Node.js 24；
- npm 11；
- Electron 43；
- Python 使用本机 Conda Python 3.13，接入引擎时创建项目内 `.venv`；
- npm 包默认通过 `https://registry.npmmirror.com` 安装；
- Electron 运行时通过 `https://npmmirror.com/mirrors/electron/` 下载。

## 安装

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
.\scripts\install-engine.ps1
```

项目统一使用 npm，不使用 pnpm 或 Yarn。`scripts/install.ps1` 会先执行 `npm install`，并在本地缺少 Electron 运行时时通过镜像安装。

## 开发与验证

```powershell
npm run dev
npm test
npm run typecheck
npm run build
npm run test:ui
```

`npm run test:ui` 会使用真实 Electron 分别渲染默认尺寸和最小尺寸，截图写入被 Git 忽略的 `artifacts/ui/`。

通信格式、错误码和生命周期说明见 `docs/protocol.md`。

## 隐私原则

默认不保存字幕正文，不录制原始音频。模型安装完成后，Argos 翻译、本地语音识别及字幕显示均可离线工作；任何联网翻译 Provider 都必须由用户主动配置和启用。

## 设计稿

首轮审阅用的静态交互稿保留在 `ui-demo.html`，正式实现位于 `src/`，两者不会共享运行时代码。
