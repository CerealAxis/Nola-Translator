import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/styles/base-nova/ui/menubar"

export function MenubarCheckbox() {
  return (
    <Menubar className="w-72">
      <MenubarMenu>
        <MenubarTrigger>查看</MenubarTrigger>
        <MenubarContent className="w-64">
          <MenubarCheckboxItem>始终显示书签栏</MenubarCheckboxItem>
          <MenubarCheckboxItem checked>
            始终显示完整网址
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem inset>
            重新加载 <MenubarShortcut>⌘R</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled inset>
            强制重新加载 <MenubarShortcut>⇧⌘R</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>格式</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem checked>删除线</MenubarCheckboxItem>
          <MenubarCheckboxItem>代码</MenubarCheckboxItem>
          <MenubarCheckboxItem>上标</MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
