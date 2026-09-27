import { useI18n, type TranslationValues } from '../i18n'
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
import { DEFAULT_SETTINGS, type RecognitionModelId } from '../../shared/settings'
import { ModelStorageSettings } from '../components/ModelStorageSettings'

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

function formatBytes(value?: number): string | null {
  if (!value) return null
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
  const { t } = useI18n()
  if (resource.state === 'failed') {
    return <span className="resource-status error-status">{t(errorLabels[resource.errorCode ?? ''] ?? '操作失败')}</span>
  }
  if (resource.state !== 'idle') {
    return <span className="resource-status working-status">{t(resource.phase ? phaseLabels[resource.phase] : '正在处理')}</span>
  }
  return resource.installed
    ? <span className="resource-status installed-status"><CheckmarkCircleRegular aria-hidden />{t("已安装 · ")}{formatBytes(resource.installedBytes) ?? t('大小由下载源提供')}</span>
    : <span className="resource-status">{t("未安装 · ")}{formatBytes(resource.downloadBytes) ?? t('大小由下载源提供')}</span>
}

type ResourceActionProps = {
  resource: ResourceRecord
  selected?: boolean
  onAction: (resource: ResourceRecord, action: 'install' | 'remove' | 'cancel') => void
}

function ResourceAction({ resource, selected = false, onAction }: ResourceActionProps): React.JSX.Element {
  const { t } = useI18n()
  if (resource.state !== 'idle' && resource.state !== 'failed') {
    if (resource.cancellable) {
      return <button className="button secondary-button compact-button" onClick={() => onAction(resource, 'cancel')} type="button"><DismissRegular aria-hidden />{t("取消")}</button>
    }
    return <button className="button secondary-button compact-button" disabled type="button">{t("处理中")}</button>
  }
  if (resource.installed) {
    if (selected) return <button className="button secondary-button compact-button" disabled type="button">{t("当前使用")}</button>
    return <button className="button secondary-button compact-button" onClick={() => onAction(resource, 'remove')} type="button"><DeleteRegular aria-hidden />{t("删除")}</button>
  }
  return <button className="button primary-button compact-button" onClick={() => onAction(resource, 'install')} type="button"><ArrowDownloadRegular aria-hidden />{t(resource.state === 'failed' ? '重试' : '安装')}</button>
}

function ResourceProgress({ resource }: { resource: ResourceRecord }): React.JSX.Element | null {
  const { t } = useI18n()
  if (resource.state !== 'running' && resource.state !== 'cancelling') return null
  return (
    <div className="resource-progress" aria-label={resource.progress == null ? t('正在处理') : t('进度 {progress}%', { progress: Math.round(resource.progress * 100) })}>
      <div className={resource.progress == null ? 'resource-progress-fill indeterminate' : 'resource-progress-fill'} style={resource.progress == null ? undefined : { width: `${Math.max(2, resource.progress * 100)}%` }} />
    </div>
  )
}

