# Nola 浏览器内字幕首版

## 加载

1. 安装新版 Nola，保持软件运行。在设置的“浏览器连接”页启用连接；首次启用会注册当前用户的 Chrome／Edge Native Messaging 程序。
2. 在 Chrome 或 Edge 对应行点击“下载扩展”，保存并解压扩展 ZIP。界面只提供下载和管理入口，不显示安装步骤。
3. 打开 `chrome://extensions` 或 `edge://extensions`，启用开发者模式，加载解压后的文件夹。开发 ID 固定为 `cgbjfdpkcoapeiefeflikdolennbdcbe`。
4. B 站和 YouTube 默认可用；其他 HTTPS 网站点击扩展弹窗中的“在当前网站启用”。在播放器点击 Nola 字幕，选择视频并开启。

标签页音频每次新建共享都需要浏览器选择框，选择当前标签页并共享音频。系统音频直接使用软件的默认输出／扬声器设备。浏览器语言选择不会修改软件默认值。浏览器会话不会产生同传记录或音频文件，字号、位置和双语偏好保存在扩展中。

## 连接和协议

内容脚本 → 扩展后台 → `NolaBrowserHost.exe` → 随机 Windows 命名管道 → Electron 共享会话控制器 → Python 引擎。连接描述文件位于当前用户 `%LOCALAPPDATA%\Nola\Browser`，目录 ACL 限制当前用户与 SYSTEM，连接需要随机密钥。Native Messaging 注册仅在 HKCU，固定扩展身份；接口只允许摘要、扬声器列表、会话与音频控制及字幕事件。

Tab PCM16 单声道约 100 ms 每块，8–192 kHz；引擎归一化为 16 kHz／20 ms。未确认音频及引擎队列均限制两秒。`sessionId`、`streamId`、`epoch`、`sequence` 共同隔离音频；字幕携带视频时间和代次。暂停完成当前句，跳转／倍速／换视频重建时间锚点并取消旧任务。自然结束独立排空 PCM、识别和翻译；用户关闭直接释放输入，模型卸载异步完成，期间拒绝启动或修改资源。

普通视频、开放 Shadow DOM、普通／网页／容器全屏在首版范围内；原生 video 全屏使用临时文字轨道。跨域 iframe、封闭 Shadow DOM、画中画和单视频音轨提取留待后续。识别保留实时处理延迟，回退不重放历史字幕。严格 CSP 页面的 worklet 加载须按实际浏览器验证，失败会释放共享并提示重试。

## 构建及验收

```powershell
npm run typecheck
npm test -- --maxWorkers=4
.venv/Scripts/python.exe -m pytest engine/tests/test_browser_audio.py
.venv/Scripts/python.exe -m unittest discover -s browser/native_host
npm run build:browser
npm run package:browser
npm run build:browser-host
npm run dist:win
```

扩展目录与测试播放器见 [extension/README.md](extension/README.md)。Windows 安装包同时携带扩展 ZIP 和独立连接 EXE。首版不向商店提交。

已执行的检查、已有失败及尚未完成的真实环境验收见 [验证记录](VALIDATION.md)。

手动验收需在 Chrome 与 Edge 分别覆盖 B 站、YouTube 和 HTTPS 通用播放器：共享取消／选错页面／缺少音频、正常声音、暂停缓冲、跳转倍速、自动下一视频、原生及容器全屏、标签页关闭、连接禁用和软件退出。协议单测与构建通过不能替代这组实际浏览器验收。

浏览器 API 依据：[共享选择规则](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)、[Capture Handle](https://developer.chrome.com/docs/web-platform/capture-handle)、[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。
