---
title: 即时反应
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 即时反应

输入或点击后，界面应立即回应。短操作在原处显示结果。耗时任务持续说明进展。

## 查询模式

<div class="vis-principle-row">
<div class="vis-principle-copy">

输入搜索词时，建议与匹配结果随之更新。类别固定时按固定分组显示。类别不固定时，只显示有结果的组。

</div>

<figure>

<demo react="search-states.tsx" :reactFiles="['search-states.tsx', '../figures/DynamicPatterns.tsx']" />

<figcaption>输入“林青”筛选其负责的项目，清空后再查看全部。</figcaption>
</figure>

</div>

筛选条件一变，结果与数量同步更新。没有匹配项时，提供修改或清空条件的入口。

## 反馈模式

<div class="vis-principle-row">
<div class="vis-principle-copy">

在邮箱字段附近显示格式提示。地址从不完整变为有效时，就地更新反馈，让用户知道可以继续。

</div>

<figure>

<demo react="preview-states.tsx" :reactFiles="['preview-states.tsx', '../figures/DynamicPatterns.tsx']" />

<figcaption>输入 `lin`，再补上 `@example.com`，观察输入框下方的提示。</figcaption>
</figure>

</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

耗时操作先显示忙碌状态，避免重复提交。能测量进度才显示百分比。否则说明当前阶段。按钮、表格或整页的加载范围与实际任务一致。

</div>

<figure>

<demo react="task-states.tsx" :reactFiles="['task-states.tsx', '../figures/Interactions.tsx']" />

<figcaption>等待、完成和失败都有明确反馈。</figcaption>
</figure>

</div>

成功写清完成的内容。失败保留输入并给出重试入口。新内容若会打断阅读，可先提示用户查看。通知消失后，任务页仍显示结果。
