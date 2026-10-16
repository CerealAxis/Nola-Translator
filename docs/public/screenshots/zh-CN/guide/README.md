# 简体中文教程截图来源

这些截图来自项目实际 React 页面与内存演示 bridge，使用浅色主题。生成器请求 1920 × 1080 窗口，Windows 工作区可能限制实际捕获高度；每张 PNG 的实际像素尺寸以 `manifest.json` 为准。模型状态、硬件、记录和字幕均为虚构数据，不读取真实凭据、录音或模型，不代表推理性能实测。

在仓库根目录安装开发依赖后运行：

```powershell
node docs/scripts/generate-screenshots.mjs --guide
```

此选项仅更新本目录及其 `manifest.json`，不覆盖其他语言和既有海报。生成器等待字体和页面完成渲染，再由 Electron 捕获视口。`compute-components` 在计算设备页面滚动到底部，展示运行组件区域。

| 文件 | 页面路由 | 演示参数 page |
| --- | --- | --- |
| `home.png` | `#/` | `home` |
| `workspace.png` | `#/workspace` | `workspace` |
| `session-setup.png` | `#/workspace` | `session-setup` |
| `session-check.png` | `#/workspace` | `session-check` |
| `models.png` | `#/models` | `models` |
| `download-source.png` | `#/models` | `download-source` |
| `compute.png` | `#/settings/compute` | `compute-environment` |
| `compute-components.png` | `#/settings/compute` | `compute-components` |
| `translation.png` | `#/settings/translation` | `llm-configuration` |
| `audio.png` | `#/settings/audio` | `audio` |
| `browser.png` | `#/settings/browser` | `browser` |

每张图片对应的组件、主题、尺寸和文件大小记录在 `manifest.json`。内容由 `docs/media-src/demo.ts` 和 `docs/media-src/demoBridge.ts` 提供，截图生成逻辑在 `docs/scripts/capture-screenshots.cjs`。

新建同传、开始前检查和下载源截图通过点击真实页面按钮打开相应窗口，等待内容和有限动画完成后捕获。所有动作留在内存演示中，不发起真实下载、采集或模型加载。

正文另行引用的 `../overlay-scene.png` 和 `../browser-scene.png` 是既有原创场景合成图，其来源保留在 `docs/public/screenshots/manifest.json`，本次未重建。
