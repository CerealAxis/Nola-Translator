---
title: 简化交互
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 简化交互

把工具放在操作对象附近，并为常用目标留出容易点击的范围。

## 实时可见工具

重要操作始终可见。悬停提示可以点击，选中后保留明确状态。

<div class="vis-principle-row">
<div class="vis-principle-copy">

「收藏」始终位于内容旁。移入时按钮响应，点击后文案与计数一起变化。

</div>
<figure>

<demo react="visible-tools.tsx" :reactFiles="['visible-tools.tsx', '../figures/LightweightExamples.tsx']" />

<figcaption>悬停并点击「收藏」，比较常态与选中状态。</figcaption>
</figure>
</div>

## 悬停即现工具

次要操作只在目标行悬停或获得键盘焦点时出现，避免占据整张列表。

<div class="vis-principle-row">
<div class="vis-principle-copy">

将指针移入任一行，或用 Tab 聚焦行内操作，再查看该条目的工具。

</div>
<figure>

<demo react="hover-tools.tsx" :reactFiles="['hover-tools.tsx', '../figures/LightweightExamples.tsx']" />

<figcaption>工具跟随当前行出现。</figcaption>
</figure>
</div>

## 开关显示工具

切换到编辑模式后，表格文本在原位置变为输入框。完成后恢复阅读状态。

<div class="vis-principle-row">
<div class="vis-principle-copy">

点击某行「修改」，只编辑这一行；「完成」把新文本放回同一格。

</div>
<figure>

<demo react="edit-mode-tools.tsx" :reactFiles="['edit-mode-tools.tsx', '../figures/LightweightExamples.tsx']" />

<figcaption>输入与阅读在同一个单元格切换。</figcaption>
</figure>
</div>

## 交互中的工具

当内容本身就是操作入口，让提示贴近内容。点击编号可直接复制，结果就地反馈。

<div class="vis-principle-row">
<div class="vis-principle-copy">

把指针移到编号上查看提示，再点击编号复制。

</div>
<figure>

<demo react="contextual-tools.tsx" :reactFiles="['contextual-tools.tsx', '../figures/DynamicPatterns.tsx']" />

<figcaption>复制发生在编号本身，无须旁置图标。</figcaption>
</figure>
</div>

## 可视区域 ≠ 可点击区域

短文字链的热区可覆盖整格；图标按钮也应有完整的 36 × 36 px 点击范围。

<div class="vis-principle-row">
<div class="vis-principle-copy">

短 ID 所在的整个单元格均为目标，浅蓝色标出热区。

</div>
<figure>

<demo react="hit-area-links.tsx" :reactFiles="['hit-area-links.tsx', '../figures/LightweightExamples.tsx']" />

<figcaption>点击范围覆盖完整单元格。</figcaption>
</figure>
</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

删除图标保持 16 px，周围按钮提供 36 × 36 px 热区。

</div>
<figure>

<demo react="hit-area.tsx" :reactFiles="['hit-area.tsx', '../figures/LightweightExamples.tsx']" />

<figcaption>图标尺寸与可点击范围分别标注。</figcaption>
</figure>
</div>
