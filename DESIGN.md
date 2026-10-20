---
name: Nola Translator
description: 面向实时双语阅读的桌面翻译工具；冰蓝底色、清晰层级、紧凑控件与克制的彩色入口。
colors:
  primary: "oklch(60% 0.22 257)"
  on-primary: "oklch(99% 0.002 255)"
  background: "oklch(97.8% 0.014 255)"
  surface: "oklch(99.6% 0.004 255)"
  surface-secondary: "oklch(97.4% 0.012 255)"
  surface-tertiary: "oklch(94.4% 0.024 255)"
  text: "oklch(22.5% 0.047 261)"
  text-muted: "oklch(57.5% 0.046 259)"
  border: "oklch(92.3% 0.026 255)"
  separator: "oklch(95.2% 0.013 255)"
  success: "oklch(71% 0.19 155)"
  warning: "oklch(73% 0.16 65)"
  danger: "oklch(64% 0.21 23)"
  feature-purple: "oklch(60% 0.24 298)"
  feature-orange: "oklch(67% 0.19 48)"
  feature-emerald: "oklch(76% 0.15 170)"
  dark-primary: "oklch(70% 0.16 257)"
  dark-background: "oklch(21% 0.039 259)"
  dark-surface: "oklch(27% 0.044 258)"
  dark-surface-secondary: "oklch(31% 0.048 258)"
  dark-surface-tertiary: "oklch(36% 0.051 258)"
  dark-text: "oklch(96% 0.014 255)"
  dark-text-muted: "oklch(74% 0.04 258)"
  dark-border: "oklch(37% 0.05 258)"
  dark-separator: "oklch(32% 0.044 258)"
  dark-success: "oklch(76% 0.16 157)"
  dark-warning: "oklch(80% 0.15 75)"
  dark-danger: "oklch(72% 0.18 22)"
  dark-feature-purple: "oklch(74% 0.17 298)"
  dark-feature-orange: "oklch(78% 0.14 48)"
  dark-feature-emerald: "oklch(80% 0.12 170)"
typography:
  display:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.2
  h1:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.25
  h2:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.65
  body-strong:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.45
  caption:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 24px
  full: 9999px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 80px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.xl}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.xl}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  panel:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  panel-dark:
    backgroundColor: "{colors.dark-surface-secondary}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
---

# DESIGN.MD

## Colors

主色用于主要操作、链接、焦点和选中状态。文字、表面、边框与状态色按语义引用，深色模式保持相同布局，仅切换调色板。

| YAML token | 运行时 CSS token | 用途 |
| --- | --- | --- |
| primary / on-primary | `--accent` / `--accent-foreground`（亦有 `--primary` 别名） | 主操作及其文字 |
| background | `--background` | 页面底色 |
| surface / surface-secondary / surface-tertiary | 同名 `--surface*` | 卡片、次级面、悬停面 |
| text / text-muted | `--foreground` / `--muted` | 正文、说明与元信息 |
| border / separator | `--border` / `--separator` | 容器边界、行分隔 |
| success / warning / danger | 同名 CSS token | 成功、警告、危险 |
| feature-purple / feature-orange / feature-emerald | `--color-purple` / `--color-orange` / `--color-emerald` | 悬浮字幕、记录、模型入口 |

dark-* 是同一语义的深色值，on-primary 两套主题共用。调色板分别对应 [nola-light.css](src/renderer/theme/nola-light.css) 和 [nola-dark.css](src/renderer/theme/nola-dark.css)。

快速同传入口使用 `--color-blue`（即主色）；紫、橙、薄荷绿只用于相应入口及装饰，不替代状态色。中性色与彩色背景混合使用 oklab，避免色相插值导致橙色和薄荷绿偏成紫蓝。现有主色柔底沿用 `--color-accent-soft`。

主按钮与侧栏选中项实际使用 `--nola-primary-gradient`，YAML 的 primary 表示主色基准。浅色渐变从主色至 oklch(71% 0.16 257)，深色至 oklch(76% 0.12 257)，方向为 105deg。背景只允许低对比光晕与宽斜带。

