---
title: 对齐
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 对齐

对齐让页面有稳定的阅读线。用户沿同一起点向下看，就能较快找到相关内容。

## 文案类对齐

<div class="vis-principle-row">
<div class="vis-principle-copy">

短标题与正文共享行首起点。起点错开时，读者需要不断重新找下一行。

</div>

<figure>

<demo react="alignment-text.tsx" :reactFiles="['alignment-text.tsx', '../figures/Foundations.tsx', '../figures/Foundations.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

<figcaption>标题与正文共用阅读起点。</figcaption>
</figure>

</div>

## 表单类对齐

<div class="vis-principle-row">
<div class="vis-principle-copy">

连续字段的标签和输入框分别成列。标签较短时可按末端对齐，让视线顺着标签找到输入位置。窄窗则把标签放到控件上方。

</div>

<figure>

<demo react="alignment-form.tsx" :reactFiles="['alignment-form.tsx', '../figures/Foundations.tsx', '../figures/Foundations.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

<figcaption>标签和输入框分别成列。</figcaption>
</figure>

</div>

## 数字类对齐

<div class="vis-principle-row">
<div class="vis-principle-copy">

同类数值统一单位与小数位数，按右侧末位对齐，便于比较大小。单位写在表头，缺失值写明状态。

</div>

<figure>

<demo react="alignment-numbers.tsx" :reactFiles="['alignment-numbers.tsx', '../figures/Foundations.tsx', '../figures/Foundations.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

<figcaption>数值统一精度并右对齐。</figcaption>
</figure>

</div>
