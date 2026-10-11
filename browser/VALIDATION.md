# 浏览器字幕首版验证记录

## 扩展 1.1.0 修复验证（2026-10-11）

- 当前启动日志确认故障时源音频、Worklet 和 PCM 均为全零；采集的回声消除、降噪、自动增益处于开启状态。新版显式关闭这些语音处理选项；全零输入仅提示，不结束静音片段的会话。
- TypeScript 类型检查、桌面生产构建、扩展生产构建与 ZIP 打包通过；Vitest 全量 58 文件、352 项通过。
- Chrome、Edge 在独立临时配置中加载真实 MV3 产物，生成并播放 440 Hz 音频，使用真实共享与 Worklet 验证非零 PCM。测试替身只替换 Native Messaging 响应，验证返回的双语字幕实际绘制到页面；不调用收费识别服务。
- 已检查开始／刷新／关闭、标签页音频采集操作、自动选视频、页面刷新清理、10px 网站根字号下的 14px 控件字体，以及关闭后的共享释放。
- 已覆盖扩展磁盘版本、未缓存 manifest 的解压安装、页面脚本版本握手、旧版本启动拦截、Toast 去重和对应浏览器下载动作。
- 本轮没有把真实网站 ASR／翻译验收标记为通过。合成音频＋替身字幕不能证明 YouTube／B 站上的具体模型识别效果。

验证截图和报告：`artifacts/browser-smoke/chrome-pipeline/` 与 `artifacts/browser-smoke/edge-pipeline/`。重现：

```powershell
python browser/tests/smoke.py --executable "C:/Program Files/Google/Chrome/Application/chrome.exe" --name chrome-pipeline --cdp-load --pipeline
python browser/tests/smoke.py --executable "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --name edge-pipeline --pipeline
```

本记录对应 2026-10-08 的本地开发版本。安装包用于测试；下列“尚未验收”项目不能由协议单测或界面冒烟测试代替。

## 已验证

| 检查 | 结果 |
| --- | --- |
| TypeScript 类型检查、桌面生产构建 | 通过 |
| Vitest 全量测试 | 44 文件、281 项通过；扩展占 7 文件、34 项；浏览器设置与主进程新增检测／下载／连接权限测试通过 |
| 新增 Python 浏览器音频测试 | 32 项通过 |
| Native Messaging 帧协议 | 3 项通过 |
| 独立连接 EXE 到 Electron 命名管道 | 真实 Windows EXE 往返测试通过 |
| Chrome、Edge 实际 MV3 加载及界面 | 通过；隔离配置下检查按钮、面板隐藏／关闭、多视频选择、音源／设备、布局及刷新清理 |
| 安装资源一致性 | 内置扩展 ZIP、连接 EXE 的 SHA256 与构建源产物一致 |
| 桌面浏览器设置页 | 正式打包产物检查 Chrome／Edge 两行、图标、下载入口、无安装教程；1440×960、1180×780、760×560 深浅主题无横向溢出或隐藏按钮 |
| 打包桌面 UI 冒烟 | 47 项通过；截图位于 `artifacts/browser-settings.png` |

浏览器冒烟测试使用实际生产扩展，只在临时副本增加 `https://nola.test/*` 的测试权限；它不模拟浏览器按钮或面板。软件没有连接时检查错误提示，不把此测试记为识别、共享选择框或完整本地连接验收。Chrome 使用官方 CDP `Extensions.loadUnpacked`，因为正式 Chrome 已移除命令行加载扩展入口；测试仅修改临时配置。依据见 [Chrome 说明](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ) 和 [CDP 协议](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)。

## 全量检查中未通过的项目

- Python 全量测试存在 14 项失败，集中在 `test_runtime_resources.py` 与 `translation/test_llama_server.py`。用 HEAD 引擎代码的隔离副本复现了相同的 14 项失败；该副本另有一项开发路径测试因移动目录而失败。不能将 Python 全量测试标记为通过。
- 桌面全量布局报告为 2331 项检查、18 项失败，涉及模型存储区选择器、记录返回和浮窗滚动；新增浏览器设置页无失败。报告位于 `artifacts/layout/results.json`。这些项目不在浏览器功能修复范围内。

## 尚未验收

- Windows 实际安装及安装后的 Chrome／Edge 完整连接。
- B 站、YouTube 的真实控制栏、真实语音识别与翻译。
- 浏览器共享选择框的取消、选错目标、没有音频，以及实际播放声音是否正常。
- 真实网站上的暂停／缓冲、跳转、倍速、自动下一视频、容器与原生全屏。
- 真实连接下的标签页关闭、禁用连接、软件退出和严格 CSP 页面。

这些项目需按 [加载与验收说明](README.md) 执行，尤其应区分实时模型处理延迟与字幕时间映射错误。

## 重现浏览器界面测试

在独立 Python 环境安装 Playwright，先执行 `npm run build:browser`，再运行：

```powershell
python browser/tests/smoke.py --executable "C:/Program Files/Google/Chrome/Application/chrome.exe" --name chrome --cdp-load
python browser/tests/smoke.py --executable "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --name edge
```

结果及截图保存在 `artifacts/browser-smoke/`，临时浏览器配置在退出后清理。
