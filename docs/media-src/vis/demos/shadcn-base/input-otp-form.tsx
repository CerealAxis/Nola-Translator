import { RefreshCwIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/styles/base-nova/ui/input-otp"

export function InputOTPForm() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>验证登录</CardTitle>
        <CardDescription>
          输入我们发送到你邮箱的验证码：{" "}
          <span className="font-medium">m@example.com</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="otp-verification">
              验证码
            </FieldLabel>
            <Button variant="outline" size="xs">
              <RefreshCwIcon />
              重新发送验证码
            </Button>
          </div>
          <InputOTP maxLength={6} id="otp-verification" required>
            <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator className="mx-2" />
            <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <FieldDescription>
            <a href="#">我已无法访问此电子邮箱地址。</a>
          </FieldDescription>
        </Field>
      </CardContent>
      <CardFooter>
        <Field>
          <Button type="submit" className="w-full">
            验证
          </Button>
          <div className="text-sm text-muted-foreground">
            登录遇到问题？{" "}
            <a
              href="#"
              className="underline underline-offset-4 transition-colors hover:text-primary"
            >
              联系支持
            </a>
          </div>
        </Field>
      </CardFooter>
    </Card>
  )
}
