import './dialog-gallery.css'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { AlertDialogContent, Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DownloadSourceDialog } from '@/features/models/DownloadSourceDialog'
import { ModelConfigurationDialog } from '@/features/models/ModelConfigurationDialog'
import { ExportDialog } from '@/features/records/ExportDialog'
import { I18nProvider } from '@/i18n'
import { showToast, ToastProvider } from '@/components/ui/toast'
import type { ResourceRecord } from '@/bridge'

const params = new URLSearchParams(location.search)
const kind = params.get('case') ?? 'standard'
const modelRecord: ResourceRecord = {
  resourceId: 'sensevoice-small', kind: 'recognitionModel', provider: 'sensevoice', name: 'SenseVoiceSmall',
  description: '', languages: ['zh', 'en', 'yue', 'ja', 'ko'], installed: true, installedBytes: 1,
  state: 'idle', cancellable: false,
}

function BackdropPage() {
  return <main className="dialog-gallery__page" aria-hidden="true">
    <Card><CardHeader><CardTitle>设置</CardTitle><CardDescription>应用首选项和通知</CardDescription></CardHeader><CardContent>语言、模型和字幕显示选项</CardContent></Card>
    <Card><CardHeader><CardTitle>通知</CardTitle></CardHeader><CardContent>成功、警告和错误通知会显示在这里。</CardContent></Card>
  </main>
}

function StandardDialog() {
  return <Dialog open><DialogContent>
    <DialogCloseButton />
    <DialogHeader><DialogTitle>选择下载源</DialogTitle><DialogDescription>SenseVoiceSmall</DialogDescription></DialogHeader>
    <div className="flex items-center gap-2 rounded-xl bg-surface-secondary p-2"><Button variant="secondary">🤗 Hugging Face</Button><Button variant="tertiary">HF-Mirror</Button><Button variant="tertiary">ModelScope</Button></div>
    <DialogFooter><Button variant="secondary">取消</Button><Button>重试</Button></DialogFooter>
  </DialogContent></Dialog>
}

function AlertDialogSample() {
  return <AlertDialog.Root open><AlertDialog.Portal>
    <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-nola-ui-backdrop" />
    <AlertDialogContent className="max-w-md">
      <DialogHeader><AlertDialog.Title data-slot="dialog-title">结束这场同传？</AlertDialog.Title><AlertDialog.Description data-slot="dialog-description">结束后可以在记录中查看本次字幕。</AlertDialog.Description></DialogHeader>
      <DialogFooter><Button variant="secondary">继续同传</Button><Button variant="danger">结束同传</Button></DialogFooter>
    </AlertDialogContent>
  </AlertDialog.Portal></AlertDialog.Root>
}

function ModelDialog() {
  return <Dialog open><DialogContent className="dialog-gallery__model model-configuration-dialog">
    <DialogHeader><DialogTitle>配置本地翻译模型</DialogTitle><DialogDescription>设置模型支持的语言和运行引擎。</DialogDescription></DialogHeader>
    <div className="dialog-gallery__model-body flex flex-col gap-4">
      {['翻译方向', '运行引擎', '源语言', '目标语言', '受限语言对'].map((label, index) => <label key={label} className="flex flex-col gap-2"><span>{label}</span><Input readOnly value={['中译英', 'llama.cpp', '中文、英语', '日语、韩语', '否'][index]} /></label>)}
    </div>
    <DialogFooter><Button variant="secondary">取消</Button><Button>保存配置</Button></DialogFooter>
  </DialogContent></Dialog>
}

