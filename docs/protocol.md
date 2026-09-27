# Electron 与 Python 通信协议

FluentCaptions 的 Electron 主进程通过标准输入和标准输出管理独立 Python 引擎。协议采用 UTF-8 JSON Lines：每条消息占一行，当前 `protocolVersion` 固定为 `1`。

## 边界与安全约束

- Python 的 stdout 只允许输出协议 JSON；诊断日志只写 stderr。
- 单行序列化后不得超过 32 KiB，超过时返回 `lineTooLarge`。
- 所有命令和事件必须包含非空 `requestId`，请求响应沿用同一个 ID。
- 未知消息类型、缺少必填字段或非法数值会被拒绝；未知的非关键字段会被忽略，以便旧版本读取新版本消息。
- `error.code` 必须使用协议中的枚举代码，`details` 只能包含不敏感的结构化上下文，不依赖自然语言错误文本进行程序判断。
- 字幕正文、密钥和完整音频设备 ID 不写入主进程日志。

## 启动与退出

```mermaid
sequenceDiagram
    participant E as Electron 主进程
    participant P as Python 引擎
    E->>P: hello
    P-->>E: ready
    E->>P: listDevices / listResources
    P-->>E: devices / resources
    E->>P: manageResource（用户明确操作）
    P-->>E: resourceActionResult / resourceChanged
    E->>P: startSession
    P-->>E: sessionStarted / caption / status
    E->>P: stopSession
    P-->>E: sessionStopped
    E->>P: shutdown
    P-->>E: shutdownComplete
```

启动后 10 秒内没有收到 `ready` 即视为失败。异常退出最多自动重启三次，默认退避为 250 ms、1 秒和 4 秒；用户主动退出不会触发重启。

开发态使用项目已有的 `.venv\\Scripts\\python.exe -m fluentcaptions_engine`；打包后使用 `resources\\engine\\FluentCaptionsEngine.exe`，最终用户无需安装 Python。

## 会话配置

`startSession.config` 包含音频来源、识别模式、具体识别模型、源语言、最多八个目标语言和翻译 Provider。例如：

```json
{
  "audioSource": { "kind": "defaultOutput" },
  "recognitionMode": "realtime",
  "recognitionModelId": "qwen3-asr-1.7b-hf",
  "sourceLanguage": "auto",
  "targetLanguages": ["zh", "ja"],
  "translationProvider": "hymt2",
  "allowIntermediateTranslation": false
}
```

`recognitionModelId` 可选值为 `qwen3-asr-1.7b-hf`；旧客户端省略该字段时，Python 引擎同样按该模型处理。`recognitionMode` 为消息结构兼容字段，不再决定识别模型。

`translationProvider` 可为 `hymt2`（本地 llama.cpp + Hy-MT2）、`microsoft`、`openai` 或 `ollama`。联网 Provider 的地址、区域和模型放在 `translationOptions`；API 密钥由 Electron 主进程从 Windows 加密存储读取，只在发送 `startSession` 时注入，不暴露给渲染进程。`allowIntermediateTranslation` 默认 `false`——只翻译最终字幕；为 `true` 时对变化中的中间字幕限频提交翻译，最终字幕始终优先。`hymt2` 在 `startSession` 前校验目标语言，不支持的组合返回 `invalidConfiguration`。

## 资源管理

`listResources` 只扫描本地文件，返回识别模型（`kind: "recognitionModel"`，`provider: "qwen3-asr"`）与本地翻译模型（`kind: "translationModel"`，`provider: "hy-mt2"`）的安装状态、占用空间与当前操作。`manageResource` 只接受内置 `resourceId`（`qwen3-asr-1.7b-hf`、`hy-mt2-1.8b-q4-k-m`），动作可为 `install`、`remove` 或 `cancel`；渲染进程不能传入下载 URL 或任意文件路径。两类资源的安装均支持取消与逐文件校验，`phase` 依次经过 `download`、`verify`、`install`。

资源操作先返回 `resourceActionResult`，后台状态变化通过 `resourceChanged` 推送。已知总大小时 `progress` 为 0 到 1；下载源不提供总大小时省略进度，界面显示不定进度条，不伪造百分比。

`startSession` 不会隐式下载、更新或安装资源。缺少识别模型时立即返回 `resourceUnavailable`，并在 `details.missingResourceIds` 中给出缺失项。缺少本地翻译模型时不阻断识别；对应译文标记为失败（`resourceUnavailable`），不影响原文识别，也不会联网补包。

## 字幕事件

`caption` 携带以下稳定结构：

```json
{
  "protocolVersion": 1,
  "type": "caption",
  "requestId": "event-caption-1",
  "sessionId": "session-1",
  "segment": {
    "segmentId": "segment-1",
    "revision": 2,
    "startedAtMs": 120,
    "endedAtMs": 940,
    "sourceLanguage": "en",
    "sourceText": "Hello world",
    "isFinal": true,
    "translations": [
      {
        "targetLanguage": "zh-CN",
        "text": "你好，世界",
        "state": "complete",
        "provider": "hymt2"
      }
    ]
  }
}
```

`revision` 从 0 开始并且只能递增。主进程允许合并同一 `segmentId` 的中间版本，只向界面投递当前最新版本；最终字幕、错误和模型进度不会被合并或丢弃。最终字幕到达后，该字幕段的迟到中间结果将被忽略。

共享协议样例位于 `tests/fixtures/protocol/messages.json`，TypeScript/Zod 与 Python/Pydantic 测试共同读取该文件，防止两端字段定义漂移。
