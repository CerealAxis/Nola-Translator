import {
  FileIcon,
  FolderIcon,
  HelpCircleIcon,
  SaveIcon,
  SettingsIcon,
  TrashIcon,
} from "lucide-react"

import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/styles/base-nova/ui/menubar"

export function MenubarIcons() {
  return (
    <Menubar className="w-72">
      <MenubarMenu>
        <MenubarTrigger>文件</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <FileIcon />
            新建文件 <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <FolderIcon />
            打开文件夹
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <SaveIcon />
            保存 <MenubarShortcut>⌘S</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>更多</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem>
              <SettingsIcon />
              设置
            </MenubarItem>
            <MenubarItem>
              <HelpCircleIcon />
              帮助
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem variant="destructive">
              <TrashIcon />
              删除
            </MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
