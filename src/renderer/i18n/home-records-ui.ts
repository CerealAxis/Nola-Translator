export const homeRecordsZh = {
  tagline: '高效、稳定、易用的实时翻译与同传工具',
  speech: '实时语音识别', multilingual: '多语言互译', meetings: '会议与学习', live: '直播场景',
  quickDescription: '实时语音识别与翻译\n支持多语言互译',
  overlayDescription: '实时翻译字幕\n支持桌面悬浮显示',
  recordsDescription: '查看、编辑\n导出历史记录',
  modelsDescription: '管理和切换\n翻译与识别模型',
  openOverlay: '开启悬浮字幕', openRecords: '查看记录', openModels: '进入管理',
  allRecords: '查看全部记录', language: '语言方向', status: '状态', completed: '已完成',
  time: '时间', localOnly: '记录仅保存在这台电脑上', moreActions: '更多操作：{name}',
  detail: '查看详情', notes: '笔记',
  back: '返回记录', playbackRate: '播放速度',
  /**
   * 时长文案。`daySequence` 的自动标题规则（`2026年10月01日_记录_1`）是**渲染时算出来的**，
   * 不落盘，所以切界面语言会给每一条记录重新起名而一个文件都不动。
   */
  durationMinutes: '{minutes}分钟',
  durationHoursMinutes: '{hours}小时{minutes}分钟',
  durationHours: '{hours}小时',
}
export const homeRecordsEn: Record<keyof typeof homeRecordsZh, string> = {
  tagline: 'Fast, stable, and simple real-time translation and interpretation',
  speech: 'Live transcription', multilingual: 'Multilingual translation', meetings: 'Meetings & learning', live: 'Live streaming',
  quickDescription: 'Live speech recognition and translation\nTranslate across languages',
  overlayDescription: 'Real-time translated captions\nFloat above your desktop',
  recordsDescription: 'View and rename sessions\nExport your saved transcripts',
  modelsDescription: 'Manage and switch\nRecognition and translation models',
  openOverlay: 'Open floating captions', openRecords: 'View records', openModels: 'Manage models',
  allRecords: 'View all records', language: 'Languages', status: 'Status', completed: 'Completed',
  time: 'Time', localOnly: 'Records are stored only on this computer', moreActions: 'More actions: {name}',
  detail: 'View details', notes: 'Notes',
  back: 'Back to records', playbackRate: 'Playback speed',
  durationMinutes: '{minutes} min',
  durationHoursMinutes: '{hours} h {minutes} min',
  durationHours: '{hours} h',
}

