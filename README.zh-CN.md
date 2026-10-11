<div align="center">
  <img src="assets/brand/nola-logo.svg" alt="Nola Translator Logo" width="112" height="112">
  <h1>Nola Translator</h1>
  <p>Nola Translator 是一个实时字幕与翻译软件</p>
  <p><a href="README.md">English</a> · 简体中文</p>
</div>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square" alt="GPL v3 许可证"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml/badge.svg" alt="构建工作流状态"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://img.shields.io/badge/Actions-Download%20Artifacts-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="从 GitHub Actions 下载"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases"><img src="https://img.shields.io/github/v/release/CerealAxis/Nola-Translator?style=flat-square&label=Release" alt="最新 GitHub 版本"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases/latest"><img src="https://img.shields.io/badge/Releases-Download%20Latest-2DA44E?style=flat-square&logo=github&logoColor=white" alt="下载最新版本"></a>
  <img src="https://img.shields.io/badge/QQ%E7%BE%A4-701699932-12B7F5?style=flat-square&logo=tencentqq&logoColor=white" alt="QQ群：701699932">
  <img src="https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-7-7A5CFA?style=flat-square&logo=vite&logoColor=white" alt="Vite 7">
</p>

<p align="center">
  <img src="https://picui.ogmua.cn/s1/2026/10/11/6acafb5f8d672.webp" alt="Nola Translator 界面概念图" width="1000">
</p>

## 项目简介

Nola Translator 是一款实时字幕与翻译软件，支持本地模型和云端模型，可以根据需求使用本地算力进行字幕识别与翻译，或是选择接入云端模型进行识别和翻译。

## 功能特性

- 本地模型支持：可本地运行 Qwen3-ASR、SenseVoiceSmall 等识别模型，以及 Hy-MT2 等翻译模型；软件也支持搜索安装Hugging Face上的其他模型。
- 云端模型支持：支持 OpenAI 兼容接口、Anthropic、Ollama等协议的LLM服务商，使用大语言模型进行字幕翻译。（云端ASR模型的接入后续版本推出）
- GPU 加速：可检测可用的计算设备，并为识别和翻译分别配置设备。
- 浏览器扩展：内置浏览器拓展插件，支持 Chrome 和 Edge，并在视频页面显示双语字幕；也可配置桌面系统音频作为输入。
- 实时字幕浮层：支持系统输出设备、指定音频设备或麦克风；字幕可独立显示，支持调整位置、字号、颜色、透明度和原文译文布局。
- 灵活配置：可按需安装模型，选择识别和翻译方式、语言方向、计算设备及字幕样式；API 凭据由应用安全存储。
- 记录与导出：可保存字幕记录，并导出 TXT、SRT 和 WebVTT 格式；录音保存可自行开启。

## 界面预览

