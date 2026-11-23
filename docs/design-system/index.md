---
title: Nola 设计文档
description: Nola Translator 设计文档，涵盖设计原则、基础样式、组件、页面模板和工程规约。
pageClass: nola-vis-doc
editLink: false
---

# 设计文档

这里存放 Nola Translator 的设计文档，涵盖设计原则、基础样式、组件、页面模板和工程规约。

## 规范总览

- [DESIGN.md](./DESIGN)

## 设计原则

- [亲密性](./principles/structure)
- [对齐](./principles/alignment)
- [对比](./principles/contrast)
- [重复](./principles/repetition)
- [直截了当](./principles/interaction)
- [足不出户](./principles/stay)
- [简化交互](./principles/lightweight)
- [提供邀请](./principles/invitation)
- [巧用过渡](./principles/transition)
- [即时反应](./principles/response)

## 基础样式

- [无障碍](./foundations/accessibility)
- [App 图标](./foundations/app-icons)
- [品牌](./foundations/branding)
- [颜色](./foundations/color)
- [深色模式](./foundations/dark-mode)
- [图标](./foundations/icons)
- [图像](./foundations/images)
- [包容性](./foundations/inclusion)
- [布局](./foundations/layout)
- [材质](./foundations/materials)
- [动态效果](./foundations/motion)
- [从右到左](./foundations/right-to-left)
- [字体排印](./foundations/typography)
- [编写](./foundations/writing)

## 布局与导航

- [窗口布局](./layout/windows)
- [列表与表格](./layout/structure)
- [导航路径](./layout/paths)
- [层级与浮层](./layout/layers)

## 组件

### shadcn 组件

<table class="component-index-table">
<tbody>
  <tr><td><a href="./components/shadcn/accordion">Accordion</a></td><td><a href="./components/shadcn/alert">Alert</a></td><td><a href="./components/shadcn/alert-dialog">Alert Dialog</a></td><td><a href="./components/shadcn/aspect-ratio">Aspect Ratio</a></td></tr>
  <tr><td><a href="./components/shadcn/attachment">Attachment</a></td><td><a href="./components/shadcn/avatar">Avatar</a></td><td><a href="./components/shadcn/badge">Badge</a></td><td><a href="./components/shadcn/breadcrumb">Breadcrumb</a></td></tr>
  <tr><td><a href="./components/shadcn/bubble">Bubble</a></td><td><a href="./components/shadcn/button">Button</a></td><td><a href="./components/shadcn/button-group">Button Group</a></td><td><a href="./components/shadcn/calendar">Calendar</a></td></tr>
  <tr><td><a href="./components/shadcn/card">Card</a></td><td><a href="./components/shadcn/carousel">Carousel</a></td><td><a href="./components/shadcn/chart">Chart</a></td><td><a href="./components/shadcn/checkbox">Checkbox</a></td></tr>
  <tr><td><a href="./components/shadcn/code-block">Code Block</a></td><td><a href="./components/shadcn/collapsible">Collapsible</a></td><td><a href="./components/shadcn/combobox">Combobox</a></td><td><a href="./components/shadcn/command">Command</a></td></tr>
  <tr><td><a href="./components/shadcn/context-menu">Context Menu</a></td><td><a href="./components/shadcn/data-table">Data Table</a></td><td><a href="./components/shadcn/date-picker">Date Picker</a></td><td><a href="./components/shadcn/dialog">Dialog</a></td></tr>
  <tr><td><a href="./components/shadcn/direction">Direction</a></td><td><a href="./components/shadcn/drawer">Drawer</a></td><td><a href="./components/shadcn/dropdown-menu">Dropdown Menu</a></td><td><a href="./components/shadcn/empty">Empty</a></td></tr>
  <tr><td><a href="./components/shadcn/field">Field</a></td><td><a href="./components/shadcn/hover-card">Hover Card</a></td><td><a href="./components/shadcn/input">Input</a></td><td><a href="./components/shadcn/input-group">Input Group</a></td></tr>
  <tr><td><a href="./components/shadcn/input-otp">Input OTP</a></td><td><a href="./components/shadcn/item">Item</a></td><td><a href="./components/shadcn/kbd">Kbd</a></td><td><a href="./components/shadcn/label">Label</a></td></tr>
  <tr><td><a href="./components/shadcn/marker">Marker</a></td><td><a href="./components/shadcn/menubar">Menubar</a></td><td><a href="./components/shadcn/message">Message</a></td><td><a href="./components/shadcn/message-scroller">Message Scroller</a></td></tr>
  <tr><td><a href="./components/shadcn/native-select">Native Select</a></td><td><a href="./components/shadcn/navigation-menu">Navigation Menu</a></td><td><a href="./components/shadcn/pagination">Pagination</a></td><td><a href="./components/shadcn/popover">Popover</a></td></tr>
  <tr><td><a href="./components/shadcn/progress">Progress</a></td><td><a href="./components/shadcn/questionnaire">Questionnaire</a></td><td><a href="./components/shadcn/radio-group">Radio Group</a></td><td><a href="./components/shadcn/resizable">Resizable</a></td></tr>
  <tr><td><a href="./components/shadcn/scroll-area">Scroll Area</a></td><td><a href="./components/shadcn/select">Select</a></td><td><a href="./components/shadcn/separator">Separator</a></td><td><a href="./components/shadcn/sheet">Sheet</a></td></tr>
  <tr><td><a href="./components/shadcn/sidebar">Sidebar</a></td><td><a href="./components/shadcn/skeleton">Skeleton</a></td><td><a href="./components/shadcn/slider">Slider</a></td><td><a href="./components/shadcn/spinner">Spinner</a></td></tr>
  <tr><td><a href="./components/shadcn/switch">Switch</a></td><td><a href="./components/shadcn/table">Table</a></td><td><a href="./components/shadcn/tabs">Tabs</a></td><td><a href="./components/shadcn/textarea">Textarea</a></td></tr>
  <tr><td><a href="./components/shadcn/toast">Toast</a></td><td><a href="./components/shadcn/toggle">Toggle</a></td><td><a href="./components/shadcn/toggle-group">Toggle Group</a></td><td><a href="./components/shadcn/tooltip">Tooltip</a></td></tr>
  <tr><td><a href="./components/shadcn/trace">Trace</a></td><td><a href="./components/shadcn/typography">Typography</a></td><td></td><td></td></tr>
