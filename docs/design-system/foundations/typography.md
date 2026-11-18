---
title: 字体排印
pageClass: nola-vis-doc nola-vis-foundations
editLink: false
description: "桌面端、浏览器扩展和产品组件预览使用八种文字样式。页面标题、分区标题和嵌套标题分别表达内容层级。同一页的窗口栏、侧栏和操作按钮使用 Body。"
---

# 字体排印

桌面端、浏览器扩展和产品组件预览使用八种文字样式。页面标题、分区标题和嵌套标题分别表达内容层级。同一页的窗口栏、侧栏和操作按钮使用 Body。

## 字号、行高与字重

下表为根字号 16px 时的尺寸。浅色主题的字距均为 `normal`。

| 样式 | 浅色字号 | 深色字号 | 行高 | 默认字重 | 深色字距 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | 36px | 36px | 40px | 800 | normal | 页面主标题 |
| H2 | 30px | 30px | 36px | 600 | normal | 页面主要分区 |
| H3 | 24px | 24px | 32px | 600 | normal | 分区中的次级标题 |
| H4 | 20px | 20px | 28px | 600 | normal | 更深一层的分组标题 |
| Body | 14px | 15px | 22px | 400 | 0.015em | 正文、表单、按钮、导航和列表 |
| Small | 14px | 14px | 20px | 500 | 0.02em | 简短状态、需要强调的辅助内容 |
| Muted | 14px | 14px | 20px | 继承 | 0.02em | 说明、来源、日期等次要信息 |
| Code | 14px | 14px | 20px | 600 | normal | 代码、命令、日志及 API 模型 ID |

<demo react="foundation-appearance-typography.tsx" :reactFiles="['foundation-appearance-typography.tsx', '../figures/FoundationAppearance.tsx']" />

在模型网关表格中，「API 模型 ID」是列名，使用 Body；可复制的 `nola-asr` 使用 Code。「已停止」用 Small 和现有状态色，「与 MT 共用」用 Muted。少量文字需要强调时独立选择 500 或 600 字重，同一层级保留其字号与行高。

## 字体家族

桌面界面默认使用操作系统的原生字体。系统根据语言回退到可用的中日韩字体。用户可在设置中主动选择 Noto Sans SC、TC、HK、JP 或 KR，加载验证通过后应用于全部桌面窗口。切换字体只影响界面字体家族。浏览器扩展独立使用 `system-ui, sans-serif`。Code 使用独立等宽字体。文件名、普通路径、版本、时间和快捷键提示使用界面字体。

## 缩放与密度

字号和行高用 rem 表示。Compact 与 Comfortable 调整控件高度和布局间距。切换主题、窗口收窄或放大至 200% 时，标题、说明和错误信息可以自然换行。列表中的长文件名和网址允许折行；受限导航和工具栏中的重要文字应能查看全文。表格中的计数、时长和进度使用等宽数字。

字幕、漫画画布和编辑器内容采用各自的内容排版，记录和文档阅读器保留内容缩放。工具栏与设置使用上表。文档站正文及首页使用各自的站点样式。

字体定义位于 `src/renderer/theme/typography.css`。组件使用 `type-h1` 至 `type-h4`、`type-body`、`type-small`、`type-muted`、`type-code`。文字颜色沿用主题 Token。