字段使用 `--field-background` / `--field-foreground` / `--field-border` / `--field-border-focus`；弹层使用 `--overlay` / `--overlay-foreground`。浮窗配色由用户独立选择，字幕自定义颜色属于设置数据。

## Typography

YAML 八级字阶对应 [index.css](src/renderer/theme/index.css) 的 `--font-display/h1/h2/title/body/body-strong/caption/label`。正文默认 14px/1.65，说明 13px，元信息 12px；时间与数值使用等宽数字。

字体随区域选择打包的 Noto Sans SC / TC / HK / KR / JP，并保留系统回退。YAML 展示默认栈的核心字体，完整区域栈以 [typography.css](src/renderer/theme/typography.css) 为准。字幕选用系统字体后仍追加当前区域字体，避免缺字。

通用 `--font-*` 与页面语义字阶分别维护：[app.css](src/renderer/theme/app.css) 将 `--nola-text-display` 设为 700 32px/1.25，将 `--nola-text-title` 设为 650 20px/1.4。页面标题、小节沿用既有语义类，不把通用 h2 的 24px 套到所有小节。

字幕字号由用户设置，预览应反映设置。覆盖 HeroUI 原子字阶时使用 utilities 层字号/行高类；这是任意值类的特定例外，不能据此硬编码其他视觉值。

## Layout

以 8px 为通用间距基准：spacing.sm 至 spacing.5xl 对应 `--space-1` 至 `--space-8`。壳层已有 12px / 20px 等局部尺寸是布局规格，不新增一套通用间距。

| 区域 | 布局规格 |
| --- | --- |
| 顶栏 | 高 64px，固定在主滚动区外 |
| 侧栏 | 宽 200px；导航 padding 12px、gap 8px；不重复品牌区 |
| 导航按钮 | 高 56px、圆角 16px、图文间距 16px；图标约 24px |
| 主内容 | 路由提供一层 padding，常规 24px、最大宽 1600px；AppShell 不重复包边 |
| 区块与卡片 | 区块 gap 20px，紧凑处 16px；卡片常规 padding 20px，重点 24px（YAML card） |
| 设置行与字段 | 行高 44–52px，标签/控件对齐；通用字段高度 token 为 38px，业务字段沿用现有 36–40px 规格 |

窗口自身不滚动，main 与阅读区各自管理纵向滚动。flex/grid 内容保持 min-width:0，需要垂直收缩的区域保持 min-height:0。功能页不得通过 viewport 宽度、负 margin 或 fixed 越过壳层。

宽度不超过 1024px 时侧栏收至 76px 图标导航，保留 Tooltip 与可访问名称，页面 padding 为 20px；高度不超过 700px 时 padding 为 16px。首页四卡在内容足够宽时单行，否则两列或一列。工作台窄窗折叠笔记、双语可上下阅读；模型网格改为一列；设置次导航转为横向；表格隐藏次要列，不以横向溢出容纳内容。

### 页面构成

| 页面 | 视觉结构与主要交互 |
| --- | --- |
| 首页 | 紧凑横向 Hero、右侧插画；四色等高入口卡；最近记录 Table Card，最多三条及查看全部入口 |
| 快速同传 | 标题/会话名/状态/计时；配置工具栏；双语逐句对齐、最新句淡蓝高亮；可折叠笔记；底部音源和会话控制 |
| 悬浮字幕 | 主窗口提供动作、预览与配置；预览只呈现字幕玻璃；独立浮窗提供音源、模型、语言、显示模式与窗口操作 |
| 同传记录 | 标题、搜索、数量、Table Card；排序、分页、查看、重命名、导出、删除确认；详情沿用 PageHeader/Card |
| 模型管理 | 当前模型摘要；推荐、已安装、Hugging Face 搜索、下载任务四个 Tabs；推荐分识别/翻译两组，卡片操作对齐 |
| 设置 | 次导航与分组 Card；标签左控件右；字幕外观先预览，后布局、字体和颜色；窄窗人物行操作移至文字下方 |
| 浏览器连接 | 官方图标、安装状态、连接权限、下载/管理操作；下载直接保存内置 ZIP，不展示文件夹路径 |

