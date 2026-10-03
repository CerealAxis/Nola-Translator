# Nola Translator 设计系统

更新：2026-10-02

## 1. 视觉与功能基准

单 Logo 顶栏、紧凑侧栏、蓝白背景、四色功能卡与最近记录表。
设计稿决定视觉层级，现有 store/bridge 决定交互。不可用静态截图替代界面，也不可把稿内示例数据替代真实数据。

## 2. HeroUI v3 组件标准

使用项目当前 React 19、HeroUI React v3、Tailwind v4 与 Lucide 图标。
所有交互元素使用 HeroUI；布局可使用语义 HTML/CSS，插画可使用独立图片或 SVG。

| 用途 | 组件 |
| --- | --- |
| 操作与侧栏 | Button，事件 onPress |
| 卡片 | Card / Card.Header / Card.Title / Card.Content / Card.Footer |
| 标签 | Tabs.List / Tabs.Tab / Tabs.Panel |
| 单选与分段 | Select + ListBox；ToggleButtonGroup + ToggleButton |
| 文本与搜索 | TextField / Input / SearchField / TextArea |
| 开关/数值/颜色 | Switch / Slider / NumberField / ColorPicker / ColorSwatchPicker |
| 数据列表 | Table 复合组件 / Pagination |
| 菜单/反馈 | Dropdown / Tooltip / Chip / Alert / Toast |
| 对话框 | Modal / AlertDialog |

禁止 HeroUIProvider、v2 API、Tabs.Content、framer-motion、ScrollShadow、裸 button/select、原生 range/color、window.confirm/alert。
新组件先读取官方 v3 文档。CSS 导入顺序必须是 Tailwind → HeroUI styles → 产品 theme，Tailwind 仅扫描 src。
index.html 必须在任何样式之前注册 @layer properties, theme, base, components, utilities，避免页面局部样式提前注册 components 导致全局 reset 反过来覆盖布局。
Select 使用 value/onChange；ToggleButtonGroup 与 Dropdown.Menu 的选择值为 Set。
Switch 必须包含 Switch.Content，再在其中放 Control/Thumb；仅绘制 Control/Thumb 会产生没有 input 的装饰图形。

## 3. 全局几何

| 项目 | 规范 |
| --- | --- |
| 参考画布 | 1540×1024，实际检查 1440×960 / 1180×780 / 760×560 |
| 顶栏 | 64px；固定在主滚动区之外 |
| 侧栏 | 200px；首项距顶栏底部12px；内边距12px |
| 导航按钮 | 高56px、圆角12px、图标24px、图文间距16px |
| 导航行距 | 8px；六项连续排列，不插 spacer |
| 主内容 | 路由唯一提供24px padding；最大1600px；受 main 宽度约束 |
| 区块间距 | 20px，紧凑处16px |
| 卡片 | padding20px（重点24px），圆角16px |
| 字段/按钮 | 高40px（工具栏36px），圆角10–12px；主动作可胶囊 |
| 设置行 | 44–52px；标签和控件保持同一基线 |

只有顶栏出现 Nola Logo 与应用名；侧栏不重复 Logo、不留品牌空白。
AppShell 不包第二层 padding/max-width。整窗 overflow:hidden，main 可纵向滚动。
所有 flex/grid 内容使用 min-width:0，需垂直收缩的区域 min-height:0。
禁止功能页用 w-screen、100vw、负 margin 或 fixed 逃出主内容，禁止水平滚动或内容藏到侧栏后。
<=1024px 侧栏缩至76px图标导航并保留 Tooltip/aria-label；首页内容>=1000px四卡一行，否则两列，极窄可一列。
工作台窄窗折叠笔记，双语可上下阅读；模型卡两列/一列；设置次级导航窄窗变横向。
表格窄窗隐藏次要时间/语言列，不能以水平溢出容纳全部列。

## 4. 颜色、字体与投影

颜色由语义 CSS token 定义（优先 oklch），组件引用 token。

| 用途 | 浅色目标 | 深色目标 |
| --- | --- | --- |
| background | 冰蓝 #F2F7FF | #101A2D |
| surface | 近白 #FDFEFF | #18253B |
| surface-secondary/字段 | #F4F7FC | #21304A |
| foreground | 深蓝 #101A30 | #EFF4FF |
| muted | #6B7D9E | #A5B5CE |
| border/separator | #DBE8FC / #EAF0F8 | #2E415F |
| accent/primary | #087BFF | #529DFF |
| success | #12C776 | #38D596 |
| warning | #EC9628 | #F4B34A |
| danger | #F04452 | #FF6C78 |

侧栏选中与主按钮采用柔和蓝色水平渐变；次选用淡蓝底。背景允许非常淡的光晕和宽斜带，不能压过文本。
四色入口：蓝=快速同传、紫=悬浮字幕、橙=记录、薄荷绿=模型，仅用于对应入口卡/装饰。
中性色与彩色的背景混合使用 oklab，避免 oklch 的色相插值把橙色/薄荷绿混成紫蓝色。
深色模式几何不变，表面/边框/文字随 token 切换；独立浮窗配色由用户单独选择。
字体：Segoe UI Variable Text / Microsoft YaHei UI / PingFang SC / system-ui。
Hero标题44–52px/700（窄窗32px）；页面标题32px/700；小节20px/650；卡片22px/650；正文14px；说明13px；元信息12px。
字幕阅读默认16px，实际字幕字号由用户设置。时间与数值 tabular-nums。
卡片允许轻投影 0 2px 10px rgba(35,72,125,.04)，菜单/弹窗 0 12px 36px rgba(35,72,125,.14)。
禁止纯黑投影、逐行投影和卡片 hover 大幅抬升。