</tbody>
</table>

### assistant-ui 组件

<table class="component-index-table">
<tbody>
  <tr><td><a href="./components/assistant-ui/activity-graph">Activity graph</a></td><td><a href="./components/assistant-ui/agent-card">Agent card</a></td><td><a href="./components/assistant-ui/agent-plan">Agent plan</a></td><td><a href="./components/assistant-ui/agent-status">Agent status</a></td></tr>
  <tr><td><a href="./components/assistant-ui/approval-card">Approval card</a></td><td><a href="./components/assistant-ui/artifact-card">Artifact card</a></td><td><a href="./components/assistant-ui/assistant-modal">Assistant modal</a></td><td><a href="./components/assistant-ui/assistant-sidebar">Assistant sidebar</a></td></tr>
  <tr><td><a href="./components/assistant-ui/attachment">Attachment</a></td><td><a href="./components/assistant-ui/attachments">Attachments</a></td><td><a href="./components/assistant-ui/background-runs">Background runs</a></td><td><a href="./components/assistant-ui/canvas">Canvas</a></td></tr>
  <tr><td><a href="./components/assistant-ui/channel-message">Channel message</a></td><td><a href="./components/assistant-ui/chart">Chart</a></td><td><a href="./components/assistant-ui/chat-panel">Chat panel</a></td><td><a href="./components/assistant-ui/checkpoints">Checkpoints</a></td></tr>
  <tr><td><a href="./components/assistant-ui/code-diff">Code diff</a></td><td><a href="./components/assistant-ui/code-runner">Code runner</a></td><td><a href="./components/assistant-ui/command-palette">Command palette</a></td><td><a href="./components/assistant-ui/comparison">Comparison</a></td></tr>
  <tr><td><a href="./components/assistant-ui/composer">Composer</a></td><td><a href="./components/assistant-ui/composer-trigger-popover">Composer trigger popover</a></td><td><a href="./components/assistant-ui/computer-use">Computer use</a></td><td><a href="./components/assistant-ui/conference-session">Conference session</a></td></tr>
  <tr><td><a href="./components/assistant-ui/confidence">Confidence</a></td><td><a href="./components/assistant-ui/confirm-dialog">Confirm dialog</a></td><td><a href="./components/assistant-ui/connection-state">Connection state</a></td><td><a href="./components/assistant-ui/context">Context</a></td></tr>
  <tr><td><a href="./components/assistant-ui/context-breakdown">Context breakdown</a></td><td><a href="./components/assistant-ui/context-display">Context display</a></td><td><a href="./components/assistant-ui/conversation-map">Conversation map</a></td><td><a href="./components/assistant-ui/cost-meter">Cost meter</a></td></tr>
  <tr><td><a href="./components/assistant-ui/create-event">Create event</a></td><td><a href="./components/assistant-ui/create-task">Create task</a></td><td><a href="./components/assistant-ui/current-weather">Current weather</a></td><td><a href="./components/assistant-ui/data-table">Data table</a></td></tr>
  <tr><td><a href="./components/assistant-ui/diagram">Diagram</a></td><td><a href="./components/assistant-ui/dictation">Dictation</a></td><td><a href="./components/assistant-ui/directive-text">Directive text</a></td><td><a href="./components/assistant-ui/document-reference">Document reference</a></td></tr>
  <tr><td><a href="./components/assistant-ui/draft-email">Draft email</a></td><td><a href="./components/assistant-ui/draft-restore">Draft restore</a></td><td><a href="./components/assistant-ui/edit-a-sent-message">Edit a sent message</a></td><td><a href="./components/assistant-ui/elicitation-form">Elicitation form</a></td></tr>
  <tr><td><a href="./components/assistant-ui/empty-state">Empty state</a></td><td><a href="./components/assistant-ui/error-state">Error state</a></td><td><a href="./components/assistant-ui/feedback-dialog">Feedback dialog</a></td><td><a href="./components/assistant-ui/file">File</a></td></tr>
  <tr><td><a href="./components/assistant-ui/file-tree">File tree</a></td><td><a href="./components/assistant-ui/flight-tracker">Flight tracker</a></td><td><a href="./components/assistant-ui/flow-graph">Flow graph</a></td><td><a href="./components/assistant-ui/follow-up-suggestions">Follow-up suggestions</a></td></tr>
  <tr><td><a href="./components/assistant-ui/generative-ui">Generative UI</a></td><td><a href="./components/assistant-ui/geo-map">Geo map</a></td><td><a href="./components/assistant-ui/guardrail-notice">Guardrail notice</a></td><td><a href="./components/assistant-ui/handoff">Handoff</a></td></tr>
  <tr><td><a href="./components/assistant-ui/heat-graph">Heat graph</a></td><td><a href="./components/assistant-ui/image">Image</a></td><td><a href="./components/assistant-ui/image-gallery">Image gallery</a></td><td><a href="./components/assistant-ui/image-generation">Image generation</a></td></tr>
  <tr><td><a href="./components/assistant-ui/inline-citation">Inline citation</a></td><td><a href="./components/assistant-ui/job-progress">Job progress</a></td><td><a href="./components/assistant-ui/launcher">Launcher</a></td><td><a href="./components/assistant-ui/link-preview">Link preview</a></td></tr>
  <tr><td><a href="./components/assistant-ui/loader">Loader</a></td><td><a href="./components/assistant-ui/map">Map</a></td><td><a href="./components/assistant-ui/markdown-text">Markdown text</a></td><td><a href="./components/assistant-ui/math">Math</a></td></tr>
  <tr><td><a href="./components/assistant-ui/mcp-config-dialog">MCP config dialog</a></td><td><a href="./components/assistant-ui/media-player">Media player</a></td><td><a href="./components/assistant-ui/memory">Memory</a></td><td><a href="./components/assistant-ui/mentions">Mentions</a></td></tr>
  <tr><td><a href="./components/assistant-ui/mermaid-diagram">Mermaid diagram</a></td><td><a href="./components/assistant-ui/message-actions">Message actions</a></td><td><a href="./components/assistant-ui/message-branches">Message branches</a></td><td><a href="./components/assistant-ui/message-pair">Message pair</a></td></tr>
  <tr><td><a href="./components/assistant-ui/message-queue">Message queue</a></td><td><a href="./components/assistant-ui/message-timing">Message timing</a></td><td><a href="./components/assistant-ui/mobile-composer">Mobile composer</a></td><td><a href="./components/assistant-ui/model-logos">Model logos</a></td></tr>
  <tr><td><a href="./components/assistant-ui/model-selector">Model selector</a></td><td><a href="./components/assistant-ui/models">Models</a></td><td><a href="./components/assistant-ui/number-ticker">Number ticker</a></td><td><a href="./components/assistant-ui/onboarding">Onboarding</a></td></tr>
  <tr><td><a href="./components/assistant-ui/option-list">Option list</a></td><td><a href="./components/assistant-ui/orb">Orb</a></td><td><a href="./components/assistant-ui/order-tracking">Order tracking</a></td><td><a href="./components/assistant-ui/permission-grant">Permission grant</a></td></tr>
  <tr><td><a href="./components/assistant-ui/player-card">Player card</a></td><td><a href="./components/assistant-ui/playlist">Playlist</a></td><td><a href="./components/assistant-ui/portfolio-overview">Portfolio overview</a></td><td><a href="./components/assistant-ui/prompt-library">Prompt library</a></td></tr>
  <tr><td><a href="./components/assistant-ui/purchase-receipt">Purchase receipt</a></td><td><a href="./components/assistant-ui/question-flow">Question flow</a></td><td><a href="./components/assistant-ui/quota-banner">Quota banner</a></td><td><a href="./components/assistant-ui/quote">Quote</a></td></tr>
  <tr><td><a href="./components/assistant-ui/read-aloud">Read aloud</a></td><td><a href="./components/assistant-ui/reasoning">Reasoning</a></td><td><a href="./components/assistant-ui/reasoning-effort">Reasoning effort</a></td><td><a href="./components/assistant-ui/recommendation-card">Recommendation card</a></td></tr>
  <tr><td><a href="./components/assistant-ui/regenerate-with">Regenerate with</a></td><td><a href="./components/assistant-ui/research-report">Research report</a></td><td><a href="./components/assistant-ui/response-time">Response time</a></td><td><a href="./components/assistant-ui/retrieval-chunks">Retrieval chunks</a></td></tr>
  <tr><td><a href="./components/assistant-ui/reviewable-diff">Reviewable diff</a></td><td><a href="./components/assistant-ui/ride-status">Ride status</a></td><td><a href="./components/assistant-ui/riverside-loft">Riverside Loft</a></td><td><a href="./components/assistant-ui/run-activity">Run activity</a></td></tr>
  <tr><td><a href="./components/assistant-ui/schedule">Schedule</a></td><td><a href="./components/assistant-ui/score-breakdown">Score breakdown</a></td><td><a href="./components/assistant-ui/scroll-anchor">Scroll anchor</a></td><td><a href="./components/assistant-ui/search-in-conversation">Search in conversation</a></td></tr>
  <tr><td><a href="./components/assistant-ui/server-panel">Server panel</a></td><td><a href="./components/assistant-ui/settings">Settings</a></td><td><a href="./components/assistant-ui/shared-conversation">Shared conversation</a></td><td><a href="./components/assistant-ui/shiki-highlighter">Shiki highlighter</a></td></tr>
  <tr><td><a href="./components/assistant-ui/shopping-cart">Shopping cart</a></td><td><a href="./components/assistant-ui/slash-commands">Slash commands</a></td><td><a href="./components/assistant-ui/software-purchase">Software purchase</a></td><td><a href="./components/assistant-ui/sources">Sources</a></td></tr>
  <tr><td><a href="./components/assistant-ui/speaker-identity">Speaker identity</a></td><td><a href="./components/assistant-ui/spec-sheet">Spec sheet</a></td><td><a href="./components/assistant-ui/stopped-run">Stopped run</a></td><td><a href="./components/assistant-ui/streaming-text">Streaming text</a></td></tr>
  <tr><td><a href="./components/assistant-ui/subagent-list">Subagent list</a></td><td><a href="./components/assistant-ui/support-tickets">Support tickets</a></td><td><a href="./components/assistant-ui/syntax-highlighter">Syntax highlighter</a></td><td><a href="./components/assistant-ui/table-reservation">Table reservation</a></td></tr>
  <tr><td><a href="./components/assistant-ui/task-card">Task card</a></td><td><a href="./components/assistant-ui/terminal-block">Terminal block</a></td><td><a href="./components/assistant-ui/thinking-indicator">Thinking indicator</a></td><td><a href="./components/assistant-ui/thread">Thread</a></td></tr>
  <tr><td><a href="./components/assistant-ui/thread-list">Thread list</a></td><td><a href="./components/assistant-ui/thread-list-sidebar">Thread list sidebar</a></td><td><a href="./components/assistant-ui/thread-search">Thread search</a></td><td><a href="./components/assistant-ui/timeline">Timeline</a></td></tr>
  <tr><td><a href="./components/assistant-ui/timestamps">Timestamps</a></td><td><a href="./components/assistant-ui/todo-list">Todo list</a></td><td><a href="./components/assistant-ui/tool-call">Tool call</a></td><td><a href="./components/assistant-ui/tool-failure">Tool failure</a></td></tr>
  <tr><td><a href="./components/assistant-ui/tool-fallback">Tool fallback</a></td><td><a href="./components/assistant-ui/tool-group">Tool group</a></td><td><a href="./components/assistant-ui/tool-timeline">Tool timeline</a></td><td><a href="./components/assistant-ui/tooltip-icon-button">Tooltip icon button</a></td></tr>
  <tr><td><a href="./components/assistant-ui/trace-waterfall">Trace waterfall</a></td><td><a href="./components/assistant-ui/typing-indicator">Typing indicator</a></td><td><a href="./components/assistant-ui/view-event">View event</a></td><td><a href="./components/assistant-ui/voice-conversation">Voice conversation</a></td></tr>
  <tr><td><a href="./components/assistant-ui/web-preview">Web preview</a></td><td><a href="./components/assistant-ui/web-search">Web search</a></td><td><a href="./components/assistant-ui/weekly-active-users">Weekly active users</a></td><td></td></tr>