export function ResourcesPage(): React.JSX.Element {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<ResourceSnapshot>({ storagePath: '正在读取…', resources: [] })
  const [selectedModelId, setSelectedModelId] = useState<RecognitionModelId>(DEFAULT_SETTINGS.recognition.modelId)
  const [notice, setNotice] = useState('此页面只在你点击“安装”后访问网络。')
  const [noticeValues, setNoticeValues] = useState<TranslationValues>({})
  const [loading, setLoading] = useState(true)
  const resourceName = (name: string): string => name.split(' → ').map((part) => t(part)).join(' → ')
  const api = window.fluentCaptions

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) return
    setLoading(true)
    try {
      const [nextSnapshot, settings] = await Promise.all([api.listResources(), api.getSettings()])
      setSnapshot(nextSnapshot)
      setSelectedModelId(settings.recognition.modelId)
      setNotice('资源状态已刷新。字幕启动时不会自动下载任何内容。')
    } catch {
      setNotice('无法读取资源状态')
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
    const unsubscribeEngine = api.onEngineEvent((event: EngineEvent) => {
      if (event.type !== 'resourceChanged') return
      setSnapshot((current) => ({
        ...current,
        resources: current.resources.map((item) => item.resourceId === event.resource.resourceId ? event.resource : item),
      }))
      setNoticeValues({ name: event.resource.name })
      if (event.resource.state === 'failed') {
        setNotice(errorLabels[event.resource.errorCode ?? ''] ?? '{name} 操作失败。')
      } else if (event.resource.state === 'idle') {
        setNotice(event.resource.installed ? '{name} 已安装。' : '{name} 已删除。')
      }
    })
    const unsubscribeSettings = api.onSettingsChanged((settings) => setSelectedModelId(settings.recognition.modelId))
    return () => {
      unsubscribeEngine()
      unsubscribeSettings()
    }
  }, [api, refresh])

  const recognition = useMemo(() => snapshot.resources.filter((item) => item.kind === 'recognitionModel'), [snapshot.resources])
  const translation = useMemo(() => snapshot.resources.filter((item) => item.kind === 'translationModel'), [snapshot.resources])
  const installedBytes = useMemo(() => snapshot.resources.reduce((total, item) => total + item.installedBytes, 0), [snapshot.resources])

  const act = async (resource: ResourceRecord, action: 'install' | 'remove' | 'cancel'): Promise<void> => {
    if (!api) return
    if (action === 'remove' && !window.confirm(t('确定删除“{name}”吗？之后需要重新下载才能使用。', { name: resourceName(resource.name) }))) return
    try {
      const next = await api.manageResource(resource.resourceId, action)
      setSnapshot((current) => ({ ...current, resources: current.resources.map((item) => item.resourceId === next.resourceId ? next : item) }))
      setNoticeValues({ name: resource.name })
      setNotice(action === 'install' ? '已开始安装 {name}。' : action === 'remove' ? '正在删除 {name}。' : '正在取消 {name} 的下载。')
    } catch {
      setNotice('资源操作失败')
    }
  }

  const selectModel = async (resource: ResourceRecord): Promise<void> => {
    if (!api || !resource.installed || resource.state !== 'idle') return
    try {
      const settings = await api.updateSettings({ recognition: { modelId: resource.resourceId as RecognitionModelId } })
      setSelectedModelId(settings.recognition.modelId)
      setNoticeValues({ name: resource.name })
      setNotice('{name} 已设为字幕默认识别模型。')
    } catch {
      setNotice('无法保存识别模型选择')
    }
  }

  return (
    <div className="page resources-page">
      <header className="page-heading">
        <div><h1>{t("模型与资源")}</h1><p>{t(notice, { ...noticeValues, name: resourceName(String(noticeValues.name ?? '')) })}</p></div>
        <button className="button secondary-button" disabled={loading} onClick={() => void refresh()} type="button"><ArrowClockwiseRegular aria-hidden />{t("刷新")}</button>
      </header>

      <section className="surface storage-summary">
        <span className="summary-icon"><HardDriveRegular aria-hidden /></span>
        <div><strong>{t("引擎数据目录")}</strong><span className="storage-path" title={snapshot.storagePath}>{snapshot.storagePath === '正在读取…' ? t('正在读取…') : snapshot.storagePath}</span></div>
        <div className="storage-size"><small>{t("已安装资源")}</small><strong>{formatBytes(installedBytes) ?? t('大小由下载源提供')}</strong></div>
      </section>

      <ModelStorageSettings />

      <section className="resource-section" aria-labelledby="recognition-resources">
        <div className="section-heading-row"><div><h2 id="recognition-resources">{t("语音识别模型")}</h2><p>{t("先在这里安装并选择模型；开始字幕只做本地校验，不会悄悄下载。")}</p></div><span className="badge">{t("当前：")}{resourceName(recognition.find((item) => item.resourceId === selectedModelId)?.name ?? '未选择')}</span></div>
        <div className="recognition-resource-grid">
          {recognition.map((resource) => (
            <article className="surface resource-card" key={resource.resourceId}>
              <div className="resource-card-top"><span className="resource-provider-icon"><FolderRegular aria-hidden /></span><span className="badge">{resource.provider}</span></div>
              <h3>{resourceName(resource.name)}</h3><p>{t(resource.description)}</p>
              <div className="resource-card-footer"><ResourceStatus resource={resource} /><ResourceAction resource={resource} selected={selectedModelId === resource.resourceId} onAction={(item, action) => void act(item, action)} /></div>
              <div className="resource-select-row">
                <button className={`button ${selectedModelId === resource.resourceId ? 'secondary-button selected-resource-button' : 'secondary-button'} compact-button`} disabled={!resource.installed || resource.state !== 'idle' || selectedModelId === resource.resourceId} onClick={() => void selectModel(resource)} type="button">
                  {selectedModelId === resource.resourceId ? <><CheckmarkCircleRegular aria-hidden />{t("当前使用")}</> : t('选择此模型')}
                </button>
                {resource.provider === 'qwen3-asr' && <small>{t("下载原始 BF16 权重，加载时以 NF4 4-bit 量化运行。")}</small>}
              </div>
              <ResourceProgress resource={resource} />
            </article>
          ))}
        </div>
      </section>

      <section className="surface package-surface" aria-labelledby="translation-resources">
        <div className="card-heading-row"><div><h2 id="translation-resources">{t("本地翻译模型")}</h2><p>{t("单个预量化文件，在本机 llama.cpp 上运行；开始字幕不会自动下载。")}</p></div><span className="badge">{translation.filter((item) => item.installed).length}{t(" 已安装")}</span></div>
        <div className="package-list">
          {translation.map((resource) => (
            <div className="package-row" key={resource.resourceId}>
              <div className="package-title"><strong>{resourceName(resource.name)}</strong><small>{t(resource.provider === 'hy-mt2' ? 'Hy-MT2 · 预量化文件' : 'Qwen3-ASR · 加载时量化')}</small></div>
              {resource.provider === 'hy-mt2' && <small>{t("预量化 Q4_K_M 文件，约 1.13GB。")}</small>}
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