## 5. 页面规范

### 首页

紧凑横向 Hero：Nola 蓝色 + Translator 深色、一句副标题、四个图标说明，右侧立体地球/麦克风/字幕插画。
紧接四张等宽等高入口 Card，图标/标题/两行说明/明确 Button；取消旧的侧置模型状态大卡。
最近记录采用一张 Card 与 Table，最多三条，右上查看全部记录。浮字幕入口进入预览页；所有入口可用。

### 快速同传

标题、会话名、真实状态与计时器；声源/模型/语言集中在工具栏 Card。
第二行显示模式/排版/字号/笔记开关，各项在 main 宽度内折行。
同一双栏阅读区域中原文与译文按句对齐，时间弱化，最新句轻蓝高亮；右侧窄 Card 笔记可折叠。
未开始时提供居中开始入口；进行时读真实模拟字幕，保留状态机、预检、错误恢复。
底部条包含音源、音频视觉、计时器、暂停/继续、结束；结束仍使用 AlertDialog。
工作台内部滚动，不允许逃出壳层。

### 悬浮字幕

主窗口页提供打开浮窗动作、预览、声源/语言/显示内容/排版。
预览是一块字幕玻璃，不再重复主应用壳；独立窗口保留 mic、模型、语言对、显示模式、置顶/锁定/隐藏/关闭。
打开/隐藏通过既有 bridge/Electron 通道，保留跨窗口设置同步；不意外清空会话。
主窗口持有演示会话，字幕文档通过窗口通信读取状态与发起操作，不独立创建第二个模拟引擎会话。浮窗调整尺寸时重新计算双语行数，阅读区自动露出最新字幕。
显示可拖动/可置顶说明，外观设置跳到 settings/appearance。

### 同传记录

标题说明、开始同传、搜索、数量，一张 Table Card。
名称/时间/时长/语言方向/状态/操作；保留排序与分页。
查看、重命名、TXT/SRT/VTT 导出、删除确认；列表导出可复用 ExportDialog。
详情同一 PageHeader/Card 规范，保留双语、导出与现有播放占位。现有 bridge 没有笔记持久化字段，不虚构已保存笔记。
日期、时长和状态从 store 读取。

### 模型管理

页首小模型图标、标题说明、当前识别/翻译摘要。
四个 Tabs：推荐模型、我的模型、Hugging Face 搜索、下载任务，蓝色下划线选中。
推荐分语音识别与翻译两组，自适应 Card 网格，统一名称/说明/状态/操作位置。
模型沿用代码目录；安装/取消/删除/设为默认保留。进度来自 store；HF 兼容性判断保留。
禁止虚构在线统计/性能评分/新适配模型。存储入口跳 settings/storage。

### 设置

次级导航：常规、音频与识别、翻译、字幕外观、存储、高级；选中淡蓝底，区别于全局深蓝选中。
右侧 Card 分组，标签左、控件右，不保留大面积无目的空白。
字幕外观顶部实时预览；分组布局与显示/字体与颜色；保留位置、排版、深浅浮层、字体、两种字号、行高、不透明度、三种颜色、两轨显示开关。
自动保存与恢复默认使用真实 updateSettings；乐观更新/防抖/回滚保留。
常规主题与浮窗配色保持独立，其他设置页功能完整。

## 6. 交互与无障碍

所有界面字符串走中英 i18n；模型专名和记录为数据。控件必须接入真实 store action/bridge。
当前原型不接真实音频/翻译引擎，模型安装和字幕为本地模拟。笔记明确标为本页暂存，录音开关保存偏好但不生成真实录音，波形只作静态示意。
图标按钮、Tabs、ToggleButtonGroup、Select、Slider 必须有可访问名称。
菜单选中由 HeroUI 指示；禁自绘重复指示条。焦点、Esc、Toast、确认交互保留。
动画120–180ms，颜色/opacity/少量transform，支持减少动效。
层级使用现有 --z-* token，禁字面量 z-index。
Electron 拖拽仅顶栏/浮窗壳，交互元素 no-drag。原生窗口控制与网页回退二选一。
不新增原型未支持的在线共享、云同步、账户/企业/VIP功能。

## 7. 实施与验收

先更新本规范，再分工实现。共享主题/main/routes/基础壳层/聚合i18n由主代理维护；页面代理只写分配模块与独立locale文件。
完成后运行 typecheck、lint、相关已有测试、build，并检查三个窗口尺寸、深浅主题、各页与弹层。
验收：单Logo、导航从顶部连续排列、首页四卡合理折行、工具栏无遮挡、无横向滚动、控件不截断、所有操作可执行。
生成PNG用于设计比对，不能作为整页交互背景。
