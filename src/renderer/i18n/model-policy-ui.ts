const rows = {
"modelDisabled": ["模型尚未启用，请先在模型管理中启用。", "This model is disabled. Enable it in Model Management.", "模型尚未啟用，請先在模型管理中啟用。", "模型尚未啟用，請先在模型管理中啟用。", "모델이 비활성화되어 있습니다. 모델 관리에서 활성화하세요.", "モデルが無効です。モデル管理で有効にしてください。"],
"modelNotLoaded": ["所选本地模型未加载，请在模型网关加载，或选择可用的云端接口。", "This local model is not loaded. Load it in Model Gateway or select a ready cloud interface.", "所選本機模型尚未載入，請於模型閘道載入，或選擇可用的雲端介面。", "所選本機模型尚未載入，請於模型閘道載入，或選擇可用的雲端介面。", "선택한 로컬 모델이 로드되지 않았습니다. 모델 게이트웨이에서 로드하거나 사용 가능한 클라우드 인터페이스를 선택하세요.", "選択したローカルモデルは未読み込みです。モデルゲートウェイで読み込むか、利用可能なクラウド接続を選択してください。"],
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
