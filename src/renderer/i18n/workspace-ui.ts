export const workspaceZh = {
  ready: '准备就绪',
  idleTitle: '开启一场实时同传',
  running: '同传进行中',
  session: '当前会话',
  readyHint: '选择声源与语言，开始实时同传',
  input: '输入来源',
  systemAudio: '系统音频',
  languages: '语言方向',
  fontSize: '字体大小',
  openOverlay: '悬浮字幕',
  localRecord: '记录保存在本机',
  noLevel: '音频状态示意，当前引擎未提供实时电平',
  notesLocal: '随会议保存',
  notesLocalHint: '笔记会随这场会议存在本机，停止后可在记录详情里继续看',
  notesExpand: '展开同传笔记',
  overlayFailed: '悬浮字幕未能打开，请重试',
  titleFailed: '会话已开始，但名称保存失败，可在同传记录中重命名',
  /**
   * 录音开关下面那行小字。
   *
   * **不要写回「当前演示不生成真实录音」** —— 录音早就是真的了：主进程 `ipc.ts` 按
   * `recording.keepAudio` 给引擎注入 `recordingPath`，`meeting-store.ts` 结束时按 WAV
   * 字节数算出真实的 `audioDurationMs`，记录详情页的 `AudioPlayerBar` 放的就是那个文件。
   * 留着「演示」两个字会让用户以为关掉也没损失，反而不去开。
   */
  recordingDemoHint: '录音会随这场会议保存在本机，结束后可以在记录详情里回放。',
  recordingPreferenceFailed: '录音偏好未保存，请重新开始同传',
} as const

export const workspaceEn: { [K in keyof typeof workspaceZh]: string } = {
  ready: 'Ready',
  idleTitle: 'Start a live interpretation',
  running: 'Interpretation in progress',
  session: 'Current session',
  readyHint: 'Choose an audio source and languages to begin',
  input: 'Audio source',
  systemAudio: 'System audio',
  languages: 'Languages',
  fontSize: 'Text size',
  openOverlay: 'Floating captions',
  localRecord: 'Records saved locally',
  noLevel: 'Audio status illustration; live audio levels are unavailable',
  notesLocal: 'Saved with the meeting',
  notesLocalHint: 'Notes are stored locally with this meeting and stay readable in the record afterwards',
  notesExpand: 'Expand interpretation notes',
  overlayFailed: 'Could not open floating captions. Try again',
  titleFailed: 'The session started, but its name was not saved. Rename it in records',
  recordingDemoHint: 'The recording is saved locally with this meeting and can be played back from its record afterwards.',
  recordingPreferenceFailed: 'The recording preference was not saved. Start the session again',
}
