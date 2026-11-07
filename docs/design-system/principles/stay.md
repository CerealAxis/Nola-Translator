---
title: 足不出户
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 足不出户

能在当前页面完成的事，就尽量留在当前页面。少一次跳转，用户便少一次重新寻找原内容。

## 覆盖层

<div class="vis-principle-row">
<div class="vis-principle-copy">

可恢复的移除立即更新列表，并提供“撤销”。无法恢复的删除在执行前确认。

</div>

<figure>

<demo react="undo-states.tsx" :reactFiles="['undo-states.tsx', '../figures/StayExamples.tsx', '../figures/StayExamples.css', '../demo.css']" />

<figcaption>点击“移除”，再用通知中的“撤销”恢复该记录。</figcaption>
</figure>

</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

从列表查看少量详情，可在所选条目旁打开浮层。关闭后，列表仍保留原来的筛选与位置。

</div>

<figure>

<demo react="detail-popover.tsx" :reactFiles="['detail-popover.tsx', '../figures/StayExamples.tsx', '../figures/StayExamples.css', '../demo.css']" />

<figcaption>点击“查看详情”，在当前条目旁打开浮层。</figcaption>
</figure>

</div>

少量输入也可在浮层中完成。字段较多时再使用完整表单。

## 嵌入层

<div class="vis-principle-row">
<div class="vis-principle-copy">

在列表行中展开详情或编辑区，能继续看见相邻条目。收起后，列表顺序不变。

</div>

<figure>

<demo react="inline-states.tsx" :reactFiles="['inline-states.tsx', '../figures/StayExamples.tsx', '../figures/StayExamples.css', '../demo.css']" />

<figcaption>点击“展开”，在当前行下方查看详情；收起后保留原有顺序。</figcaption>
</figure>

</div>

平级内容可用标签页切换，一次显示一组，页头与当前条目保持可见。

## 虚拟页面

长列表可以连续加载，也可以分页。新增内容不应让用户失去原来的阅读位置。翻看图片时，前后顺序和返回入口保持清楚。

## 流程处理

<div class="vis-principle-row">
<div class="vis-principle-copy">

较长流程按当前选择逐步显示选项，已填写内容可返回修改。

</div>

<figure>

<demo react="progressive-options.tsx" :reactFiles="['progressive-options.tsx', '../figures/DynamicPatterns.tsx', '../figures/DynamicPatterns.css', '../demo.css']" />

<figcaption>打开“接收提醒”，再选择提醒方式。</figcaption>
</figure>

</div>

确需对话框或独立页面的步骤，完成后回到原任务。
