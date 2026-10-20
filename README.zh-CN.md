<div align="center">
  <img src="assets/brand/nola-logo.svg" alt="Nola Translator Logo" width="112" height="112">
  <h1>Nola Translator</h1>
  <p>Nola Translator 是一个实时字幕与翻译软件</p>
  <p><a href="README.md">English</a> · 简体中文 · <a href="README.zh-TW.md">繁體中文（台灣）</a> · <a href="README.zh-HK.md">繁體中文（香港）</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>
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
  <img src="docs/public/screenshots/zh-CN/home.png" alt="Nola Translator 界面概念图" width="1000">
</p>
  
## 项目简介

Nola Translator 是一款实时字幕与翻译软件，支持本地模型和云端模型，可以根据需求使用本地算力进行字幕识别与翻译，或是选择接入云端模型进行识别和翻译。

## 功能特性

- 本地模型支持：可本地运行 Qwen3-ASR、SenseVoiceSmall 等识别模型，以及 Hy-MT2 等翻译模型；软件也支持搜索安装Hugging Face上的其他模型。
- 云端模型支持：支持阿里云、MiniMax等云端ASR模型；支持 OpenAI 兼容接口、Anthropic、Ollama 等LLM协议；支持调用免费的MyMemory翻译服务。
- GPU 加速：可检测可用的计算设备，并为识别和翻译分别配置设备。
- 浏览器扩展：内置浏览器拓展插件，支持 Chrome 和 Edge，并在视频页面显示双语字幕；也可配置桌面系统音频作为输入。
- 实时字幕浮层：支持系统输出设备、指定音频设备或麦克风；字幕可独立显示，支持调整位置、字号、颜色、透明度和原文译文布局。
- 灵活配置：可按需安装模型，选择识别和翻译方式、语言方向、计算设备及字幕样式；API 凭据由应用安全存储。
- 记录与导出：可保存字幕记录，并导出 TXT、SRT 和 WebVTT 格式；录音保存可自行开启。

## 界面预览

| 主页 | 悬浮字幕 | 视频字幕 |
|---|---|---|
| ![主页](docs/public/screenshots/zh-CN/home.png) | ![悬浮字幕](docs/public/screenshots/zh-CN/overlay-scene.png) | ![视频字幕](docs/public/screenshots/zh-CN/browser-scene.png) |

| 本地模型安装 | 推理环境设置 | 深色模式支持 |
|---|---|---|
| ![本地模型安装](docs/public/screenshots/zh-CN/models.png) | ![推理环境设置](docs/public/screenshots/zh-CN/compute-environment.png) | ![深色模式支持](docs/public/screenshots/zh-CN/dark-mode.png) |

悬浮字幕和视频字幕场景使用了 [Blender Foundation《Tears of Steel》](https://commons.wikimedia.org/wiki/File:Tears_of_Steel_frame_05_6a.jpg) 的裁切画面，依据 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 授权使用。

## 安装

- [下载最新版本](https://github.com/CerealAxis/Nola-Translator/releases/latest)

支持 Windows x64，可选择 EXE 或 MSI 安装程序；其他平台会在软件开发稳定后提供支持。

- [在线文档](https://nola.xaviermc.top/)

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

## 云端模型

| 供应商 | 模型 | 支持语言 | 详情 |
|---|---|---|---|
| 阿里云 | Qwen3.5／Qwen3.8 LiveTranslate | 60 种 | 中文、英语、阿拉伯语、德语、法语、西班牙语、葡萄牙语、印度尼西亚语、意大利语、韩语、俄语、泰语、越南语、日语、土耳其语、印地语、马来语、荷兰语、乌尔都语、挪威书面语、瑞典语、丹麦语、希伯来语、芬兰语、波兰语、冰岛语、捷克语、菲律宾语、波斯语、粤语、希腊语、南非荷兰语、阿斯图里亚斯语、白俄罗斯语、保加利亚语、孟加拉语、波斯尼亚语、加泰罗尼亚语、宿务语、爱沙尼亚语、加利西亚语、古吉拉特语、克罗地亚语、匈牙利语、爪哇语、哈萨克语、卡纳达语、吉尔吉斯语、拉脱维亚语、马其顿语、马拉雅拉姆语、马拉地语、旁遮普语、罗马尼亚语、斯洛伐克语、斯洛文尼亚语、斯瓦希里语、塔吉克语、阿塞拜疆语、乌克兰语。3.8 自动检测源语言；3.5 可指定源语言。 |
| MiniMax | Speech-to-Text `asr-1.0` | 20 种 | 阿拉伯语、粤语、中文、英语、菲律宾语、法语、德语、印度尼西亚语、意大利语、日语、韩语、马来语、波兰语、葡萄牙语、俄语、西班牙语、泰语、土耳其语、乌克兰语、越南语。 |

## LLM API 配置

> [!TIP]
> 这里的 LLM 协议用于翻译。阿里云、MiniMax ASR模型使用「音频与识别」中的独立连接配置和凭据。本地模型无需配置。


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

![LLM 配置界面](docs/public/screenshots/zh-CN/llm-configuration.png)

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

Fork 仓库、创建分支、提交修改并发起 Pull Request。请简要描述修改内容及已运行的检查。设计和代码约定可参考[界面规范](DESIGN.md)与[参与贡献](https://nola.xaviermc.top/zh-CN/contributing/)。

## 赞助

您可通过如下渠道对本项目进行赞助，本项目会对赞助者提供对应的权益，包括但不限于问题优先答疑、一对一指导、永久放入赞助名单中并在软件等渠道展示、功能定制等。

**1. 中国大陆**
- [爱发电](https://afdian.com/a/CerealAxis)

**2. 其他地区**
- [Github Sponsor](ttps://github.com/sponsors/CerealAxis/)

## 许可证

Nola Translator 自有代码采用 [GNU GPL v3.0 only](LICENSE) 授权。第三方组件及模型适用各自的许可证，详见[第三方组件声明](THIRD_PARTY_NOTICES.md)。

[![Star History Chart](https://api.star-history.com/svg?repos=CerealAxis/Nola-Translator&type=Date)](https://star-history.com/#CerealAxis/Nola-Translator)
