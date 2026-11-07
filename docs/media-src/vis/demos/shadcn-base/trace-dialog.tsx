import { ArrowUpRightIcon, ChevronRightIcon, GlobeIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/styles/base-rhea/ui/dialog"
import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/styles/base-rhea/ui/trace"

const results = [
  {
    title: "缓存构建产物",
    url: "https://nextjs.org/docs/app/guides/caching",
  },
  {
    title: "图像优化参考",
    url: "https://nextjs.org/docs/app/api-reference/components/image",
  },
  {
    title: "部署钩子与缓存键",
    url: "https://vercel.com/docs/deploy-hooks",
  },
]

export function TraceDialog() {
  return (
    <Trace className="max-w-sm">
      <Dialog>
        <DialogTrigger>
          <TraceLine>
            <TraceIcon>
              <GlobeIcon />
            </TraceIcon>
            <TraceTitle>已搜索缓存键</TraceTitle>
            <TraceIcon>
              <ChevronRightIcon />
            </TraceIcon>
          </TraceLine>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>已搜索缓存键</DialogTitle>
            <DialogDescription>
              答复中引用了 3 个结果。
            </DialogDescription>
          </DialogHeader>
          <Trace>
            {results.map((result) => (
              <a
                key={result.url}
                href={result.url}
                target="_blank"
                rel="noreferrer"
              >
                <TraceLine>
                  <TraceIcon>
                    <GlobeIcon />
                  </TraceIcon>
                  <TraceTitle>
                    {result.title}
                    <span className="sr-only"> （在新标签页中打开）</span>
                  </TraceTitle>
                  <TraceIcon>
                    <ArrowUpRightIcon />
                  </TraceIcon>
                </TraceLine>
              </a>
            ))}
          </Trace>
        </DialogContent>
      </Dialog>
    </Trace>
  )
}
