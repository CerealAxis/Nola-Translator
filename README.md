# FluentCaptions

FluentCaptions 是一款面向 Windows 11 的实时字幕与翻译应用。它使用 Electron + React 构建 Fluent 风格界面，使用独立 Python 引擎完成 Windows 音频捕获、语音识别和翻译。

## 已实现功能

- 捕获 Windows 默认系统输出、指定输出设备或麦克风；
- 实时模式：sherpa-onnx 中英双语流式识别，持续输出中间结果；
- 高精度模式：faster-whisper + Silero VAD，以完整语音片段输出，优先使用 CUDA/FP16，失败时回退 CPU/INT8；
- 支持自动识别、中文、英文、日文，以及 Whisper 模型支持的其他语言；
- 同时选择中文、英文、日文等多个目标语言；
- 独立“模型与语言包”页面显示真实安装状态，由用户明确安装或删除识别模型和 Argos 有向语言包；
- Argos Translate 本地翻译，可选择是否允许英语中转；
- 可选 Microsoft Translator、OpenAI 兼容接口和本地 Ollama；
- API 密钥使用 Electron `safeStorage` 调用 Windows 加密能力保存，不写入普通设置文件；
- 独立字幕浮层支持顶部、底部和自由位置，置顶、锁定、点击穿透、拖动、缩放；
- 支持主题、字体、字号、字重、颜色、背景透明度、最大行数、原文/译文显示；
- 默认仅在内存中保留字幕；用户明确开启后才写入磁盘；
- 导出 TXT、SRT 和 WebVTT；
- 支持浅色、深色、高对比度、系统文字缩放、减少动画、多显示器与独立 DPI；
- 首版只构建 Windows x64，Electron 与 Python 协议保持架构无关。

## 直接运行开发版

本项目统一使用 npm，不使用 pnpm 或 Yarn。脚本优先使用项目现有 `.venv`，缺少时才用本机 `python` 创建；npm 使用 npmmirror，Python 使用阿里云 PyPI 镜像。

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
.\scripts\install-engine.ps1
npm run dev
```

首次使用前，请打开“模型与语言包”页面并明确安装需要的资源：

- 实时模式下载 sherpa-onnx 中英双语流式模型；
- 高精度模式下载 faster-whisper `small` 模型；
- Argos 语言包按翻译方向分别安装，例如 English → 简体中文与简体中文 → English 是两个包。

“开始字幕”只检查本地资源，不会下载、更新或安装任何内容；缺少模型时会给出明确提示并引导到资源页。

下载完成后，本地识别和 Argos/Ollama 翻译可以离线运行。Microsoft Translator 和 OpenAI 兼容接口只有在用户主动选择并配置后才联网。

## 调整和关闭字幕浮层

在“外观”页面顶部可以直接控制独立字幕浮层：

- 点击“调整位置和大小”会切换到自由位置并解除点击穿透；拖动浮层可移动，拖动窗口边缘或右下角可缩放；
- 调整完成后点击浮层右上角的“完成调整”，重新锁定并恢复点击穿透；
- 点击主窗口或调整浮层中的“隐藏浮层”即可立即关闭浮层；需要时点击“显示浮层”重新显示。

## 验证与构建

```powershell
npm test
npm run typecheck
.\.venv\Scripts\python.exe -m pytest engine\tests
npm run build
```

构建 Windows x64 安装包：

```powershell
npm run dist:win
```

安装包输出到 `release\`。打包版自带 Python sidecar，最终用户不需要安装 Node.js 或 Python。识别模型和 Argos 语言包不放入安装包，由用户在资源页明确下载。

## 隐私与数据位置

- 原始音频从不写入磁盘；
- 字幕历史默认关闭，只保留在当前进程内存；
- 开启保存后，最终字幕写入 Electron `userData` 目录；
- 模型、Argos 包、普通设置与加密凭据分别存放；
- 诊断信息不包含音频、字幕正文或 API 密钥；
- 清空历史会清除内存记录，并在持久化开启时清空历史文件。

## 文档

- [实现说明](docs/implementation.md)
- [界面与窗口规范](docs/design-system.md)
- [Windows 音频管线](docs/audio.md)
- [Electron 与 Python 协议](docs/protocol.md)
- [第三方组件声明](THIRD_PARTY_NOTICES.md)

`ui-demo.html` 是早期静态审阅稿；正式应用位于 `src/` 和 `engine/`，运行时不依赖该文件。
