import { Badge } from "@/styles/base-nova/ui/badge"
import { Button } from "@/styles/base-nova/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"

export function CardImage() {
  return (
    <Card className="relative mx-auto w-full max-w-sm pt-0">
      <div className="absolute inset-0 z-30 aspect-video bg-black/35" />
      <img
        src="https://avatar.vercel.sh/shadcn1"
        alt="活动封面"
        className="relative z-20 aspect-video w-full object-cover brightness-60 grayscale dark:brightness-40"
      />
      <CardHeader>
        <CardAction>
          <Badge variant="secondary">精选</Badge>
        </CardAction>
        <CardTitle>设计系统交流会</CardTitle>
        <CardDescription>
          一场关于组件 API、无障碍设计和高效交付的实用分享。
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full">查看活动</Button>
      </CardFooter>
    </Card>
  )
}
