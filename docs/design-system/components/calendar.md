---
title: Calendar（日历）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Calendar（日历）

允许用户选择日期或日期范围的日历组件。

<demo react="shadcn-base/calendar-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add calendar
```

</template>

<template #manual>

**1. 安装以下依赖：**

```bash
npm install react-day-picker date-fns
```

**2. 将 `Button` 组件添加到项目中。**

`Calendar` 组件使用 `Button` 组件。请确保项目已经安装它。

**3. 将以下代码复制到你的项目中。**

<<< @/media-src/vis/shadcn-base/ui/calendar.tsx [components/ui/calendar.tsx]

**4. 根据你的项目配置调整导入路径。**

</template>

</ShadcnInstall>

## 用法 {#usage}

```tsx:line-numbers
import { Calendar } from "@/components/ui/calendar"
```

```tsx:line-numbers
const [date, setDate] = React.useState<Date | undefined>(new Date())

return (
  <Calendar
    mode="single"
    selected={date}
    onSelect={setDate}
    className="rounded-lg border"
  />
)
```

更多信息请参阅 [React DayPicker](https://react-day-picker.js.org) 文档。

## 简介 {#about}

`Calendar` 组件基于 [React DayPicker](https://react-day-picker.js.org) 构建。

## 日期选择器 {#date-picker}

可以使用 `<Calendar>` 组件构建日期选择器。更多信息请参阅[日期选择器](https://ui.shadcn.com/docs/components/base/date-picker)页面。

## 波斯历 / 希吉来历 / 贾拉利历 {#persian-hijri-jalali-calendar}

如需使用波斯历，请编辑 `components/ui/calendar.tsx`，将 `react-day-picker` 替换为 `react-day-picker/persian`。

```diff
- import { DayPicker } from "react-day-picker"
+ import { DayPicker } from "react-day-picker/persian"
```

<demo react="shadcn-base/calendar-hijri.tsx" />

*A Persian calendar.*

## 已选日期（含时区） {#selected-date-with-timezone}

Calendar 组件接受 `timeZone` 属性，确保日期按用户的本地时区显示和选择。

```tsx:line-numbers
export function CalendarWithTimezone() {
  const [date, setDate] = React.useState<Date | undefined>(undefined)
  const [timeZone, setTimeZone] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      timeZone={timeZone}
    />
  )
}
```

**注意：** 如果所选日期发生偏移，例如选择 20 日时高亮了 19 日，请确认 `timeZone` 属性已设为用户的本地时区。

**为什么在客户端检测？** 在 `useEffect` 中使用 `Intl.DateTimeFormat().resolvedOptions().timeZone` 检测时区，以兼容服务端渲染。在渲染期间检测可能导致水合不匹配，因为服务端和客户端可能处于不同时区。

## 基础 {#basic}

基础日历组件。我们用 `className="rounded-lg border"` 设置日历样式。

<demo react="shadcn-base/calendar-basic.tsx" />

## 日期范围日历 {#range-calendar}

使用 `mode="range"` 属性启用范围选择。

<demo react="shadcn-base/calendar-range.tsx" />

## 月份和年份选择器 {#month-and-year-selector}

使用 `captionLayout="dropdown"` 显示月份和年份下拉菜单。

<demo react="shadcn-base/calendar-caption.tsx" />

## 预设 {#presets}

<demo react="shadcn-base/calendar-presets.tsx" />

## 日期和时间选择器 {#date-and-time-picker}

<demo react="shadcn-base/calendar-time.tsx" />

## 已预订日期 {#booked-dates}

<demo react="shadcn-base/calendar-booked-dates.tsx" />

## 自定义单元格尺寸 {#custom-cell-size}

<demo react="shadcn-base/calendar-custom-days.tsx" />

*A calendar with custom cell size that's responsive.*

可以使用 CSS 变量 `--cell-size` 自定义日历单元格的尺寸，也可在不同断点设置不同值，实现响应式尺寸：

```tsx:line-numbers
<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  className="rounded-lg border [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]"
/>
```

也可以使用固定值：

```tsx:line-numbers
<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  className="rounded-lg border [--cell-size:2.75rem] md:[--cell-size:3rem]"
/>
```

## 周数 {#week-numbers}

使用 `showWeekNumber` 显示周数。

<demo react="shadcn-base/calendar-week-numbers.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

有关如何启用波斯历 / 希吉来历 / 贾拉利历，另请参阅[希吉来历指南](#persian--hijri--jalali-calendar)。

<demo react="shadcn-base/calendar-rtl.tsx" />

使用 RTL 时，请从 `react-day-picker/locale` 导入区域设置，并将 `locale` 和 `dir` 属性一并传给 Calendar 组件：

```tsx:line-numbers
import { arSA } from "react-day-picker/locale"

