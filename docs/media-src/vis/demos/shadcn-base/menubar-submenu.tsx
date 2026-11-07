import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/styles/base-nova/ui/menubar"

export function MenubarSubmenu() {
  return (
    <Menubar className="w-72">
      <MenubarMenu>
        <MenubarTrigger>文件</MenubarTrigger>
        <MenubarContent>
          <MenubarSub>
            <MenubarSubTrigger>分享</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>邮件链接</MenubarItem>
              <MenubarItem>消息</MenubarItem>
              <MenubarItem>备注</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>
            打印... <MenubarShortcut>⌘P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>编辑</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            撤销 <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            重做 <MenubarShortcut>⇧⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>查找</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>查找...</MenubarItem>
              <MenubarItem>查找下一个</MenubarItem>
              <MenubarItem>查找上一个</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>剪切</MenubarItem>
          <MenubarItem>复制</MenubarItem>
          <MenubarItem>粘贴</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
