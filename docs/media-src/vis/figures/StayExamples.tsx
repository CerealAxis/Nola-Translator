import { Fragment, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { closeToast, showToast } from '@/components/ui/toast';
import './StayExamples.css';

const records = [
  { id: 'a', name: '记录 A', detail: '需求整理' },
  { id: 'b', name: '记录 B', detail: '方案评审' },
  { id: 'c', name: '记录 C', detail: '发布检查' },
] as const;

const resources = [
  { id: 'messages', name: '消息服务', status: '运行中', version: '2.4', region: '华东', description: '处理站内消息与提醒。' },
  { id: 'files', name: '文件服务', status: '运行中', version: '1.8', region: '华北', description: '管理上传文件与共享资源。' },
  { id: 'search', name: '搜索服务', status: '维护中', version: '3.1', region: '华东', description: '提供资源检索与索引。' },
] as const;

export function UndoExample() {
  const [visible, setVisible] = useState<string[]>(records.map(record => record.id));
  const ownToasts = useRef<string[]>([]);

  useEffect(() => () => {
    ownToasts.current.forEach(closeToast);
    ownToasts.current = [];
  }, []);

  function remove(id: string) {
    const record = records.find(item => item.id === id);
    if (!record) return;
    setVisible(current => current.filter(item => item !== id));
    const toastId: string = showToast({
      type: 'info',
      title: `已移除${record.name}`,
      actionProps: {
        children: '撤销',
        onClick: () => {
          setVisible(current => current.includes(id) ? current : records.filter(item => item.id === id || current.includes(item.id)).map(item => item.id));
          closeToast(toastId);
        },
      },
      duration: 12000,
    });
    ownToasts.current.push(toastId);
  }

  return <div className="fig-stay-example" data-scene="undo-states"><Table><TableHeader><TableRow><TableHead>记录</TableHead><TableHead>内容</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
    {records.filter(record => visible.includes(record.id)).map(record => <TableRow key={record.id}><TableCell>{record.name}</TableCell><TableCell>{record.detail}</TableCell><TableCell><Button type="button" variant="outline" size="sm" onClick={() => remove(record.id)}>移除</Button></TableCell></TableRow>)}
  </TableBody></Table></div>;
}

export function DetailPopoverExample() {
  return <div className="fig-stay-example" data-scene="detail-popover"><Table><TableHeader><TableRow><TableHead>资源</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
    {resources.map(resource => <TableRow key={resource.id}><TableCell>{resource.name}</TableCell><TableCell>{resource.status}</TableCell><TableCell>
      <Popover><PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>查看详情</PopoverTrigger>
        <PopoverContent className="fig-stay-popover" side="top" align="end"><PopoverHeader><PopoverTitle>{resource.name}</PopoverTitle><PopoverDescription>{resource.description}</PopoverDescription></PopoverHeader>
          <dl className="fig-stay-details"><dt>版本</dt><dd>{resource.version}</dd><dt>区域</dt><dd>{resource.region}</dd><dt>状态</dt><dd>{resource.status}</dd></dl>
        </PopoverContent>
      </Popover>
    </TableCell></TableRow>)}
  </TableBody></Table></div>;
}

export function InlineDetailsExample() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return <div className="fig-stay-example" data-scene="inline-states"><Table><TableHeader><TableRow><TableHead>资源</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
    {resources.map(resource => <Fragment key={resource.id}>
      <TableRow><TableCell>{resource.name}</TableCell><TableCell>{resource.status}</TableCell><TableCell><Button type="button" variant="outline" size="sm" aria-expanded={expandedId === resource.id} aria-controls={`details-${resource.id}`} onClick={() => setExpandedId(current => current === resource.id ? null : resource.id)}>{expandedId === resource.id ? '收起' : '展开'}</Button></TableCell></TableRow>
      {expandedId === resource.id && <TableRow className="fig-stay-expanded-row"><TableCell colSpan={3}><div id={`details-${resource.id}`} className="fig-stay-inline-content"><p>{resource.description}</p><dl className="fig-stay-details"><dt>版本</dt><dd>{resource.version}</dd><dt>区域</dt><dd>{resource.region}</dd></dl></div></TableCell></TableRow>}
    </Fragment>)}
  </TableBody></Table></div>;
}
