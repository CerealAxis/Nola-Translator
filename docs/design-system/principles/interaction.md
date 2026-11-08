---
title: 直截了当
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 直截了当

需要编辑哪里，就在那里的内容附近提供输入。减少为了修改一项内容而跳转页面的步骤。

## 页内编辑

<div class="vis-principle-row">
<div class="vis-principle-copy">

单字段修改可在原行完成。浏览时显示文本，悬停时提示可编辑，编辑时在原位置显示输入框、确定与取消。

</div>

<figure>

<demo react="edit-states.tsx" :reactFiles="['edit-states.tsx', '../figures/DynamicPatterns.tsx', '../figures/DynamicPatterns.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

<figcaption>点击项目名称进行编辑，然后确认或取消修改。</figcaption>
</figure>

</div>

多字段编辑可扩展当前行的空间。表格列位保持稳定，让用户认得正在修改的条目。

## 利用拖放

<div class="vis-principle-row">
<div class="vis-principle-copy">

拖入文件时，突出可以接收文件的区域。上传开始后，在同一区域显示文件与进度。

</div>

<figure>

<demo react="drag-states.tsx" :reactFiles="['drag-states.tsx', '../figures/Interactions.tsx', '../figures/Interactions.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

<figcaption>上传前与文件拖入后的状态。</figcaption>
</figure>

</div>

文件拖入也要标明有效区域。按钮或菜单提供等效操作。
