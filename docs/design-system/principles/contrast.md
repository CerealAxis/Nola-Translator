---
title: 对比
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 对比

对比让主要内容先被看到。差别应足够明显，可通过按钮样式、字号、间距和状态变化形成。

## 主次关系对比

<div class="vis-principle-row">
<div class="vis-principle-copy">

需要先完成的操作使用更强的样式，次要操作保持清楚可见。

</div>

<figure>

<demo react="contrast-actions.tsx" :reactFiles="['contrast-actions.tsx', '../figures/Contrast.tsx']" />

<figcaption>主要操作与次要操作形成对比。</figcaption>
</figure>

</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

两项同等重要的选择保持相同权重。界面提供后果说明，由用户判断。

</div>

<figure>

<demo react="contrast-neutral.tsx" :reactFiles="['contrast-neutral.tsx', '../figures/Contrast.tsx']" />

<figcaption>对等决策保持相同权重。</figcaption>
</figure>

</div>

## 总分关系对比

<div class="vis-principle-row">
<div class="vis-principle-copy">

标题概括内容，正文展开细节，说明补充条件。字号、字重和间距按这个顺序拉开层级。

</div>

<figure>

<demo react="contrast-hierarchy.tsx" :reactFiles="['contrast-hierarchy.tsx', '../figures/Contrast.tsx']" />

<figcaption>标题、正文与说明逐级区分。</figcaption>
</figure>

</div>

## 状态关系对比

<div class="vis-principle-row">
<div class="vis-principle-copy">

用颜色、文字和图标区分运行状态。悬停或选中时，也应呈现不同的外观。

</div>

<figure>

<demo react="contrast-state.tsx" :reactFiles="['contrast-state.tsx', '../figures/Contrast.tsx']" />

<figcaption>颜色、文字和图标共同表示状态。</figcaption>
</figure>

</div>
