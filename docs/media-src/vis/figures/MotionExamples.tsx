import { useId, useState } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import './MotionExamples.css';

export function SlideExample() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return <div className="fig-board" data-scene="transition-slide">
    <div className="motion-toolbar">
      <strong>采访提纲</strong>
      <Button variant="outline" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        {open ? '收起详情' : '查看详情'}
      </Button>
    </div>
    <div className="motion-slide">
      <p>第一节　沿河而居</p>
      <p>第二节　渡口的变化</p>
      <p>第三节　回到老街</p>
      <Card className="motion-slide-detail" id={panelId} aria-hidden={!open} data-open={open}>
        <CardHeader><CardTitle>文稿详情</CardTitle></CardHeader>
        <CardContent>共 3 节 · 420 字</CardContent>
      </Card>
    </div>
  </div>;
}

const excerpts = [
  ['山间', '过了山口，便能看见村子。'],
  ['河畔', '木船靠岸，船头轻轻一晃。'],
  ['林中', '再走几步，脚下都是松针。'],
];

export function CarouselExample() {
  const [page, setPage] = useState(0);
  return <div className="fig-board" data-scene="transition-carousel">
    <div className="motion-carousel">
      <div className="motion-track" style={{ transform: `translateX(-${page * 100}%)` }}>
        {excerpts.map(([title, excerpt], index) => <div className="motion-page" key={title} aria-hidden={index !== page}>
          <strong>{title}</strong>
          <p>{excerpt}</p>
        </div>)}
      </div>
    </div>
    <div className="motion-page-controls">
      <Button size="icon" variant="outline" aria-label="上一段" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
      <span aria-live="polite">第 {page + 1} 段，共 {excerpts.length} 段</span>
      <Button size="icon" variant="outline" aria-label="下一段" disabled={page === excerpts.length - 1} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
    </div>
  </div>;
}

export function FoldExample() {
  return <div className="fig-board" data-scene="transition-fold">
    <Collapsible.Root>
      <div className="motion-toolbar">
        <strong>候车室的钟停了。</strong>
        <Collapsible.Trigger render={<Button variant="outline" />}>译注<ChevronDown data-icon="inline-end" /></Collapsible.Trigger>
      </div>
      <Collapsible.Panel className="motion-fold">
        <p>这里的“钟”指墙上的挂钟。</p>
      </Collapsible.Panel>
    </Collapsible.Root>
    <p className="motion-next-line">月台上还有几个人在等车。</p>
  </div>;
}

export function AddExample() {
  const [added, setAdded] = useState(false);
  return <div className="fig-board" data-scene="transition-states">
    <div className="motion-toolbar">
      <strong>篇目</strong>
      <Button variant="outline" onClick={() => setAdded(!added)}>{added ? '重置' : '添加条目'}</Button>
    </div>
    <Table aria-label="篇目"><TableHeader><TableRow><TableHead>篇名</TableHead><TableHead>字数</TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow><TableCell>山间</TableCell><TableCell>230</TableCell></TableRow>
        <TableRow><TableCell>河畔</TableCell><TableCell>185</TableCell></TableRow>
        {added && <TableRow className="motion-highlight"><TableCell>林中</TableCell><TableCell>206</TableCell></TableRow>}
      </TableBody>
    </Table>
    <span role="status" className="vis-example__sr-only">{added && '已添加《林中》'}</span>
  </div>;
}

export function DeleteExample() {
  const [removed, setRemoved] = useState(false);
  return <div className="fig-board" data-scene="transition-delete">
    <div className="motion-toolbar">
      <strong>文稿</strong>
      <Button variant="outline" onClick={() => setRemoved(!removed)}>{removed ? '重置' : '删除草稿'}</Button>
    </div>
    <Collapsible.Root open={!removed} render={<ul className="motion-list" />}>
      <li><span>山间</span></li>
      <Collapsible.Panel className="motion-fold" render={<li />}><span>河畔（草稿）</span></Collapsible.Panel>
      <li><span>林中</span></li>
    </Collapsible.Root>
    <span role="status" className="vis-example__sr-only">{removed && '已删除《河畔》草稿'}</span>
  </div>;
}

export function UpdateExample() {
  const [reviewed, setReviewed] = useState(false);
  return <div className="fig-board" data-scene="transition-update">
    <Table aria-label="文稿校对进度"><TableHeader><TableRow><TableHead>篇名</TableHead><TableHead>校对状态</TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow><TableCell>河畔</TableCell><TableCell aria-live="polite" className={reviewed ? 'motion-highlight' : undefined}>{reviewed ? '已校对' : '待校对'}</TableCell></TableRow>
      </TableBody>
    </Table>
    <Button variant="outline" onClick={() => setReviewed(!reviewed)}>{reviewed ? '重置' : '标为已校对'}</Button>
  </div>;
}

export function CalloutExample() {
  return <div className="fig-board" data-scene="transition-callout">
    <div className="motion-toolbar">
      <strong>河畔.txt</strong>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" />}>文件信息</PopoverTrigger>
        <PopoverContent className="motion-popover" align="end">
          <PopoverHeader><PopoverTitle>文件信息</PopoverTitle></PopoverHeader>
          <dl><dt>格式</dt><dd>纯文本</dd><dt>编码</dt><dd>UTF-8</dd></dl>
        </PopoverContent>
      </Popover>
    </div>
  </div>;
}
