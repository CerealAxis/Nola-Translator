// AstrBot v4.29.4 presets, plus official API endpoints checked against CC Switch.
export const astrBotChatPresets = [
  { id: 'openai', name: 'OpenAI Compatible', endpoint: 'https://api.openai.com/v1', icon: 'OpenAI' },
  { id: 'openai-responses', name: 'OpenAI Responses', endpoint: 'https://api.openai.com/v1', protocol: 'chat-responses', icon: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic Compatible', endpoint: 'https://api.anthropic.com', protocol: 'anthropic', icon: 'Claude' },
  { id: 'gemini-native', name: 'Gemini Compatible', endpoint: 'https://generativelanguage.googleapis.com/', protocol: 'google-native', icon: 'Gemini' },
  { id: 'gemini', name: 'Gemini OpenAI API', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/', icon: 'Gemini' },

  { id: 'zhipu', name: 'Zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4/', icon: 'Zhipu' },
  { id: 'zai', name: 'Z.ai (Global)', endpoint: 'https://api.z.ai/api/paas/v4', icon: 'Zhipu' },
  { id: 'moonshot', name: 'Kimi', endpoint: 'https://api.moonshot.cn/v1', icon: 'Kimi' },
  { id: 'moonshot-global', name: 'Kimi Global', endpoint: 'https://api.moonshot.ai/v1', icon: 'Kimi' },
  { id: 'kimi-code', name: 'Kimi Coding Plan', endpoint: 'https://api.kimi.com/coding', protocol: 'anthropic', icon: 'Kimi' },
  { id: 'kimi-code-global', name: 'Kimi Coding Plan (Global)', endpoint: 'https://api.kimi.ai/coding', protocol: 'anthropic', icon: 'Kimi' },
  { id: 'qianwen', name: '千问 AI 平台', endpoint: 'https://maas.qianwenaiapi.com/compatible-mode/v1', icon: 'Qwen' },
  { id: 'qwencloud', name: 'QwenCloud (Global)', endpoint: 'https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1', icon: 'Qwen' },
  { id: 'modelscope', name: 'ModelScope', endpoint: 'https://api-inference.modelscope.cn/v1', icon: 'ModelScope' },
  { id: 'xiaomi', name: 'Xiaomi', endpoint: 'https://api.xiaomimimo.com/v1', icon: 'XiaomiMiMo' },
  { id: 'xiaomi-token-plan', name: 'Xiaomi Token Plan', endpoint: 'https://token-plan-cn.xiaomimimo.com/anthropic', protocol: 'anthropic', icon: 'XiaomiMiMo' },
  { id: 'minimax-chat', name: 'MiniMax', endpoint: 'https://api.minimax.cn/v1', icon: 'Minimax' },
  { id: 'minimax-chat-global', name: 'MiniMax (Global)', endpoint: 'https://api.minimax.io/v1', icon: 'Minimax' },
  { id: 'minimax-token-plan', name: 'MiniMax Token Plan', endpoint: 'https://api.minimax.cn/anthropic', protocol: 'anthropic', icon: 'Minimax' },
  { id: 'minimax-token-plan-global', name: 'MiniMax Token Plan (Global)', endpoint: 'https://api.minimax.io/anthropic', protocol: 'anthropic', icon: 'Minimax' },

  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', icon: 'DeepSeek' },
  { id: 'deepseek-responses', name: 'DeepSeek Responses', endpoint: 'https://api.deepseek.com/v1', protocol: 'chat-responses', icon: 'DeepSeek' },
  { id: 'deepseek-anthropic', name: 'DeepSeek Anthropic', endpoint: 'https://api.deepseek.com/anthropic', protocol: 'anthropic', icon: 'DeepSeek' },
  { id: 'volcengine-ark', name: 'Volcengine Doubao', endpoint: 'https://ark.cn-beijing.volces.com/api/v3', icon: 'Doubao' },
  { id: 'byteplus-modelark', name: 'BytePlus ModelArk (APAC)', endpoint: 'https://ark.ap-southeast.bytepluses.com/api/v3', icon: 'ByteDance' },
  { id: 'byteplus-modelark-eu', name: 'BytePlus ModelArk (Europe)', endpoint: 'https://ark.eu-west.bytepluses.com/api/v3', icon: 'ByteDance' },
  { id: 'tencent-tokenhub', name: 'Tencent TokenHub', endpoint: 'https://tokenhub.tencentmaas.com/v1', icon: 'TencentCloud' },
  { id: 'tencent-tokenhub-global', name: 'Tencent TokenHub (Global)', endpoint: 'https://tokenhub-intl.tencentcloudmaas.com/v1', icon: 'TencentCloud' },
  { id: 'baidu-qianfan', name: 'Baidu Qianfan', endpoint: 'https://qianfan.baidubce.com/v2', icon: 'Baidu' },
  { id: 'baidu-qianfan-global', name: 'Baidu Qianfan (Global)', endpoint: 'https://api.baiduqianfan.ai/v1', icon: 'Baidu' },
  { id: 'stepfun', name: 'StepFun API', endpoint: 'https://api.stepfun.com/v1', icon: 'Stepfun' },
  { id: 'stepfun-global', name: 'StepFun API (Global)', endpoint: 'https://api.stepfun.ai/v1', icon: 'Stepfun' },
  { id: 'longcat', name: 'LongCat', endpoint: 'https://api.longcat.chat/openai', icon: 'LongCat' },
  { id: 'bailing', name: 'BaiLing', endpoint: 'https://api.ant-ling.com/v1', icon: 'AntGroup' },
  { id: 'astron-maas', name: 'Astron MaaS', endpoint: 'https://maas-api.cn-huabei-1.xf-yun.com/v2', icon: 'Spark' },
  { id: 'streamlake', name: 'StreamLake', endpoint: 'https://wanqing.streamlakeapi.com/api/gateway/v1/endpoints', icon: 'StreamLake' },
  { id: 'streamlake-global', name: 'StreamLake (Global)', endpoint: 'https://vanchin.streamlake.ai/api/gateway/v1/endpoints', icon: 'StreamLake' },

  { id: 'xai', name: 'xAI', endpoint: 'https://api.x.ai/v1', protocol: 'chat-responses', icon: 'XAI' },
  { id: 'meta-model-api', name: 'Meta Model API', endpoint: 'https://api.meta.ai/v1', icon: 'MetaAI' },
  { id: 'mistral', name: 'Mistral AI', endpoint: 'https://api.mistral.ai/openai/v1', icon: 'Mistral' },

  { id: 'azure-openai', name: 'Azure OpenAI', endpoint: '', protocol: 'azure-openai', icon: 'Azure' },
  { id: 'microsoft-foundry', name: 'Microsoft Foundry', endpoint: '', icon: 'Azure' },
  { id: 'aws-bedrock', name: 'AWS Bedrock (API Key)', endpoint: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1', icon: 'Bedrock' },
  { id: 'nvidia', name: 'NVIDIA', endpoint: 'https://integrate.api.nvidia.com/v1', icon: 'Nvidia' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1', icon: 'Groq' },

  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', icon: 'OpenRouter' },
  { id: 'siliconflow', name: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1', icon: 'SiliconCloud' },
  { id: 'aihubmix', name: 'AIHubMix', endpoint: 'https://aihubmix.com/v1', icon: 'AiHubMix' },
  { id: 'mirarouter', name: 'MiraRouter', endpoint: 'https://api.mirarouter.com/v1' },
  { id: 'ssycloud', name: 'SSYCloud(胜算云)', endpoint: 'https://router.shengsuanyun.com/api/v1', headers: { 'X-Title': 'AstrBot' } },
  { id: '302ai', name: '302.AI', endpoint: 'https://api.302.ai/v1', icon: 'Ai302' },
  { id: 'ppio', name: 'PPIO', endpoint: 'https://api.ppinfra.com/v3/openai', icon: 'PPIO' },
  { id: 'tokenpony', name: 'TokenPony', endpoint: 'https://api.tokenpony.cn/v1', icon: 'TokenPony' },
  { id: 'compshare', name: 'Compshare', endpoint: 'https://api.modelverse.cn/v1', icon: 'Compshare' },
  { id: 'fastgpt', name: 'FastGPT', endpoint: 'https://api.fastgpt.in/api/v1', timeout: 60, icon: 'FastGPT' },
] as const satisfies readonly {
  id: string; name: string; endpoint: string; protocol?: 'chat-completions' | 'chat-responses' | 'anthropic' | 'google-native' | 'azure-openai'
  icon?: string; headers?: Record<string, string>; timeout?: number
}[]

export type AstrBotChatService = typeof astrBotChatPresets[number]['id']
