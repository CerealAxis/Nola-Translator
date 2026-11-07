import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import '../foundation-theme.css';

export default function Demo() {
  return (
    <div className="nola-component-demo foundation-demo" inert>
      <div className="foundation-board grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4" data-scene="media-branding">
        {[false, true].map((focused) => (
          <figure key={String(focused)} className="grid min-w-0 gap-2">
            <Card>
              <CardHeader><CardTitle>术语库</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <ul className="grid gap-1">
                  <li className="flex items-center justify-between gap-2 rounded-md px-3 py-2" style={{ background: focused ? 'var(--selection)' : 'var(--muted-surface)', color: focused ? 'var(--selection-foreground)' : 'var(--foreground)' }}>
                    <span>登机口</span><Check size={16} aria-label="已选中" />
                  </li>
                  <li className="px-3 py-2">行李提取</li>
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button variant={focused ? 'outline' : 'default'}>筛选</Button>
                  <Button variant={focused ? 'outline' : 'default'}>导出</Button>
                </div>
              </CardContent>
            </Card>
            <figcaption>{focused ? '蓝色指示当前选择' : '辅助工具都用蓝色'}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
