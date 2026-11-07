"use client"

import * as React from "react"

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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/styles/base-nova/ui/toggle-group"

const spacingOptions = [
  {
    className: "[--card-spacing:--spacing(4)]",
    label: "16px",
    value: "4",
  },
  {
    className: "[--card-spacing:--spacing(5)]",
    label: "20px",
    value: "5",
  },
  {
    className: "[--card-spacing:--spacing(6)]",
    label: "24px",
    value: "6",
  },
  {
    className: "[--card-spacing:--spacing(8)]",
    label: "32px",
    value: "8",
  },
]

export function CardSpacing() {
  const [spacing, setSpacing] = React.useState("4")
  const selectedSpacing = spacingOptions.find(
    (option) => option.value === spacing
  )

  return (
    <div className="mx-auto grid w-full max-w-sm gap-4">
      <ToggleGroup
        value={[spacing]}
        onValueChange={(value) => {
          if (value[0]) {
            setSpacing(value[0])
          }
        }}
        variant="outline"
        size="sm"
        className="justify-center"
      >
        {spacingOptions.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Card className={selectedSpacing?.className}>
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
                <Label htmlFor="email-spacing">邮箱</Label>
                <Input
                  id="email-spacing"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password-spacing">密码</Label>
                  <a
                    href="#"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    忘记密码？
                  </a>
                </div>
                <Input id="password-spacing" type="password" required />
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
    </div>
  )
}
