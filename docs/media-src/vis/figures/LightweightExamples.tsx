import { useEffect, useRef, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function VisibleToolsExample() {
  const [saved, setSaved] = useState(false);

  return <div className="fig-board" data-scene="visible-tools">
    <Card className="fig-light-visible"><CardHeader><CardTitle>每周读书会</CardTitle><CardDescription>周五下午 · 社区活动</CardDescription></CardHeader><CardContent className="fig-light-visible-content">
      <p>分享本周读过的一篇文章。</p>
      <Button type="button" variant={saved ? 'default' : 'outline'} aria-pressed={saved} onClick={() => setSaved(value => !value)}><Star data-icon="inline-start" aria-hidden="true" />{saved ? '已收藏 13' : '收藏 12'}</Button>
    </CardContent></Card>
  </div>;
}

const ruleNames = ['自动归档', '到期提醒', '每日摘要'];

export function HoverToolsExample() {
  const [selected, setSelected] = useState<string | null>(null);

  return <div className="fig-board" data-scene="hover-tools">
    <Table className="fig-light-hover-table"><TableHeader><TableRow><TableHead>规则条目</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {ruleNames.map(name => <TableRow key={name} data-selected={selected === name || undefined}><TableCell>{name}</TableCell><TableCell><Button type="button" variant="outline" size="sm" onClick={() => setSelected(name)}>{selected === name ? '已查看' : '查看'}</Button></TableCell></TableRow>)}
    </TableBody></Table>
  </div>;
}

const initialRows = [
  { id: 'a', text: '首页介绍' },
  { id: 'b', text: '常见问题' },
  { id: 'c', text: '更新记录' },
];

export function EditModeToolsExample() {
  const [rows, setRows] = useState(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  function start(id: string, text: string) {
    setEditingId(id);
    setDraft(text);
  }

  function save() {
    const next = draft.trim();
    if (!next || !editingId) {
      inputRef.current?.focus();
      return;
    }
    setRows(current => current.map(row => row.id === editingId ? { ...row, text: next } : row));
    setEditingId(null);
  }

  return <div className="fig-board" data-scene="edit-mode-tools">
    <Table className="fig-light-edit-table"><TableHeader><TableRow><TableHead>文本</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {rows.map(row => <TableRow key={row.id}><TableCell>{editingId === row.id ? <Input ref={inputRef} aria-label="编辑文本" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditingId(null); }} /> : row.text}</TableCell><TableCell>{editingId === row.id ? <div className="fig-light-edit-actions"><Button type="button" size="sm" onClick={save}>完成</Button><Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>取消</Button></div> : <Button type="button" variant="outline" size="sm" onClick={() => start(row.id, row.text)}>修改</Button>}</TableCell></TableRow>)}
    </TableBody></Table>
  </div>;
}

export function LinkHitAreaExample() {
  return <div className="fig-board" data-scene="hit-area-links" inert>
    <Table className="fig-light-hit-table"><TableHeader><TableRow><TableHead>编号</TableHead><TableHead>详情</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>
      <TableRow><TableCell className="fig-light-hit-cell"><Button type="button" variant="link">R-120</Button></TableCell><TableCell>项目文件</TableCell><TableCell>可用</TableCell></TableRow>
      <TableRow><TableCell className="fig-light-hit-cell fig-light-hit-cell--marked"><Button type="button" variant="link">R-119</Button></TableCell><TableCell>共享记录</TableCell><TableCell>可用</TableCell></TableRow>
      <TableRow><TableCell className="fig-light-hit-cell"><Button type="button" variant="link">R-118</Button></TableCell><TableCell>归档清单</TableCell><TableCell>可用</TableCell></TableRow>
    </TableBody></Table>
    <p className="fig-light-note">整格均为 R-119 的点击范围</p>
  </div>;
}

export function ButtonHitAreaExample() {
  return <div className="fig-board" data-scene="hit-area" inert>
    <Card className="fig-light-target-card"><CardHeader><CardTitle>项目文件</CardTitle><CardDescription>已选择一项</CardDescription></CardHeader><CardContent className="fig-light-target-row">
      <span>说明文档.pdf</span>
      <div className="fig-light-target-annotation"><span className="fig-light-target"><Button type="button" variant="bare" size="icon-sm" aria-label="移除文件"><Trash2 aria-hidden="true" /></Button></span><span>16 px 图标<br />36 × 36 px 热区</span></div>
    </CardContent></Card>
  </div>;
}
