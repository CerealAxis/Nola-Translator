---
title: 亲密性
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 亲密性

相关内容放得近，读起来像一个整体。无关内容拉开距离，页面分组就清楚。

## 纵向间距关系

<div class="vis-principle-row">
<div class="vis-principle-copy">

用小、中、大三档间距区分字段、段落和分组。

</div>

<figure>

<demo react="spacing-vertical.tsx" :reactFiles="['spacing-vertical.tsx', '../figures/Foundations.tsx', '../figures/Foundations.css', '../demo.css']" />

<figcaption>小、中、大三档纵向间距。</figcaption>
</figure>

</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

仅靠间距难以区分时，可增加分隔线。

</div>

<figure>

<demo react="spacing-separator.tsx" :reactFiles="['spacing-separator.tsx', '../figures/Foundations.tsx', '../figures/Foundations.css', '../demo.css']" />

<figcaption>分隔线划开不同的信息组。</figcaption>
</figure>

</div>

本例的小、中、大间距分别为 6px、14px、24px。

## 横向间距关系

<div class="vis-principle-row">
<div class="vis-principle-copy">

用分栏组合相关控件，窗口变窄时按组换行。

</div>

<figure>

<demo react="spacing-horizontal.tsx" :reactFiles="['spacing-horizontal.tsx', '../figures/Foundations.tsx', '../figures/Foundations.css', '../demo.css']" />

<figcaption>分栏中的字段按组排列。</figcaption>
</figure>

</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

同一组件内，复选框与文字的间距应小于选项之间的间距。

</div>

<figure>

<demo react="spacing-inline.tsx" :reactFiles="['spacing-inline.tsx', '../figures/Foundations.tsx', '../figures/Foundations.css', '../demo.css']" />

<figcaption>组件内部的间距也有亲疏。</figcaption>
</figure>

</div>
