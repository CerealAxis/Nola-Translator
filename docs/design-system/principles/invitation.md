---
title: 提供邀请
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 提供邀请

用户应看得出哪里能点击、编辑或继续。文字、形状和状态变化都可以提示下一步操作。

## 静态邀请

<div class="vis-principle-row">
<div class="vis-principle-copy">

空列表直接给出添加入口。未完成的表单说明还需要填写什么。提示在操作前就能看到。

</div>

<figure>

<demo react="invitation-empty.tsx" :reactFiles="['invitation-empty.tsx', '../figures/Interactions.tsx', '../figures/Interactions.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

<figcaption>空状态给出第一步操作。</figcaption>
</figure>

</div>

首次引导只指出当前要做的一步，可以关闭，也能再次找到。

## 动态邀请

<div class="vis-principle-row">
<div class="vis-principle-copy">

把次要操作放在对应条目内。指针悬停或键盘焦点移入时，显示同一个入口。

</div>

<figure>

<demo react="invitation-hover.tsx" :reactFiles="['invitation-hover.tsx', '../figures/DynamicPatterns.tsx', '../figures/DynamicPatterns.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

<figcaption>悬停模板卡片，或按 Tab 聚焦卡片，查看“选择模板”入口。</figcaption>
</figure>

</div>

当前操作完成后，可提示相关的下一步。还有更多内容时，用箭头或当前位置说明可以继续查看。
