# 如何贡献

> [!WARNING]  
> 本文档仍在持续完善中，部分内容可能不完整、未验证或暂未覆盖最新实现。  
> 如果你有兴趣，欢迎提交 Pull Request 来完善本文档

本页面向希望修正文档、补充截图、验证模型、修复问题或开发功能的贡献者。流程按“确定任务、准备环境、Fork、修改、验证、提交、审核”展开，首次参与也可以从一个明确的小问题开始。

文档贡献先阅读[编写规范](./writing-guidelines)，代码贡献还需遵守根目录 `AGENTS.md` 和 `DESIGN.MD`。

## 一、明确要解决的问题

| 贡献类型 | 合适的材料 | 开始前重点 |
| --- | --- | --- |
| 文档修正 | 错误位置、正确行为和来源 | 是否已有同类说明 |
| 新教程或截图 | 读者任务、完整步骤及图片来源 | 是否符合现有大纲 |
| 缺陷修复 | 最小复现、错误信息和预期行为 | 是否已有 Issue／修复分支 |
| 新模型支持 | 官方模型卡、许可证、格式和能力依据 | 引擎是否实际支持 |
| 功能或架构调整 | 使用场景、行为变化和验证方案 | 数据、协议和维护成本 |

明确错字或失效链接可以直接修改。涉及新入口、结构、协议或记录行为时，建议先在 [Issues](https://github.com/CerealAxis/Nola-Translator/issues)讨论范围，避免完成大量改动后才发现方向不符。

搜索已有 Issue 和 Pull Request；发现重叠任务时，在对应讨论中说明计划。一个分支尽量处理一类问题，不混入无关格式化和依赖升级。

## 二、准备本地环境

### 1. 最小工具

文档修改需要 Git、Node.js 24、npm 11 和能编辑 Markdown 的工具。Python、模型和 GPU 只在对应代码或真实推理任务中需要，完整说明见[开发环境配置](../developers/development-setup)。

在 PowerShell 中检查：

```powershell
git --version
node --version
npm --version
```

### 2. 配置Github和SSH

项目托管在 GitHub 上。为了能够克隆仓库、推送分支和提交 Pull Request，你需要先准备好 GitHub 账号，并配置 SSH 密钥。

如果你尚未配置 SSH，可以参考 GitHub 官方文档：

[将新的 SSH 密钥添加到 GitHub 帐户](https://docs.github.com/zh/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)

配置完成后，可以使用以下命令测试 SSH 是否可用：

```powershell
ssh -T git@github.com
```

## 三、Fork 并克隆仓库

打开[项目仓库](https://github.com/CerealAxis/Nola-Translator)，点击 Fork，在自己的账户下创建副本。

```powershell
git clone https://github.com/YOUR_USERNAME/Nola-Translator.git
cd Nola-Translator
git remote add upstream https://github.com/CerealAxis/Nola-Translator.git
git remote -v
```

正常情况下，你应该能看到 `origin` 指向自己的 `Fork`，`upstream` 指向`Nola Translator` 的原仓库。

克隆完成后，可以使用你习惯的编辑器或 IDE 打开项目目录。之后的安装依赖、启动开发服务器、编辑文档等操作，都可以在 IDE 内置终端中完成。

## 四、安装依赖并启动预览

### 1. 文档任务

在仓库根目录运行：

```powershell
npm ci
npm --prefix docs ci
npm run docs:dev
```

启动成功后，终端会显示本地预览地址。打开该地址后，你就可以在浏览器中查看文档站点。

修改文档时，开发服务器通常会自动刷新页面。建议一边编辑，一边在浏览器中检查最终显示效果。

### 2. 桌面代码任务

按[开发环境配置](../developers/development-setup)启动 Electron。

## 五、修改文档与截图

### 1. 确定文件位置

简体中文页面位于 `docs/nola-docs/` 根级分类中。`en/`、`ja/`、`ko/`、`zh-HK/`、`zh-TW/` 是其他语言文档。

| 内容 | 位置 |
| --- | --- |
| 入门配置 | `getting-started/` |
| 功能操作 | `features/` |
| 排错与反馈 | `troubleshooting/` |
| 贡献与写作 | `contributing/` |
| 开发和契约 | `developers/` |
| 使用与隐私说明 | `legal/` |

优先沿用现有页面，文件名采用有意义的小写连字符。每页一个一级标题，按真实任务顺序写清前置、选项、结果和失败处理。

### 2. 截图与来源

写入文档前，将图片复制到 `docs/public/docs-image/zh-CN/{文档分类}/{文章名}/`，使用描述性文件名，并从 `/docs-image/` 引用。

### 3. 检查导航

侧栏来自页面与目录结构。改名或新增页面后检查入口页、相邻链接、锚点及分类位置。


## 六、检查差异并提交

在仓库根目录查看：

```powershell
git diff --check
git diff --stat
git diff
git status --porcelain -uall
```

排除真实凭据、日志、模型、缓存、构建产物和无关 IDE 文件。暂存时选择本次文件，避免在工作区混有其他改动时直接把全部文件提交。

提交信息格式为 `<type>[optional scope][!]: <description>`，描述使用英文、祈使语气、小写开头且不加句号。例如：

```text
docs(zh-CN): document audio setup and verification
```

可用类型包括 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`。破坏性变更使用 `!` 并解释影响。

## 七、推送并创建 Pull Request

确认提交内容后，把当前工作分支推送到自己的 Fork，例如：

```powershell
git push -u origin codex/docs-audio-setup
```

GPG 签名配置见[对应指南](../developers/gpg-signing)，原则上所有的 Pull Request 都需要 GPG 签名，否则不予接受。

## 八、回应审核与保持分支可用

根据意见修改原分支并补充验证。只需继续推送即可更新同一个 PR，通常不必为每轮修改新建 PR。

需要同步上游时，先检查工作区，再依据团队约定选择合并或变基。变基会改写提交，已被他人使用的分支不要直接强推；遇到冲突逐项理解双方意图，不整文件选择一边来省略判断。

审核范围改变时同步更新 PR 标题和描述，移除过时截图与说明。维护者可能要求缩小范围或补充证据，提出贡献不等于保证合并时限。

## 九、获取帮助

遇到问题时，可以通过以下方式获取帮助：

* 在 [GitHub Issues](https://github.com/CerealAxis/Nola-Translator/issues) 提问。
* 在 Pull Request 中说明遇到的问题，等待维护者协助。

感谢你为 Nola Translator 文档站点做出的贡献！
