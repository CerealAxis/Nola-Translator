import { useRef, useState, type FormEvent } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast, ToastProvider } from '@/components/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type TargetLanguage = 'zh-CN' | 'ja' | 'zh-TW';
type Density = 'compact' | 'comfortable';

const targets: Record<TargetLanguage, { label: string; translation: string }> = {
  'zh-CN': { label: '简体中文', translation: '下一站是中央车站。' },
  ja: { label: '日本語', translation: '次は中央駅です。' },
  'zh-TW': { label: '繁體中文', translation: '下一站是中央車站。' },
};

export function Specimen() {
  const [density, setDensity] = useState<Density>('compact');
  const [name, setName] = useState('旅途字幕');
  const [target, setTarget] = useState<TargetLanguage>('zh-CN');
  const [saved, setSaved] = useState<{ name: string; target: TargetLanguage }>();
  const [nameError, setNameError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError('请输入方案名称');
      nameInputRef.current?.focus();
      return;
    }

    setName(cleanName);
    setNameError('');
    setSaved({ name: cleanName, target });
    showToast({ type: 'success', title: '方案已保存', description: `${cleanName} · ${targets[target].label}` });
  }

  return (
    <div className="vis-specimen" data-density={density}>
      <header className="vis-specimen__toolbar">
        <span className="vis-specimen__toolbar-title"><PanelsTopLeft aria-hidden="true" />实时预览</span>
        <ToggleGroup className="vis-specimen__density" aria-label="布局密度" value={[density]} onValueChange={([next]) => {
          if (next === 'compact' || next === 'comfortable') setDensity(next);
        }}>
          <ToggleGroupItem value="compact">紧凑</ToggleGroupItem>
          <ToggleGroupItem value="comfortable">舒展</ToggleGroupItem>
        </ToggleGroup>
      </header>

      <Card className="vis-specimen__card">
        <CardHeader>
          <CardTitle>{saved?.name ?? '字幕方案'}</CardTitle>
          <CardDescription>{saved ? `英语 → ${targets[saved.target].label}` : '原文语言：英语'}</CardDescription>
        </CardHeader>
        <form onSubmit={save} noValidate>
          <CardContent className="vis-specimen__content">
            <FieldGroup>
              <Field data-invalid={nameError ? true : undefined}>
                <FieldLabel htmlFor="vis-specimen-name">方案名称</FieldLabel>
                <Input
                  required
                  ref={nameInputRef}
                  id="vis-specimen-name"
                  value={name}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? 'vis-specimen-name-error' : undefined}
                  onChange={event => {
                    setName(event.target.value);
                    if (nameError && event.target.value.trim()) setNameError('');
                  }}
                />
                <FieldError id="vis-specimen-name-error">{nameError}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="vis-specimen-target">目标语言</FieldLabel>
                <Select value={target} onValueChange={value => {
                  if (value === 'zh-CN' || value === 'ja' || value === 'zh-TW') setTarget(value);
                }}>
                  <SelectTrigger id="vis-specimen-target"><SelectValue>{targets[target].label}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="zh-CN">简体中文</SelectItem>
                      <SelectItem value="ja">日本語</SelectItem>
                      <SelectItem value="zh-TW">繁體中文</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="vis-specimen__actions">
            <Dialog>
              <DialogTrigger render={<Button type="button" variant="outline" />}>预览字幕</DialogTrigger>
              <DialogContent className="vis-specimen__dialog">
                <DialogHeader>
                  <DialogTitle>字幕预览</DialogTitle>
                  <DialogDescription>English → {targets[target].label}</DialogDescription>
                </DialogHeader>
                <CardContent className="vis-specimen__preview">
                  <div className="vis-specimen__preview-row">
                    <span className="vis-specimen__preview-label">原文</span>
                    <p className="vis-specimen__preview-text" lang="en">The next stop is Central Station.</p>
                  </div>
                  <div className="vis-specimen__preview-row">
                    <span className="vis-specimen__preview-label">译文</span>
                    <p className="vis-specimen__preview-text" lang={target}>{targets[target].translation}</p>
                  </div>
                </CardContent>
                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="outline" />}>关闭</DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button type="submit">保存方案</Button>
          </CardFooter>
        </form>
      </Card>
      <ToastProvider />
    </div>
  );
}

export default Specimen;
