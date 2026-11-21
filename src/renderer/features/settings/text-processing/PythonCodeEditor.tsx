import { useEffect, useRef, useState } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const highlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword], class: 'text-danger' },
  { tag: [tags.className, tags.function(tags.definition(tags.variableName))], class: 'text-primary' },
  { tag: [tags.string, tags.number, tags.bool, tags.null], class: 'text-success' },
  { tag: tags.comment, class: 'text-muted-foreground' },
])

export function PythonCodeEditor({ initialCode, id, wrap, onChange }: {
  initialCode: string
  id: string
  wrap: boolean
  onChange: (code: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  const [wrapping] = useState(() => new Compartment())

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      doc: initialCode,
      extensions: [
        python(), syntaxHighlighting(highlighting), lineNumbers(), history(), bracketMatching(), indentOnInput(),
        keymap.of([...defaultKeymap, ...historyKeymap]), wrapping.of([]),
        EditorView.contentAttributes.of({
          'data-slot': 'code-block-editor', 'aria-labelledby': id + '-name', 'aria-describedby': id + '-help ' + id + '-error',
          spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off',
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChange(update.state.doc.toString())
        }),
      ],
    })
    view.current = editor
    return () => {
      view.current = null
      editor.destroy()
    }
  }, [id, initialCode, onChange, wrapping])

  useEffect(() => {
    view.current?.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) })
  }, [wrap, wrapping, initialCode])

  return <div ref={host} className="processing-python-editor type-code" dir="ltr" />
}
