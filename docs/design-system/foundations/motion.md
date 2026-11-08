---
title: 动态效果
pageClass: nola-vis-doc nola-vis-foundations
editLink: false
---

# 动态效果

动态效果能够解释状态变化、提供反馈，并帮助人们理解界面中元素的关系。让每一次变化都有明确的用途。

## 最佳实践

**用动态效果传达信息。** 展开内容从触发位置出现，收起后回到原处。界面中的运动方向应与操作和空间关系一致。

**谨慎添加动态效果。** 经常使用的控件采用简短、熟悉的过渡。让内容和操作及时响应，避免反复出现的装饰性动画占用注意力。

**让动态效果可以被打断。** 用户可以继续操作或关闭浮层，操作结果及时生效。新输入到来时，过渡应顺畅进入下一状态。

## 提供反馈

**让反馈对应用户刚刚完成的动作。** 修改后的内容在原处显示，短暂强调发生变化的区域。提示结束后，结果仍然保留。

<demo react="foundation-appearance-motion.tsx" :reactFiles="['foundation-appearance-motion.tsx', '../figures/FoundationAppearance.tsx', '../figures/FoundationAppearance.css', '../shadcn-base/apple-liquid-glass.css', '../shadcn-base/nola-liquid-glass.css']" />

点击「应用校对」，观察修改行的短暂强调。再次点击可恢复原文。

**保持反馈简洁、准确。** 控件颜色变化使用 150 ms 过渡。浮层进入为 150 ms，退出为 120 ms，均使用 ease-out。修改行可保留两秒选中底色，再用 150 ms 淡出。

## 利用平台功能

**尊重减少动态效果的偏好。** 开启后移除位移和高亮动画，直接显示最终状态。文字、图标和控件状态继续说明变化。

**优先使用组件已有的过渡。** shadcn/ui 与 Base UI 负责浮层和控件的状态变化。在这些行为上使用统一时长，让不同页面保持一致。

**让动态效果适应实际运行环境。** 避免持续重绘大面积模糊和阴影。长列表、视频播放和窗口缩放时，内容与操作仍应及时响应。
