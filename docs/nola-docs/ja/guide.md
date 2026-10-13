---
prev:
  text: ホームに戻る
  link: /ja/
next:
  text: Nola Translator をダウンロード
  link: https://github.com/CerealAxis/Nola-Translator/releases/latest
---

# はじめに

Nola Translator は、システム音声やマイクの音声を即座に書き起こし、二言語字幕として翻訳します。以下の手順で Windows x64 環境をセットアップしてください。

## 1. インストール

[GitHub Releases](https://github.com/CerealAxis/Nola-Translator/releases/latest) から Windows x64 のインストーラーをダウンロードし、実行してアプリを起動します。

## 2. 認識・翻訳モデルの設定

「モデル管理」を開き、音声認識モデルとテキスト翻訳モデルを選択します。それぞれ独立して設定できます：

- **音声認識**：Qwen、Paraformer（ローカル）；Aliyun LiveTranslate、MiniMax（クラウド）。
- **テキスト翻訳**：Hy-MT2、Index-Translate（ローカル）；MyMemory 公開 API（クラウド）。

ローカルモデルにはモデルのダウンロードと実行コンポーネントが必要で、VRAM/RAM の要件があります。クラウドサービスにはネットワーク接続が必要で、一部サービスは API 認証情報の設定が必要です。

## 3. 推論エンジンの設定

「設定」→「計算」を開きます：

- **推論エンジン**：llama.cpp または PyTorch を選択。
- **推論デバイス**：NVIDIA GPU または CPU を選択。GPU 推論には対応するドライバと十分な VRAM が必要です。

## 4. リアルタイム翻訳の開始

「クイック同時通訳」を開きます：

1. 音声ソース（システム音声またはマイク）を選択。
2. 変換元と変換先の言語を設定。
3. 認識・翻訳モデルを選択。
4. 開始をクリック。

ワークスペースは、二言語・原文のみ・翻訳のみの表示に対応し、文分割または領域分割レイアウトを選択できます。セッション終了後、「履歴」で字幕とメモを確認できます。
