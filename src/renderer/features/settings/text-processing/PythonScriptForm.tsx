import { useCallback, useId, useState } from 'react'
import { CircleHelp, Copy, Download, FileCode, RotateCcw, Upload, WrapText } from 'lucide-react'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CodeBlock, CodeBlockActions, CodeBlockHeader, CodeBlockTitle } from '@/components/ui/code-block'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { ProcessingIconButton, ProcessingPageHeading, textProcessingPath } from './ProcessingPage'
import { PythonCodeEditor } from './PythonCodeEditor'
import { validatePythonScript, type PythonScriptError } from './python-script-validation'
import type { ProcessingFeature } from './text-processing-features'
import { usePreviewSetting } from './text-processing-preview'

const preprocessingExample = `def POSTSOLVE(text):
    return text.strip()`

const optimizationExample = `class Process:
    def process_before(self, text):
        return text.strip(), None

    def process_after(self, text, context):
        return text.replace("...", "…")`

export default function PythonScriptForm({
  feature,
  back,
  sectionLabel,
}: {
  feature: ProcessingFeature
  back: string
  sectionLabel: string
}) {
  const { t } = useI18n()
  const id = useId()
  const fileId = useId()
  const preprocessing = feature.id === 'python-pre'
  const template = preprocessing ? preprocessingExample : optimizationExample
  const [saved, save] = usePreviewSetting<string | null>('script:' + feature.id, null)
  const [editorSeed, setEditorSeed] = useState(0)
  const [initialCode, setInitialCode] = useState(() => saved?.trim() ? saved : template)
  const [draft, setDraft] = useState(initialCode)
  const [error, setError] = useState<PythonScriptError>()
  const [wrap, setWrap] = useState(false)
  const filename = preprocessing ? 'preprocess.py' : 'translation.py'
  const dirty = draft !== (saved?.trim() ? saved : template) && draft !== saved
  const signature = preprocessing ? 'POSTSOLVE(text) -> str' : 'class Process'
  const helpText = t(preprocessing ? 'suite.textPythonPreHelp' : 'suite.textPythonOptimizeHelp')
  const change = useCallback((code: string) => {
    setDraft(code)
    setError(undefined)
  }, [])

  function loadCode(code: string) {
    setInitialCode(code)
    setDraft(code)
    setError(undefined)
    setEditorSeed(value => value + 1)
  }

  function downloadScript() {
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/x-python;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="processing-script-page">
      <ProcessingPageHeading
        title={t(feature.label)}
        back={back}
        breadcrumbs={[
          { label: t('suite.textProcessing'), href: textProcessingPath },
          { label: sectionLabel, href: back },
          { label: t(feature.label) },
        ]}
        actions={
          <>
            <Input id={fileId} hidden type="file" tabIndex={-1} accept=".py,text/x-python,text/plain"
              onChange={event => {
                const file = event.currentTarget.files?.[0]
                if (file) void file.text().then(loadCode).catch(cause => notifyError(t('suite.actionFailed'), { cause }))
                event.currentTarget.value = ''
              }} />
            <Button variant="secondary" size="sm" onClick={() => document.getElementById(fileId)?.click()}>
              <Upload data-icon="inline-start" />{t('suite.textImportScript')}
            </Button>
            <Button variant="secondary" size="sm" disabled={draft === template} onClick={() => loadCode(template)}>
              <RotateCcw data-icon="inline-start" />{t('suite.textResetTemplate')}
            </Button>
          </>
        }
      />
      <form className="processing-script-form processing-script-form--fill" onSubmit={event => {
        event.preventDefault()
        const issue = validatePythonScript(draft, preprocessing)
        if (issue) {
          setError(issue)
          notifyError(issue.kind === 'syntax' ? t('suite.textPythonSyntaxError', { line: issue.line })
            : t('suite.textPythonEntryError', { signature: issue.signature }))
          return
        }
        void save(draft).then(saved => { if (saved) location.hash = back })
      }}>
        <CodeBlock className="processing-script-code has-[.cm-content:focus-visible]:border-ring has-[.cm-content:focus-visible]:ring-3 has-[.cm-content:focus-visible]:ring-ring/50">
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileCode aria-hidden="true" />
              <span>{filename}</span>
            </CodeBlockTitle>
            <Badge variant="secondary" className="ms-2">
              {t(dirty ? 'suite.textScriptModified' : saved?.trim() ? 'suite.textScriptCustom' : 'suite.textScriptTemplate')}
            </Badge>
            <Tooltip>
              <TooltipTrigger render={
                <Button type="button" variant="bare" size="icon-xs" className="-ms-2.5" aria-label={signature}>
                  <CircleHelp aria-hidden="true" />
                </Button>
              } />
              <TooltipContent>{signature + ': ' + helpText}</TooltipContent>
            </Tooltip>
            <CodeBlockActions>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.textWrapCode')} aria-pressed={wrap}
                    onClick={() => setWrap(value => !value)}><WrapText /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.textWrapCode')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.textDownloadCode')} onClick={downloadScript}><Download /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.textDownloadCode')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.textCopyCode')} onClick={() => {
                    void navigator.clipboard.writeText(draft)
                      .then(() => notifySuccess(t('suite.copied')))
                      .catch(cause => notifyError(t('suite.actionFailed'), { cause }))
                  }}><Copy /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.textCopyCode')}</TooltipContent>
              </Tooltip>
            </CodeBlockActions>
          </CodeBlockHeader>
          <span id={id + '-name'} className="sr-only">{t('suite.textScript')}</span>
          <span id={id + '-help'} className="sr-only">{helpText}</span>
          <div className="processing-python-stage processing-python-stage--fill">
            <PythonCodeEditor key={editorSeed} id={id} initialCode={initialCode} onChange={change} wrap={wrap} />
          </div>
        </CodeBlock>
        {error && (
          <Alert id={id + '-error'} variant="danger">
            <AlertDescription>
              {error.kind === 'syntax' ? t('suite.textPythonSyntaxError', { line: error.line })
                : t('suite.textPythonEntryError', { signature: error.signature })}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" nativeButton={false} render={<a href={back} />}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={draft === saved}>{t('suite.save')}</Button>
        </div>
      </form>
    </div>
  )
}
