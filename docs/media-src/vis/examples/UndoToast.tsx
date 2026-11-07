import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { showToast } from '@/components/ui/toast';

const initial = ['旅途字幕', '会议口译'];

export default function UndoToast() {
  const [items, setItems] = useState(initial);

  function remove(name: string) {
    setItems(previous => previous.filter(item => item !== name));
    showToast({
      type: 'info',
      title: `已移除${name}`,
      actionProps: {
        children: '撤销',
        onClick: () => setItems(previous => initial.filter(item => item === name || previous.includes(item))),
      },
    });
  }

  return (
    <div className="vis-example vis-example--undo-toast">
      <Card className="vis-example__card">
        <CardHeader><CardTitle>最近方案</CardTitle></CardHeader>
        <CardContent>
          {items.length ? <ul className="vis-example__item-list">
            {items.map(name => <li key={name}><span>{name}</span><Button type="button" size="sm" variant="outline" onClick={() => remove(name)}>移除</Button></li>)}
          </ul> : <Empty><EmptyHeader><EmptyTitle>暂无方案</EmptyTitle><EmptyDescription>可用提示中的“撤销”恢复刚移除的方案。</EmptyDescription></EmptyHeader><EmptyContent /></Empty>}
        </CardContent>
      </Card>
    </div>
  );
}