;<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  locale={arSA}
  dir="rtl"
/>
```

## API 参考 {#api-reference}

有关 `Calendar` 组件的更多信息，请参阅 [React DayPicker](https://react-day-picker.js.org) 文档。

## 更新日志 {#changelog}

### RTL 支持 {#rtl-support}

如果你从旧版 `Calendar` 组件升级，需要应用以下更新以增加区域设置支持：

**1. 导入 `Locale` 类型。**

在来自 `react-day-picker` 的导入中添加 `Locale`：

```diff
  import {
    DayPicker,
    getDefaultClassNames,
    type DayButton,
+   type Locale,
  } from "react-day-picker"
```

**2. 为 Calendar 组件添加 `locale` 属性。**

在组件属性中添加 `locale`：

```diff
  function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    captionLayout = "label",
    buttonVariant = "ghost",
+   locale,
    formatters,
    components,
    ...props
  }: React.ComponentProps<typeof DayPicker> & {
    buttonVariant?: React.ComponentProps<typeof Button>["variant"]
  }) {
```

**3. 将 `locale` 传给 DayPicker。**

将 `locale` 属性传给 `DayPicker` 组件：

```diff
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(...)}
      captionLayout={captionLayout}
+     locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
-         date.toLocaleString("default", { month: "short" }),
+         date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
```

**4. 更新 CalendarDayButton 以接收 locale。**

更新 `CalendarDayButton` 组件的签名，并传入 `locale`：

```diff
  function CalendarDayButton({
    className,
    day,
    modifiers,
+   locale,
    ...props
- }: React.ComponentProps<typeof DayButton>) {
+ }: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
```

**5. 更新 CalendarDayButton 的日期格式化。**

在日期格式化时使用 `locale?.code`：

```diff
    <Button
      variant="ghost"
      size="icon"
-     data-day={day.date.toLocaleDateString()}
+     data-day={day.date.toLocaleDateString(locale?.code)}
      ...
    />
```

**6. 将 locale 传给 DayButton 组件。**

更新 `DayButton` 组件的用法，传入 `locale` 属性：

```diff
      components={{
        ...
-       DayButton: CalendarDayButton,
+       DayButton: ({ ...props }) => (
+         <CalendarDayButton locale={locale} {...props} />
+       ),
        ...
      }}
```

**7. 更新支持 RTL 的 CSS 类。**

使用逻辑属性替换方向类，以更好地支持 RTL：

```diff
  // In the day classNames:
- [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)
+ [&:last-child[data-selected=true]_button]:rounded-e-(--cell-radius)
- [&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)
+ [&:nth-child(2)[data-selected=true]_button]:rounded-s-(--cell-radius)
- [&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)
+ [&:first-child[data-selected=true]_button]:rounded-s-(--cell-radius)

  // In range_start classNames:
- rounded-l-(--cell-radius) ... after:right-0
+ rounded-s-(--cell-radius) ... after:end-0

  // In range_end classNames:
- rounded-r-(--cell-radius) ... after:left-0
+ rounded-e-(--cell-radius) ... after:start-0

  // In CalendarDayButton className:
- data-[range-end=true]:rounded-r-(--cell-radius)
+ data-[range-end=true]:rounded-e-(--cell-radius)
- data-[range-start=true]:rounded-l-(--cell-radius)
+ data-[range-start=true]:rounded-s-(--cell-radius)
```

应用这些更改后，即可使用 `locale` 属性按区域设置调整格式：

```tsx
import { enUS } from "react-day-picker/locale"

;<Calendar mode="single" selected={date} onSelect={setDate} locale={enUS} />
```
