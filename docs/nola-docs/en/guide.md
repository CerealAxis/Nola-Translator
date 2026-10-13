---
prev:
  text: Home
  link: /en/
next:
  text: Download Nola Translator
  link: https://github.com/CerealAxis/Nola-Translator/releases/latest
---

# Quick start

Nola Translator transcribes and translates system audio or microphone speech into bilingual captions in real time. The steps below help you set up on Windows x64.

## 1. Install

Download the Windows x64 installer from [GitHub Releases](https://github.com/CerealAxis/Nola-Translator/releases/latest), run it, and launch the application.

## 2. Configure recognition and translation models

Open **Model management** and select a speech recognition model and a text translation model. Each can be configured independently:

- **Speech recognition**: Qwen, Paraformer (local); Aliyun LiveTranslate, MiniMax (cloud).
- **Text translation**: Hy-MT2, Index-Translate (local); MyMemory public API (cloud).

Local models require downloading model weights and runtime components and have VRAM/RAM requirements. Cloud services require a network connection; some need API credentials.

## 3. Set the inference engine

Open **Settings → Compute**:

- **Inference engine**: Choose llama.cpp or PyTorch.
- **Inference device**: Choose NVIDIA GPU or CPU. GPU inference requires compatible drivers and sufficient VRAM.

## 4. Start real-time translation

Open **Quick interpreting**:

1. Select the audio source (system audio or microphone).
2. Set source and target languages.
3. Select recognition and translation models.
4. Click Start.

The workspace supports bilingual, original-only, and translation-only views, with sentence or split layout. After the session, view captions and notes in **Records**.
