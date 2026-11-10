import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function InlineEditExample() {
  const [name, setName] = useState('春季调研');
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (wasEditing.current) triggerRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function save() {
    const next = draft.trim();
    if (!next) {
      setError('请输入项目名称');
      inputRef.current?.focus();
      return;
    }
    setName(next);
    setError('');
    setEditing(false);
  }

  function cancel() {
    setDraft(name);
    setError('');
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }

  return <div className="fig-board" data-scene="edit-states">
    <div className="fig-dynamic-edit">
      <span className="fig-dynamic-label">项目名称</span>
      {editing ? <div className="fig-dynamic-edit-content"><div className="fig-dynamic-edit-controls"><Input ref={inputRef} aria-label="项目名称" aria-invalid={Boolean(error)} aria-describedby={error ? 'dynamic-edit-error' : undefined} value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} onKeyDown={onKeyDown} /><Button type="button" onClick={save}>确定</Button><Button type="button" variant="outline" onClick={cancel}>取消</Button></div>{error && <FieldError id="dynamic-edit-error">{error}</FieldError>}</div>
        : <TooltipProvider><Tooltip><TooltipTrigger render={<Button type="button" variant="link" ref={triggerRef} className="fig-dynamic-edit-trigger" onClick={() => { setDraft(name); setEditing(true); }} />}>{name}</TooltipTrigger><TooltipContent>单击编辑</TooltipContent></Tooltip></TooltipProvider>}
    </div>
  </div>;
}

export function ProgressiveOptionsExample() {
  const [enabled, setEnabled] = useState(false);
  const [method, setMethod] = useState<'email' | 'inapp'>('email');

  return <div className="fig-board" data-scene="progressive-options">
    <div className="fig-dynamic-form">
      <div className="fig-dynamic-switch-row"><div><strong>接收提醒</strong><p>有新消息时通知我</p></div><Switch checked={enabled} onCheckedChange={setEnabled} aria-label="接收提醒"><SwitchThumb /></Switch></div>
      {enabled && <Field><FieldLabel htmlFor="dynamic-notice-method">提醒方式</FieldLabel><Select value={method} onValueChange={value => { if (value === 'email' || value === 'inapp') setMethod(value); }}><SelectTrigger id="dynamic-notice-method"><SelectValue>{method === 'email' ? '邮件提醒' : '应用内提醒'}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="email">邮件提醒</SelectItem><SelectItem value="inapp">应用内提醒</SelectItem></SelectGroup></SelectContent></Select></Field>}
    </div>
  </div>;
}

export function CopyHintExample() {
  const [status, setStatus] = useState('');
  const fallbackRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText('DOC-042');
      setStatus('已复制');
    } catch {
      setStatus('复制失败，请手动复制');
      requestAnimationFrame(() => fallbackRef.current?.select());
    }
  }

  return <div className="fig-board" data-scene="contextual-tools">
    <div className="fig-dynamic-copy">
      <span className="fig-dynamic-label">文档编号</span>
      <TooltipProvider><Tooltip><TooltipTrigger render={<Button type="button" variant="link" onClick={() => void copy()} />}>DOC-042</TooltipTrigger><TooltipContent>{status || '单击复制'}</TooltipContent></Tooltip></TooltipProvider>
      {status && <span className="fig-dynamic-copy-status" role="status">{status}</span>}
      {status.startsWith('复制失败') && <Input ref={fallbackRef} aria-label="手动复制文档编号" value="DOC-042" readOnly />}
    </div>
  </div>;
}

export function HoverInvitationExample() {
  return <div className="fig-board" data-scene="invitation-hover">
    <div className="fig-dynamic-templates">
      {[
        { name: '简洁模板', description: '标题、摘要与内容' },
        { name: '目录模板', description: '章节、目录与内容' },
      ].map(template => <Card key={template.name} size="sm" className="fig-dynamic-template" tabIndex={0}><CardHeader><CardTitle>{template.name}</CardTitle><CardDescription>{template.description}</CardDescription></CardHeader><CardContent><div className="fig-dynamic-template-preview" aria-hidden="true"><span /><span /><span /></div></CardContent><CardFooter><Button type="button" variant="outline" size="sm">选择模板</Button></CardFooter></Card>)}
    </div>
  </div>;
}

const projects = [
  { name: '设计规范', owner: '林青' },
  { name: '发布计划', owner: '周明' },
  { name: '用户研究', owner: '陈宁' },
];

export function SearchFeedbackExample() {
  const [query, setQuery] = useState('');
  const matches = projects.filter(project => project.name.includes(query.trim()) || project.owner.includes(query.trim()));

  return <div className="fig-board" data-scene="search-states">
    <div className="fig-dynamic-table">
      <Input aria-label="搜索项目" placeholder="搜索项目或负责人" value={query} onChange={event => setQuery(event.target.value)} />
      {matches.length ? <Table><TableHeader><TableRow><TableHead>项目</TableHead><TableHead>负责人</TableHead></TableRow></TableHeader><TableBody>
        {matches.map(project => <TableRow key={project.name}><TableCell>{project.name}</TableCell><TableCell>{project.owner}</TableCell></TableRow>)}
      </TableBody></Table> : <div className="fig-dynamic-no-results" role="status"><span>没有匹配项目</span><Button type="button" variant="outline" size="sm" onClick={() => setQuery('')}>清空搜索</Button></div>}
    </div>
  </div>;
}

export function ValidationFeedbackExample() {
  const [email, setEmail] = useState('');
  const [valid, setValid] = useState(true);
  const [touched, setTouched] = useState(false);
  const invalid = touched && !valid;

  return <div className="fig-board" data-scene="preview-states">
    <Field className="fig-dynamic-form" data-invalid={invalid || undefined}><FieldLabel htmlFor="dynamic-email">邮箱地址</FieldLabel><Input id="dynamic-email" type="email" required placeholder="lin@example.com" value={email} aria-invalid={invalid} aria-describedby="dynamic-email-feedback" onChange={event => { setEmail(event.target.value); setValid(event.currentTarget.validity.valid); setTouched(true); }} />
      {invalid ? <FieldError id="dynamic-email-feedback">请输入有效的邮箱地址</FieldError> : <FieldDescription id="dynamic-email-feedback">{email ? '邮箱格式正确' : '输入时会显示格式反馈'}</FieldDescription>}
    </Field>
  </div>;
}
