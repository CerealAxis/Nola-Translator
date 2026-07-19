import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  CheckmarkCircleRegular,
  DeleteRegular,
  DismissRegular,
  FolderRegular,
  HardDriveRegular,
} from '@fluentui/react-icons'

import type { EngineEvent, ResourceRecord, ResourceSnapshot } from '../../shared/contracts'

const phaseLabels: Record<NonNullable<ResourceRecord['phase']>, string> = {
  resolve: '正在查找下载资源',
  download: '正在下载',
  verify: '正在校验',
  install: '正在安装',
  remove: '正在删除',
  cleanup: '正在清理临时文件',
}

const errorLabels: Record<string, string> = {
  networkUnavailable: '网络连接不可用，请检查代理或稍后重试',
  integrityCheckFailed: '文件校验失败，请重新下载',
  installFailed: '安装失败，请在“诊断”页复制信息',
  resourceInUse: '字幕正在使用该资源，请先停止字幕',
}

function formatBytes(value?: number): string {
  if (!value) return '大小由下载源提供'
  const units = ['B', 'KB', 'MB', 'GB']
  let current = value
  let unit = 0
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024
    unit += 1
  }
  return `${current >= 100 || unit === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unit]}`
}

function ResourceStatus({ resource }: { resource: ResourceRecord }): React.JSX.Element {
  if (resource.state === 'failed') {
    return <span className="resource-status error-status">{errorLabels[resource.errorCode ?? ''] ?? '操作失败'}</span>
  }
  if (resource.state !== 'idle') {
    return <span className="resource-status working-status">{resource.phase ? phaseLabels[resource.phase] : '正在处理'}</span>
  }
  return resource.installed
    ? <span className="resource-status installed-status"><CheckmarkCircleRegular aria-hidden />已安装 · {formatBytes(resource.installedBytes)}</span>
    : <span className="resource-status">未安装 · {formatBytes(resource.downloadBytes)}</span>
}

type ResourceActionProps = {
  resource: ResourceRecord
  onAction: (resource: ResourceRecord, action: 'install' | 'remove' | 'cancel') => void
}

function ResourceAction({ resource, onAction }: ResourceActionProps): React.JSX.Element {
  if (resource.state !== 'idle' && resource.state !== 'failed') {
    if (resource.cancellable) {
      return <button className="button secondary-button compact-button" onClick={() => onAction(resource, 'cancel')} type="button"><DismissRegular aria-hidden />取消</button>
    }
    return <button className="button secondary-button compact-button" disabled type="button">处理中</button>
  }
  if (resource.installed) {
    return <button className="button secondary-button compact-button" onClick={() => onAction(resource, 'remove')} type="button"><DeleteRegular aria-hidden />删除</button>
  }
  return <button className="button primary-button compact-button" onClick={() => onAction(resource, 'install')} type="button"><ArrowDownloadRegular aria-hidden />{resource.state === 'failed' ? '重试' : '安装'}</button>
}

function ResourceProgress({ resource }: { resource: ResourceRecord }): React.JSX.Element | null {
  if (resource.state !== 'running' && resource.state !== 'cancelling') return null
  return (
    <div className="resource-progress" aria-label={resource.progress == null ? '正在处理' : `进度 ${Math.round(resource.progress * 100)}%`}>
      <div className={resource.progress == null ? 'resource-progress-fill indeterminate' : 'resource-progress-fill'} style={resource.progress == null ? undefined : { width: `${Math.max(2, resource.progress * 100)}%` }} />
    </div>
  )
}