语言对按钮使用邻近弹层，原文、译文独立选择，长列表内部滚动。不兼容方向说明原因，提供换模型、换识别语言或关闭翻译。模型、语言与状态来自真实配置，不虚构能力。

## Elevation & Depth

卡片依靠表面色和细边框建立层次，投影只辅助区分，不为每行添加阴影。

| CSS token | 浅色 | 深色 |
| --- | --- | --- |
| `--surface-shadow` | 0 2px 10px rgba(35,72,125,.04) | 0 2px 10px rgba(15,25,45,.12) |
| `--overlay-shadow` | 0 12px 36px rgba(35,72,125,.14) | 0 12px 36px rgba(10,20,40,.32) |

通用 `--shadow-sm/md/lg` 由 index.css 提供，深色降低透明度；不要与语义投影混为一套值。当前 YAML schema 无独立 elevation 导出类别，投影保留为 CSS 映射，不伪造可导出的 shadows 字段。

浮窗允许玻璃感和用户配置的不透明度，可读性优先。禁止纯黑重投影和卡片 hover 大幅抬升。动效使用 [motion.css](src/renderer/theme/motion.css) 的既有 token，常规约 120–180ms，尊重减少动效偏好。

## Shapes

rounded.sm/md/lg/xl/2xl/full 对应 `--radius-sm/md/lg/xl/2xl/full`。常规按钮统一 16px（rounded.xl），标题栏控件保留系统式样。图标按钮须有区别于底层的可见底色，禁止 ghost 变体。

业务 Card 使用 16px；基础 .nola-card / .nola-panel 使用 `--radius-lg`（12px）。输入框使用 `--field-radius`；弹层和对话框专用几何由 app.css 管理，不将其误写成通用圆角档位。主题中没有 rounded-pill。

## Components

使用 HeroUI v3 语义组件和 Lucide 图标。YAML 列出主按钮、业务卡片与次级面板的浅/深色基准；渐变、边框、状态和布局由既有样式补齐。

| 用途 | 组件 |
| --- | --- |
| 操作、导航 | Button，事件 onPress |
| 卡片、数据 | Card 复合组件；Table / Pagination |
| 面板切换、设置选择 | Tabs.List / Tabs.Tab / Tabs.Panel；Select + ListBox；ToggleButtonGroup + ToggleButton |
| 输入、调节 | TextField / Input / SearchField / TextArea；Switch / Slider / NumberField / ColorPicker / ColorSwatchPicker |
| 菜单、反馈、对话框 | Dropdown / Tooltip / Chip / Alert / Toast；Modal / AlertDialog |

先选语义匹配的 HeroUI 原子，再尝试 className/variant、扩展 variants，最后才考虑自创。基础封装为 AppShell、TitleBar（含 useNolaTheme）、PageHeader、StatusPill、SectionCard、SettingRow、ErrorBoundary、NavigationItem；新增前先维护清单。旧版第 11.1/11.2 节合并于此。

ModelCard、DualColumnView、CaptionLine、NotesPanel、AudioPlayerBar 属于 feature 层。Switch 必须含 Switch.Content 及有效输入控件；菜单选中沿用 HeroUI 指示，不重复绘制。

### 特殊场景

