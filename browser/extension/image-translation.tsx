import { Dialog } from '@base-ui/react/dialog'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../src/renderer/components/ui/button'
import { Card } from '../../src/renderer/components/ui/card'
import { showToast } from '../../src/renderer/components/ui/toast'
import { browserText, errorKey } from './i18n'
import { translateImage } from './provider-client'
import type { Preferences } from './preferences'

export interface ImageRect { x: number; y: number; width: number; height: number }

export function viewportRect(rect: ImageRect, width: number, height: number): ImageRect {
  const left = Math.max(0, Math.min(width, rect.x))
  const top = Math.max(0, Math.min(height, rect.y))
  const right = Math.max(left, Math.min(width, rect.x + rect.width))
  const bottom = Math.max(top, Math.min(height, rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export async function cropScreenshot(image: string, rect: ImageRect, viewport = { width: innerWidth, height: innerHeight }): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(image)).blob())
  try {
    const area = viewportRect(rect, viewport.width, viewport.height)
    if (area.width < 2 || area.height < 2) throw new Error('imageNotVisible')
    const sx = bitmap.width / viewport.width, sy = bitmap.height / viewport.height
    return encodeImage(bitmap, { x: area.x * sx, y: area.y * sy, width: area.width * sx, height: area.height * sy })
  } finally { bitmap.close() }
}

function encodeImage(bitmap: ImageBitmap, area: ImageRect) {
  const width = Math.ceil(area.width), height = Math.ceil(area.height)
  if (width * height > 16_000_000) throw new Error('imageTooLarge')
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('imageCaptureFailed')
  context.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, width, height)
  const result = canvas.toDataURL('image/png')
  if (result.length > 4_000_000) throw new Error('imageTooLarge')
  return result
}

export async function encodeClipboardImage(file: File): Promise<string> {
  if (file.size > 12_000_000) throw new Error('imageTooLarge')
  const bitmap = await createImageBitmap(file)
  try {
    return encodeImage(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height })
  } finally { bitmap.close() }
}

export function ImageTranslation({ initialRect, preferences, container, capture, close }: {
  initialRect: ImageRect; preferences: Preferences; container: HTMLElement
  capture(rect: ImageRect): Promise<string>; close(): void
}) {
  const t = browserText(preferences.uiLanguage)
  const [image, setImage] = useState('')
  const [result, setResult] = useState('')
  const [pending, setPending] = useState(false)
  const controller = useRef(new AbortController())
  const notifyError = (e: unknown, fallback: string) => {
    if (!controller.current.signal.aborted) showToast({ type: 'error', description: t(errorKey(e instanceof Error ? e.message : fallback)) })
  }
  useEffect(() => () => controller.current.abort(), [])
  useEffect(() => { void capture(initialRect).then(setImage).catch(e => notifyError(e, 'imageCaptureFailed')) }, [])
  return <Dialog.Root open onOpenChange={open => { if (!open) close() }}><Dialog.Portal container={container}><Dialog.Backdrop className="fixed inset-0 bg-nola-ui-backdrop" /><Dialog.Popup render={<Card />} className="nola-dialog-content" aria-describedby={undefined}>
    <Dialog.Title className="font-semibold">{t('imageTranslate')}</Dialog.Title>
    {image && <img src={image} alt={t('imageTranslate')} className="max-h-60 max-w-full object-contain" />}
    {result && <p dir="auto" className="whitespace-pre-wrap">{result}</p>}
    <div className="flex justify-end gap-2">{result && <Button variant="outline" onClick={() => { void Promise.resolve().then(() => navigator.clipboard.writeText(result)).then(() => showToast({ type: 'success', description: t('copied') })).catch(() => notifyError('imageCopyFailed', 'imageCopyFailed')) }}>{t('copyTranslation')}</Button>}<Button variant="outline" onClick={close}>{t('close')}</Button><Button disabled={!image || pending} onClick={() => { setPending(true); void translateImage(image, preferences.pageLanguage, controller.current.signal).then(setResult).catch(e => notifyError(e, 'providerRequestFailed')).finally(() => setPending(false)) }}>{t(pending ? 'translating' : 'imageTranslate')}</Button></div>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>
}
