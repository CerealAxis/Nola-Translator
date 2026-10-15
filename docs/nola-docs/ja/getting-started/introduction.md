# 製品紹介

<div align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/assets/brand/nola-logo.svg" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/assets/brand/nola-logo.svg" alt="Nola Translator Logo" width="112" height="112"></a>
  <h1>Nola Translator</h1>
  <p>リアルタイム字幕・翻訳アプリ</p>
  <p><a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.md">English</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-CN.md">简体中文</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ja.md">日本語</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ko.md">한국어</a></p>
</div>

<p align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square" alt="GPL v3 ライセンス"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml/badge.svg" alt="ビルドワークフローの状態"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://img.shields.io/badge/Actions-Download%20Artifacts-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="GitHub Actions の成果物をダウンロード"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases"><img src="https://img.shields.io/github/v/release/CerealAxis/Nola-Translator?style=flat-square&label=Release" alt="最新の GitHub リリース"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases/latest"><img src="https://img.shields.io/badge/Releases-Download%20Latest-2DA44E?style=flat-square&logo=github&logoColor=white" alt="最新リリースをダウンロード"></a>
  <img src="https://img.shields.io/badge/QQ%E7%BE%A4-701699932-12B7F5?style=flat-square&logo=tencentqq&logoColor=white" alt="QQ グループ：701699932">
  <img src="https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-7-7A5CFA?style=flat-square&logo=vite&logoColor=white" alt="Vite 7">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ja/home.png" alt="Nola Translator の画面プレビュー" width="1000">
</p>

## 概要

Nola Translator は、ローカルモデルとクラウドモデルに対応したリアルタイム字幕・翻訳アプリです。用途に応じてローカルの計算リソースで音声認識と翻訳を行うことも、クラウドモデルに接続して認識と翻訳を行うこともできます。

## 機能

- **ローカルモデル:** Qwen3-ASR や SenseVoiceSmall などの認識モデル、HY-MT2 などの翻訳モデルをローカルで実行できます。Hugging Face の他のモデルを検索してインストールすることもできます。
- **クラウドモデル:** Aliyun、MiniMax などのクラウド ASR モデルに対応し、OpenAI 互換 API、Anthropic、Ollama などの LLM プロトコルと、無料の MyMemory 翻訳サービスも利用できます。
- **GPU アクセラレーション:** 利用可能な計算デバイスを検出し、認識と翻訳に別々のデバイスを設定できます。
- **ブラウザー拡張機能:** Chrome と Edge 用の拡張機能で動画ページに二言語字幕を表示できます。デスクトップのシステム音声を入力ソースに設定することもできます。
- **リアルタイム字幕オーバーレイ:** システム出力、選択したオーディオデバイス、またはマイクに対応します。字幕は独立したウィンドウに表示され、位置、フォントサイズ、色、不透明度、原文と翻訳のレイアウトを調整できます。
- **柔軟な設定:** 必要なモデルをインストールし、認識・翻訳方式、言語の組み合わせ、計算デバイス、字幕スタイルを選択できます。API 認証情報はアプリ内に安全に保存されます。
- **履歴とエクスポート:** 字幕履歴を保存し、TXT、SRT、WebVTT 形式でエクスポートできます。音声録音の保存は任意です。

## 画面プレビュー

| ホーム | フローティング字幕 | 動画字幕 |
|---|---|---|
| ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ja/home.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ja/overlay-scene.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ja/browser-scene.png) |

| ローカルモデルのインストール | 推論環境の設定 | ダークモード |
|---|---|---|
| ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ja/models.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/zh-CN/compute-environment.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/zh-CN/dark-mode.png) |

## インストール

