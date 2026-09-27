import { useI18n } from '../i18n'
import { useEffect, useState } from 'react'
import { FolderRegular } from '@fluentui/react-icons'
import type { ModelStorageInfo } from '../../shared/bridge'

export function ModelStorageSettings(): React.JSX.Element | null {
  const { t } = useI18n()
  const [storage, setStorage] = useState<ModelStorageInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const api = window.fluentCaptions

  useEffect(() => {
    if (!api?.getModelStorage) return
    void api.getModelStorage().then(setStorage).catch(() => setError('无法读取模型存储目录'))
  }, [api])

  const choose = async (): Promise<void> => {
    if (!api || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api.chooseModelStorageDirectory()
      if (result) setStorage(result)
    } catch {
      setError('无法使用该目录，请选择可写入的本地文件夹。')
    } finally {
      setBusy(false)
    }
  }

  const restart = async (): Promise<void> => {
    if (!api || busy) return
    if (!window.confirm(t('重启会停止当前字幕与下载。确定现在重启吗？'))) return
    setBusy(true)
    try { await api.restartApp() } catch { setError('无法重启，请手动关闭并重新打开应用。'); setBusy(false) }
  }

  if (!storage && !error) return null
  return (
    <section className="surface model-storage-settings" aria-label={t("模型下载位置")}>
      <div className="section-heading-row">
        <div><h2>{t("模型下载位置")}</h2><p>{t("识别模型、翻译模型及下载缓存可存放在其他磁盘。")}</p></div>
        <button className="button secondary-button" disabled={busy} onClick={() => void choose()} type="button"><FolderRegular aria-hidden />{t("更改目录")}</button>
      </div>
      {storage && <>
        <p>{t("当前目录：")}<span className="storage-path">{storage.activePath}</span></p>
        {storage.restartRequired && <div role="status">
          <p>{t("重启后使用：")}<span className="storage-path">{storage.configuredPath}</span></p>
          <p>{t("需要时复制原目录中的 models 文件夹。")}</p>
          <p>{t("重启前的下载仍写入当前目录。")}</p>
          <button className="button primary-button" disabled={busy} onClick={() => void restart()} type="button">{t("重启并应用")}</button>
        </div>}
      </>}
      {error && <p role="alert">{t(error)}</p>}
    </section>
  )
}
