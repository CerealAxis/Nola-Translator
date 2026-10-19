# 开发环境配置

>[!TIP]
> AI攥写，待完善

本页说明如何取得源代码、准备前端与 Python 环境、运行真实桌面引擎、构建文档及扩展，并选择相应检查。普通使用者无需安装这些开发工具，直接阅读[环境配置](../getting-started/environment)。

完成哪一层验证取决于任务：能打开 React 界面，不代表引擎能启动；能运行 Python 单测，不代表 Electron 使用了那个 Python；能生成 Electron 输出，也不等于生成了完整 Windows 安装包。

## 一、确定需要开发的部分

| 任务 | 最小准备 | 后续增加 |
| --- | --- | --- |
| 修改 Markdown | Git、Node.js、npm、文档依赖 | 图片和页面检查 |
| 修改 React 页面 | 根目录依赖、Electron 开发启动 | 真实引擎或内存演示 |
| 修改 Python 协议和逻辑 | Python 3.12 测试环境 | 对应模型、音频和组件 |
| 修改浏览器扩展 | 前端构建、匹配桌面和连接程序 | Chrome／Edge 真实授权验收 |
| 修改安装与发布 | Windows x64、Python 构建和打包依赖 | 安装、升级及迁移回归 |

开始前阅读 `AGENTS.md` 与 `DESIGN.MD`。它们包含命名、状态、事件、i18n、主题、日志和协议约定；文档贡献还需遵循[编写规范](../contributing/writing-guidelines)。

## 二、基础工具与版本

仓库 `package.json` 要求 Node.js `>=24 <25`、npm `>=11 <12`；引擎 `pyproject.toml` 要求 Python `>=3.12,<3.13`。不要只写“最新版本”或安装另一个主版本后修改锁文件迁就本机。

准备 Git、编辑器、对应 Node.js／npm。Python 任务另装 Python 3.12。Windows 音频采集和安装包应在 Windows x64 上验证；其他系统可编辑部分代码，但不能据此宣称通过 WASAPI 或 Native Messaging 的实际验收。

在 PowerShell 检查：

```powershell
git --version
node --version
npm --version
py -3.12 --version
```

`py` 不存在时，可以使用确认为 3.12 的解释器完整路径。不要把命令名存在当成版本和架构已符合要求。

## 三、克隆与 Git 设置

在准备存放项目的目录运行：

```powershell
git clone https://github.com/CerealAxis/Nola-Translator.git
cd Nola-Translator
git status --porcelain -uall
```

需要提交时按[如何贡献](../contributing/how-to-contribute)使用 Fork 和工作分支。配置本仓库作者信息时，替换名称和邮箱：

```powershell
git config --local user.name "YOUR_NAME"
git config --local user.email "YOUR_VERIFIED_EMAIL"
```

邮箱可使用 GitHub 提供的 `noreply` 地址。SSH 仓库认证和提交签名不是同一设置，GPG 见[签名指南](./gpg-signing)。不要把全局配置改动作为每位贡献者的必经操作。

## 四、安装 Node 依赖

在仓库根目录运行：

```powershell
npm ci
```

`npm ci` 按锁文件恢复环境。失败时记录阶段，检查 Node.js、npm、网络和 Electron 二进制，不要一开始就删除锁文件重新解析所有依赖。

文档依赖在独立工程，文档任务额外执行：

```powershell
npm --prefix docs ci
```

更改业务代码通常不需要更新依赖。确实修改依赖时，说明原因并提交相应锁文件；不要混入无关批量升级。

## 五、运行桌面端

### 1. 前端和 Electron

在仓库根目录运行：

```powershell
npm run dev
```

electron-vite 管理主进程、preload 和 React 渲染器。主窗口能打开，说明桌面界面启动，但采集和推理还依赖 Python 基础环境、组件、模型及设备。

### 2. 准备桌面实际使用的 Python

在仓库根目录运行：

```powershell
npm run build:python
```

脚本准备 `engine/dist/NolaPythonEngine`。开发主进程实际从这里启动 `python.exe`，加载 `engine/` 下的引擎源代码，使用固定 3.12 ABI，并按配置加入组件导入及 DLL 路径。

根目录 `.venv` 是开发测试环境，不会因为已激活就自动成为桌面引擎。遇到“我已经 pip 安装但桌面仍缺依赖”时，先确认安装到了哪个解释器。

### 3. 运行组件和模型

通过设置准备 PyTorch／llama.cpp，按本地任务下载权重。开发用 llama 脚本为 `scripts/fetch-llama.ps1` 与 `scripts/fetch-llama-cpu.ps1`，读取运行清单的固定版本、配套资源及 SHA-256，不自行拼装 DLL。

完成组件检查、音频试听和短会话三层验证。不要在 PR 中只写“页面正常”却声称音频推理已通过。

## 六、建立 Python 测试环境

