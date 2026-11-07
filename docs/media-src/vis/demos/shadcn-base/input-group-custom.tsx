"use client"

import TextareaAutosize from "react-textarea-autosize"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@/styles/base-nova/ui/input-group"

export default function InputGroupCustom() {
  return (
    <div className="grid w-full max-w-sm gap-6">
      <InputGroup>
        <TextareaAutosize
          data-slot="input-group-control"
          className="flex field-sizing-content min-h-16 w-full resize-none rounded-md bg-transparent px-3 py-2.5 text-base transition-[color,box-shadow] outline-none md:text-sm"
          placeholder="自动调整高度的文本框..."
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton className="ml-auto" size="sm" variant="default">
            提交
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
