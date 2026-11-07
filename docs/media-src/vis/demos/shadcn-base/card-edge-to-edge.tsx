import { Button } from "@/styles/base-nova/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"

export function CardEdgeToEdge() {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>服务条款</CardTitle>
        <CardDescription>
          接受协议前请先阅读条款。
        </CardDescription>
      </CardHeader>
      <CardContent className="-mb-(--card-spacing)">
        <div className="-mx-(--card-spacing) max-h-48 space-y-4 overflow-y-scroll border-t bg-muted/50 px-(--card-spacing) py-4 text-sm leading-relaxed">
          <p>
            这些条款规定了工作区的使用方式，包括共享文档、项目文件和协作工具的访问权限。
          </p>
          <p>
            你需要对上传的内容负责，并确保团队成员拥有相应的查看或编辑权限。
          </p>
          <p>
            随着服务发展，我们可能会调整功能或限制。如果这些变化会显著影响工作流程，我们会通知工作区管理员。
          </p>
          <p>
            继续操作即表示你同意妥善保管账户凭据，并遵守组织的可接受使用政策。
          </p>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline">拒绝</Button>
        <Button>接受</Button>
      </CardFooter>
    </Card>
  )
}
