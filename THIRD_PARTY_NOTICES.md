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
- PyInstaller：GPL-2.0-or-later，并带有允许分发生成程序的 bootloader exception。

## 本地推理运行时

- llama.cpp（`llama-server` b11211 及 CUDA 运行时 DLL，打包于 `resources\llama\`）：MIT，来自 ggml-org/llama.cpp 官方 release。

## 按需下载的模型

- Qwen3-ASR 1.7B（`Qwen/Qwen3-ASR-1.7B-hf`，BF16 权重，加载时 NF4/8bit 量化）：Apache-2.0，见 [Hugging Face 模型卡](https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf)；
- Hy-MT2 1.8B GGUF（`tencent/Hy-MT2-1.8B-GGUF` 的 `Hy-MT2-1.8B-Q4_K_M.gguf`）：Apache-2.0，见 [Hugging Face 模型卡](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)。

模型不直接提交到本仓库或安装包。其许可证及元数据由各自发布方提供，用户首次下载前应遵循对应条款。

本文件只记录第三方声明，不代表 Nola Translator 项目自身已经选择开源许可证。
