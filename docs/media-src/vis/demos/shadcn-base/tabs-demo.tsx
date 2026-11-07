import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/styles/base-nova/ui/tabs"

export function TabsDemo() {
  return (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview">概览</TabsTrigger>
        <TabsTrigger value="analytics">数据分析</TabsTrigger>
        <TabsTrigger value="reports">报告</TabsTrigger>
        <TabsTrigger value="settings">设置</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>概览</CardTitle>
            <CardDescription>
              查看关键指标和近期项目活动，跟踪所有活跃项目的进展。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            你有 12 个活跃项目和 3 个待处理任务。
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="analytics">
        <Card>
          <CardHeader>
            <CardTitle>数据分析</CardTitle>
            <CardDescription>
              跟踪性能和用户参与度指标，监控趋势并发现增长机会。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            页面浏览量较上月增长了 25%。
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="reports">
        <Card>
          <CardHeader>
            <CardTitle>报告</CardTitle>
            <CardDescription>
              生成并下载详细报告。导出多种格式的数据以供分析。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            有 5 份报告已准备好，可以导出。
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle>设置</CardTitle>
            <CardDescription>
              管理账户偏好和选项，根据需要自定义使用体验。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            配置通知、安全和主题。
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
