# 第三方组件声明

FluentCaptions 使用或分发以下主要第三方组件；完整传递依赖及精确版本见 `package-lock.json` 和 `engine/requirements.lock`。

## 桌面应用

- Electron、React、React DOM、Vite、Vitest、electron-vite：MIT；
- Fluent UI System Icons：MIT；
- Zod：MIT；
- electron-builder：MIT。

## Python 引擎

- PyAudioWPatch / PyAudio：MIT；
- sherpa-onnx：Apache-2.0；
- faster-whisper：MIT；
- CTranslate2：MIT；
- ONNX Runtime：MIT；
- Argos Translate：MIT 或 CC0 双许可；
- NumPy：BSD-3-Clause；
- SciPy：BSD-3-Clause；
- Pydantic：MIT；
- PyInstaller：GPL-2.0-or-later，并带有允许分发生成程序的 bootloader exception。

## 按需下载的模型

- sherpa-onnx 中英双语 Zipformer 模型从 k2-fsa 官方 release 下载；
- faster-whisper 模型从 Hugging Face 的 Systran/faster-whisper 模型仓库下载；
- Argos `.argosmodel` 从 Argos 官方包索引下载。

模型和语言包不直接提交到本仓库或安装包。其许可证及元数据由各自发布方提供，用户首次下载前应遵循对应条款。

本文件只记录第三方声明，不代表 FluentCaptions 项目自身已经选择开源许可证。
