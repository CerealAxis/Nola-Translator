# Product Overview

<div align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/assets/brand/nola-logo.svg" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/assets/brand/nola-logo.svg" alt="Nola Translator Logo" width="112" height="112"></a>
  <h1>Nola Translator</h1>
  <p>Real-time captions and translation for your desktop.</p>
  <p><a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.md">English</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-CN.md">简体中文</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ja.md">日本語</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ko.md">한국어</a></p>
</div>

<p align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square" alt="GPL v3 license"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml/badge.svg" alt="Build workflow status"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://img.shields.io/badge/Actions-Download%20Artifacts-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="Download from GitHub Actions"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases"><img src="https://img.shields.io/github/v/release/CerealAxis/Nola-Translator?style=flat-square&label=Release" alt="Latest GitHub release"></a>
  <a href="./download-and-install"><img src="https://img.shields.io/badge/Releases-Download%20Latest-2DA44E?style=flat-square&logo=github&logoColor=white" alt="Download the latest release"></a>
  <img src="https://img.shields.io/badge/QQ%E7%BE%A4-701699932-12B7F5?style=flat-square&logo=tencentqq&logoColor=white" alt="QQ Group: 701699932">
  <img src="https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-7-7A5CFA?style=flat-square&logo=vite&logoColor=white" alt="Vite 7">
</p>

<p align="center">
  <img src="/docs-image/en/getting-started/introduction/home-screen.png" alt="Home screen" width="1000">
</p>

## Overview

Nola Translator turns speech into real-time captions and translations. Run speech recognition and translation locally, use cloud services, or combine the two.

## Features

- **Local models:** Run recognition models such as Qwen3-ASR and SenseVoiceSmall, and translation models such as HY-MT2 locally. The app can also search for and install other models from Hugging Face.
- **Cloud models:** Use speech recognition from Aliyun, MiniMax, and other providers; connect translation models through LLM protocols such as OpenAI-compatible APIs, Anthropic, or Ollama; or use the free MyMemory translation service.
- **GPU acceleration:** Detects available compute devices and lets you configure separate devices for recognition and translation.
- **Browser extension:** Includes a browser extension for Chrome and Edge that displays bilingual captions on video pages. You can also configure desktop system audio as an input source.
- **Real-time caption overlay:** Supports system output, a selected audio device, or a microphone. Captions appear in a separate overlay, where you can adjust its position, font size, colors, opacity, and original/translated text layout.
- **Flexible configuration:** Install models as needed and choose recognition and translation methods, language directions, compute devices, and caption styles. API credentials are securely stored by the app.
- **History and export:** Save caption history and export it as TXT, SRT, or WebVTT. Audio recording can be enabled optionally.

## Interface Preview

| Home | Floating Captions | Video Captions |
|---|---|---|
| ![Home screen](/docs-image/en/getting-started/introduction/home-screen.png) | ![Floating captions](/docs-image/en/getting-started/introduction/floating-captions.png) | ![Browser captions](/docs-image/en/getting-started/introduction/browser-captions.png) |

| Local Model Installation | Inference Environment Settings | Dark Mode Support |
|---|---|---|
| ![Model management](/docs-image/en/getting-started/introduction/model-management.png) | ![Compute environment settings](/docs-image/en/getting-started/introduction/compute-environment.png) | ![Dark mode](/docs-image/en/getting-started/introduction/dark-mode.png) |

