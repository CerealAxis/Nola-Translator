import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { getBridge } from '@/store'
import { checkCredential } from '@/store/modelStore'
import { normalizeThrownError, restoreIpcError } from '../../../../shared/ipc-error'
import type { ChatGptPlanRequest, ChatGptPlanResult } from '../../../../shared/chatgpt-plan'
import { customCredentialSlot } from '../../../../shared/custom-models'
import { SettingsRow } from '../../settings/SettingsRow'
import { CloudModelListDialog, CloudModelTest } from './CloudModelTools'
import { CloudSourceHeader } from './CloudPreview'
import { useCloudPreviewCopy } from './cloud-preview-copy'
import type { Connection } from './cloud-preview-data'

const messages = {
  en: ['Continue with ChatGPT', 'Connected account', 'Disconnected', 'Allow ChatGPT plan usage', 'Disconnect', 'Finish signing in in your browser.', 'ChatGPT authorization or model loading failed.', 'Plan usage was declined. You can allow it here.', 'Signed out locally. You can revoke the connection in ChatGPT settings.', 'No models are available for this account.'],
  'zh-CN': ['使用 ChatGPT 继续', '已连接的账户', '未登录', '授权使用订阅额度', '断开连接', '请在浏览器里完成登录。', 'ChatGPT 授权或模型读取失败。', '尚未授权使用订阅额度，可在这里重新授权。', '已退出本地登录，可在 ChatGPT 设置中撤销连接。', '此账户暂无可用模型。'],
  'zh-TW': ['使用 ChatGPT 繼續', '已連線帳戶', '尚未登入', '授權使用訂閱額度', '中斷連線', '請在瀏覽器完成登入。', 'ChatGPT 授權或模型讀取失敗。', '尚未授權使用訂閱額度，可在此重新授權。', '已登出本機，可在 ChatGPT 設定中撤銷連線。', '此帳戶暫無可用模型。'],
  ja: ['ChatGPT で続行', '接続中のアカウント', '未ログイン', 'プランの利用を許可', '接続を解除', 'ブラウザでログインを完了してください。', 'ChatGPT の認証またはモデル一覧の取得に失敗しました。', 'プランの利用が許可されていません。', 'ローカルでログアウトしました。ChatGPT の設定で接続を解除できます。', 'このアカウントで利用可能なモデルがありません。'],
  ko: ['ChatGPT로 계속', '연결된 계정', '로그인하지 않음', '플랜 사용 허용', '연결 해제', '브라우저에서 로그인을 완료하세요.', 'ChatGPT 인증 또는 모델 목록을 불러오지 못했습니다.', '플랜 사용이 허용되지 않았습니다.', '로컬에서 로그아웃했습니다. ChatGPT 설정에서 연결을 해제할 수 있습니다.', '이 계정에서 사용할 수 있는 모델이 없습니다.'],
} as const

export function requestChatGptPlan(sourceId: string, action: ChatGptPlanRequest['action']) {
  const request = getBridge()?.app.chatGptPlan
  if (!request) return Promise.reject(new Error('CHATGPT_PLAN_UNAVAILABLE'))
  return request({ sourceId, action })
}

