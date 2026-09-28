# Nola Translator · 诺拉翻译

**适用于 Windows 11 的实时字幕与翻译应用。**

[English](README.md) | 简体中文

![Nola Translator 界面概念图](docs/images/nola-ui-preview.svg)

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [使用方法](#使用方法)
- [项目结构](#项目结构)
- [技术架构](#技术架构)
- [开发与构建](#开发与构建)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 项目简介

Nola Translator 可以捕获系统音频或麦克风输入，识别语音，并在独立浮层中显示原文和译文。桌面应用使用 Electron、React 和 TypeScript 构建；Python 引擎负责音频捕获、语音识别与翻译。

## 功能特性

- 捕获 Windows 默认输出设备、指定输出设备或麦克风。
- 使用本地 Qwen3-ASR 识别语音，使用本地 Hy-MT2 或 M2M100 翻译。
- 同时翻译为多种目标语言，可选择翻译中间字幕。
- 按需配置 Microsoft Translator、OpenAI 兼容接口或本地 Ollama。
- 独立字幕浮层支持定位、缩放、锁定和点击穿透。
- 自定义字幕字体、颜色、透明度及原文和译文的显示方式。
- 将保存的字幕导出为 TXT、SRT 或 WebVTT。
- 支持中英文界面，以及浅色、深色和高对比度主题。
- 默认只在内存中保留字幕历史；磁盘保存需要主动开启。

## 快速开始

### 环境要求

- Windows 11 x64
- Node.js 24、npm 11
- Python 3.13

### 安装与运行

在项目根目录执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
.\scripts\install-engine.ps1
.\scripts\fetch-llama.ps1
npm run dev
```

安装脚本会准备 JavaScript 和 Python 依赖。`fetch-llama.ps1` 会安装 Hy-MT2 本地翻译所需的固定版本 llama.cpp 运行时。

打开应用的“模型与资源”页面，安装需要的识别和翻译模型。模型仅在你从该页面选择安装时下载；模型目录和下载缓存目录也可以在此修改。

## 使用方法

1. 在“实时字幕”页面选择音频来源、源语言和目标语言。
2. 选择显示原文或译文，然后开始字幕会话。
3. 在“外观”页面调整独立字幕浮层。
4. 如需在关闭应用后保留字幕，在“历史记录”页面开启保存。

安装资源后，本地识别与翻译可以离线运行。Microsoft Translator 和 OpenAI 兼容翻译需要连接相应服务。API 密钥通过 Electron `safeStorage` 保存。

## 项目结构

```text
assets/brand/                  Logo 与品牌资源
docs/                          设计与实现文档
engine/nola_translator_engine/  Python 音频、识别和翻译引擎
engine/tests/                   Python 测试
scripts/                        安装与构建脚本
src/main/                       Electron 主进程
src/preload/                    IPC 桥接
src/renderer/                   React 界面
src/shared/                     共享协议与设置
tests/                          应用测试
```

## 技术架构

```text
React 界面 ── preload IPC ── Electron 主进程 ── JSONL 协议 ── Python 引擎
                                                          ├─ 音频捕获
                                                          ├─ Qwen3-ASR
                                                          └─ 翻译
```

详细设计见[实现说明](docs/implementation.md)、[音频管线](docs/audio.md)和[进程间协议](docs/protocol.md)。

## 开发与构建

```powershell
npm run typecheck
npm test
.\.venv\Scripts\python.exe -m pytest engine\tests
npm run build
```

构建 Windows x64 安装包：

```powershell
npm run dist:win
```

安装包输出到 `release\`，其中包含 Python sidecar 和 llama.cpp 运行时；识别与翻译模型由用户在应用内另行下载。

## 参与贡献

Fork 仓库、创建分支、提交修改并发起 Pull Request。请简要描述修改内容及已运行的检查。设计和代码约定可参考[界面规范](docs/design-system.md)与[实现说明](docs/implementation.md)。

## 许可证

Nola Translator 自有代码采用 [GNU GPL v3.0 only](LICENSE) 授权。第三方组件及模型适用各自的许可证，详见[第三方组件声明](THIRD_PARTY_NOTICES.md)。
