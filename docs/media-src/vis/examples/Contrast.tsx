import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';

const versions = [
  { title: '重点明确', previewVariant: 'outline' as const },
  { title: '重点不明', previewVariant: 'default' as const },
];

export default function Contrast() {
  const [saved, setSaved] = useState('');

  return (
    <div className="vis-example vis-example--contrast">
      <div className="vis-example__comparison">
        {versions.map(version => (
          <Card className="vis-example__card" key={version.title}>
            <CardHeader><CardTitle>{version.title}</CardTitle></CardHeader>
            <CardContent><p>旅途字幕 · English → 简体中文</p></CardContent>
            <CardFooter className="vis-example__actions">
              <Dialog>
                <DialogTrigger render={<Button type="button" variant={version.previewVariant} />}>预览字幕</DialogTrigger>
                <DialogContent className="vis-example__dialog">
                  <DialogHeader>
                    <DialogTitle>字幕预览</DialogTitle>
                    <DialogDescription>旅途字幕 · English → 简体中文</DialogDescription>
                  </DialogHeader>
                  <CardContent><p lang="en">The next stop is Central Station.</p><p>下一站是中央车站。</p></CardContent>
                  <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>关闭</DialogClose></DialogFooter>
                </DialogContent>
              </Dialog>
              <Button type="button" onClick={() => {
                setSaved(version.title);
                showToast({ type: 'success', title: '方案已保存', description: '旅途字幕 · 简体中文' });
              }}>保存方案</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <span className="vis-example__sr-only" role="status">{saved ? `${saved}的方案已保存` : ''}</span>
    </div>
  );
}
