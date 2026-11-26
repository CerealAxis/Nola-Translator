import { ttsCatalogCapabilities } from '../../../../shared/tts/catalog'
import { ALIYUN_LANGUAGES, ALIYUN_S2S_SPEECH_LANGUAGES, MINIMAX_LANGUAGES } from '../../../../shared/cloud-config'
import { INDEX_TRANSLATE_LANGUAGES, INDEX_TRANSLATE_PUBLIC_MODEL } from '../../../../shared/index-translate'
import { LANGUAGE_CODES } from '../../../../shared/languages'
import { SOURCE_LANGUAGE_OPTIONS } from '../../../../shared/settings'
import type { Connection } from './cloud-preview-data'

// https://github.com/openai/whisper/blob/main/whisper/tokenizer.py
const whisperLanguages = 'en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su'.split(' ')
// https://developers.openai.com/api/docs/guides/text-to-speech

export function cloudModelLanguages(connection: Pick<Connection, 'capability' | 'service'>, modelId: string): {
  source?: readonly string[]; target?: readonly string[]; audio?: readonly string[]; languages?: readonly string[]; dependsOnVoice?: boolean; partial?: boolean;
} {
  const { capability, service } = connection
  if (capability === 'MT') {
    if (service === 'index' && modelId !== INDEX_TRANSLATE_PUBLIC_MODEL) return {}
    const target = service === 'index' ? INDEX_TRANSLATE_LANGUAGES : LANGUAGE_CODES
    const source = service === 'index' ? ['auto', ...target] : service === 'mymemory' ? target : SOURCE_LANGUAGE_OPTIONS
    return { source, target }
  }
  if (capability === 'S2S') return {
    source: modelId === 'qwen3.8-livetranslate-flash-realtime' ? ['auto'] : ['auto', ...ALIYUN_LANGUAGES],
    target: ALIYUN_LANGUAGES, audio: ALIYUN_S2S_SPEECH_LANGUAGES,
  }
  if (capability === 'ASR') {
    if (service === 'minimax') return { languages: ['auto', ...MINIMAX_LANGUAGES] }
    if (service === 'aliyun') {
      // The engine validates different language lists for the two ASR protocols.
      const codes = modelId === 'qwen3-asr-flash-realtime'
        ? 'zh yue en ja de ko ru fr pt ar it es hi id th tr uk vi cs da tl fi is ms no pl sv'
        : 'zh en ja ko vi th id ms tl hi ar fr de es pt ru it nl sv da fi no el pl cs hu ro bg hr sk'
      return { languages: ['auto', ...codes.split(' ')] }
    }
    if (service === 'whisper-api' && modelId === 'whisper-1') return { languages: whisperLanguages }
    // https://mimo.mi.com/models/zh-CN/mimo-v2.5-asr
    if (service === 'mimo-stt-api' && modelId === 'mimo-v2.5-asr') return { languages: ['zh', 'en', 'yue', 'wuu', 'nan', 'zh-sichuan'] }
  }
  if (capability === 'TTS') {
    const capability = ttsCatalogCapabilities(service, modelId, '')
    return { languages: capability.languages.mode === 'finite' ? capability.languages.values : undefined,
      dependsOnVoice: capability.languageInputMode === 'voice-derived' }
  }
  return {}
}
