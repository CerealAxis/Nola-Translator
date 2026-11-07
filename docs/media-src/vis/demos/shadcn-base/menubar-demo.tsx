import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/styles/base-nova/ui/menubar"

export default function MenubarDemo() {
  return (
    <Menubar className="w-72">
      <MenubarMenu>
        <MenubarTrigger>文件</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem>
              新建标签页 <MenubarShortcut>⌘T</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              新建窗口 <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>新建无痕窗口</MenubarItem>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarSub>
              <MenubarSubTrigger>分享</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarGroup>
                  <MenubarItem>邮件链接</MenubarItem>
                  <MenubarItem>消息</MenubarItem>
                  <MenubarItem>备注</MenubarItem>
                </MenubarGroup>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem>
              打印... <MenubarShortcut>⌘P</MenubarShortcut>
            </MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>编辑</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem>
              撤销 <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              重做 <MenubarShortcut>⇧⌘Z</MenubarShortcut>
            </MenubarItem>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarSub>
              <MenubarSubTrigger>查找</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarGroup>
                  <MenubarItem>搜索网页</MenubarItem>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarGroup>
                  <MenubarItem>查找...</MenubarItem>
                  <MenubarItem>查找下一个</MenubarItem>
                  <MenubarItem>查找上一个</MenubarItem>
                </MenubarGroup>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem>剪切</MenubarItem>
            <MenubarItem>复制</MenubarItem>
            <MenubarItem>粘贴</MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>查看</MenubarTrigger>
        <MenubarContent className="w-44">
          <MenubarGroup>
            <MenubarCheckboxItem>书签栏</MenubarCheckboxItem>
            <MenubarCheckboxItem checked>完整网址</MenubarCheckboxItem>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem inset>
              重新加载 <MenubarShortcut>⌘R</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled inset>
              强制重新加载 <MenubarShortcut>⇧⌘R</MenubarShortcut>
            </MenubarItem>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem inset>切换全屏</MenubarItem>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem inset>隐藏侧边栏</MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>个人资料</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup value="benoit">
            <MenubarRadioItem value="andy">安迪</MenubarRadioItem>
            <MenubarRadioItem value="benoit">贝诺瓦</MenubarRadioItem>
            <MenubarRadioItem value="Luis">路易斯</MenubarRadioItem>
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem inset>编辑...</MenubarItem>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem inset>添加个人资料...</MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
