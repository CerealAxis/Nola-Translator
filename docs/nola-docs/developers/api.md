# API 文档

>[!TIP]
> AI攥写，待完善

本页说明 Nola Translator 内部 bridge、Electron IPC、Python JSONL 与浏览器契约，供修改源代码和维护跨进程行为使用。它不是公共 HTTP API，也不承诺内部字段跨桌面版本稳定。

完整字段和约束应直接查阅共享类型、schema 与 Python 定义。本页说明调用关系、重要方法、副作用、生命周期和修改时需要保持的边界，不以复制所有声明代替接口解释。

## 一、调用关系与职责

```text
React 页面
  → store action
    → NolaBridge
      → preload 暴露的 NolaTranslatorApi
        → Electron 主进程 IPC
          → SessionController / 资源与存储管理
            → Python stdin / stdout JSONL

浏览器内容脚本
  → 扩展后台
    → Native Messaging stdio 帧
      → 当前用户命名管道
        → Electron 单会话控制
```

| 层次 | 定义位置 | 负责的边界 |
| --- | --- | --- |
| 渲染访问契约 | `src/renderer/bridge/contract.ts` | 分组的 NolaBridge，统一数据出口 |
| preload API | `src/shared/bridge.ts` | `NolaTranslatorApi` 方法签名 |
| TS 线类型 | `src/shared/contracts.ts` | 引擎命令、事件和共享数据 |
| TS 校验 | `src/shared/schemas.ts` | 进程边界输入校验 |
| Python 校验 | `engine/nola_translator_engine/protocol.py` | Pydantic 模型与序列化 |
| 浏览器受限契约 | `src/shared/browser.ts` | 扩展消息、版本、音频约束 |

渲染组件只调用 store action。store 在 `initStores()` 时取得 bridge，不在模块求值时访问 IPC。桌面桥接和网页演示使用不同实现，但共享页面与 store 路径。

## 二、桌面 bridge 与生命周期

`window.nolaTranslator` 由 preload 暴露，生产适配器将其封装为 NolaBridge。业务代码应从现有边界取得类型，不能在各组件中复制接口或绕过主进程。

### 1. 读取状态与启动引擎

| 方法 | 返回 | 副作用 |
| --- | --- | --- |
| `getEngineState()` | `Promise<EngineProcessState>` | 只读，不因为查询而启动引擎 |
| `ensureEngineReady()` | `Promise<EngineProcessState>` | 启动子进程并完成握手，不加载权重 |
| `prewarmModels()` | `Promise<PrewarmResult>` | 校验并加载当前所需模型，不打开音频 |
| `onEngineEvent(listener)` | 退订函数 | 建立引擎与主进程生命周期事件订阅 |

`EngineProcessState` 为 `stopped`、`starting`、`ready`、`stopping`、`recovering`、`failed`。它描述进程状态，不等同于会话收音状态；进程 ready 后仍可能尚未加载模型。

订阅状态变化时先建立订阅再读取当前值，避免初始化窗口期漏事件。销毁 store 或组件绑定时调用退订函数，不重复叠加监听器。

### 2. 预热失败

bridge 的 `prewarmModels()` 可通过 `PrewarmResult.state` 返回失败及具体 code，不应假定一切拒绝都抛异常。Python 线上的预热成功事件和 bridge 层的返回形状也不完全相同，不要把封装后的失败对象直接当引擎事件解析。

模型预热可以为浏览器服务准备权重，但不创建音频会话、不保存录音。释放模型时，尚未完成的原生任务可能要求延迟释放，不能仅因 UI 停止就取消资源保留。

## 三、音频设备与试听

### 1. 类型

```typescript
type AudioSource =
  | { kind: 'defaultOutput' }
  | { kind: 'systemOutput'; deviceId: string }
  | { kind: 'microphone'; deviceId: string }
  | { kind: 'browserTab'; streamId: string }

type AudioTestSource = Exclude<AudioSource, { kind: 'browserTab' }>

interface AudioTestResult {
  audioBase64: string
  durationMs: 2000
  hasSignal: boolean
}
```

`defaultOutput` 是协议来源，不是某个枚举设备 ID。没有默认回环设备时，也不应隐藏其他明确的输出或麦克风端点。

### 2. 方法与结果

`listDevices(): Promise<AudioDevice[]>` 只说明枚举结果，不证明流能够打开或启动。`testAudio(source): Promise<AudioTestResult>` 经会话控制预留采集，执行两秒内存试听。

返回为识别链路的 16 kHz 单声道 WAV，`hasSignal` 表示是否检测到信号。Promise 完成且 `hasSignal === false` 是静音结果，不能作为打开流异常；异常则应区分枚举、匹配、打开流和启动流阶段。

