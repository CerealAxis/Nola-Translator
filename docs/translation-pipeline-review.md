# 字幕与翻译链路评估（2026-09-27）

## 当前链路

`PortAudioCapture` 捕获系统音频，重采样后按 20 ms 帧送入识别器。当前用户配置是 SenseVoiceSmall：Silero VAD 维护语音片段，`StreamingSenseVoiceRecognizer` 对增长中的片段反复运行完整的离线 SenseVoice 模型，以此模拟流式识别。源文 revision 进入 `EngineRuntime._emit_update`，随后翻译 worker 将最新文本提交给 `TranslationScheduler`。调度器按 provider、语言和文本缓存结果，合并相同请求，最多同时处理三个请求，并拒绝过期 revision。当前 provider 是 Argos，本地语言包执行翻译。事件经 Electron IPC 传入浮层，由 `receiveCaption` 和 `CaptionTrack` 显示。

可选翻译 provider 还有 Microsoft Translator、OpenAI 兼容接口和 Ollama。它们共用调度器与字幕协议。Argos 的实现为单锁串行执行；有英语中转开关，但当前用户配置关闭。当前设置中的 SenseVoice 和 Argos 都在本机运行；网络 provider 要把识别文本发送给对应服务。

## 已确认问题与本次处理

1. 浮层曾跨 segment 保存上一句译文；新句 pending 时仍显示旧句。现在仅显示当前 segment 的翻译，旧句只保留 280 ms 退出动画。原文和译文依各自事件独立切换。
2. 引擎曾在同一 segment 的原文 revision 改变后，把上一 revision 的译文作为新 revision 的可见译文。现在只有原文完全相同时才沿用已有翻译，否则发出 pending。
3. SenseVoice 是离线模型，原先默认每 280 ms 对当前语音窗口从头译码。10 秒连续语音的测试触发 35 次快照；默认调整为 650 ms 后测试上限为 17 次，预计降低长语音时重复推理的 CPU 工作量，代价是中间原文最多额外延迟约 370 ms。VAD 截止后的最终译码不受这一间隔限制。

截图中的 82% 是整个系统 CPU，不能直接视为本应用占用。空闲时一次 5 秒进程采样：识别引擎消耗约单核 9%，Electron 各进程约 0%。尚无用户播放音频时的逐进程样本，因此不能给出播放中的实际降幅。

## 方案比较与建议

| 方案 | 收益 | 成本与限制 | 建议 |
| --- | --- | --- | --- |
| 保留 Argos，优化事件和请求调度 | 本地离线、无需改包格式；当前故障主要在字幕状态而非翻译模型 | 长句质量依语言包，单锁执行会排队 | **近期首选**。先用真实视频测 P50/P95 翻译延迟、CPU 秒数和译文质量 |
| 直接接入 CTranslate2 与 OPUS-MT 或其他兼容模型 | 可选 INT8、线程和 beam 参数；有机会降低延迟和 CPU | 需要模型转换、分词、语言包和 Windows 打包；模型许可需逐个核对 | **实验分支**。固定同一测试集，与 Argos 比质量、耗时和内存后再决定 |
| Bergamot 本地引擎 | 面向本地翻译，支持浏览器 JavaScript/WASM 路径 | 模型格式和运行时要重做，需验证 Electron 场景的内存与质量 | 暂作备选，不建议直接替换 |
| Microsoft Translator | 免本地翻译推理，多语言覆盖 | 网络时延、费用及上传文本；离线不可用 | 保持为可选 provider |
| OpenAI 兼容接口或 Ollama | 可通过提示词控制语气和术语 | LLM 的首字时延、成本或本机算力需求更高，实时字幕不稳定 | 用于用户明确选择的高质量模式 |

下一步最有价值的实验是同一段 5–10 分钟音视频，记录捕获到原文、原文到译文、字幕切换的 P50/P95 延迟，以及引擎 CPU 秒数和内存峰值。分别运行当前 Argos、CTranslate2 INT8 的候选模型和 Microsoft provider，并人工核对专有名词、长句与断句。没有这组同机对照数据，不应断言替代方案一定更快或翻译更好。

## 仍需处理的边界

当前 `captionPages` 分别按原文和译文标点/长度分页，再用同一个页号显示两种语言。两种语言句数不同时，页号未必语义对齐。后续应给源文与译文建立按 segment、句子 ID 对应的分页，或在单个 segment 内将译文作为整体展示并独立滚动；这需要真实语料验证，不能简单按页号硬配。

## 官方资料

- [sherpa-onnx 的非流式 SenseVoice 示例](https://github.com/k2-fsa/sherpa-onnx/blob/master/python-api-examples/non_streaming_server.py)
- [Argos Translate 项目说明](https://github.com/argosopentech/argos-translate)
- [CTranslate2 性能建议](https://github.com/OpenNMT/CTranslate2/blob/master/docs/performance.md)
- [CTranslate2 模型和运行时支持](https://github.com/OpenNMT/CTranslate2)
- [OPUS-MT 模型说明](https://github.com/Helsinki-NLP/Opus-MT)
- [Bergamot WASM 示例](https://github.com/browsermt/bergamot-translator/blob/main/wasm/README.md)
- [Azure Translator 数据处理说明](https://learn.microsoft.com/en-us/azure/ai-services/translator/secure-deployment)
