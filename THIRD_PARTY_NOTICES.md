# 第三方组件声明

Nola Translator 使用或分发以下主要第三方组件；完整传递依赖及精确版本见 `package-lock.json` 和 `engine/requirements.lock`。

## 桌面应用

- Electron、React、React DOM、Vite、Vitest、electron-vite：MIT；
- Fluent UI System Icons：MIT；
- Zod：MIT；
- electron-builder：MIT。

## Python 引擎

- PyAudioWPatch / PyAudio：MIT；
- PyTorch（torch）：BSD-3-Clause；
- transformers：Apache-2.0；
- bitsandbytes：MIT；
- accelerate：Apache-2.0；
- NumPy：BSD-3-Clause；
- SciPy：BSD-3-Clause；
- Pydantic：MIT；
- FunASR（`funasr`，SenseVoiceSmall 的官方推理实现）：MIT，随附 ModelScope：Apache-2.0；
- kaldi-native-fbank（FunASR 的 fbank 后端）：Apache-2.0；
- PyInstaller：GPL-2.0-or-later，并带有允许分发生成程序的 bootloader exception。

## 本地推理运行时

- llama.cpp（`llama-server` b11211 及 CUDA 运行时 DLL，打包于 `resources\llama\`）：MIT，来自 ggml-org/llama.cpp 官方 release。

## 按需下载的模型

- Qwen3-ASR 1.7B（`Qwen/Qwen3-ASR-1.7B-hf`，BF16 权重，加载时 NF4/8bit 量化）：Apache-2.0，见 [Hugging Face 模型卡](https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf)；
- Qwen3-ASR 0.6B（`Qwen/Qwen3-ASR-0.6B-hf`，同上）：Apache-2.0，见 [Hugging Face 模型卡](https://huggingface.co/Qwen/Qwen3-ASR-0.6B-hf)；
- SenseVoiceSmall（`FunAudioLLM/SenseVoiceSmall`，`model.pt` 等）：FunASR Model License，见 [Hugging Face 模型卡](https://huggingface.co/FunAudioLLM/SenseVoiceSmall)；
- Hy-MT2 1.8B GGUF（`tencent/Hy-MT2-1.8B-GGUF` 的 `Hy-MT2-1.8B-Q4_K_M.gguf`）：Apache-2.0，见 [Hugging Face 模型卡](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)；
- M2M100 418M（`facebook/m2m100_418M`）：MIT，见 [Hugging Face 模型卡](https://huggingface.co/facebook/m2m100_418M)。

模型不直接提交到本仓库或安装包。其许可证及元数据由各自发布方提供，用户首次下载前应遵循对应条款。

Nola Translator 自有代码采用 GNU General Public License v3.0 only（GPL-3.0-only），完整条款见仓库根目录 `LICENSE`。本文件列出的第三方依赖、运行时和模型不因此自动改用 GPL；分发时须分别遵守各自的许可证与声明。