- **下载源弹窗**：Modal + 可执行 ListBox；当前模型、渠道图标及右箭头，仅 hover/focus 高亮，点击直接下载。只显示可用渠道，源站/镜像说明放 Tooltip。
- **新手引导**：先欢迎弹窗，再镂空高亮真实控件。九步依次为首页快速同传、悬浮字幕、侧栏浏览器字幕、PyTorch、llama.cpp、语音识别、翻译、模型下载、更多页再次查看；底栏只放进度、跳过和下一步/完成。焦点留在说明卡，Esc 退出，运行时不可开始教程。欢迎展示后持久化 onboardingSeen，稍后、跳过、完成和 Esc 不清除标记；再次查看重开欢迎页。
- **浏览器播放器**：Logo 按钮垂直居中，无圆形底色，hover/press 透明并保留焦点反馈。面板仅开始、刷新、关闭及文字状态，标签页音源增加采集动作；其余配置留在桌面。Shadow DOM 使用 browser.css、:host 与固定尺寸 token；选择项在面板内展开，避免宿主网站字号和 portal 干扰。
- **字幕阅读**：位置相对视频高度保存并避开控制栏，仅保留当前句。双语模式先原文后译文，失败不隐藏原文；仅译文模式不以原文替代。调整尺寸后重新计算行数并露出最新内容；直接 video 全屏保留文字轨道回退。
- **更多与许可证**：关于、鸣谢使用 Avatar，赞助占位 Tooltip 明示“虚位以待”。许可证采用左对齐纸张式阅读区、常规字重等宽字体、内部滚动、可达的关闭操作，不改写措辞。
- **文档站与演示**：主题和语言持久化，深浅首屏和下载入口均清晰；演示切主题不重载会话。模拟字幕、波形、暂存笔记准确标示范围，不混淆桌面真实数据。

## Do's and Don'ts

### 应当遵守

- 使用语义 token 和现有封装，界面文案走六区域语言词典；工程规则遵循 AGENTS.MD。
- 呈现真实状态，错误提供恢复动作；删除和结束会话保留确认交互。
- 控件提供可访问名称，装饰图标 aria-hidden="true"；保留焦点、Esc、Toast 反馈。
- Electron 拖拽仅顶栏/浮窗壳，交互控件 no-drag；原生窗口控制与网页回退二选一。

### 层级与样式边界（第 8 节）

本节是第八个标准章节，保留 AGENTS.MD 的层级规则引用。事实源为 [z-index.css](src/renderer/theme/z-index.css)，只使用对应类：

| 类 | token 值 | 用途 |
| --- | --- | --- |
| `.z-base` | 0 | 普通内容 |
| `.z-caption-scrim` | 10 | 字幕渐隐遮罩 |
| `.z-sticky` | 20 | 工具栏、表头 |
| `.z-caption-actions` | 30 | 字幕操作行 |
| `.z-dropdown` | 40 | 选择器、菜单、Popover |
| `.z-overlay` | 60 | Modal、AlertDialog |
| `.z-onboarding` | 70 | 引导蒙层与说明卡 |
| `.z-toast` | 80 | Toast |
| `.z-titlebar-drag` | 100 | Electron 拖拽区 |

新增层级先在事实源定义 `--z-*`、对应类和原因，不直接写 z-50 或重排档位。

导入顺序为 Tailwind → HeroUI → theme/index.css → theme/app.css。index.html 在任何样式前注册 properties, theme, base, components, utilities。token/字阶/动效位于 base，语义类位于 components，原子覆写和层级类位于 utilities；caption-card.css 的无层覆写是既有特例。

### 避免

- 组件中新写字面色值或内联主题色；字幕颜色设置、启动页独立样式、Logo 品牌锁定色是既有例外，动态计算值按需使用。
- 截图替代交互、示例替代真实状态，或虚构模型评分、统计、已保存笔记与赞助记录。
- 使用 HeroUI v2 API、HeroUIProvider、Tabs.Content、framer-motion、ScrollShadow、裸 button/select、原生 range/color 或 window.confirm/alert。
- 添加无支持依据的账户、VIP、云同步或在线共享入口；破坏 CSS 导入顺序、Tailwind source(none) 或 CSP 边界。

### 验证与维护

格式检查使用官方 CLI：

    npx `--yes` `--package`=@google/design.md@0.4.0 designmd lint DESIGN.md

CLI 通过仅表示格式检查通过，不代表组件对比度、CSS cascade 或页面均已验收；警告按真实主题解释，不为消除警告擅改配色。omitted 只用于真正省略的类别。

UI 改动按影响范围检查 1440×960 / 1180×780 / 760×560、深浅主题、六区域语言与相关窗口：无横向滚动、无遮挡、阅读区可滚动、操作可达。工程检查按 AGENTS.MD 选择，仅整理本文件无需打包。主题 token 更改后同步 YAML 与 CSS 映射。