function OnboardingDialog({ complete = false }: { complete?: boolean }) {
  return <Dialog open><DialogContent className="onboarding-dialog onboarding-welcome">
    {complete ? <DialogCloseButton aria-label="退出引导" /> : null}
    <CardHeader><CardTitle><DialogTitle>{complete ? '设置完成' : '诺拉翻译入门指南'}</DialogTitle></CardTitle><CardDescription>{complete ? '现在可以开始使用诺拉翻译。' : '本指南将带你完成模型配置并了解主要功能。'}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-2">{complete ? '你已经完成所有入门步骤。' : '1. 配置运行环境\n2. 选择识别和翻译模型\n3. 开始实时字幕翻译'}</CardContent>
    <DialogFooter className="w-full flex-col">
      <Button className="w-full">{complete ? '开始使用' : '开始引导'}</Button>
      <Button variant="secondary" className="w-full">{complete ? '关闭' : '暂不设置'}</Button>
    </DialogFooter>
  </DialogContent></Dialog>
}

function OnboardingStep() {
  return <div className="onboarding-tour z-onboarding"><Card size="sm" className="onboarding-tour__card onboarding-tour__card--center" role="dialog" aria-modal="false" aria-labelledby="onboarding-heading" aria-describedby="onboarding-body">
    <CardHeader><CardTitle id="onboarding-heading">选择识别模型</CardTitle><CardDescription id="onboarding-body">选择已安装的模型，随后配置字幕语言。</CardDescription><CardAction><Button variant="outline" size="icon" aria-label="退出引导"><X aria-hidden="true" /></Button></CardAction></CardHeader>
    <CardContent className="onboarding-tour__lesson"><p>当前步骤会介绍模型选择和安装方式。</p></CardContent>
    <CardFooter className="onboarding-tour__footer"><div className="onboarding-tour__navigation"><span className="onboarding-tour__progress">第 2 章<span>第 3 / 6 步</span></span><div className="onboarding-tour__actions"><Button variant="secondary" size="sm">上一步</Button><Button size="sm">下一步</Button></div></div><div className="onboarding-tour__secondary"><Button variant="tertiary" size="sm">跳过本步</Button><Button variant="tertiary" size="sm">跳过本章</Button></div></CardFooter>
  </Card></div>
}

function ToastSample() {
  useEffect(() => {
    showToast({ type: 'success', title: '字幕已保存', description: '这场同传的字幕已写入本地记录。', actionProps: { children: '撤销', onClick: () => undefined }, duration: 12000 })
  }, [])
  return <ToastProvider />
}

function OverlayConfirmation() {
  return <div className="fixed inset-0 z-overlay grid place-items-center bg-black/35">
    <Card className="nola-confirm-dialog dialog-gallery__overlay" role="dialog" aria-modal="true" aria-labelledby="overlay-title">
      <h2 id="overlay-title" className="nola-confirm-title">关闭悬浮字幕？</h2>
      <p className="nola-confirm-text">正在进行的同传会继续在后台运行。</p>
      <div className="nola-confirm-actions"><Button variant="secondary">取消</Button><Button>关闭窗口</Button></div>
    </Card>
  </div>
}

function App() {
  return <I18nProvider readSettings={false}>
    <BackdropPage />
    {kind === 'standard' ? <StandardDialog /> : null}
    {kind === 'alert' ? <AlertDialogSample /> : null}
    {kind === 'model' ? <ModelDialog /> : null}
    {kind === 'model-config' ? <ModelConfigurationDialog record={modelRecord} onClose={() => undefined} /> : null}
    {kind === 'export' ? <ExportDialog meetingId={null} isOpen onOpenChange={() => undefined} /> : null}
    {kind === 'onboarding' ? <OnboardingDialog /> : null}
    {kind === 'completion' ? <OnboardingDialog complete /> : null}
    {kind === 'onboarding-step' ? <OnboardingStep /> : null}
    {kind === 'model-source' ? <DownloadSourceDialog record={{ resourceId: 'sensevoice-small', name: 'SenseVoiceSmall' }} onClose={() => undefined} onSelect={() => undefined} /> : null}
    {kind === 'toast' ? <ToastSample /> : null}
    {kind === 'overlay' ? <OverlayConfirmation /> : null}
  </I18nProvider>
}

document.documentElement.dataset.theme = params.get('theme') ?? 'light'
createRoot(document.getElementById('root')!).render(<App />)