试听不加载模型、不创建记录。成功及失败都要释放采集流和 PortAudio 后端。应用不执行增益或降噪，格式转换只满足 ASR 输入要求。

### 3. 识别与录音不是同一路格式

识别路径下混和重采样到单声道输入；桌面录音则尽量保留最多两个声道，以恒定码率 MP3 保存，高于 48 kHz 的采集需转换到编码支持范围。不能把试听 WAV 的格式当成会议录音格式，也不应在实时回调中执行磁盘写入。

## 四、会话控制

### 1. 启动与返回值

```typescript
type SessionStartResult = {
  sessionId: string
  meetingId: string | null
}
```

`startSession(config)` 通过主进程的统一控制进行配置、资源及环境校验。桌面会话可以关联会议记录；浏览器临时会话没有会议记录，因此调用方必须处理 `meetingId === null`。

`SessionConfig` 包含音源、识别服务、原文语言、目标语言、翻译服务及本地模型等。连接公开配置与密钥分开处理：渲染设置不包含原始密钥，主进程在受控路径按需注入，不能把包含凭据的引擎命令转发给浏览器。

### 2. 暂停、停止、重置和排空

| 操作 | 目的 | 不能替代的行为 |
| --- | --- | --- |
| `setSessionPaused(id, paused)` | 暂停或恢复当前会话 | 不补录暂停期间音频 |
| `stopSession(id)` | 结束当前会话 | 不能无限等待不可取消的原生线程 |
| `resetStream` | 跳转后隔离旧 epoch 和结果 | 不等于自然结束并保存尾句 |
| `finishStream` | 排空自然结束前的最后片段 | 不应直接丢弃待处理音频 |

`src/main/session-controller.ts` 是桌面及浏览器的唯一单会话入口。不得为新入口另建绕过资源预留的启动路径。

停止回执与原生资源真正空闲可能不是同一时刻。后台原生任务完成前继续锁定相关资源，避免新会话复用正在计算的模型状态。

## 五、模型与运行组件

### 1. 查询和管理

| 方法 | 作用 | 重要限制 |
| --- | --- | --- |
| `getRuntimes()` | 读取运行组件快照 | 硬件存在不等于后端已通过 |
| `prepareRuntimes(components?)` | 准备所需组件 | 与会话启动和组件操作协调 |
| `installRuntime(id, repair?)` | 安装或修复指定组合 | 修复需确认应用拥有安装记录 |
| `listResources()` | 模型资源快照 | 已安装不代表已配置能力 |
| `manageResource(id, action, source?)` | 安装、移除、取消 | 源、占用及下载身份需校验 |
| `configureModel(id, configuration)` | 持久化用途与能力配置 | 声明不能给模型增加真实能力 |

`manageResource` 的 action 为 `install`、`remove`、`cancel`。下载 source 从 UI 到 TS schema 再到 Python 必须完整传递，不能在中间解析时被静默丢弃。

### 2. 搜索与兼容性

`searchHuggingFace` 返回候选仓库；`inspectHuggingFace` 查询声明和兼容性；模型卡通过独立方法获取。搜索不应为每个结果同时安装环境或执行推理。

`installHuggingFaceModel` 先判断兼容性，再注册并启动下载。拒绝不应被描述成已传输一半，而模型下载完成也不能跳过后续语言与引擎校验。

### 3. 下载与缓存

分块身份包含固定 URL、文件大小、摘要和块大小。失败、取消和重启保留已完成分块，成功清理对应缓存；安装暂存仍是临时文件。清理不跟随 junction，不能让外部路径被当作缓存递归处理。

运行时清单固定包版本、ABI 和 SHA-256。开发下载也复用同一清单，探测与引擎启动必须使用一致 DLL 目录，并保持 Windows 目录句柄存活。

## 六、Python JSONL 线协议

### 1. Envelope 与握手

协议版本为 `1`，每行一个 UTF-8 JSON 对象，包含 `type`、`protocolVersion`、`requestId`。请求 ID 用于对应响应和诊断，不能仅依赖事件到达顺序。

示例为线格式说明，不应由渲染组件直接写入子进程：

```json
{"type":"hello","protocolVersion":1,"requestId":"docs-hello-1","clientVersion":"1.0.9"}
```

`clientVersion` 使用实际客户端版本。引擎的 `ready` 事件返回 `engineVersion` 和 `capabilities`，调用方应完成握手后再使用功能。

### 2. 命令与事件

