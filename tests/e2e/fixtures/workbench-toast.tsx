import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImageZoom } from '@/components/assistant-ui/native/image'
import { I18nProvider } from '@/i18n'
import { Button } from '@/components/ui/button'
import { showToast, ToastProvider } from '@/components/ui/toast'
import { MermaidZoom } from '@/components/assistant-ui/native/mermaid-diagram'
import '../../../src/renderer/workbench-entry.css'

const kind = new URLSearchParams(location.search).get('case') ?? 'toast'
const image = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22480%22%20height=%22320%22%20viewBox=%220%200%20480%20320%22%3E%3Crect%20width=%22480%22%20height=%22320%22%20fill=%22%232563eb%22/%3E%3C/svg%3E'

function App() {
  useEffect(() => {
    if (kind === 'toast') showToast({ type: 'success', title: '字幕已保存', description: '这场同传的字幕已写入本地记录。', actionProps: { children: '撤销', onClick: () => undefined }, duration: 12000 })
  }, [])
  return <I18nProvider readSettings={false}>
    {kind === 'toast' && <ToastProvider />}
    {kind === 'dialog' && <Dialog open><DialogContent><DialogCloseButton /><DialogHeader><DialogTitle>工作区和会话设置</DialogTitle><DialogDescription>管理工作台中的默认行为。</DialogDescription></DialogHeader><p>更改将在工作台中生效。</p><DialogFooter><Button variant="secondary">取消</Button><Button>保存</Button></DialogFooter></DialogContent></Dialog>}
    {kind === 'image' && <ImageZoom src={image} alt="示例图片" labels={{ zoom: '放大图片', zoomed: '放大后的图片', close: '关闭' }}><img src={image} alt="示例预览" width="192" height="128" /></ImageZoom>}
    {kind === 'mermaid' && <MermaidZoom svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#2563eb" /></svg>' labels={{ expand: '展开', diagram: '流程图', zoomIn: '放大', zoomOut: '缩小', reset: '重置', close: '关闭', rendering: '正在绘制', error: '无法绘制流程图' }}><div>流程图预览</div></MermaidZoom>}
  </I18nProvider>
}

document.documentElement.classList.add('native-agent-document')
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') ?? 'light'
createRoot(document.getElementById('root')!).render(<App />)
