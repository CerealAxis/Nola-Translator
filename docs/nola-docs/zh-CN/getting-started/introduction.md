# 产品介绍

<div align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/assets/brand/nola-logo.svg" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/assets/brand/nola-logo.svg" alt="Nola Translator Logo" width="112" height="112"></a>
  <h1>Nola Translator</h1>
  <p>Nola Translator 是一个实时字幕与翻译软件</p>
  <p><a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.md">English</a> · 简体中文 · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ja.md">日本語</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ko.md">한국어</a></p>
</div>

<p align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square" alt="GPL v3 许可证"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml/badge.svg" alt="构建工作流状态"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://img.shields.io/badge/Actions-Download%20Artifacts-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="从 GitHub Actions 下载"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases"><img src="https://img.shields.io/github/v/release/CerealAxis/Nola-Translator?style=flat-square&label=Release" alt="最新 GitHub 版本"></a>
  <a href="./download-and-install"><img src="https://img.shields.io/badge/Releases-Download%20Latest-2DA44E?style=flat-square&logo=github&logoColor=white" alt="下载最新版本"></a>
  <img src="https://img.shields.io/badge/QQ%E7%BE%A4-701699932-12B7F5?style=flat-square&logo=tencentqq&logoColor=white" alt="QQ群：701699932">
  <img src="https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-7-7A5CFA?style=flat-square&logo=vite&logoColor=white" alt="Vite 7">
</p>

<p align="center">
  <img src="/docs-image/zh-CN/getting-started/introduction/home-screen.png" alt="主页界面" width="1000">
</p>

## 项目简介

Nola Translator 是一款实时字幕与翻译软件，支持本地模型和云端模型，可以根据需求使用本地算力进行字幕识别与翻译，或是选择接入云端模型进行识别和翻译。

## 功能特性

- 本地模型支持：可本地运行 Qwen3-ASR、SenseVoiceSmall 等识别模型，以及 Hy-MT2 等翻译模型；软件也支持搜索安装Hugging Face上的其他模型。
- 云端模型支持：支持阿里云、MiniMax等云端ASR模型；支持 OpenAI 兼容接口、Anthropic、Ollama 等 LLM 协议；也支持调用免费的MyMemory翻译服务。
- GPU 加速：可检测可用的计算设备，并为识别和翻译分别配置设备。
- 浏览器扩展：内置浏览器拓展插件，支持 Chrome 和 Edge，并在视频页面显示双语字幕；也可配置桌面系统音频作为输入。
- 实时字幕浮层：支持系统输出设备、指定音频设备或麦克风；字幕可独立显示，支持调整位置、字号、颜色、透明度和原文译文布局。
- 灵活配置：可按需安装模型，选择识别和翻译方式、语言方向、计算设备及字幕样式；API 凭据由应用安全存储。
- 记录与导出：可保存字幕记录，并导出 TXT、SRT 和 WebVTT 格式；录音保存可自行开启。

## 界面预览

| 主页 | 悬浮字幕 | 视频字幕 |
|---|---|---|
| ![主页界面](/docs-image/zh-CN/getting-started/introduction/home-screen.png) | ![悬浮字幕界面](/docs-image/zh-CN/getting-started/introduction/floating-captions.png) | ![浏览器字幕界面](/docs-image/zh-CN/getting-started/introduction/browser-captions.png) |

| 本地模型安装 | 推理环境设置 | 深色模式支持 |
|---|---|---|
| ![模型管理界面](/docs-image/zh-CN/getting-started/introduction/model-management.png) | ![计算环境设置](/docs-image/zh-CN/getting-started/introduction/compute-environment.png) | ![深色模式界面](/docs-image/zh-CN/getting-started/introduction/dark-mode.png) |

悬浮字幕和视频字幕场景使用了 [Blender Foundation《Tears of Steel》](https://commons.wikimedia.org/wiki/File:Tears_of_Steel_frame_05_6a.jpg) 的裁切画面，依据 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 授权使用。

## 安装

- [百度网盘](https://pan.baidu.com/s/1vq6wMwdJo_0FGo_lu6FfuA?pwd=kna2)
- [夸克网盘](https://pan.quark.cn/s/ef1e11262087)
- [Github](https://github.com/CerealAxis/Nola-Translator/releases/latest)

> [!TIP]
> 如果可以的话希望大家优先通过夸克/百度网盘下载，网盘会为每笔转存给我结算费用，手机转存的单价更高，这笔费用能支持我的后续开发，谢谢大家

支持 Windows x64，可选择 EXE 或 MSI 安装程序；其他平台会在软件开发稳定后提供支持。

## 模型支持的语言

识别、翻译和语音合成的语言支持由所选模型决定。完整模型清单和支持语言见[模型支持的语言](./model-languages.md)。

## LLM API 配置

> [!NOTE] 注意
> 这里的 LLM 协议用于翻译。阿里云和 MiniMax ASR 模型使用“音频与识别”中的独立连接配置和凭据。本地模型无需配置。


### 协议说明

软件支持以下 API 协议

| 协议 |
|---|
| OpenAI Chat Completions |
| OpenAI Responses |
| Anthropic Messages |
| Ollama Chat |

### 填写示例

| 服务商 | API 格式 | API 地址示例 | 模型 ID 示例 |
|---|---|---|---|
| DeepSeek | OpenAI Chat Completions | `https://api.deepseek.com` | `deepseek-flash` |
| MiniMax | OpenAI Chat Completions | `https://api.minimax.io/v1` | `MiniMax-M3` |
| MiMo | OpenAI Chat Completions | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-pro` |

### 填写步骤

![云端翻译连接设置](/docs-image/zh-CN/getting-started/introduction/cloud-translation-settings.png)

1. 在翻译设置中选择 **云端翻译**。
2. 选择与服务商匹配的 **API 格式**。
3. 填写 **API 地址**、**API 密钥**和**模型 ID**。
4. 按需调整上下文长度和最大输出 Token 数。

## 项目结构

```text
assets/brand/                  Logo 与品牌资源
docs/                          VitePress 产品官网与多语言文档
engine/nola_translator_engine/  Python 音频、识别和翻译引擎
engine/tests/                   Python 测试
scripts/                        安装与构建脚本
src/main/                       Electron 主进程
src/preload/                    IPC 桥接
src/renderer/                   React 界面
src/shared/                     共享协议与设置
tests/                          应用测试
```

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

## 参与贡献

Fork 仓库、创建分支、提交修改并发起 Pull Request。请简要描述修改内容及已运行的检查。设计和代码约定可参考[界面规范](https://github.com/CerealAxis/Nola-Translator/blob/main/DESIGN.md)与[项目规范](https://github.com/CerealAxis/Nola-Translator/blob/main/AGENTS.md)。

## 许可证

Nola Translator 自有代码采用 [GNU GPL v3.0 only](https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE) 授权。第三方组件及模型适用各自的许可证，详见[第三方组件声明](https://github.com/CerealAxis/Nola-Translator/blob/main/THIRD_PARTY_NOTICES.md)。

[![Star History Chart](https://api.star-history.com/svg?repos=CerealAxis/Nola-Translator&type=Date)](https://star-history.com/#CerealAxis/Nola-Translator)
