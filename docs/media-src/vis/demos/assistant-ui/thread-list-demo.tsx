import { useState } from 'react'
import { DemoThreadListRuntime } from '../../assistant-ui/demo-runtime'
import { ThreadList as RuntimeThreadList } from '../../assistant-ui/elements/thread-list.aui'
import { ThreadList, type ThreadItem } from '../../assistant-ui/elements/thread-list'
import { AssistantPreview } from '../../assistant-ui/preview-scope'
import { Button } from '../../shadcn-base/ui/button'
import { Input } from '../../shadcn-base/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shadcn-base/ui/tabs'

const rows: ThreadItem[] = [
  { id: 'notes', title: '会议纪要', time: '刚刚', unread: true },
  { id: 'terms', title: '术语翻译', time: '10 分钟前' },
  { id: 'review', title: '译文校对', time: '30 分钟前' },
]

function StandaloneThreadList() {
  const [threads, setThreads] = useState(rows)
  const [activeId, setActiveId] = useState(rows[0].id)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ThreadItem | null>(null)
  const visible = threads.filter(thread => thread.title.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="flex flex-col gap-3">
      <Input aria-label="搜索会话" placeholder="搜索会话" value={query} onChange={event => setQuery(event.target.value)} />
      {visible.length ? (
        <ThreadList
          threads={visible}
          activeIndex={visible.findIndex(thread => thread.id === activeId)}
          onActiveIndexChange={index => setActiveId(visible[index].id)}
          onRename={index => setEditing(visible[index])}
          onDelete={index => {
            const removed = visible[index].id
            const remaining = threads.filter(thread => thread.id !== removed)
            setThreads(remaining)
            if (activeId === removed) setActiveId(remaining[0]?.id ?? '')
            if (editing?.id === removed) setEditing(null)
          }}
        />
      ) : <p className="text-sm text-muted-foreground">未找到会话</p>}
      {editing && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={event => {
            event.preventDefault()
            const title = editing.title.trim()
            if (!title) return
            setThreads(current => current.map(thread => thread.id === editing.id ? { ...thread, title } : thread))
            setEditing(null)
          }}
        >
          <Input
            className="min-w-0 flex-1"
            aria-label="会话名称"
            value={editing.title}
            onChange={event => setEditing({ ...editing, title: event.target.value })}
          />
          <Button type="submit" size="sm" disabled={!editing.title.trim()}>保存</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>取消</Button>
        </form>
      )}
    </div>
  )
}

export default function ThreadListDemo() {
  return (
    <AssistantPreview>
      <Tabs defaultValue="runtime" className="mx-auto w-full max-w-md">
        <TabsList aria-label="会话列表预览模式">
          <TabsTrigger value="runtime">运行时版</TabsTrigger>
          <TabsTrigger value="standalone">独立版</TabsTrigger>
        </TabsList>
        <TabsContent value="runtime" className="min-h-52 rounded-2xl border p-3">
          <DemoThreadListRuntime>
            <RuntimeThreadList />
          </DemoThreadListRuntime>
        </TabsContent>
        <TabsContent value="standalone" className="min-h-52 rounded-2xl border p-3">
          <StandaloneThreadList />
        </TabsContent>
      </Tabs>
    </AssistantPreview>
  )
}
