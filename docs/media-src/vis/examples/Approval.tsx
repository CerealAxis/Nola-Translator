import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

type Decision = 'waiting' | 'accepted' | 'rejected';

export default function Approval() {
  const [decision, setDecision] = useState<Decision>('waiting');

  return (
    <div className="vis-example vis-example--approval">
      <Card className="vis-example__card">
        <CardHeader><CardTitle>工作台工具请求</CardTitle></CardHeader>
        <CardContent>
          <div className="vis-example__message"><span>Agent</span><p>我已找到 3 个术语。是否把它们加入“旅途字幕”术语库？</p></div>
          <div className="vis-example__tool-state" role="status">{decision === 'waiting' ? '等待批准 · 添加 3 个术语' : decision === 'accepted' ? '已接受 · 添加 3 个术语' : '已拒绝 · 未修改术语库'}</div>
        </CardContent>
        <CardFooter className="vis-example__actions">
          {decision === 'waiting' ? <>
            <Button type="button" variant="outline" onClick={() => setDecision('rejected')}>拒绝</Button>
            <Button type="button" onClick={() => setDecision('accepted')}>批准</Button>
          </> : <Button type="button" variant="outline" onClick={() => setDecision('waiting')}>重新演示</Button>}
        </CardFooter>
      </Card>
    </div>
  );
}
