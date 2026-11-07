"use client"

import { useHighlightedCode } from "@/registry/bases/base/hooks/use-highlighted-code"
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@/styles/base-rhea/ui/code-block"

const samples = [
  {
    language: "css",
    title: "app/globals.css",
    code: `@import "tailwindcss";

:root {
  --radius: 0.625rem;
}`,
  },
  {
    language: "python",
    title: "main.py",
    code: `def greet(name: str) -> str:
    return f"Hello, {name}!"`,
  },
  {
    language: "text",
    title: "notes.txt",
    code: "列表中未包含的语言会以纯文本显示。",
  },
]

function Sample({ code, language }: { code: string; language: string }) {
  const lines = useHighlightedCode(code, language)

  return (
    <CodeBlockContent>
      {lines.map((line, index) => (
        <CodeBlockLine key={index}>{line}</CodeBlockLine>
      ))}
    </CodeBlockContent>
  )
}

export function CodeBlockLanguages() {
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {samples.map((sample) => (
        <CodeBlock key={sample.language}>
          <CodeBlockHeader>
            <CodeBlockTitle>{sample.title}</CodeBlockTitle>
          </CodeBlockHeader>
          <Sample code={sample.code} language={sample.language} />
        </CodeBlock>
      ))}
    </div>
  )
}