The floating and browser caption scenes use a cropped frame from [*Tears of Steel*](https://commons.wikimedia.org/wiki/File:Tears_of_Steel_frame_05_6a.jpg), © Blender Foundation, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

## Installation

- [百度网盘](https://pan.baidu.com/s/1vq6wMwdJo_0FGo_lu6FfuA?pwd=kna2)
- [夸克网盘](https://pan.quark.cn/s/ef1e11262087)
- [Github](https://github.com/CerealAxis/Nola-Translator/releases/latest)

> [!TIP]
> 如果可以的话希望大家优先通过夸克/百度网盘下载，网盘会为每笔转存给我结算费用，手机转存的单价更高，这笔费用能支持我的后续开发，谢谢大家

Windows x64 is supported. You can choose the EXE or MSI installer. Support for other platforms is planned once development has stabilized.

## Language Support

::: tip
The languages available for recognition and translation depend on the selected model's capabilities. The tables below show the capabilities of the recommended models included in the app. If you have a model to recommend, submit it as an issue; we will evaluate it for possible inclusion. For first-time users, we recommend **SenseVoiceSmall** for recognition and **HY-MT2 1.8B** for translation.
:::

### Recognition Models

| Model | Number of Languages | Details |
|---|---:|---|
| Qwen3-ASR 1.7B | 30 | Supports automatic detection; Chinese, English, Cantonese, Arabic, German, French, Spanish, Portuguese, Indonesian, Italian, Korean, Russian, Thai, Vietnamese, Japanese, Turkish, Hindi, Malay, Dutch, Swedish, Danish, Finnish, Polish, Czech, Filipino, Persian, Greek, Hungarian, Macedonian, and Romanian |
| Qwen3-ASR 0.6B | 30 | Supports automatic detection; Chinese, English, Cantonese, Arabic, German, French, Spanish, Portuguese, Indonesian, Italian, Korean, Russian, Thai, Vietnamese, Japanese, Turkish, Hindi, Malay, Dutch, Swedish, Danish, Finnish, Polish, Czech, Filipino, Persian, Greek, Hungarian, Macedonian, and Romanian |
| SenseVoiceSmall | 5 | Chinese, English, Cantonese, Japanese, and Korean |

### Translation Models

| Model | Number of Languages | Details |
|---|---:|---|
| HY-MT2 1.8B | 37 | Simplified Chinese, Traditional Chinese, English, French, Portuguese, Spanish, Japanese, Turkish, Russian, Arabic, Korean, Thai, Italian, German, Vietnamese, Malay, Indonesian, Filipino, Hindi, Polish, Czech, Dutch, Khmer, Burmese, Persian, Gujarati, Urdu, Telugu, Marathi, Hebrew, Bengali, Tamil, Ukrainian, Tibetan, Kazakh, Mongolian, and Uyghur |
| M2M100 418M | 100 | Afrikaans, Amharic, Arabic, Asturian, Azerbaijani, Bashkir, Belarusian, Bulgarian, Bengali, Breton, Bosnian, Catalan, Cebuano, Czech, Welsh, Danish, German, Greek, English, Spanish, Estonian, Persian, Fula, Finnish, French, Western Frisian, Irish, Scottish Gaelic, Galician, Gujarati, Hausa, Hebrew, Hindi, Croatian, Haitian Creole, Hungarian, Armenian, Indonesian, Igbo, Ilocano, Icelandic, Italian, Japanese, Javanese, Georgian, Kazakh, Khmer, Kannada, Korean, Luxembourgish, Ganda (Luganda), Lingala, Lao, Lithuanian, Latvian, Malagasy, Macedonian, Malayalam, Mongolian, Marathi, Malay, Burmese, Nepali, Dutch, Norwegian, Northern Sotho, Occitan, Odia, Punjabi, Polish, Pashto, Portuguese, Romanian, Russian, Sindhi, Sinhala, Slovak, Slovenian, Somali, Albanian, Serbian, Swati, Sundanese, Swedish, Swahili, Tamil, Thai, Filipino, Tswana, Turkish, Ukrainian, Urdu, Uzbek, Vietnamese, Wolof, Xhosa, Yiddish, Yoruba, Chinese, and Zulu |

## Cloud Models

| Provider | Model | Supported languages | Details |
|---|---|---|---|
| Aliyun | Qwen3.5 / Qwen3.8 LiveTranslate | 60 | Chinese, English, Arabic, German, French, Spanish, Portuguese, Indonesian, Italian, Korean, Russian, Thai, Vietnamese, Japanese, Turkish, Hindi, Malay, Dutch, Urdu, Norwegian Bokmål, Swedish, Danish, Hebrew, Finnish, Polish, Icelandic, Czech, Filipino, Persian, Cantonese, Greek, Afrikaans, Asturian, Belarusian, Bulgarian, Bengali, Bosnian, Catalan, Cebuano, Estonian, Galician, Gujarati, Croatian, Hungarian, Javanese, Kazakh, Kannada, Kyrgyz, Latvian, Macedonian, Malayalam, Marathi, Punjabi, Romanian, Slovak, Slovenian, Swahili, Tajik, Azerbaijani, and Ukrainian. Version 3.8 detects the source language automatically; version 3.5 allows you to specify the source language. |
| MiniMax | Speech-to-Text `asr-1.0` | 20 | Arabic, Cantonese, Chinese, English, Filipino, French, German, Indonesian, Italian, Japanese, Korean, Malay, Polish, Portuguese, Russian, Spanish, Thai, Turkish, Ukrainian, and Vietnamese. |

## LLM API Configuration

::: tip
The LLM protocols here are used for translation. Aliyun and MiniMax ASR models use separate connection settings and credentials under Audio and Recognition. Local models require no API configuration.
:::

### Supported Protocols

The app supports the following API protocols:

| Protocol |
|---|
| OpenAI Chat Completions |
| OpenAI Responses |
| Anthropic Messages |
| Ollama Chat |

### Configuration Examples

| Provider | API Format | Example API URL | Example Model ID |
|---|---|---|---|
| DeepSeek | OpenAI Chat Completions | `https://api.deepseek.com` | `deepseek-flash` |
| MiniMax | OpenAI Chat Completions | `https://api.minimax.io/v1` | `MiniMax-M3` |
| MiMo | OpenAI Chat Completions | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-pro` |

### Configuration Steps

![Cloud translation connection settings](/docs-image/en/getting-started/introduction/cloud-translation-settings.png)

1. Select **Cloud Translation** in the translation settings.
2. Choose the **API format** supported by your provider.
3. Enter the **API URL**, **API key**, and **model ID**.
4. Adjust the context window and maximum output tokens as needed.

## Project Structure

```text
assets/brand/                  Logo and brand assets
docs/                          VitePress product website and multilingual documentation
engine/nola_translator_engine/  Python audio, recognition, and translation engine
engine/tests/                   Python tests
scripts/                        Setup and build scripts
src/main/                       Electron main process
src/preload/                    IPC bridge
src/renderer/                   React interface
src/shared/                     Shared contracts and settings
tests/                          Application tests
```

## Development and Build

```powershell
npm run typecheck
npm test
.\.venv\Scripts\python.exe -m pytest engine\tests
npm run build
```

Build the Windows x64 installer:

```powershell
npm run dist:win
```

## Contributing

Fork the repository, create a branch, make your changes, and open a pull request. Briefly describe your changes and the checks you ran. For design and code conventions, see [DESIGN.md](https://github.com/CerealAxis/Nola-Translator/blob/main/DESIGN.md) and [AGENTS.md](https://github.com/CerealAxis/Nola-Translator/blob/main/AGENTS.md).

## License

Nola Translator's original code is licensed under [GNU GPL v3.0 only](https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE). Third-party components and models are subject to their respective licenses; see [Third-Party Notices](https://github.com/CerealAxis/Nola-Translator/blob/main/THIRD_PARTY_NOTICES.md).

[![Star History Chart](https://api.star-history.com/svg?repos=CerealAxis/Nola-Translator&type=Date)](https://star-history.com/#CerealAxis/Nola-Translator)
