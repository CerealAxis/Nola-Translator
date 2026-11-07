import { Tabs, TabsList, TabsTrigger } from "@/styles/base-nova/ui/tabs"

export function TabsDisabled() {
  return (
    <Tabs defaultValue="home">
      <TabsList>
        <TabsTrigger value="home">首页</TabsTrigger>
        <TabsTrigger value="settings" disabled>
          已禁用
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
