/** Inline Markdown editing; persisted notes remain portable Markdown strings. */
import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bold, Italic, StickyNote, Strikethrough, Underline as UnderlineIcon } from 'lucide-react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Underline from '@tiptap/extension-underline'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'

export type NotesMark = 'bold' | 'italic' | 'underline' | 'strike'
interface MarkButton { key: NotesMark; icon: LucideIcon; labelKey: TranslationKey }
const MARKS: MarkButton[] = [
  { key: 'bold', icon: Bold, labelKey: 'notes.bold' },
  { key: 'italic', icon: Italic, labelKey: 'notes.italic' },
  { key: 'underline', icon: UnderlineIcon, labelKey: 'notes.underline' },
  { key: 'strike', icon: Strikethrough, labelKey: 'notes.strikethrough' },
]

/** Use HTML only for underline, which has no standard Markdown delimiter. */
export function notesExtensions() {
  return [
    StarterKit.configure({ underline: false, link: { openOnClick: false } }),
    Underline.extend({ renderMarkdown: (node, helpers) => `<u>${helpers.renderChildren(node)}</u>` }),
    TaskList, TaskItem.configure({ nested: true }), TableKit, Image,
    Markdown,
  ]
}

export interface NotesPanelProps {
  value: string
  onChange: (next: string) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  className?: string
}

export function NotesPanel({ value, onChange, collapsed = false, onToggleCollapsed, className }: NotesPanelProps) {
  const { t } = useI18n()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastValue = useRef(value)
  const editor = useEditor({
    extensions: notesExtensions(),
    content: value,
    contentType: 'markdown',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown()
      lastValue.current = markdown
      onChangeRef.current(markdown)
    },
  })
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      underline: current?.isActive('underline') ?? false,
      strike: current?.isActive('strike') ?? false,
      empty: current?.isEmpty ?? true,
    }),
  })

  useEffect(() => {
    if (!editor || value === lastValue.current) return
    // Own edits already match lastValue: never replace their selection or IME composition.
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    lastValue.current = value
  }, [editor, value])
  useEffect(() => {
    editor?.setOptions({ editorProps: { attributes: {
      role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('notes.title'),
      'data-placeholder': t('notes.placeholder'),
    } } })
  }, [editor, t])

  if (collapsed) {
    return <Button variant="secondary" size="icon" onClick={onToggleCollapsed} aria-label={t('workspaceUi.notesExpand')} className="nola-workspace-notes-handle"><StickyNote aria-hidden="true" /></Button>
  }
  return (
    <Card role="complementary" aria-label={t('notes.title')} className={['nola-workspace-notes', className].filter(Boolean).join(' ')}>
      <CardHeader className="nola-workspace-notes-heading">
        <CardTitle className="card__title">{t('notes.title')}</CardTitle>
        <span className="nola-workspace-notes-state" title={t('workspaceUi.notesLocalHint')}>{t('workspaceUi.notesLocal')}</span>
      </CardHeader>
      <div className="nola-workspace-notes-tools" role="toolbar" aria-label={t('notes.title')}>
        {MARKS.map(({ key, icon: Icon, labelKey }) => (
          <Button key={key} variant="secondary" size="icon" aria-label={t(labelKey)}
            aria-pressed={state?.[key] ?? false} disabled={!editor}
            onClick={() => editor?.chain().focus().toggleMark(key).run()}><Icon aria-hidden="true" /></Button>
        ))}
      </div>
      <CardContent className="nola-workspace-notes-content flex-col">
        <EditorContent editor={editor} className="nola-workspace-notes-editor nola-scrollbar" data-empty={state?.empty ?? true}
          onPasteCapture={event => {
            if (!editor || editor.isActive('codeBlock') || event.clipboardData.types.includes('text/html')) return
            const text = event.clipboardData.getData('text/plain')
            if (!text) return
            event.preventDefault()
            editor.commands.insertContent(text, { contentType: 'markdown' })
          }} />
      </CardContent>
    </Card>
  )
}