export function ResourcesPage(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot>({ storagePath: '正在读取…', resources: [] })
  const [notice, setNotice] = useState('此页面只在你点击“安装”后访问网络。')
  const [loading, setLoading] = useState(true)
  const api = window.fluentCaptions

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) return
    setLoading(true)
    try {
      setSnapshot(await api.listResources())
      setNotice('资源状态已刷新。字幕启动时不会自动下载任何内容。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法读取资源状态')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (!api) {
      setLoading(false)
      setNotice('本地引擎接口不可用。')
      return
    }
    void refresh()
    return api.onEngineEvent((event: EngineEvent) => {
      if (event.type !== 'resourceChanged') return
      setSnapshot((current) => ({
        ...current,
        resources: current.resources.map((item) => item.resourceId === event.resource.resourceId ? event.resource : item),
      }))
      if (event.resource.state === 'failed') {
        setNotice(errorLabels[event.resource.errorCode ?? ''] ?? `${event.resource.name} 操作失败。`)
      } else if (event.resource.state === 'idle') {
        setNotice(event.resource.installed ? `${event.resource.name} 已安装。` : `${event.resource.name} 已删除。`)
      }
    })
  }, [api, refresh])

  const recognition = useMemo(() => snapshot.resources.filter((item) => item.kind === 'recognitionModel'), [snapshot.resources])
  const translation = useMemo(() => snapshot.resources.filter((item) => item.kind === 'translationPackage'), [snapshot.resources])
  const installedBytes = useMemo(() => snapshot.resources.reduce((total, item) => total + item.installedBytes, 0), [snapshot.resources])

  const act = async (resource: ResourceRecord, action: 'install' | 'remove' | 'cancel'): Promise<void> => {
    if (!api) return
    if (action === 'remove' && !window.confirm(`确定删除“${resource.name}”吗？之后需要重新下载才能使用。`)) return
    try {
      const next = await api.manageResource(resource.resourceId, action)
      setSnapshot((current) => ({ ...current, resources: current.resources.map((item) => item.resourceId === next.resourceId ? next : item) }))
      setNotice(action === 'install' ? `已开始安装 ${resource.name}。` : action === 'remove' ? `正在删除 ${resource.name}。` : `正在取消 ${resource.name} 的下载。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '资源操作失败')
    }
  }

  return (
    <div className="page resources-page">
      <header className="page-heading">
        <div><h1>模型与语言包</h1><p>{notice}</p></div>
        <button className="button secondary-button" disabled={loading} onClick={() => void refresh()} type="button"><ArrowClockwiseRegular aria-hidden />刷新</button>
      </header>

      <section className="surface storage-summary">
        <span className="summary-icon"><HardDriveRegular aria-hidden /></span>
        <div><strong>本地资源存储</strong><span className="storage-path" title={snapshot.storagePath}>{snapshot.storagePath}</span></div>
        <div className="storage-size"><small>已安装资源</small><strong>{formatBytes(installedBytes)}</strong></div>
      </section>

      <section className="resource-section" aria-labelledby="recognition-resources">
        <div className="section-heading-row"><div><h2 id="recognition-resources">语音识别模型</h2><p>安装后才能选择对应模式；开始字幕只做本地校验。</p></div></div>
        <div className="recognition-resource-grid">
          {recognition.map((resource) => (
            <article className="surface resource-card" key={resource.resourceId}>
              <div className="resource-card-top"><span className="resource-provider-icon"><FolderRegular aria-hidden /></span><span className="badge">{resource.provider}</span></div>
              <h3>{resource.name}</h3><p>{resource.description}</p>
              <div className="resource-card-footer"><ResourceStatus resource={resource} /><ResourceAction resource={resource} onAction={(item, action) => void act(item, action)} /></div>
              <ResourceProgress resource={resource} />
            </article>
          ))}
        </div>
      </section>

      <section className="surface package-surface" aria-labelledby="translation-resources">
        <div className="card-heading-row"><div><h2 id="translation-resources">Argos 本地翻译语言包</h2><p>语言包是有方向的；例如 English → 简体中文不包含反向翻译。</p></div><span className="badge">{translation.filter((item) => item.installed).length} 已安装</span></div>
        <div className="package-list">
          {translation.map((resource) => (
            <div className="package-row" key={resource.resourceId}>
              <div className="package-title"><strong>{resource.name}</strong><small>Argos Translate · 离线</small></div>
              <ResourceStatus resource={resource} />
              <ResourceAction resource={resource} onAction={(item, action) => void act(item, action)} />
              <ResourceProgress resource={resource} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
