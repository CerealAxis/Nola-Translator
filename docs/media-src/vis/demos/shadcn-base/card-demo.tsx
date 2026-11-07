import { Button } from "@/styles/base-nova/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"
import { Input } from "@/styles/base-nova/ui/input"
import { Label } from "@/styles/base-nova/ui/label"

export default function CardDemo() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>登录账户</CardTitle>
        <CardDescription>
          在下方输入邮箱以登录账户
        </CardDescription>
        <CardAction>
          <Button variant="link">注册</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form>
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">密码</Label>
                <a
                  href="#"
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  忘记密码？
                </a>
              </div>
              <Input id="password" type="password" required />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button type="submit" className="w-full">
          登录
        </Button>
        <Button variant="outline" className="w-full">
          使用 Google 登录
        </Button>
      </CardFooter>
    </Card>
  )
}