| 命令方向 | 主要响应或事件 | 说明 |
| --- | --- | --- |
| `hello` | `ready` | 建立协议能力基础 |
| `listDevices` | `devices` | 设备目录 |
| `prewarmModels` | `modelsPrewarmed` 或 `error` | 包含加载与就绪阶段 |
| `startSession` | `sessionStarted`、状态及字幕 | 会话 ID 决定后续归属 |
| `stopSession` | `sessionStopped` | 停止与后台清理协调 |
| `pushAudio` | `audioAccepted` | 浏览器音频确认与流控 |
| `resetStream` | `streamReset` | 隔离旧时间线 |
| `finishStream` | `streamFinished` | 排空尾句 |

stdout 只输出协议，日志和第三方库输出转到 stderr。普通 `print` 污染 stdout 会让主进程误判协议损坏，不能把调试输出随意加入该通道。

解析应遵守行大小、字段长度、有限数值和枚举约束。修改 TS 类型后还需维护 zod 和 Pydantic，不能用类型断言假装不兼容输入已被校验。

## 七、字幕、翻译与记录

`CaptionSegment` 包含片段 ID、修订号、起止时间、原文、定稿标记及翻译数组。翻译状态为 `pending`、`complete` 或 `failed`，文字可能暂时不存在，不能把 pending 当空白的最终译文。

同一片段按 ID 更新，不同片段保留完整内容。重复句子、共同前缀或相同尾词都不能作为裁剪依据，否则会丢失真实重复发言。

会议只持久化确认的原文和稳定译文更新，不写入每个 Token 的中间变化。最终结果覆盖过时网络中间结果，旧请求不能晚到后反写新结果。原生推理则需保持资源预留直到真实空闲。

`listMeetings`、`getMeeting`、`readMeeting` 用于记录读取，`setMeetingNotes` 中空字符串用于清空笔记。`exportMeeting` 返回保存路径或取消时的 `null`；调用方应处理取消，不将其显示为导出失败。

录音 URL 可能为 `null`，不保存录音是合法状态。删除记录为破坏性操作，界面需清楚确认相关字幕、译文和录音范围。

## 八、浏览器受限契约

Native Messaging 名称为 `com.nola.captions`。协议版本与扩展发布版本分别维护，扩展版本从 `browser/version.json` 编译到内容包并用于 hello；重载后台不能替旧内容脚本冒报新版本。

### 1. 消息范围

浏览器主要使用 `hello`、`start`、`audio`、`pause`、`reset`、`finish`、`stop` 等受限请求。主进程按 schema 校验，不开放任意引擎命令、凭据读取、文件访问或模型管理。

### 2. 音频与时间线

音频为单声道 PCM16，约每 100 ms 一块。`sessionId`、`streamId`、`epoch`、`sequence` 用于拒绝过期或乱序输入，输入及确认窗口限制积压。确认必须对应本 epoch，旧错误不能终止新流。

视频时间经 browserTimeline 映射，不能直接拿会话运行时间作为视频字幕位置。暂停、跳转和倍速都需处理，reset 不允许旧推理结果穿透新时间线。

### 3. 授权原因

`getDisplayMedia` 必须在用户点击的原调用栈发起，不能由稍后的桌面消息替代。Capture Handle、来源和音轨校验通过后只处理音频，不读取画面。标签页声音关闭麦克风式回声消除、降噪和自动增益，避免对播放音频做不合适处理。

## 九、错误与日志

线协议错误名、内部异常与用户支持码分别管理。`src/shared/error-catalog.ts` 维护支持码，关联 ID 连接 UI、IPC 与引擎日志。云端认证、余额及限流必须在 wire `code` 中明确区分，只有 `details.reason` 不足以驱动正确的用户提示。

日志由主进程统一保留，当前启动为一份 JSONL，旧启动逐份压缩，保留最近 10 次启动。音频、字幕、译文、密钥与携带内容的提示词不得写入日志。原始异常、设备名和路径仍可用于诊断，用户主动分享前需检查。

模块求值期不应同步抛错，缺 IPC 时应 reject 或降级为 no-op，避免连带渲染根节点失败。资源释放必须覆盖开始失败、流启动失败、取消和退出路径。

## 十、修改契约后的检查

先确定影响了哪些边界，再同步代码和测试：

1. 修改 shared 类型、默认值和 schema。
2. 修改 preload、IPC、bridge 和 store 调用。
3. 同步 Python 协议、服务及序列化。
4. 涉及浏览器时同步扩展、帧和时间线处理。
5. 验证成功、失败、取消、重置、结束及旧消息晚到。
6. 运行类型检查、相关 Vitest、Python 测试和真实链路验证。

日志或界面显示正确，不足以证明消息在所有边界中保持完整。协议示例与测试夹具也需一起维护，开发命令见[开发环境配置](./development-setup)。
