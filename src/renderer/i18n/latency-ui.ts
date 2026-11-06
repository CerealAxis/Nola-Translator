export const latencyZh = {
  connectionFailed: '无法读取同传会话的延迟数据，请重试。',
  title: '延迟检测',
  toggleHint: '同传启动后打开独立窗口，查看总延迟和各阶段耗时。',
  reopen: '打开检测窗口',
  openFailed: '无法打开延迟检测窗口',
  trend: '延迟趋势',
  current: '当前延迟',
  average: '平均延迟',
  total: '总延迟',
  asr: 'ASR 延迟',
  mt: 'MT 延迟',
  tts: 'TTS 延迟',
  remote: 'S2S 延迟',
  loading: '正在连接同传会话',
  waiting: '正在等待有效片段',
  empty: '本次会话没有可用的延迟样本',
  unavailable: '当前会话的引擎不提供延迟数据',
  active: '检测中',
  ended: '会话已结束',
  timeline: '音频时间轴',
  input: '输入音频',
  output: '输出音频',
  noAudio: '暂无波形数据',
  now: '现在',
  end: '结束',
  secondsAgo: '{seconds} 秒前',
  milliseconds: '{value} 毫秒',
}

type LatencyMessages = { [K in keyof typeof latencyZh]: string }

export const latencyEn: LatencyMessages = {
  connectionFailed: 'Could not read session latency data. Try again.',
  title: 'Latency Monitor',
  toggleHint: 'Open a separate window after the session starts to see total latency and stage timings.',
  reopen: 'Open latency monitor',
  openFailed: 'Could not open the latency monitor',
  trend: 'Latency trend', current: 'Current latency', average: 'Average latency',
  total: 'Total latency', asr: 'ASR latency', mt: 'MT latency',
  tts: 'TTS latency', remote: 'S2S latency',
  loading: 'Connecting to the session', waiting: 'Waiting for a valid segment',
  empty: 'No latency samples are available for this session',
  unavailable: 'The session engine does not provide latency data',
  active: 'Monitoring', ended: 'Session ended',
  timeline: 'Audio timeline', input: 'Input audio',
  output: 'Output audio', noAudio: 'No waveform data yet', now: 'Now', end: 'End',
  secondsAgo: '{seconds}s ago', milliseconds: '{value} ms',
}

export const latencyTw: LatencyMessages = {
  connectionFailed: '無法讀取口譯工作階段的延遲資料，請再試一次。',
  title: '延遲檢測',
  toggleHint: '口譯啟動後開啟獨立視窗，查看總延遲及各階段的耗時。',
  reopen: '開啟檢測視窗',
  openFailed: '無法開啟延遲檢測視窗',
  trend: '延遲趨勢', current: '目前延遲', average: '平均延遲',
  total: '總延遲', asr: 'ASR 延遲', mt: 'MT 延遲', tts: 'TTS 延遲',
  remote: 'S2S 延遲',
  loading: '正在連線至口譯工作階段',
  waiting: '正在等待有效片段', empty: '本次工作階段沒有可用的延遲樣本',
  unavailable: '目前工作階段的引擎不提供延遲資料',
  active: '檢測中', ended: '工作階段已結束',
  timeline: '音訊時間軸', input: '輸入音訊', output: '輸出音訊',
  noAudio: '尚無波形資料', now: '現在', end: '結束',
  secondsAgo: '{seconds} 秒前', milliseconds: '{value} 毫秒',
}

export const latencyHk: LatencyMessages = {
  ...latencyTw,
  connectionFailed: '未能讀取傳譯工作階段的延遲資料，請重試。',
  toggleHint: '傳譯啟動後開啟獨立視窗，查看總延遲及各階段的耗時。',
  loading: '正在連線至傳譯工作階段',
  timeline: '音頻時間軸', input: '輸入音頻', output: '輸出音頻',
}

export const latencyJa: LatencyMessages = {
  connectionFailed: '通訳セッションの遅延データを取得できませんでした。再試行してください。',
  title: '遅延モニター',
  toggleHint: '通訳の開始後に別ウィンドウを開き、合計遅延と処理段階ごとの時間を表示します。',
  reopen: '遅延モニターを開く',
  openFailed: '遅延モニターを開けませんでした',
  trend: '遅延の推移', current: '現在の遅延', average: '平均遅延',
  total: '合計遅延', asr: 'ASR 遅延', mt: 'MT 遅延', tts: 'TTS 遅延',
  remote: 'S2S 遅延',
  loading: '通訳セッションに接続中',
  waiting: '有効な区間を待っています', empty: 'このセッションの遅延データはありません',
  unavailable: 'このセッションのエンジンは遅延データを提供していません',
  active: '計測中', ended: 'セッション終了',
  timeline: '音声タイムライン', input: '入力音声', output: '出力音声',
  noAudio: '波形データはまだありません', now: '現在', end: '終了',
  secondsAgo: '{seconds} 秒前', milliseconds: '{value} ms',
}

export const latencyKo: LatencyMessages = {
  connectionFailed: '통역 세션의 지연 데이터를 읽지 못했습니다. 다시 시도하세요.',
  title: '지연 모니터',
  toggleHint: '통역이 시작되면 별도 창에서 전체 지연과 단계별 시간을 확인할 수 있습니다.',
  reopen: '지연 모니터 열기',
  openFailed: '지연 모니터 창을 열 수 없습니다',
  trend: '지연 추이', current: '현재 지연', average: '평균 지연',
  total: '전체 지연', asr: 'ASR 지연', mt: 'MT 지연', tts: 'TTS 지연',
  remote: 'S2S 지연',
  loading: '통역 세션 연결 중',
  waiting: '유효한 구간을 기다리는 중', empty: '이 세션에서 확인할 수 있는 지연 데이터가 없습니다',
  unavailable: '현재 세션의 엔진은 지연 데이터를 제공하지 않습니다',
  active: '측정 중', ended: '세션 종료',
  timeline: '오디오 타임라인', input: '입력 오디오', output: '출력 오디오',
  noAudio: '아직 파형 데이터가 없습니다', now: '현재', end: '종료',
  secondsAgo: '{seconds}초 전', milliseconds: '{value}ms',
}

type LatencyEntries = { [K in keyof LatencyMessages as `latency.${K}`]: string }
export function latencyEntries(messages: LatencyMessages): LatencyEntries {
  return Object.fromEntries(Object.entries(messages).map(([key, value]) => [`latency.${key}`, value])) as LatencyEntries
}
