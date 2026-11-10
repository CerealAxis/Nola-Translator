import Alibaba from '@lobehub/icons/es/Alibaba/components/Mono';
import Qwen from '@lobehub/icons/es/Qwen/components/Mono';
import { ArrowDownToLine, Check, Copy, Globe, Search } from 'lucide-react';
import nolaLogo from '../../../../assets/brand/nola-logo.svg';
import { Button } from '@/components/ui/button';

export function AppIconSizes() {
  return <div className="foundation-board fm-icon-appearances" data-scene="media-app-icons">
    {(['light', 'dark'] as const).map(appearance => (
      <figure className="foundation-palette fm-icon-strip" data-appearance={appearance} key={appearance}>
        <img src={nolaLogo} width="96" height="96" alt="Nola 应用图标" />
        <figcaption>{appearance === 'light' ? '浅色背景' : '深色背景'}</figcaption>
      </figure>
    ))}
  </div>;
}

export function ActionIcons() {
  return <div className="foundation-board fm-action-icons" data-scene="media-icons">
    <div className="fm-icon-comparison">
      <figure>
        <div className="fm-icon-vocabulary">
          <Button variant="outline" size="icon" aria-label="搜索"><Search aria-hidden="true" /></Button>
          <Button variant="outline" size="icon" aria-label="复制"><Copy aria-hidden="true" /></Button>
          <Button variant="outline" size="icon" aria-label="导出"><ArrowDownToLine aria-hidden="true" /></Button>
        </div>
        <figcaption>图标大小与线条一致</figcaption>
      </figure>
      <figure>
        <div className="fm-icon-vocabulary">
          <Button variant="outline"><ArrowDownToLine data-icon="inline-start" aria-hidden="true" />导出文本</Button>
        </div>
        <figcaption>图标与相邻文字对齐</figcaption>
      </figure>
    </div>
    <p className="fm-caption">两组图标均为 16 × 16px，独立图标按钮的操作区域为 36 × 36px。</p>
  </div>;
}

export function ProviderIcons() {
  return <div className="foundation-board" data-scene="media-providers">
    <ul className="fm-provider-list" aria-label="服务与模型标识">
      <li><Qwen size={20} aria-hidden="true" /><span><strong>Qwen</strong><span>模型系列</span></span></li>
      <li><Alibaba size={20} aria-hidden="true" /><span><strong>阿里云</strong><span>云端服务</span></span></li>
      <li><Globe size={20} aria-hidden="true" /><span><strong>其他兼容服务</strong><span>通用标识</span></span></li>
    </ul>
  </div>;
}

export function ImageResolution() {
  return <div className="foundation-board fm-resolution" data-scene="media-images">
    {[12, 24, 36].map((size, index) => {
      const pixels: string[] = [];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const centerX = (x + .5) / size;
          const centerY = (y + .5) / size;
          if (Math.hypot(centerX - .5, centerY - .5) < .38) pixels.push(`M${x} ${y}h1v1h-1z`);
        }
      }
      const grid = Array.from({ length: size - 1 }, (_, i) => {
        const line = i + 1;
        return `M${line} 0v${size}M0 ${line}h${size}`;
      }).join('');
      return <figure key={size}>
        <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true" shapeRendering="crispEdges">
          <path d={pixels.join('')} fill="var(--primary)" />
          <path d={grid} className="fm-pixel-grid" vectorEffect="non-scaling-stroke" />
        </svg>
        <figcaption><strong>@{index + 1}x</strong><span>{size} × {size} 像素</span></figcaption>
      </figure>;
    })}
  </div>;
}

export function LanguageNames() {
  return <div className="foundation-board" data-scene="media-inclusion">
    <ul className="fm-language-list" aria-label="界面语言示例">
      <li><span lang="zh-Hans">简体中文</span><Check aria-label="已选择" /></li>
      <li><span lang="zh-Hant">繁體中文（台灣）</span></li>
      <li><span lang="ja">日本語</span></li>
      <li><span lang="ko">한국어</span></li>
      <li><span lang="en">English</span></li>
    </ul>
  </div>;
}
