import { Check, CircleCheck, CircleX, Copy, Download, Ellipsis, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ColorPairs() {
  return <div className="foundation-board" data-scene="appearance-color">
    <div className="fa-themes">{(['light', 'dark'] as const).map(appearance =>
      <figure className="foundation-palette fa-theme" data-appearance={appearance} key={appearance}>
        <figcaption>{appearance === 'light' ? '浅色' : '深色'}</figcaption>
        <Card>
          <CardHeader><CardTitle>资料库</CardTitle></CardHeader>
          <CardContent className="fa-options">
            <div className="fa-option fa-option--selected"><span>海岸观察</span><Check aria-hidden="true" /></div>
            <div className="fa-option"><span>山地路线</span></div>
            <div className="fa-option"><span>城市漫步</span></div>
          </CardContent>
        </Card>
      </figure>
    )}</div>
    <div className="fa-statuses">
      <span className="fa-success"><CircleCheck aria-hidden="true" />已同步</span>
      <span className="fa-warning"><TriangleAlert aria-hidden="true" />空间不足</span>
      <span className="fa-danger"><CircleX aria-hidden="true" />上传失败</span>
    </div>
  </div>;
}

export function AppearancePair() {
  return <div className="foundation-board" data-scene="appearance-dark-mode">
    <div className="fa-themes">{(['light', 'dark'] as const).map(appearance =>
      <figure className="foundation-palette fa-theme" data-appearance={appearance} key={appearance}>
        <figcaption>{appearance === 'light' ? '浅色' : '深色'}</figcaption>
        <Card>
          <CardHeader><CardTitle>海岸观察</CardTitle><CardDescription>今天 16:42 更新</CardDescription></CardHeader>
          <CardContent className="fa-appearance-content">
            <p>潮水退去，礁石间留下了清澈的水潭。</p>
            <div className="fa-appearance-toolbar"><span>12 篇笔记</span><Button variant="outline" size="icon" aria-label="更多"><Ellipsis /></Button></div>
            <div className="fa-context-menu"><span><Copy aria-hidden="true" />复制内容</span><span><Download aria-hidden="true" />导出文件</span></div>
          </CardContent>
        </Card>
      </figure>
    )}</div>
  </div>;
}

export function TypeSpecimen() {
  return <div className="foundation-board" data-scene="appearance-typography">
    <article className="fa-type-article">
      <header><p className="fa-caption">观察手记 · 6 月 18 日</p><h2 className="fa-page-title">退潮后的海湾</h2></header>
      <section><h3 className="fa-panel-title">礁石之间</h3><p className="fa-reading">海水慢慢退去，潮间带露出一道道细密的纹理。沿着岸边向前走，浅水中还能看见小鱼游动。</p></section>
      <footer className="fa-caption">记录人 林青 · 阅读约 2 分钟</footer>
    </article>
    <dl className="fa-type-key"><div><dt>标题</dt><dd>title-1</dd></div><div><dt>分节</dt><dd>title-3</dd></div><div><dt>正文</dt><dd>reading</dd></div><div><dt>附加信息</dt><dd>caption</dd></div></dl>
  </div>;
}

export function MaterialLayers() {
  return <div className="foundation-board" data-scene="appearance-materials">
    <div className="fa-material-scene">
      <div className="fa-media">
        <svg className="fa-media-image" viewBox="0 0 640 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="640" height="260" fill="var(--muted-surface)" />
          <path d="M0 145 Q160 65 320 145 T640 145 V260 H0Z" fill="var(--border)" />
          <path d="M0 205 Q210 105 420 205 T840 205 V260 H0Z" fill="var(--muted)" />
        </svg>
        <p className="fa-caption-overlay">海风带来了远处的潮声。</p>
      </div>
      <div className="fa-material-toolbar"><span>海湾片段 · 00:12</span><Button variant="outline" size="icon" aria-label="更多"><Ellipsis /></Button></div>
      <Card className="fa-material-menu"><CardContent><span><Copy aria-hidden="true" />复制字幕</span><span><Download aria-hidden="true" />导出片段</span></CardContent></Card>
    </div>
  </div>;
}

export function LayoutPair() {
  return <div className="foundation-board" data-scene="appearance-layout">
    <div className="fa-layouts">{(['wide', 'narrow'] as const).map(width =>
      <figure key={width}>
        <figcaption>{width === 'wide' ? '宽窗口' : '窄窗口'}</figcaption>
        <div className="fa-layout-window"><div className="fa-layout-title">海岸手记</div>
          <div className={'fa-page fa-page--' + width}>
            <section><span>原文</span><p lang="en">The tide is going out. Small pools remain among the rocks.</p></section>
            <section><span>译文</span><p>潮水正在退去，礁石间留下了一汪汪小水潭。</p></section>
          </div>
        </div>
      </figure>
    )}</div>
  </div>;
}

export function MotionUpdate() {
  const [corrected, setCorrected] = useState(false);
  return <div className="foundation-board" data-scene="appearance-motion">
    <div className="fa-motion">
      <div className="fa-motion-bar"><h3>字幕校对</h3>
        <Button variant="outline" onClick={() => setCorrected(!corrected)}>
          {corrected ? '撤销校对' : '应用校对'}
        </Button>
      </div>
      <div className="fa-line"><time>00:08</time><span>请沿着海岸走。</span></div>
      <div className="fa-line" data-updated={corrected} aria-live="polite" aria-atomic="true">
        <time>00:12</time><span>{corrected ? '在灯塔前向左转。' : '在灯塔前向右转。'}</span>
      </div>
    </div>
  </div>;
}
