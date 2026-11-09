---
title: 巧用过渡
pageClass: nola-vis-doc nola-vis-principles
editLink: false
---

# 巧用过渡

内容出现、消失或改变时，过渡能引导视线。其余内容留在原处，给用户一个参照。

## 在视图变化时保持上下文

<div class="vis-principle-row">
<div class="vis-principle-copy">

**滑入与滑出**　详情从右侧滑入，收起时沿原路退出。篇名始终留在原处。

</div>

<figure>

<demo react="transition-slide.tsx" :reactFiles="['transition-slide.tsx', '../figures/MotionExamples.tsx', '../figures/MotionExamples.css']" />

</figure>
</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

**传送带**　后一段从右边进，前一段从左边出。翻回去时，方向相反。

</div>

<figure>

<demo react="transition-carousel.tsx" :reactFiles="['transition-carousel.tsx', '../figures/MotionExamples.tsx', '../figures/MotionExamples.css']" />

</figure>
</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

**折叠窗口**　译注在对应的句子下展开，把下一句向下推。收起译注，两句便重新相邻。

</div>

<figure>

<demo react="transition-fold.tsx" :reactFiles="['transition-fold.tsx', '../figures/MotionExamples.tsx', '../figures/MotionExamples.css']" />

</figure>
</div>

## 解释刚刚发生了什么

<div class="vis-principle-row">
<div class="vis-principle-copy">

**对象增加**　新增的整行亮起，方便用户找到它。两秒后底色淡去。

</div>

<figure>

<demo react="transition-states.tsx" :reactFiles="['transition-states.tsx', '../figures/MotionExamples.tsx', '../figures/MotionExamples.css']" />

</figure>
</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

**对象删除**　草稿淡出，下面的文稿随即上移，填补留下的空位。

</div>

<figure>

<demo react="transition-delete.tsx" :reactFiles="['transition-delete.tsx', '../figures/MotionExamples.tsx', '../figures/MotionExamples.css']" />

</figure>
</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

**对象更改**　校对完成后，只有状态一格亮起。底色淡去后，新值仍留在原处。

</div>

<figure>

<demo react="transition-update.tsx" :reactFiles="['transition-update.tsx', '../figures/MotionExamples.tsx', '../figures/MotionExamples.css']" />

</figure>
</div>

<div class="vis-principle-row">
<div class="vis-principle-copy">

**对象呼出**　点击“文件信息”，浮层从按钮旁展开，用户仍能看到它属于哪份文件。

</div>

<figure>

<demo react="transition-callout.tsx" :reactFiles="['transition-callout.tsx', '../figures/MotionExamples.tsx', '../figures/MotionExamples.css']" />

</figure>
</div>

## 改善感知性能

等待时间较长时，先显示已经就绪的内容。例如，一段译文完成就显示一段，用户可以边等边读。

## 自然运动

进入和退出的方向相互呼应。运动的时长和节奏可参见 [Ant Motion 动画语言](https://motion.ant.design/)。
