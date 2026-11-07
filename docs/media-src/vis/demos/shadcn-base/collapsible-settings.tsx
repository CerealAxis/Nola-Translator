"use client"

import * as React from "react"
import { MaximizeIcon, MinimizeIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/styles/base-nova/ui/collapsible"
import { Field, FieldGroup, FieldLabel } from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function CollapsibleSettings() {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Card className="mx-auto w-full max-w-xs" size="sm">
      <CardHeader>
        <CardTitle>圆角</CardTitle>
        <CardDescription>设置元素的圆角。</CardDescription>
      </CardHeader>
      <CardContent>
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className="flex items-start gap-2"
        >
          <FieldGroup className="grid w-full grid-cols-2 gap-2">
            <Field>
              <FieldLabel htmlFor="radius-x" className="sr-only">
                圆角 X
              </FieldLabel>
              <Input id="radius" placeholder="0" defaultValue={0} />
            </Field>
            <Field>
              <FieldLabel htmlFor="radius-y" className="sr-only">
                圆角 Y
              </FieldLabel>
              <Input id="radius" placeholder="0" defaultValue={0} />
            </Field>
            <CollapsibleContent className="col-span-full grid grid-cols-subgrid gap-2">
              <Field>
                <FieldLabel htmlFor="radius-x" className="sr-only">
                  圆角 X
                </FieldLabel>
                <Input id="radius" placeholder="0" defaultValue={0} />
              </Field>
              <Field>
                <FieldLabel htmlFor="radius-y" className="sr-only">
                  圆角 Y
                </FieldLabel>
                <Input id="radius" placeholder="0" defaultValue={0} />
              </Field>
            </CollapsibleContent>
          </FieldGroup>
          <CollapsibleTrigger render={<Button variant="outline" size="icon" />}>
            {isOpen ? <MinimizeIcon /> : <MaximizeIcon />}
          </CollapsibleTrigger>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
