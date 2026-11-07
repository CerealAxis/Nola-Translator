import {
  BrainIcon,
  ChevronRightIcon,
  FileTextIcon,
  TerminalIcon,
} from "lucide-react"

import { CodeBlock, CodeBlockContent } from "@/styles/base-rhea/ui/code-block"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/styles/base-rhea/ui/trace"

export function TraceTurn() {
  return (
    <div className="w-full max-w-sm">
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine status="error">
            <TraceTitle>耗时 2 分 4 秒，1 条命令失败</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted className="flex flex-col gap-2">
          <Trace>
            <TraceCollapsible>
              <TraceCollapsibleTrigger>
                <TraceLine>
                  <TraceIcon>
                    <BrainIcon />
                  </TraceIcon>
                  <TraceTitle>思考</TraceTitle>
                  <TraceDescription>12s</TraceDescription>
                </TraceLine>
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent className="whitespace-pre-wrap">
                开始搭建前，我应该先检查已安装的包管理器。
              </TraceCollapsibleContent>
            </TraceCollapsible>
            <TraceCollapsible defaultOpen>
              <TraceCollapsibleTrigger>
                <TraceLine status="error">
                  <TraceIcon>
                    <TerminalIcon />
                  </TraceIcon>
                  <TraceTitle>已运行 2 条命令，1 条失败</TraceTitle>
                </TraceLine>
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent keepMounted>
                <Trace>
                  <TraceLine>
                    <TraceIcon>
                      <TerminalIcon />
                    </TraceIcon>
                    <TraceTitle>已运行 node --version</TraceTitle>
                  </TraceLine>
                  <TraceCollapsible>
                    <TraceCollapsibleTrigger>
                      <TraceLine status="error">
                        <TraceIcon>
                          <TerminalIcon />
                        </TraceIcon>
                        <TraceTitle>运行 pnpm --version 失败</TraceTitle>
                      </TraceLine>
                    </TraceCollapsibleTrigger>
                    <TraceCollapsibleContent>
                      <CodeBlock size="sm" variant="destructive">
                        <CodeBlockContent wrap className="max-h-64">
                          command not found: pnpm
                        </CodeBlockContent>
                      </CodeBlock>
                    </TraceCollapsibleContent>
                  </TraceCollapsible>
                </Trace>
              </TraceCollapsibleContent>
            </TraceCollapsible>
          </Trace>
          <p>已安装 Node，但未安装 pnpm。正在查看文档配置。</p>
          <Trace>
            <a href="#turn">
              <TraceLine>
                <TraceIcon>
                  <FileTextIcon />
                </TraceIcon>
                <TraceTitle>已读取 apps/v4/lib/docs.ts</TraceTitle>
                <TraceIcon>
                  <ChevronRightIcon />
                </TraceIcon>
              </TraceLine>
            </a>
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </div>
  )
}
