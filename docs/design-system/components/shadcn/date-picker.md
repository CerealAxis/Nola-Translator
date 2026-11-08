---
title: Date Picker（日期选择器）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
---

# Date Picker（日期选择器）

支持日期范围与预设的日期选择器组件。

<demo react="shadcn-base/date-picker-demo.tsx" />

## 安装 {#installation}

日期选择器由 `<Popover />` 和 `<Calendar />` 组件组合而成。

请参阅 [Popover](https://ui.shadcn.com/docs/components/base/popover#installation) 和 [Calendar](https://ui.shadcn.com/docs/components/base/calendar#installation) 组件的安装说明。

## 用法 {#usage}

```tsx:line-numbers [components/example-date-picker.tsx]
"use client"

import * as React from "react"
import { cn } from "cn"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePickerDemo() {
  const [date, setDate] = React.useState<Date>()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            data-empty={!date}
            className="justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
          />
        }
      >
        <CalendarIcon />
        {date ? format(date, "PPP") : <span>Pick a date</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={setDate} />
      </PopoverContent>
    </Popover>
  )
}
```

详情请参阅 [React DayPicker](https://react-day-picker.js.org) 文档。

## 组件结构 {#composition}

日期选择器由 `Popover` 和 `Calendar` 组成（没有 `DatePicker` 根组件）：

```text
Popover
├── PopoverTrigger
└── PopoverContent
    └── Calendar
```

## 基础 {#basic}

一个基础日期选择器组件。

<demo react="shadcn-base/date-picker-basic.tsx" />

## 范围选择器 {#range-picker}

用于选择日期范围的日期选择器组件。

<demo react="shadcn-base/date-picker-range.tsx" />

## 出生日期 {#date-of-birth}

用于选择出生日期的日期选择器组件。该组件使用带下拉选项的标题布局来选择日期与月份。

<demo react="shadcn-base/date-picker-dob.tsx" />

## 输入框 {#input}

带输入框的日期选择器组件。

<demo react="shadcn-base/date-picker-input.tsx" />

## 时间选择器 {#time-picker}

带时间输入框的日期选择器组件。

<demo react="shadcn-base/date-picker-time.tsx" />

## 自然语言选择器 {#natural-language-picker}

此组件使用 `chrono-node` 库解析自然语言日期。

<demo react="shadcn-base/date-picker-natural-language.tsx" />

## RTL {#rtl}

要在 shadcn/ui 中启用 RTL 支持，请参阅 [RTL 配置指南](https://ui.shadcn.com/docs/rtl)。

<demo react="shadcn-base/date-picker-rtl.tsx" />
