import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const models = [
  { name: 'Nola Lite MT', kind: '文本翻译', status: '已安装' },
  { name: 'Index Translate', kind: '文本翻译', status: '未安装' },
  { name: 'CrispASR', kind: '语音识别', status: '已安装' },
];

export default function ContentStates() {
  const [query, setQuery] = useState('');
  const visible = models.filter(model => model.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="vis-example vis-example--content-states">
      <Card className="vis-example__card">
        <CardHeader><CardTitle>模型目录</CardTitle></CardHeader>
        <CardContent>
          <Field className="vis-example__search-field"><FieldLabel htmlFor="vis-model-search">搜索模型</FieldLabel><Input id="vis-model-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入模型名称" /></Field>
          {visible.length ? <Table>
            <TableHeader><TableRow><TableHead>模型</TableHead><TableHead>能力</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
            <TableBody>{visible.map(model => <TableRow key={model.name}><TableCell>{model.name}</TableCell><TableCell>{model.kind}</TableCell><TableCell>{model.status}</TableCell></TableRow>)}</TableBody>
          </Table> : <Empty className="vis-example__empty"><EmptyHeader><EmptyMedia variant="icon"><Search aria-hidden="true" /></EmptyMedia><EmptyTitle>没有匹配的模型</EmptyTitle><EmptyDescription>试试其他名称，或清除搜索条件。</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" onClick={() => setQuery('')}>清除搜索</Button></EmptyContent></Empty>}
        </CardContent>
      </Card>
    </div>
  );
}
