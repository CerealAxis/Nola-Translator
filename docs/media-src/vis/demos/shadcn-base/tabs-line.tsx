import { Tabs, TabsList, TabsTrigger } from "@/styles/base-nova/ui/tabs"

export function TabsLine() {
  return (
    <Tabs defaultValue="overview">
      <TabsList variant="line">
        <TabsTrigger value="overview">概览</TabsTrigger>
        <TabsTrigger value="analytics">数据分析</TabsTrigger>
        <TabsTrigger value="reports">报告</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