</tbody>
</table>

### 自制组件

<table class="component-index-table">
<tbody>
  <tr><td><a href="./components/custom/floating-captions">Floating Captions</a></td></tr>
</tbody>
</table>
## 文案

- [界面用语](./writing/voice)
- [操作名称](./writing/actions)
- [状态与反馈文案](./writing/states)
- [多语言与数据格式](./writing/localization)

## 页面模板

### 页面结构

- [首页与工作台](./templates/home)
- [列表页](./templates/list)
- [详情页](./templates/detail)
- [表单页](./templates/form)
- [阅读与字幕页](./templates/reading)
- [数据可视化页](./templates/visualization)

### 页面状态

- [空状态页](./templates/states)
- [异常页](./templates/exception)
- [结果页](./templates/result)

## 工程规约

### 编码规约

- [通用编码规约](./engineering/coding/common)
- [HTML 编码规约](./engineering/coding/html)
- [CSS 编码规约](./engineering/coding/css)
- [JavaScript 编码规约](./engineering/coding/javascript)
- [React 编码规约](./engineering/coding/react)
- [TypeScript 编码规约](./engineering/coding/typescript)
- [Node.js 编码规约](./engineering/coding/node)

### 工程规约

- [Git 规约](./engineering/engineering/git)
- [文档通用规约](./engineering/engineering/writing)
- [更新日志规约](./engineering/engineering/changelog)
- [HTTP JSON API 规范](./engineering/engineering/http-json-api)


## 许可协议

如无特别说明，本文档中的原创内容均按 **[CC BY-SA 4.0 协议](https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans)** 进行分发。

本文档部分内容参考或改编自第三方开源项目。相关内容的原始版权归各自作者所有，并继续遵循其原有许可协议，不因本文档采用 CC BY-SA 4.0 而改变。

<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans" target="_blank" rel="noopener">
    <img src="https://mirrors.creativecommons.org/presskit/buttons/88x31/svg/by-sa.svg" alt="CC BY-SA">
</a>

### 参考项目

- [Shadcn UI 文档](https://github.com/shadcn-ui/ui)，基于 [MIT License](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) 协议引用修改。
- [Assistant UI 文档](https://github.com/assistant-ui/assistant-ui)，基于 [MIT License](https://github.com/assistant-ui/assistant-ui/blob/main/LICENSE) 协议引用修改。
- [Ant Design 文档](https://github.com/ant-design/ant-design)，基于 [MIT License](https://github.com/ant-design/ant-design/blob/master/LICENSE) 协议引用修改。
- [阿里巴巴前端规约](https://github.com/alibaba/f2e-spec)，基于 [MPL-2.0 License](https://github.com/alibaba/f2e-spec/blob/main/LICENSE) 协议引用修改。
