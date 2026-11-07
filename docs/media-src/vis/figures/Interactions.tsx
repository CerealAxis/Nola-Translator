import type { ReactNode } from 'react';
import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { Check, CircleAlert, FileUp, FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import './Interactions.css';

function ProgressBar({ value, max = 100, className, label }: { value: number; max?: number; className?: string; label: string }) {
  return <ProgressPrimitive.Root value={value} max={max} className={className} data-slot="progress" aria-label={label}>
    <ProgressPrimitive.Track className="fig-progress-track"><ProgressPrimitive.Indicator className="fig-progress-indicator" /></ProgressPrimitive.Track>
  </ProgressPrimitive.Root>;
}

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return <figure className="fig-interaction-frame"><figcaption>{label}</figcaption>{children}</figure>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="fig-interaction-panel"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}

function UploadPanel({ active = false }: { active?: boolean }) {
  return <div className="fig-upload-example">
    <Card size="sm" className="fig-upload-zone" data-active={active || undefined}><CardContent><FileUp aria-hidden="true" /><strong>点击或将文件拖到这里导入</strong><span>支持 PDF、DOCX 和图片</span></CardContent></Card>
    {active && <div className="fig-upload-files"><div><span>调研提纲.pdf</span><ProgressBar value={60} label="调研提纲上传进度" /></div><div><span>流程草图.png</span><ProgressBar value={38} label="流程草图上传进度" /></div></div>}
  </div>;
}

function EmptyProjects() {
  return <Panel title="项目列表">
    <Empty><EmptyHeader><EmptyMedia variant="icon"><FolderOpen aria-hidden="true" /></EmptyMedia><EmptyTitle>暂无项目</EmptyTitle><EmptyDescription>添加第一个项目，开始整理工作。</EmptyDescription></EmptyHeader><EmptyContent><Button><Plus aria-hidden="true" />添加项目</Button></EmptyContent></Empty>
  </Panel>;
}

function TaskPanel({ phase }: { phase: 'ready' | 'running' | 'done' | 'error' }) {
  return <div className="fig-task-example">
    {phase === 'ready' && <Button>提交任务</Button>}
    {phase === 'running' && <Button disabled>正在提交 <Spinner /></Button>}
    {phase === 'done' && <span className="fig-interaction-status"><Check aria-hidden="true" />提交完成</span>}
    {phase === 'error' && <span className="fig-interaction-status"><CircleAlert aria-hidden="true" />提交失败</span>}
  </div>;
}

function SceneContent({ scene }: { scene: string }) {
  switch (scene) {
    case 'drag-states': return <div className="fig-interaction-pair"><Frame label="常态"><UploadPanel /></Frame><Frame label="可放置"><UploadPanel active /></Frame></div>;
    case 'invitation-empty': return <div className="fig-interaction-single"><Frame label="空列表中的下一步"><EmptyProjects /></Frame></div>;
    case 'task-states': return <div className="fig-task-states"><TaskPanel phase="ready" /><TaskPanel phase="running" /><TaskPanel phase="done" /><TaskPanel phase="error" /></div>;
    default: return <div className="fig-interaction-single"><Frame label="项目列表"><EmptyProjects /></Frame></div>;
  }
}

export function Scene({ scene }: { scene: string }) {
  return <div className="fig-board" data-scene={scene} inert><SceneContent scene={scene} /></div>;
}

export default Scene;