- [最新リリースをダウンロード](https://github.com/CerealAxis/Nola-Translator/releases/latest)

Windows x64 に対応しています。EXE または MSI インストーラーを選択できます。他のプラットフォームは開発が安定した後に対応予定です。

## 対応する認識言語

::: tip
認識と翻訳で利用できる言語は、選択したモデルの能力によって異なります。以下の表は、アプリに含まれる推奨モデルの対応状況です。おすすめのモデルがあれば issue でお知らせください。採用を検討します。初めての方には、認識に **SenseVoiceSmall**、翻訳に **HY-MT2 1.8B** をおすすめします。
:::

### 認識モデル

| モデル | 言語数 | 詳細 |
|---|---:|---|
| Qwen3-ASR 1.7B | 30 | 自動検出に対応；中国語、英語、広東語、アラビア語、ドイツ語、フランス語、スペイン語、ポルトガル語、インドネシア語、イタリア語、韓国語、ロシア語、タイ語、ベトナム語、日本語、トルコ語、ヒンディー語、マレー語、オランダ語、スウェーデン語、デンマーク語、フィンランド語、ポーランド語、チェコ語、フィリピノ語、ペルシア語、ギリシャ語、ハンガリー語、マケドニア語、ルーマニア語 |
| Qwen3-ASR 0.6B | 30 | 自動検出に対応；中国語、英語、広東語、アラビア語、ドイツ語、フランス語、スペイン語、ポルトガル語、インドネシア語、イタリア語、韓国語、ロシア語、タイ語、ベトナム語、日本語、トルコ語、ヒンディー語、マレー語、オランダ語、スウェーデン語、デンマーク語、フィンランド語、ポーランド語、チェコ語、フィリピノ語、ペルシア語、ギリシャ語、ハンガリー語、マケドニア語、ルーマニア語 |
| SenseVoiceSmall | 5 | 中国語、英語、広東語、日本語、韓国語 |

### 翻訳モデル

| モデル | 言語数 | 詳細 |
|---|---:|---|
| HY-MT2 1.8B | 37 | 簡体字中国語、繁体字中国語、英語、フランス語、ポルトガル語、スペイン語、日本語、トルコ語、ロシア語、アラビア語、韓国語、タイ語、イタリア語、ドイツ語、ベトナム語、マレー語、インドネシア語、フィリピノ語、ヒンディー語、ポーランド語、チェコ語、オランダ語、クメール語、ミャンマー語、ペルシア語、グジャラート語、ウルドゥー語、テルグ語、マラーティー語、ヘブライ語、ベンガル語、タミル語、ウクライナ語、チベット語、カザフ語、モンゴル語、ウイグル語 |
| M2M100 418M | 100 | アフリカーンス語、アムハラ語、アラビア語、アストゥリアス語、アゼルバイジャン語、バシキール語、ベラルーシ語、ブルガリア語、ベンガル語、ブルトン語、ボスニア語、カタロニア語、セブアノ語、チェコ語、ウェールズ語、デンマーク語、ドイツ語、ギリシャ語、英語、スペイン語、エストニア語、ペルシア語、フラ語、フィンランド語、フランス語、西フリジア語、アイルランド語、スコットランド・ゲール語、ガリシア語、グジャラート語、ハウサ語、ヘブライ語、ヒンディー語、クロアチア語、ハイチ・クレオール語、ハンガリー語、アルメニア語、インドネシア語、イボ語、イロカノ語、アイスランド語、イタリア語、日本語、ジャワ語、ジョージア語、カザフ語、クメール語、カンナダ語、韓国語、ルクセンブルク語、ガンダ語、リンガラ語、ラオ語、リトアニア語、ラトビア語、マダガスカル語、マケドニア語、マラヤーラム語、モンゴル語、マラーティー語、マレー語、ミャンマー語、ネパール語、オランダ語、ノルウェー語、北ソト語、オック語、オディア語、パンジャブ語、ポーランド語、パシュトゥー語、ポルトガル語、ルーマニア語、ロシア語、シンド語、シンハラ語、スロバキア語、スロベニア語、ソマリ語、アルバニア語、セルビア語、スワジ語、スンダ語、スウェーデン語、スワヒリ語、タミル語、タイ語、フィリピノ語、ツワナ語、トルコ語、ウクライナ語、ウルドゥー語、ウズベク語、ベトナム語、ウォロフ語、コサ語、イディッシュ語、ヨルバ語、中国語、ズールー語 |

## クラウドモデル

| プロバイダー | モデル | 対応言語 | 詳細 |
|---|---|---|---|
| Aliyun | Qwen3.5 / Qwen3.8 LiveTranslate | 60 | 中国語、英語、アラビア語、ドイツ語、フランス語、スペイン語、ポルトガル語、インドネシア語、イタリア語、韓国語、ロシア語、タイ語、ベトナム語、日本語、トルコ語、ヒンディー語、マレー語、オランダ語、ウルドゥー語、ノルウェー語(ブークモール)、スウェーデン語、デンマーク語、ヘブライ語、フィンランド語、ポーランド語、アイスランド語、チェコ語、フィリピノ語、ペルシア語、広東語、ギリシャ語、アフリカーンス語、アストゥリアス語、ベラルーシ語、ブルガリア語、ベンガル語、ボスニア語、カタロニア語、セブアノ語、エストニア語、ガリシア語、グジャラート語、クロアチア語、ハンガリー語、ジャワ語、カザフ語、カンナダ語、キルギス語、ラトビア語、マケドニア語、マラヤーラム語、マラーティー語、パンジャブ語、ルーマニア語、スロバキア語、スロベニア語、スワヒリ語、タジク語、アゼルバイジャン語、ウクライナ語。3.8 は入力言語を自動検出し、3.5 は入力言語を指定できます。 |
| MiniMax | Speech-to-Text `asr-1.0` | 20 | アラビア語、広東語、中国語、英語、フィリピノ語、フランス語、ドイツ語、インドネシア語、イタリア語、日本語、韓国語、マレー語、ポーランド語、ポルトガル語、ロシア語、スペイン語、タイ語、トルコ語、ウクライナ語、ベトナム語 |

## LLM API の設定

::: tip
ここで設定する LLM プロトコルは翻訳に使用します。Aliyun と MiniMax の ASR モデルは、「オーディオと認識」にある専用の接続設定と認証情報を使用します。ローカルモデルに API 設定は不要です。
:::

### 対応プロトコル

次の API プロトコルに対応しています：

| プロトコル |
|---|
| OpenAI Chat Completions |
| OpenAI Responses |
| Anthropic Messages |
| Ollama Chat |

### 設定例

| サービス | API 形式 | API URL の例 | モデル ID の例 |
|---|---|---|---|
| DeepSeek | OpenAI Chat Completions | `https://api.deepseek.com` | `deepseek-flash` |
| MiniMax | OpenAI Chat Completions | `https://api.minimax.io/v1` | `MiniMax-M3` |
| MiMo | OpenAI Chat Completions | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-pro` |

### 設定手順

![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/zh-CN/llm-configuration.png)

1. 翻訳設定で **クラウド翻訳** を選択します。
2. プロバイダーが対応する **API 形式** を選択します。
3. **API URL**、**API キー**、**モデル ID** を入力します。
4. 必要に応じてコンテキスト長と最大出力 Token 数を調整します。

## プロジェクト構成

```text
assets/brand/                  ロゴとブランド素材
docs/                          VitePress 製品サイトと多言語ドキュメント
engine/nola_translator_engine/  Python 音声・認識・翻訳エンジン
engine/tests/                   Python テスト
scripts/                        セットアップとビルドスクリプト
src/main/                       Electron メインプロセス
src/preload/                    IPC ブリッジ
src/renderer/                   React インターフェース
src/shared/                     共有契約と設定
tests/                          アプリケーションのテスト
```

## 開発とビルド

```powershell
npm run typecheck
npm test
.\.venv\Scripts\python.exe -m pytest engine\tests
npm run build
```

Windows x64 インストーラーのビルド：

```powershell
npm run dist:win
```

## コントリビューション

リポジトリを Fork し、ブランチを作成して変更を加え、Pull Request を送ってください。変更内容と実行したチェックを簡潔に記載してください。デザインとコードの規約は [DESIGN.md](https://github.com/CerealAxis/Nola-Translator/blob/main/DESIGN.md) と [AGENTS.md](https://github.com/CerealAxis/Nola-Translator/blob/main/AGENTS.md) を参照してください。

## ライセンス

Nola Translator のオリジナルコードは [GNU GPL v3.0 only](https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE) の下で公開されています。サードパーティのコンポーネントとモデルにはそれぞれのライセンスが適用されます。詳しくは [Third-Party Notices](https://github.com/CerealAxis/Nola-Translator/blob/main/THIRD_PARTY_NOTICES.md) を参照してください。

[![Star History Chart](https://api.star-history.com/svg?repos=CerealAxis/Nola-Translator&type=Date)](https://star-history.com/#CerealAxis/Nola-Translator)
