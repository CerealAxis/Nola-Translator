"use client"

import * as React from "react"
import Link from "next/link"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
} from "lucide-react"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/styles/base-nova/ui/navigation-menu"

const components: { title: string; href: string; description: string }[] = [
  {
    title: "警告对话框",
    href: "/docs/primitives/alert-dialog",
    description:
      "用于展示重要内容并要求用户回应的模态对话框。",
  },
  {
    title: "悬浮卡片",
    href: "/docs/primitives/hover-card",
    description:
      "供视力正常的用户预览链接所指向的内容。",
  },
  {
    title: "进度",
    href: "/docs/primitives/progress",
    description:
      "显示任务完成进度，通常以进度条呈现。",
  },
  {
    title: "滚动区域",
    href: "/docs/primitives/scroll-area",
    description: "通过视觉或语义方式分隔内容。",
  },
  {
    title: "标签页",
    href: "/docs/primitives/tabs",
    description:
      "一组分层内容区域（即标签面板），每次显示其中一个。",
  },
  {
    title: "工具提示",
    href: "/docs/primitives/tooltip",
    description:
      "当元素获得键盘焦点或鼠标悬停时，显示与该元素相关信息的弹出层。",
  },
]

export default function NavigationMenuDemo() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>入门</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-96">
              <ListItem href="/docs" title="简介">
                基于 Tailwind CSS 构建的可复用组件。
              </ListItem>
              <ListItem href="/docs/installation" title="安装">
                了解如何安装依赖并搭建应用结构。
              </ListItem>
              <ListItem href="/docs/primitives/typography" title="排版">
                适用于标题、段落、列表等内容的样式
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem className="hidden md:flex">
          <NavigationMenuTrigger>组件</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-2 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              {components.map((component) => (
                <ListItem
                  key={component.title}
                  title={component.title}
                  href={component.href}
                >
                  {component.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>带图标</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[200px]">
              <li>
                <NavigationMenuLink
                  render={
                    <Link href="#" className="flex-row items-center gap-2" />
                  }
                >
                  <CircleAlertIcon />
                  待办列表
                </NavigationMenuLink>
                <NavigationMenuLink
                  render={
                    <Link href="#" className="flex-row items-center gap-2" />
                  }
                >
                  <CircleDashedIcon />
                  待办事项
                </NavigationMenuLink>
                <NavigationMenuLink
                  render={
                    <Link href="#" className="flex-row items-center gap-2" />
                  }
                >
                  <CircleCheckIcon />
                  完成
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink
            render={<Link href="/docs" />}
            className={navigationMenuTriggerStyle()}
          >
            文档
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

function ListItem({
  title,
  children,
  href,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & { href: string }) {
  return (
    <li {...props}>
      <NavigationMenuLink render={<Link href={href} />}>
        <div className="flex flex-col gap-1 text-sm">
          <div className="leading-none font-medium">{title}</div>
          <div className="line-clamp-2 text-muted-foreground">{children}</div>
        </div>
      </NavigationMenuLink>
    </li>
  )
}
