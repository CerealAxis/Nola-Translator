import { Tabs, TabsList, TabsTrigger } from "@/styles/base-nova/ui/tabs"

export function TabsVertical() {
  return (
    <Tabs defaultValue="account" orientation="vertical">
      <TabsList>
        <TabsTrigger value="account">账户</TabsTrigger>
        <TabsTrigger value="password">密码</TabsTrigger>
        <TabsTrigger value="notifications">通知</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