| 主页 | 悬浮字幕 | 视频字幕 |
|---|---|---|
| ![主页](https://picui.ogmua.cn/s1/2026/10/11/6acafb5f8d672.webp) | ![悬浮字幕](https://picui.ogmua.cn/s1/2026/10/11/6acb08b27982a.webp) | ![视频字幕](https://picui.ogmua.cn/s1/2026/10/11/6acb08df31f5d.webp) |

| 本地模型安装 | 推理环境设置 | 深色模式支持 |
|---|---|---|
| ![本地模型安装](https://picui.ogmua.cn/s1/2026/10/11/6acb09045cfab.webp) | ![推理环境设置](https://picui.ogmua.cn/s1/2026/10/11/6acb098cb9a51.webp) | ![深色模式支持](https://picui.ogmua.cn/s1/2026/10/11/6acb09476cbdf.webp) |

## 安装

- [下载最新版本](https://github.com/CerealAxis/Nola-Translator/releases/latest)

支持 Windows x64，可选择 EXE 或 MSI 安装程序；其他平台会在软件开发稳定后提供支持。

## 支持识别的语言

> [!TIP]
> 软件支持的识别和翻译的语言种类由选中的模型能力决定，下为软件中内置的推荐模型的支持情况。如您有推荐的模型，可以直接提交在issue中，我们会评估后决定是否纳入。初次使用推荐使用**SenseVoiceSmall**模型和**HY-MT2 1.8B**模型。

### 识别模型

| 模型 | 支持种类 | 详情 |
|---|---:|---|
| Qwen3-ASR 1.7B | 30 种 | 支持自动检测；中文、英语、粤语、阿拉伯语、德语、法语、西班牙语、葡萄牙语、印度尼西亚语、意大利语、韩语、俄语、泰语、越南语、日语、土耳其语、印地语、马来语、荷兰语、瑞典语、丹麦语、芬兰语、波兰语、捷克语、菲律宾语、波斯语、希腊语、匈牙利语、马其顿语、罗马尼亚语 |
| Qwen3-ASR 0.6B | 30 种 | 支持自动检测；中文、英语、粤语、阿拉伯语、德语、法语、西班牙语、葡萄牙语、印度尼西亚语、意大利语、韩语、俄语、泰语、越南语、日语、土耳其语、印地语、马来语、荷兰语、瑞典语、丹麦语、芬兰语、波兰语、捷克语、菲律宾语、波斯语、希腊语、匈牙利语、马其顿语、罗马尼亚语 |
| SenseVoiceSmall | 5 种 | 中文、英语、粤语、日语、韩语 |

### 翻译模型

| 模型 | 支持种类 | 详情 |
|---|---:|---|
| HY-MT2 1.8B | 37 种 | 中文（简体）、中文（繁体）、英语、法语、葡萄牙语、西班牙语、日语、土耳其语、俄语、阿拉伯语、韩语、泰语、意大利语、德语、越南语、马来语、印度尼西亚语、菲律宾语、印地语、波兰语、捷克语、荷兰语、高棉语、缅甸语、波斯语、古吉拉特语、乌尔都语、泰卢固语、马拉地语、希伯来语、孟加拉语、泰米尔语、乌克兰语、藏语、哈萨克语、蒙古语、维吾尔语 |
| M2M100 418M | 100 种 | 南非荷兰语、阿姆哈拉语、阿拉伯语、阿斯图里亚斯语、阿塞拜疆语、巴什基尔语、白俄罗斯语、保加利亚语、孟加拉语、布列塔尼语、波斯尼亚语、加泰罗尼亚语、宿务语、捷克语、威尔士语、丹麦语、德语、希腊语、英语、西班牙语、爱沙尼亚语、波斯语、富拉语、芬兰语、法语、西弗里西亚语、爱尔兰语、苏格兰盖尔语、加利西亚语、古吉拉特语、豪萨语、希伯来语、印地语、克罗地亚语、海地克里奥尔语、匈牙利语、亚美尼亚语、印度尼西亚语、伊博语、伊洛卡诺语、冰岛语、意大利语、日语、爪哇语、格鲁吉亚语、哈萨克语、高棉语、卡纳达语、韩语、卢森堡语、卢干达语、林加拉语、老挝语、立陶宛语、拉脱维亚语、马拉加斯语、马其顿语、马拉雅拉姆语、蒙古语、马拉地语、马来语、缅甸语、尼泊尔语、荷兰语、挪威语、北索托语、奥克语、奥里亚语、旁遮普语、波兰语、普什图语、葡萄牙语、罗马尼亚语、俄语、信德语、僧伽罗语、斯洛伐克语、斯洛文尼亚语、索马里语、阿尔巴尼亚语、塞尔维亚语、斯瓦蒂语、巽他语、瑞典语、斯瓦希里语、泰米尔语、泰语、菲律宾语、茨瓦纳语、土耳其语、乌克兰语、乌尔都语、乌兹别克语、越南语、沃洛夫语、科萨语、意第绪语、约鲁巴语、中文、祖鲁语 |

## LLM API 配置

> [!TIP]
> LLM 仅用于大模型翻译，若选用本地模型等提供方式则无需配置。云端ASR模型的支持后续版本会推出。


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

![LLM 配置界面](https://picui.ogmua.cn/s1/2026/10/11/6acb06f580b12.webp)

1. 在翻译设置中选择 **云端翻译**。
2. 选择与服务商匹配的 **API 格式**。
3. 填写 **API 地址**、**API 密钥**和**模型 ID**。
4. 按需调整上下文长度和最大输出 Token 数。

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

Fork 仓库、创建分支、提交修改并发起 Pull Request。请简要描述修改内容及已运行的检查。设计和代码约定可参考[界面规范](docs/design-system.md)与[实现说明](docs/implementation.md)。

## 许可证

Nola Translator 自有代码采用 [GNU GPL v3.0 only](LICENSE) 授权。第三方组件及模型适用各自的许可证，详见[第三方组件声明](THIRD_PARTY_NOTICES.md)。

[![Star History Chart](https://api.star-history.com/svg?repos=CerealAxis/Nola-Translator&type=Date)](https://star-history.com/#CerealAxis/Nola-Translator)