export function ChatGptPlanDetails({ connection, creating, saving, onSave, onCancel }: {
  connection: Connection; creating: boolean; saving: boolean
  onSave: (value: Connection, edit?: 'connection' | 'models') => Promise<void>
  onCancel: () => void
}) {
  const { t, language } = useI18n()
  const copy = useCloudPreviewCopy()
  const [continueWith, accountLabel, disconnected, authorize, disconnect, waiting, failed, declined, localOnly, noModels] =
    language === 'zh-HK' ? messages['zh-TW'] : messages[language] ?? messages.en
  const [draft, setDraft] = useState(connection)
  const draftRef = useRef(draft)
  const [savingIdentity, setSavingIdentity] = useState(false)
  const [account, setAccount] = useState<ChatGptPlanResult['account']>()
  const [models, setModels] = useState<ChatGptPlanResult['models']>()
  const [busy, setBusy] = useState<ChatGptPlanRequest['action']>()
  const [notice, setNotice] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [removal, setRemoval] = useState('')
  const id = connection.id

  useEffect(() => {
    let active = true
    void requestChatGptPlan(id, 'status').then(result => { if (active) setAccount(result.account) },
      () => { if (active) setNotice(failed) })
    return () => { active = false; void requestChatGptPlan(id, 'cancel').catch(() => undefined) }
  }, [id, failed])

  const run = async (action: 'sign-in' | 'disconnect' | 'models') => {
    setBusy(action)
    setNotice('')
    try {
      const result = await requestChatGptPlan(id, action)
      if (action === 'sign-in') {
        setAccount(result.account)
        setNeedsSignIn(false)
        if (creating && result.account) await onSave(draftRef.current)
        await checkCredential(customCredentialSlot(id))
      } else if (action === 'disconnect') {
        setAccount(undefined)
        setNeedsSignIn(false)
        if (!result.revocationConfirmed) setNotice(localOnly)
        await checkCredential(customCredentialSlot(id))
      } else if (result.models?.length) setModels(result.models)
      else setNotice(noModels)
    } catch (error) {
      const { code } = normalizeThrownError(restoreIpcError(error))
      if (code === 'CHATGPT_SIGN_IN_REQUIRED') setNeedsSignIn(true)
      if (code !== 'CHATGPT_SIGN_IN_CANCELLED') setNotice(code === 'CHATGPT_SIGN_IN_DENIED' ? declined : failed)
    } finally { setBusy(undefined) }
  }

  const signIn = <Button disabled={!!busy || saving} size="sm" onClick={() => void run('sign-in')}>
    {account && !account.authorized ? authorize : continueWith}
  </Button>

  return <div className="model-settings">
    <CloudSourceHeader connection={creating ? draft : connection} disabled={!!busy || saving || savingIdentity}
      onIdentityChange={fields => {
        if (creating) {
          draftRef.current = { ...draftRef.current, ...fields }
          setDraft(draftRef.current)
        } else {
          setSavingIdentity(true)
          void onSave({ ...connection, ...fields }, 'connection').catch(() => undefined).finally(() => setSavingIdentity(false))
        }
      }}>
      {creating && <>
        <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>{t('common.cancel')}</Button>
        {signIn}
      </>}
    </CloudSourceHeader>
    <div className="settings-group">
      <h3 className="model-settings__heading type-body font-semibold">{copy('connection')}</h3>
      <SettingsRow label={accountLabel}>
        <div className="cpv-actions min-w-0">
          <span className="min-w-0 wrap-anywhere">{account?.email || account?.name || disconnected}</span>
          {!creating && (!account?.authorized || needsSignIn) && signIn}
          {!creating && account && <Button disabled={!!busy || saving} variant="secondary" size="sm" onClick={() => void run('disconnect')}>{disconnect}</Button>}
        </div>
      </SettingsRow>
      {busy === 'sign-in' && <p role="status" className="type-muted">{waiting}</p>}
      {notice && <p role="status" className="type-muted">{notice}</p>}
    </div>
    <section className="cpv-models">
      <div className="model-settings__heading">
        <h3 className="type-body font-semibold">{copy('models')}</h3>
        <Button variant="secondary" size="sm" disabled={creating || !account?.authorized || needsSignIn || !!busy || saving} onClick={() => void run('models')}>
          <Plus data-icon="inline-start" />{copy('addModel')}
        </Button>
      </div>
      {connection.models.length ? <ul>{connection.models.map(model => <li key={model.id}>
        <span className="cpv-model-info type-body">{model.name}</span>
        <div className="cpv-actions">
          {removal === model.id ? <>
            <span className="type-small">{copy('confirmRemoval')}</span>
            <Button variant="secondary" size="sm" onClick={() => setRemoval('')}>{t('common.cancel')}</Button>
            <Button variant="danger" size="sm" disabled={saving} onClick={() => {
              void onSave({ ...connection, models: connection.models.filter(item => item.id !== model.id) }, 'models')
                .then(() => setRemoval('')).catch(() => undefined)
            }}>{t('common.confirm')}</Button>
          </> : <>
            <CloudModelTest connection={connection} model={model} disabled={creating || saving || !account?.authorized || needsSignIn || !!busy} />
            <Button variant="bare" size="icon-sm" disabled={saving} tooltip={t('modelsSettingsUi.deleteModel')} aria-label={t('modelsSettingsUi.deleteModel') + ' ' + model.id} onClick={() => setRemoval(model.id)}><Trash2 /></Button>
            <Switch checked={model.enabled} disabled={saving} aria-label={t('workbench.enable') + ' ' + model.id}
              onCheckedChange={enabled => void onSave({ ...connection,
                models: connection.models.map(item => item.id === model.id ? { ...item, enabled } : item),
              }, 'models').catch(() => undefined)}><SwitchThumb /></Switch>
          </>}
        </div>
      </li>)}</ul> : <p className="type-muted text-muted">{copy('noModels')}</p>}
    </section>
    {models && <CloudModelListDialog connection={connection} models={models} creating={false} onClose={() => setModels(undefined)}
      onAdd={async added => {
        try {
          await onSave({ ...connection, models: [...connection.models, ...added] }, 'models')
          return true
        } catch { return false }
      }} />}
  </div>
}
