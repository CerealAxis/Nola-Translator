# 云端模型配置

> [!WARNING]  
> 本文档仍在持续完善中，部分内容可能不完整、未验证或暂未覆盖最新实现。  
> 如果你有兴趣，欢迎提交 Pull Request 来完善本文档

## 一、背景

Nola Translator 支持多种云端模型的接入，其中可能会涉及到模型调用的费用，需要您自行评估是否使用。

## 二、云端语音识别模型

Nola Translator 支持两种云端语音识别模型的接入，分别是`阿里云 LiveTranslate` 和 `MiniMax ASR`。

### （一）阿里云 LiveTranslate

启动软件，进入 `设置-音频与识别-识别`，切换服务商为 `阿里云 LiveTranslate`。

Nola Translator 支持 `qwen3.8-livetranslate-flash-realtime` 和 `qwen3.5-livetranslate-flash-realtime`，您可结合自身需求选择识别模型。

> [!NOTE]
> 该模型为 `Speech to Speech` 模型，后续会完善同声传译的功能。

#### 账号设置

1. <strong>注册账号</strong>：若无阿里云账号，需首先[注册](https://account.aliyun.com/register/qr_register.htm)。

   > 如遇问题，请参见[注册阿里云账号](https://help.aliyun.com/zh/account/step-1-register-an-alibaba-cloud-account)。
2. <strong>开通阿里云百炼：</strong>使用<strong>阿里云主账号</strong>前往[阿里云百炼大模型服务平台](https://bailian.console.aliyun.com/model/market)，阅读并同意协议后，将自动开通阿里云百炼，如果未弹出服务协议，则表示您已经开通。

   > 如果开通服务时提示“您尚未进行实名认证”，请先进行[实名认证](https://help.aliyun.com/zh/account/verify-your-identity-individual-account)。
3. <strong>获取API Key：</strong>前往[API Key](https://bailian.console.aliyun.com/model/settings/api-key)页面，单击<strong>创建API Key，</strong>即可通过API KEY调用大模型。

4. <strong>获取业务空间ID：</strong>使用<strong>华北2（北京）</strong>、<strong>新加坡</strong>地域的模型时，需在Base URL中填入业务空间ID（WorkspaceId），可在[业务空间管理](https://bailian.console.aliyun.com/cn-beijing/settings/workspace)页面中查看。

### （二）MiniMax ASR

待补充...

## 三、云端翻译模型

Nola Translator 支持云端多种语音识别模型的接入，分别是`阿里云 LiveTranslate`、`Index-Translator API`、`LLM API兼容`、`Google 翻译`、`Microsoft Translator` 和 `MyMemory`。
 
### （一）阿里云 LiveTranslate

若您选择使用 `qwen3.8-livetranslate-flash-realtime` 和 `qwen3.5-livetranslate-flash-realtime` 进行语音识别，在 `翻译-服务商` 选择启用即可。

### （二）Index-Translator API

该 API 是由哔哩哔哩 Index Translator 团队推出的免费翻译 API ，在 `翻译-服务商` 选择启用即可。

### （三）MyMemory
该 API 由 Translated.net 公司运营的免费翻译 API ，在 `翻译-服务商` 选择启用即可。

### （四）LLM API兼容

待补充...

