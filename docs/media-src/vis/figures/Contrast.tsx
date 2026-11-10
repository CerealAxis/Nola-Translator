import { CheckCircle2, CircleAlert, Clock3, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function Example({ label, children }: { label: string; children: ReactNode }) {
  return <figure className="fig-contrast-example"><figcaption>{label}</figcaption>{children}</figure>;
}

function ApplicationTable() {
  return <Table><TableHeader><TableRow><TableHead>应用名称</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>
    <TableRow><TableCell>应用 A</TableCell><TableCell><span className="fig-contrast-status fig-contrast-status--success"><CheckCircle2 aria-hidden="true" />运行中</span></TableCell></TableRow>
    <TableRow><TableCell>应用 B</TableCell><TableCell><span className="fig-contrast-status"><Clock3 aria-hidden="true" />未启动</span></TableCell></TableRow>
    <TableRow><TableCell>应用 C</TableCell><TableCell><span className="fig-contrast-status fig-contrast-status--danger"><CircleAlert aria-hidden="true" />异常</span></TableCell></TableRow>
  </TableBody></Table>;
}

export function Scene({ scene }: { scene: string }) {
  let content: ReactNode;

  if (scene === 'contrast-actions') {
    content = <div className="fig-contrast-pair">
      <Example label="主次明确"><Card><CardHeader><CardTitle>提交申请</CardTitle><CardDescription>申请编号 2026-001</CardDescription></CardHeader><CardContent>请确认填写内容后提交。</CardContent><CardFooter className="fig-contrast-actions"><Button variant="outline">检查</Button><Button>提交</Button></CardFooter></Card></Example>
      <Example label="主次不明"><Card><CardHeader><CardTitle>提交申请</CardTitle><CardDescription>申请编号 2026-001</CardDescription></CardHeader><CardContent>请确认填写内容后提交。</CardContent><CardFooter className="fig-contrast-actions"><Button>检查</Button><Button>提交</Button></CardFooter></Card></Example>
    </div>;
  } else if (scene === 'contrast-neutral') {
    content = <div className="fig-contrast-single"><Card><CardHeader><CardTitle>申请详情</CardTitle><CardDescription>申请编号 REQ-2048</CardDescription></CardHeader><CardContent>申请人：林青　当前状态：待审核</CardContent><CardFooter className="fig-contrast-actions"><Button variant="outline">驳回</Button><Button variant="outline">通过</Button></CardFooter></Card></div>;
  } else if (scene === 'contrast-hierarchy') {
    content = <div className="fig-contrast-pair">
      <Example label="总分层次清楚"><Card><CardHeader><CardTitle>服务概览</CardTitle><CardDescription>今日运行情况</CardDescription></CardHeader><CardContent><div className="fig-contrast-metric"><strong>12,804 次</strong><span>当前访问量</span></div></CardContent><CardFooter>较昨日增加 12%</CardFooter></Card></Example>
      <Example label="层次不清"><Card className="fig-contrast-flat"><CardHeader><CardTitle>服务概览</CardTitle><CardDescription>今日运行情况</CardDescription></CardHeader><CardContent><p>当前访问量 12,804 次</p><p>较昨日增加 12%</p></CardContent></Card></Example>
    </div>;
  } else if (scene === 'contrast-state') {
    content = <div className="fig-contrast-wide"><Card><CardHeader><CardTitle>应用状态</CardTitle><CardDescription>图标与文字一起标识状态</CardDescription></CardHeader><CardContent><ApplicationTable /></CardContent></Card></div>;
  } else if (scene === 'repetition-style') {
    content = <div className="fig-contrast-pair">
      {['资料整理', '活动安排'].map((task, index) => <Card key={task}><CardHeader><CardTitle>{task}</CardTitle></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor={`name-${index}`}>项目名称</FieldLabel><Input id={`name-${index}`} value={task} readOnly /></Field><Field><FieldLabel htmlFor={`owner-${index}`}>负责人</FieldLabel><Input id={`owner-${index}`} value={index ? '许然' : '林青'} readOnly /></Field></FieldGroup></CardContent><CardFooter className="fig-contrast-actions"><Button variant="outline">取消</Button><Button>提交</Button></CardFooter></Card>)}
    </div>;
  } else {
    content = <div className="fig-contrast-wide"><Card><CardHeader><CardTitle>项目列表</CardTitle><CardDescription>相同类型的值与操作使用相同格式</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>项目名称</TableHead><TableHead>负责人</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {['数据分析', '消息中心', '日志管理'].map(name => <TableRow key={name}><TableCell>{name}</TableCell><TableCell>王明</TableCell><TableCell><Button variant="outline" size="sm"><Pencil aria-hidden="true" />编辑</Button></TableCell></TableRow>)}
    </TableBody></Table></CardContent></Card></div>;
  }

  return <div className="fig-board" data-scene={scene} inert>{content}</div>;
}

export default Scene;
