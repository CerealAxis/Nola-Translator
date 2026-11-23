import { ALIYUN_LANGUAGES, ALIYUN_S2S_SPEECH_LANGUAGES, MINIMAX_LANGUAGES } from '../../../../shared/cloud-config'
import { INDEX_TRANSLATE_LANGUAGES, INDEX_TRANSLATE_PUBLIC_MODEL } from '../../../../shared/index-translate'
import { LANGUAGE_CODES } from '../../../../shared/languages'
import { SOURCE_LANGUAGE_OPTIONS } from '../../../../shared/settings'
import type { Connection } from './cloud-preview-data'

// https://github.com/openai/whisper/blob/main/whisper/tokenizer.py
const whisperLanguages = 'en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su'.split(' ')
// https://developers.openai.com/api/docs/guides/text-to-speech
const openAiTts = 'af ar hy az be bs bg ca zh hr cs da nl en et fi fr gl de el he hi hu is id it ja kn kk ko lv lt mk ms mr mi ne no fa pl pt ro ru sr sk sl es sw sv tl ta th tr uk ur vi cy'.split(' ')

export function cloudModelLanguages(connection: Pick<Connection, 'capability' | 'service'>, modelId: string) {
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
    if (service === 'openai-tts-api' && ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'].includes(modelId)) return { languages: openAiTts }
    if (service === 'mimo' && modelId === 'mimo-v2.5-tts') return { languages: ['zh', 'en'] }
    // https://elevenlabs.io/docs/overview/models/
    if (service === 'elevenlabs-tts' && modelId === 'eleven_multilingual_v2') {
      return { languages: 'en ja zh de hi fr ko pt it es id nl tr tl pl sv bg ro ar cs el fi hr ms sk da ta uk ru'.split(' ') }
    }
    // https://platform.minimax.io/docs/api-reference/speech-t2a-http
    if (service === 'minimax-tts' && /^speech-0[12]-(hd|turbo)$/.test(modelId)) {
      return { languages: 'zh yue en ar ru es fr pt de tr nl uk vi id ja it ko th pl ro el cs fi hi bg da he ms sk sv hr hu no sl ca nn af'.split(' ') }
    }
    // https://fish.audio/s2/ lists examples for S2 Pro.
    if (service === 'fishaudio-tts' && modelId === 's2-pro') {
      return { languages: 'ja en zh ko es pt ar ru fr de sv it tr nl hi th vi'.split(' '), partial: true }
    }
    // https://cloud.google.com/text-to-speech/docs/gemini-tts#available_languages
    if (service === 'gemini-tts' && modelId === 'gemini-2.5-flash-preview-tts') {
      return { languages: 'ar bn nl en fr de hi id it ja ko mr pl pt ro ru es ta te th tr uk vi zh'.split(' '), partial: true }
    }
    if (service === 'edge-tts' || service === 'azure-tts' || service === 'dashscope-tts' || service === 'volcengine-tts') {
      return { dependsOnVoice: true }
    }
  }
  return {}
}
