import { Checkbox } from '@base-ui/react/checkbox';
import { Fieldset } from '@base-ui/react/fieldset';
import { Check, Minus } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

function CheckBox({ label, checked = false, mixed = false }: { label: string; checked?: boolean; mixed?: boolean }) {
  return (
    <Checkbox.Root aria-label={label} className="fig-f-check" checked={checked} indeterminate={mixed} readOnly>
      <Checkbox.Indicator>{mixed ? <Minus size={12} /> : <Check size={12} />}</Checkbox.Indicator>
    </Checkbox.Root>
  );
}

function Option({ label, checked, mixed }: { label: string; checked?: boolean; mixed?: boolean }) {
  return <Field><FieldLabel className="fig-f-choice"><CheckBox label={label} checked={checked} mixed={mixed} /><span className="fig-f-choice-text">{label}</span></FieldLabel></Field>;
}

const apps = [
  ['订单中心', '运行中'], ['客户门户', '运行中'], ['库存查询', '已停止'], ['报表服务', '未启动'],
];

function VerticalSpacing() {
  return (
    <Tabs value="test" className="fig-f-tabbed">
      <TabsList aria-label="应用管理"><TabsTrigger value="test">测试管理</TabsTrigger><TabsTrigger value="cert">证书管理</TabsTrigger></TabsList>
      <TabsContent value="test">
        <Card className="fig-f-app-card">
          <CardHeader className="fig-f-gap-section"><CardTitle className="fig-f-gap-label">应用管理</CardTitle><CardDescription>创建于 5 月 12 日 · 林安</CardDescription></CardHeader>
          <CardContent className="fig-f-app-content">
            <div className="fig-f-actions fig-f-gap-tools"><Button type="button">添加应用</Button><Button type="button" variant="outline">启动</Button><Button type="button" variant="outline">停止</Button></div>
            <Table aria-label="应用列表">
              <TableHeader><TableRow><TableHead><CheckBox label="选择全部" mixed /></TableHead><TableHead>应用名称</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
              <TableBody>{apps.map(([name, state], index) => <TableRow key={name}>
                <TableCell><CheckBox label={name} checked={index === 0} /></TableCell>
                <TableCell>{name}</TableCell><TableCell>{state}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="fig-f-key" aria-label="纵向间距图例">
          <span data-mark="small">标题与说明 6px</span><span data-mark="medium">操作与表格 14px</span><span data-mark="large">分区 24px</span>
        </div>
      </TabsContent>
    </Tabs>
  );
}

const serviceGroups = [
  { title: '描述', rows: [['名称', '文件存储'], ['用途', '团队文档归档']] },
  { title: '连接', rows: [['协议', 'HTTPS'], ['端口', '443']] },
  { title: '配置', rows: [['容量', '200 GB'], ['备份', '每天 02:00']] },
  { title: '维护', rows: [['负责人', '陈静'], ['时间', '周日 06:00']] },
];

function SeparatedDetails() {
  return <>
    <Card className="fig-f-panel">
      <CardHeader><CardTitle>服务详情</CardTitle><CardDescription>共享资料库 · 生产环境</CardDescription></CardHeader>
      <CardContent className="fig-f-service">
        {serviceGroups.map(({ title, rows }, index) => <Fragment key={title}>
          {index > 0 && <Separator className="fig-f-rule" />}
          <section className="fig-f-detail-section">
            <strong>{title}</strong>
            <dl>{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
          </section>
        </Fragment>)}
      </CardContent>
    </Card>
    <div className="fig-f-panel fig-f-key"><span data-mark="separator">1px 分隔线划开信息组</span></div>
  </>;
}

function HorizontalSpacing() {
  return (
    <Tabs value="general" className="fig-f-tabbed">
      <TabsList aria-label="应用设置"><TabsTrigger value="general">基本设置</TabsTrigger><TabsTrigger value="advanced">高级设置</TabsTrigger></TabsList>
      <TabsContent value="general">
        <Card>
          <CardHeader><CardTitle>应用设置</CardTitle><CardDescription>设置名称和可见范围。</CardDescription></CardHeader>
          <CardContent className="fig-f-field-columns">
            <Field><FieldLabel htmlFor="fig-f-app-name">名称</FieldLabel><Input id="fig-f-app-name" value="订单中心" readOnly /></Field>
            <Fieldset.Root className="fig-f-choice-set">
              <Fieldset.Legend data-slot="field-label">可见范围</Fieldset.Legend>
              <div className="fig-f-choices"><Option label="成员" checked /><Option label="访客" /></div>
            </Fieldset.Root>
          </CardContent>
        </Card>
        <div className="fig-f-key"><span data-mark="large">字段组之间 24px</span></div>
      </TabsContent>
    </Tabs>
  );
}

function InlineSpacing() {
  return <>
    <Card className="fig-f-panel">
      <CardHeader><CardTitle>列表显示</CardTitle></CardHeader>
      <CardContent>
        <Fieldset.Root className="fig-f-choice-set">
          <Fieldset.Legend data-slot="field-label">显示范围</Fieldset.Legend>
          <div className="fig-f-choices">
            <div className="fig-f-measured-pair"><Option label="全部" mixed /><Option label="选项一" checked /></div>
            <Option label="选项二" /><Option label="选项三" checked />
          </div>
        </Fieldset.Root>
      </CardContent>
    </Card>
    <div className="fig-f-panel fig-f-key"><span data-mark="small">框与文字 8px</span><span data-mark="large">选项之间 24px</span></div>
  </>;
}

function TextAlignment() {
  return (
    <div className="fig-f-comparison">
      {[true, false].map(aligned => <figure key={String(aligned)}>
        <Card>
          <CardHeader><CardTitle>活动信息</CardTitle></CardHeader>
          <CardContent className="fig-f-reading" data-aligned={aligned}>
            <section><strong>春季设计交流会</strong><p>5 月 18 日 · 三层多功能厅</p></section>
            <section><strong>入场安排</strong><p>09:30 开始签到，请从东门入场。</p></section>
          </CardContent>
        </Card>
        <figcaption>{aligned ? '推荐 · 标题与正文共用一条起始线' : '不推荐 · 正文比标题缩进 24px'}</figcaption>
      </figure>)}
    </div>
  );
}

function FormAlignment() {
  return <>
    <Card className="fig-f-panel">
      <CardHeader><CardTitle>个人资料</CardTitle><CardDescription>基本信息与联系方式</CardDescription></CardHeader>
      <CardContent>
        <FieldGroup className="fig-f-profile">
          <Field><FieldLabel htmlFor="fig-f-birth">生日</FieldLabel><Input id="fig-f-birth" value="1996-03-21" readOnly /></Field>
          <Field><FieldLabel htmlFor="fig-f-mail">邮箱</FieldLabel><Input id="fig-f-mail" value="lin@example.com" readOnly /></Field>
          <Field><FieldLabel htmlFor="fig-f-about">描述</FieldLabel><div><Textarea id="fig-f-about" rows={2} value="喜欢摄影和周末徒步。" readOnly /><FieldDescription>显示在个人主页上。</FieldDescription></div></Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="fig-f-actions"><Button type="button">保存</Button><Button type="button" variant="outline">取消</Button></CardFooter>
    </Card>
    <div className="fig-f-panel fig-f-key">
      <span className="fig-f-wide-note" data-mark="axis">标签末端与输入框起点分别对齐</span>
      <span className="fig-f-narrow-note" data-mark="axis">换行后标签与输入框共用起点</span>
    </div>
  </>;
}

const ledger = [
  ['交通支出', '−128.00'], ['办公支出', '−2,356.80'], ['退款收入', '+86.50'], ['项目收入', '+4,250.00'],
];

function NumberAlignment() {
  return (
    <div className="fig-f-comparison">
      {[true, false].map(aligned => <figure key={String(aligned)}>
        <Card>
          <CardHeader><CardTitle>收支明细</CardTitle></CardHeader>
          <CardContent>
            <Table aria-label="收支明细" className="fig-f-ledger" data-aligned={aligned}>
              <TableHeader><TableRow><TableHead>项目</TableHead><TableHead>金额（元）</TableHead></TableRow></TableHeader>
              <TableBody>{ledger.map(([item, amount]) => {
                const point = amount.indexOf('.');
                return <TableRow key={item}><TableCell>{item}</TableCell>
                  <TableCell>{amount.slice(0, point)}<span className="fig-f-decimal">{amount.slice(point)}</span></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </CardContent>
        </Card>
        <figcaption>{aligned ? '推荐 · 小数点对齐' : '不推荐 · 小数点位置不一'}</figcaption>
      </figure>)}
    </div>
  );
}

const scenes = {
  'spacing-vertical': VerticalSpacing,
  'spacing-separator': SeparatedDetails,
  'spacing-horizontal': HorizontalSpacing,
  'spacing-inline': InlineSpacing,
  'alignment-text': TextAlignment,
  'alignment-form': FormAlignment,
  'alignment-numbers': NumberAlignment,
};

export function Scene({ scene }: { scene: string }) {
  const Content = scenes[scene as keyof typeof scenes];
  return <div className="fig-board fig-foundations" data-scene={scene} inert><Content /></div>;
}
