import { useI18n } from '@/i18n'
import { performanceMonitorTitles } from '../../../shared/window-titles'

const copy = {
  larger: ['放大图表','放大圖表','Larger charts','グラフを拡大','차트 확대'],
  smaller: ['缩小图表','縮小圖表','Smaller charts','グラフを縮小','차트 축소'],
  refresh: ['立即刷新','立即重新整理','Refresh now','今すぐ更新','지금 새로 고침'],
  readFailed: ['无法读取性能数据。若刷新后仍无数据，请重启 Nola。','無法讀取效能資料。若重新整理後仍無資料，請重新啟動 Nola。','Could not read performance data. If refreshing does not help, restart Nola.','パフォーマンスデータを読み取れません。更新しても表示されない場合は、Nola を再起動してください。','성능 데이터를 읽을 수 없습니다. 새로 고침해도 표시되지 않으면 Nola를 다시 시작하세요.'],
  display: ['显示设置','顯示設定','Display settings','表示設定','표시 설정'],
  grid: ['网格线','格線','Grid lines','グリッド線','격자선'],
  legend: ['图例','圖例','Legend','凡例','범례'],
  models: ['全部模型','全部模型','All models','すべてのモデル','모든 모델'],
  devices: ['全部显卡','全部顯示卡','All GPUs','すべての GPU','모든 GPU'],
  period: ['时间范围','時間範圍','Time range','時間範囲','시간 범위'],
  pause: ['暂停','暫停','Pause','一時停止','일시 정지'],
  resume: ['恢复实时','恢復即時','Resume live','リアルタイムに戻る','실시간 재개'],
  minute: ['分钟','分鐘','min','分','분'],
  latency: ['模型处理耗时','模型處理耗時','Model latency','モデル処理時間','모델 처리 시간'],
  tasks: ['网关任务数','閘道工作數','Gateway tasks','ゲートウェイタスク数','게이트웨이 작업 수'],
  active: ['执行中','執行中','Running','実行中','실행 중'],
  queued: ['等待中','等候中','Waiting','待機中','대기 중'],
  queueTime: ['网关排队耗时','閘道等候時間','Gateway queue time','ゲートウェイ待機時間','게이트웨이 대기 시간'],
  shared: ['共享进程','共用處理程序','Shared process','共有プロセス','공유 프로세스'],
  total: ['任务总耗时','工作總耗時','End-to-end','合計時間','총 소요 시간'],
  load: ['GPU 利用率','GPU 使用率','GPU utilization','GPU 使用率','GPU 사용률'],
  gpuMemory: ['GPU 内存','GPU 記憶體','GPU memory','GPU メモリ','GPU 메모리'],
  used: ['已用','已用','Used','使用量','사용량'],
  cpu: ['CPU 利用率','CPU 使用率','CPU utilization','CPU 使用率','CPU 사용률'],
  ram: ['系统内存','系統記憶體','System memory','システムメモリ','시스템 메모리'],
  system: ['系统','系統','System','システム','시스템'],
  gateway: ['模型网关','模型閘道','Model gateway','モデルゲートウェイ','모델 게이트웨이'],
} as const

export function useMonitorCopy() {
  const { language } = useI18n()
  const column = { 'zh-CN': 0, 'zh-TW': 1, 'zh-HK': 1, en: 2, ja: 3, ko: 4 }[language]
  return (key: keyof typeof copy | 'title') => key === 'title' ? performanceMonitorTitles[language] : copy[key][column]
}
