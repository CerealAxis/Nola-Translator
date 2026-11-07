import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';

export default function ModelPopover() {
  return (
    <div className="vis-example vis-example--model-popover">
      <Card className="vis-example__card">
        <CardHeader><CardTitle>本地翻译模型</CardTitle></CardHeader>
        <CardContent>
          <div className="vis-example__model-row">
            <div><strong>Nola Lite MT</strong><span>已安装 · 文本翻译</span></div>
            <Popover>
              <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>查看详情</PopoverTrigger>
              <PopoverContent className="vis-example__popover" align="end">
                <PopoverHeader>
                  <PopoverTitle>Nola Lite MT</PopoverTitle>
                  <PopoverDescription>本地文本翻译模型</PopoverDescription>
                </PopoverHeader>
                <dl className="vis-example__model-facts"><dt>版本</dt><dd>1.2</dd><dt>来源</dt><dd>本地安装</dd><dt>状态</dt><dd>可用</dd></dl>
                <a className="vis-example__model-link" href="/zh-CN/getting-started/local-models">打开模型页</a>
              </PopoverContent>
            </Popover>
          </div>
          <div className="vis-example__model-row"><div><strong>Index Translate</strong><span>未安装 · 文本翻译</span></div><span>未安装</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
