# UI, captions, localization and model performance Implementation Plan

> **For agentic workers:** Use subagent-driven implementation with independent file ownership and review. Preserve baseline commit `88a0ff4`. Steps use checkbox syntax for tracking.

**Goal:** 修复布局与字幕显示，以参考视频的紧凑双语字幕条为方向，提供中英文界面和可选模型目录，并消除已确认的识别/翻译瓶颈。

**Architecture:** Electron 主进程保存设置并负责目录选择；React 使用显式翻译字典和语言上下文。字幕预览与浮层共享显示规则，Python 保持现有识别模型和协议，修复调度与资源竞争。

**Tech Stack:** Electron, React, TypeScript, CSS, Python asyncio, sherpa-onnx, faster-whisper, Argos, Vitest, pytest.

## 审查结果

- 外观两列最小宽度 640px，与 901px 窗口下的侧栏冲突；700px 断点低于桌面最小窗口宽度，实际不起作用。
- 标题、按钮组、语言包行缺少换行；路径和英文长文本容易撑开布局。
- 独立浮层以 maxLines 取句数，预览却限制文字行数；历史句堆叠使当前内容裁剪。
- 预览未采用字体，外观页无双语例句；实时页显示开关未同步浮层。
- 旧段落翻译晚到可能覆盖当前段落。
- SenseVoice partial 使用截断样本长度做计时，12 秒后停止刷新；每帧重复复制完整音频。
- 翻译跨片段无并发上限，partial 频繁触发；Argos 查找阻塞事件循环，取消等待可能释放仍在使用的推理锁。
- 韩语自动语言回退缺失；长期会话的 revision/segment 状态无界增长。
- 模型和 Argos 目录硬编码为 userData 下的目录。

## Task 1 — layout and captions

Files: `src/renderer/styles/app.css`, `components/CaptionPreview.tsx`, `overlay/CaptionOverlay.tsx`, `pages/AppearancePage.tsx`, `pages/LiveCaptionsPage.tsx`, renderer tests.

- [x] 将固定两列改为可收缩列，并在可用宽度不足时单列；标题、底栏、资源行折行，长路径断词。
- [x] 当前字幕优先，限制实际文字行数；独立浮层不再将 maxLines 解释为历史句数。采用深色半透明紧凑圆角字幕条、原文/译文层级和低干扰工具栏。
- [x] 原文/译文显示设置持久化并同步所有窗口；预览应用 fontFamily，外观页传入双语示例。
- [x] 按会话、时间与 revision 拒绝陈旧字幕；测试旧句翻译不能取代新句。
- [x] 验证 760/900/901/1100px、中英文长文案、多目标译文和大字号。

## Task 2 — model storage

Files: `src/shared/settings.ts`, `bridge.ts`, `src/preload/index.ts`, `src/main/app-ipc.ts`, `index.ts`, new `model-storage.ts`, `src/renderer/pages/ResourcesPage.tsx`, storage tests.

- [x] 保存 `modelStoragePath: string`，空值兼容原目录。通过系统目录选择器选中可写绝对路径。
- [x] 将自定义根目录中的 models、argos/data、argos/config、argos/cache 传给引擎；将模型下载临时目录与缓存放到选择的磁盘。
- [x] 设置对重启后的下载与加载生效；页面同时说明当前路径和待生效路径，提供重启操作。保留旧目录文件，避免隐式删除或大文件搬迁。
- [x] 验证默认目录兼容、Windows 自定义路径、取消选择、无写入权限及重启后环境变量。

## Task 3 — localization

Files: new `src/renderer/i18n/*`, renderer pages/components, `src/shared/settings.ts`, `src/main/app-ipc.ts`, renderer tests.

- [x] 新增持久化 `uiLanguage: 'zh-CN' | 'en'`，标题栏地球图标菜单即时切换，更新 document.lang 并同步浮层。
- [x] 覆盖导航、7 页文案、表单、aria 标签、错误、状态、资源模型说明；字幕正文、用户路径和模型标识不翻译。
- [x] 动态状态采用可翻译键或渲染时转换，不保留旧语言通知。
- [x] 验证选择 English 后页面/导航更新，重载保存选择，中文回切，字幕正文保持原样。

## Task 4 — recognition and translation

Files: `engine/fluentcaptions_engine/recognition/accurate.py`, `runtime.py`, `translation/scheduler.py`, `translation/argos.py`, matching engine tests.

- [x] 使用累计真实采样数调度 SenseVoice partial，仅在确实推理时复制音频。测试连续语音超 12 秒及 busy/间隔内不复制。
- [x] partial 合并节流，final 立即调度；限制实际翻译并发，共享重复请求；等待超时后原生线程持有锁直到真正完成。
- [x] Argos 查找在线程中执行，缓存会话语言路径；新增韩语回退，限制已完成片段状态增长。
- [x] 测试慢服务、多目标、revision 失效、final 更新、取消锁及缓存；不声称未经语料基准测量的准确率提升。

## Task 5 — integration and verification

- [x] `npm test` → renderer/main/shared tests pass.
- [x] `npm run build` → typecheck + production build pass.
- [x] `.venv/Scripts/python.exe -m pytest engine/tests` → engine tests pass.
- [x] 浏览器或 Electron 渲染截图检查布局与字幕；补充英文窄窗口和实际存储目录行为。
- [x] 审查新增 diff 的需求覆盖与代码质量，更新 README 与计划执行结果。记录无法实测的 GPU、麦克风或联网模型限制。

## 执行结果（2026-09-27）

- `npm test`：15 个文件、52 项全部通过（新增 i18n 切换/回滚/字幕正文不翻译 3 项，模型存储与设置存储补测）。
- `npm run build`：typecheck + electron-vite 生产构建通过。
- `.venv/Scripts/python.exe -m pytest engine/tests`：69 项全部通过（新增超时持锁集成、runtime 陈旧翻译拒绝、默认并发上限 3 共 3 项）。
- `npm run test:layout`（新增脚本）：2 语言 × 4 宽度 × 7 页共 56 场景零溢出，真实鼠标点击语言菜单切换/切回通过，浮层双目标译文（zh+ja）渲染通过。
- 布局 e2e 修复：该 Electron 构建下 `window.destroy()` 后再加载新窗口会 `ERR_FAILED`，改为 `close()` 并等待 `closed`。
- 计划偏差：i18n 实际落地为 `src/renderer/i18n.tsx` + `src/renderer/locales/en.ts`（中文原文即键），而非 `i18n/*` 目录；审查后追加修复：语言按钮 no-drag 与下拉菜单绝对定位、外观滑块 180ms 防抖合并写盘、资源页双口径改称“引擎数据目录”、`AppSettingsPatch` 与 IPC schema 对齐。
- 字幕样式二次校准（视频直读）：当前模型不支持视频输入，按 mimo 视频理解文档将录像 base64 传给 `mimo-v2.6-pro`（fps=2，15232 video tokens）输出样式规格并据此修改：去掉玻璃拟态渐变与背景模糊，改为纯色 `#111111` @84%、圆角 10px、投影 `0 4px 12px rgba(0,0,0,.5)`；译文默认色由淡蓝改为白色（层级靠字号/字重）；深色字幕加 `text-shadow`；换句 160ms 淡入（行按 segmentId 重建，旧配置默认色自动迁移）；默认浮层宽度改为屏幕工作区宽度的 66%（760–1600 夹取）。复验：`npm test` 53 项、构建、`test:layout` 56 场景全部通过。
- 未实测项：GPU（CUDA/FP16）、真实麦克风与扬声器回路、联网模型下载（本次验证均使用确定性 fixture，无网络与真实模型）。