在仓库根目录运行：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "./engine[dev]"
.\.venv\Scripts\python.exe -m pytest engine/tests
```

显式调用 `.venv` 解释器可避免依赖终端是否激活。该安装提供引擎开发依赖；真实 Torch、llama 和设备相关测试还需对应环境，不能把所有跳过项当作通过实际推理。

修改单个模块时先运行相关测试，再按影响扩大范围。例如浏览器音频和连接帧测试可分别执行：

```powershell
.\.venv\Scripts\python.exe -m pytest engine/tests/test_browser_audio.py
.\.venv\Scripts\python.exe -m unittest discover -s browser/native_host
```

测试错误应按其阶段处理：导入失败查解释器和依赖，协议断言失败查契约，实际采集失败查设备和资源释放。不要用一条“重建环境”覆盖所有类型。

## 七、文档、演示与截图

### 1. 启动和构建

在仓库根目录运行：

```powershell
npm run docs:dev
```

文档源为 `docs/nola-docs/`，主题及配置位于 `docs/.vitepress/`。预览地址看终端输出，首次访问受浏览器语言检测影响，检查中文页时先选择简体中文。

生产检查使用：

```powershell
npm run docs:build
```

此命令包含文档类型检查、演示构建和 VitePress 静态构建。开发预览可用不能代替生产构建成功。

### 2. 共享页面和内存 bridge

桌面、文档演示和 Toy 共用 `renderer/application.tsx` 页面与导航。`docs/media-src/` 使用纯内存 bridge 模拟设置、记录、组件和模型动作，不读取真实凭据、不采集音频、不进行推理。

验证交互时先确认自己运行的是演示还是真实桌面。演示中的安装成功、字幕和设备都不构成真实后端测试。

### 3. 演示回归与截图

修改共享页面、导航或演示行为时，按范围运行：

```powershell
npm run build:toy
npm run test:demo
```

中文教程截图生成：

```powershell
node docs/scripts/generate-screenshots.mjs --guide
```

图片和独立来源记录保存在中文 guide 目录。`docs/public/demo/` 等生成结果按项目忽略约定处理，不把整个构建目录提交。

## 八、浏览器扩展与连接程序

在仓库根目录依次运行需要的构建：

```powershell
npm run build:browser
npm run package:browser
npm run build:browser-host
```

扩展构建输出为 `browser/extension/dist/`。Native Messaging 构建默认使用 `.venv\Scripts\python.exe`，依赖 PyInstaller，输出 `artifacts/browser-host/NolaBrowserHost.exe`。

安装与开发验证还需要匹配桌面端。通过桌面“浏览器字幕”设置注册／允许当前用户连接，加载完整扩展目录，按[浏览器字幕](../features/browser-captions)授权。

修改协议时保持固定开发 ID、消息名、schema 和 Python 帧一致。发布版本来自 `browser/version.json`，行为变更记录在 `browser/CHANGELOG.md`；更新后刷新旧视频页。

浏览器真实验收覆盖共享取消、选错页、没有音频、暂停、跳转、倍速、播放器替换、全屏和断连。隔离测试不能替代 Chrome 与 Edge 的实际流程，详细基线见[browser/README.md](https://github.com/CerealAxis/Nola-Translator/blob/main/browser/README.md)。

## 九、目录与修改边界

| 目录 | 负责内容 | 修改时联动 |
| --- | --- | --- |
| `src/main/` | 会话、窗口、存储、组件与日志 | IPC 校验、资源及隐私边界 |
| `src/preload/` | 受控 API 暴露 | shared bridge 和渲染适配 |
| `src/shared/` | 类型、schema、默认值与能力目录 | Python 协议与六语言界面 |
| `src/renderer/` | React 页面、store 和主题 | 演示与真实桌面 |
| `engine/` | 音频、识别、翻译、资源管理 | 线协议与 Python 测试 |
| `browser/` | 扩展和 Native Messaging | 版本、帧、权限和时间线 |
| `docs/` | 文档站、演示、截图 | 站点构建与来源记录 |

完整结构和规范以 `AGENTS.md` 为准。路径别名在 Electron 和 Vitest 中都要维护，不能只让开发服务器解析成功。

## 十、检查与 Windows 打包

在仓库根目录按范围运行：

```powershell
npm run typecheck
npm test
npm run build
```

`npm run build` 只生成应用构建；完整发布流程为：

```powershell
npm run dist:win
```

它构建桌面、浏览器扩展、连接程序与内置 Python，再执行 Windows EXE／MSI 打包。下载、临时环境和安装资源占用较大，应先确认磁盘和网络。

CI 通过 `.github/actions/build-windows/` 和 `scripts/ci-build-windows.ps1` 组织构建，可能使用与本地默认打包不同的发布文件名，并生成附件摘要。构建成功不自动代表完成代码签名、安装验收或发布。

## 十一、常见问题

| 现象 | 检查方法 |
| --- | --- |
| Electron 缺二进制 | 根依赖安装是否完成，实际 Electron 文件与包版本是否匹配 |
| `.venv` 正常、桌面引擎失败 | 检查 `engine/dist/NolaPythonEngine/python.exe` 及启动搜索路径 |
| DLL 导入失败 | 检查 Python 3.12 ABI、组件后端、配套 DLL 和句柄存活 |
| 文档找不到包 | 根目录和 `docs/` 是否分别安装依赖 |
| 扩展构建成功但不能连接 | 匹配桌面／host、注册、浏览器许可和内容脚本版本 |
| 安装包构建失败 | 保留失败阶段，不把前端编译结果当作完整打包结果 |

提交前写出实际完成的验证和限制，流程见[如何贡献](../contributing/how-to-contribute)。本页结构参考 [PCLC Docs 开发环境配置](https://docs.pclc.cc/ce/developers/setup)，工具链和命令均按本仓库重新核对。
