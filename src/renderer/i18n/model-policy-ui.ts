const rows = {
  "title": [
    "模型启用与默认模型",
    "Model availability and defaults",
    "模型啟用與預設模型",
    "模型啟用與預設模型",
    "모델 활성화 및 기본 모델",
    "モデルの有効化と既定モデル"
  ],
  "enable": [
    "启用",
    "Enable",
    "啟用",
    "啟用",
    "활성화",
    "有効にする"
  ],
  "disable": [
    "停用",
    "Disable",
    "停用",
    "停用",
    "비활성화",
    "無効にする"
  ],
  "enabled": [
    "已启用",
    "Enabled",
    "已啟用",
    "已啟用",
    "활성화됨",
    "有効"
  ],
  "disabled": [
    "未启用",
    "Disabled",
    "未啟用",
    "未啟用",
    "비활성화됨",
    "無効"
  ],
  "enableHint": [
    "启用后可在各场景中选择；本地模型还需在模型网关加载。",
    "Enable models here. Local models must also be loaded in Model Gateway.",
    "啟用後可在各情境選擇；本機模型還需在模型閘道載入。",
    "啟用後可在各場景選擇；本機模型還需在模型閘道載入。",
    "여기서 활성화하세요. 로컬 모델은 모델 게이트웨이에서 로드해야 합니다.",
    "ここで有効化します。ローカルモデルはモデルゲートウェイでの読み込みも必要です。"
  ],
  "defaultHint": [
    "默认模型供新场景和工具调用使用；不会改变运行中的任务。",
    "Defaults apply to new scenes and tools, without changing running tasks.",
    "預設模型供新情境與工具使用，不會改變執行中的任務。",
    "預設模型供新場景與工具使用，不會改變執行中的任務。",
    "기본 모델은 새 작업과 도구에 적용되며 실행 중인 작업은 변경하지 않습니다.",
    "既定モデルは新しい場面とツールに使用し、実行中の処理は変更しません。"
  ],
  "noEnabled": [
    "暂无可用的已启用模型",
    "No enabled models available",
    "暫無可用的已啟用模型",
    "暫無可用的已啟用模型",
    "사용 가능한 활성 모델 없음",
    "利用可能な有効モデルがありません"
  ],
  "defaultAsr": [
    "默认识别模型",
    "Default recognition model",
    "預設辨識模型",
    "預設識別模型",
    "기본 인식 모델",
    "既定の認識モデル"
  ],
  "defaultMt": [
    "默认翻译模型",
    "Default translation model",
    "預設翻譯模型",
    "預設翻譯模型",
    "기본 번역 모델",
    "既定の翻訳モデル"
  ],
  "defaultTts": [
    "默认语音合成模型",
    "Default speech synthesis model",
    "預設語音合成模型",
    "預設語音合成模型",
    "기본 음성 합성 모델",
    "既定の音声合成モデル"
  ],
  "defaultLlm": [
    "默认语言模型",
    "Default language model",
    "預設語言模型",
    "預設語言模型",
    "기본 언어 모델",
    "既定の言語モデル"
  ],
  "proxyTitle": [
    "对外 API 模型映射",
    "Public API model mapping",
    "對外 API 模型對應",
    "對外 API 模型對應",
    "외부 API 모델 매핑",
    "外部 API のモデル対応"
  ],
  "proxyHint": [
    "对外 API 可代理已启用的云端接口或已加载的本地模型；云端接口无需加载本地权重。",
    "The public API serves enabled cloud interfaces or loaded local models. Cloud interfaces need no local weights.",
    "對外 API 可代理已啟用的雲端介面或已載入的本機模型，雲端無須載入本機權重。",
    "對外 API 可代理已啟用的雲端介面或已載入的本機模型，雲端毋須載入本機權重。",
    "외부 API는 활성 클라우드 인터페이스 또는 로드된 로컬 모델을 제공합니다.",
    "外部 API は有効なクラウド接続または読み込み済みのローカルモデルを提供します。"
  ],
  "localHint": [
    "此处只加载已启用的本地模型。云端接口在场景中直接选择，对外代理单独配置。",
    "Load enabled local models here. Select cloud interfaces in scenes; configure their public aliases separately.",
    "此處只載入已啟用的本機模型。雲端介面於情境中選擇，對外代理另行設定。",
    "此處只載入已啟用的本機模型。雲端介面於場景中選擇，對外代理另行設定。",
    "여기서는 활성 로컬 모델만 로드합니다. 클라우드 연결과 외부 매핑은 별도로 선택하세요.",
    "ここでは有効なローカルモデルを読み込みます。クラウド接続と外部 API の対応は別に設定します。"
  ],
"modelDisabled": ["模型尚未启用，请先在模型管理中启用。", "This model is disabled. Enable it in Model Management.", "模型尚未啟用，請先在模型管理中啟用。", "模型尚未啟用，請先在模型管理中啟用。", "모델이 비활성화되어 있습니다. 모델 관리에서 활성화하세요.", "モデルが無効です。モデル管理で有効にしてください。"],
"modelNotLoaded": ["所选本地模型未加载，请在模型网关加载，或选择已启用的云端接口。", "This local model is not loaded. Load it in Model Gateway or select an enabled cloud interface.", "所選本機模型尚未載入，請於模型閘道載入，或選擇已啟用的雲端介面。", "所選本機模型尚未載入，請於模型閘道載入，或選擇已啟用的雲端介面。", "선택한 로컬 모델이 로드되지 않았습니다. 모델 게이트웨이에서 로드하거나 활성 클라우드 연결을 선택하세요.", "選択したローカルモデルは未読み込みです。モデルゲートウェイで読み込むか、有効なクラウド接続を選択してください。"],
"busy": ["模型正在被任务使用。请先停止相关任务，再更换模型或加载配置。", "This model is in use. Stop its tasks before changing the model or loader settings.", "模型正由任務使用，請先停止相關任務，再更換模型或載入設定。", "模型正由任務使用，請先停止相關任務，再更換模型或載入設定。", "모델이 사용 중입니다. 관련 작업을 중지한 후 모델이나 로더 설정을 변경하세요.", "モデルは使用中です。関連する処理を停止してからモデルや読み込み設定を変更してください。"]
} as const

function region(index: number): Record<keyof typeof rows, string> {
  return Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]])) as Record<keyof typeof rows, string>
}
export const modelPolicyZh = region(0)
export const modelPolicyEn = region(1)
export const modelPolicyTw = region(2)
export const modelPolicyHk = region(3)
export const modelPolicyKo = region(4)
export const modelPolicyJa = region(5)

export function modelPolicyEntries(value: typeof modelPolicyZh): Record<`modelsPolicy.${keyof typeof rows}`, string> {
  return Object.fromEntries(Object.entries(value).map(([key, text]) => [`modelsPolicy.${key}`, text])) as Record<`modelsPolicy.${keyof typeof rows}`, string>
}
