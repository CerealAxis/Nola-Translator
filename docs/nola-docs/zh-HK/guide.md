---
prev:
  text: 返回首頁
  link: /zh-HK/
next:
  text: 下載 Nola Translator
  link: https://github.com/CerealAxis/Nola-Translator/releases/latest
---

# 快速上手

Nola Translator 將系統音訊或咪高峰語音即時轉寫並傳譯為雙語字幕。以下步驟幫你喺 Windows x64 上完成初始設定。

## 1. 下載安裝

由 [GitHub Releases](https://github.com/CerealAxis/Nola-Translator/releases/latest) 下載適用於 Windows x64 嘅安裝程式，執行安裝並啟動應用程式。

## 2. 設定辨識與傳譯模型

進入「模型管理」，揀選適合嘅語音辨識模型同文字傳譯模型。兩種模型可以獨立設定：

- **語音辨識**：支援 Qwen、Paraformer 等本機模型，以及阿里雲 LiveTranslate、MiniMax 等雲端服務。
- **文字傳譯**：支援 Hy-MT2、Index-Translate 等本機模型，以及 MyMemory 公開 API 等雲端服務。

本機模型需要下載模型權重同執行元件，對顯示記憶體同記憶體有一定需求。雲端服務需要網絡連線，部分服務需要設定 API 憑證。

## 3. 設定推論引擎

進入「設定」嘅「計算」面板：

- **推論引擎**：揀選 llama.cpp 或 PyTorch。
- **推論裝置**：揀選 NVIDIA GPU 或 CPU。GPU 推論需要相應嘅驅動程式同顯示記憶體支援。

## 4. 開始即時傳譯

開啟「快速同傳」：

1. 揀選音訊來源（系統音訊或咪高峰）。
2. 設定來源語言同目標語言。
3. 揀選辨識模型同傳譯模型。
4. 點選開始。

工作區支援雙語、僅原文、僅譯文三種顯示模式，以及逐句或分區對照版面。完成後可以喺「記錄」中查看字幕同筆記。
