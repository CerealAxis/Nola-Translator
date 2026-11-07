"use client"

import * as React from "react"

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarTrigger,
} from "@/styles/base-nova/ui/menubar"

export function MenubarRadio() {
  const [user, setUser] = React.useState("benoit")
  const [theme, setTheme] = React.useState("system")

  return (
    <Menubar className="w-72">
      <MenubarMenu>
        <MenubarTrigger>个人资料</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup value={user} onValueChange={setUser}>
            <MenubarRadioItem value="andy">安迪</MenubarRadioItem>
            <MenubarRadioItem value="benoit">贝诺瓦</MenubarRadioItem>
            <MenubarRadioItem value="luis">路易斯</MenubarRadioItem>
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarItem inset>编辑...</MenubarItem>
          <MenubarItem inset>添加个人资料...</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>主题</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup value={theme} onValueChange={setTheme}>
            <MenubarRadioItem value="light">浅色</MenubarRadioItem>
            <MenubarRadioItem value="dark">深色</MenubarRadioItem>
            <MenubarRadioItem value="system">系统</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
