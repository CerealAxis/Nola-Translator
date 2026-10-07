export const workspaceZh = {
  idleTitle: '开启一场实时同传',
  input: '输入来源',
  systemAudio: '系统音频',
  languages: '语言方向',
  translationOff: '不启用',
  fontSize: '字体大小',
  openOverlay: '悬浮字幕',
  noLevel: '音频状态示意，当前引擎未提供实时电平',
  notesLocal: '随会议保存',
  notesLocalHint: '笔记会随这场会议存在本机，停止后可在记录详情里继续看',
  notesExpand: '展开同传笔记',
  overlayFailed: '悬浮字幕未能打开，请重试',
  titleFailed: '会话已开始，但名称保存失败，可在同传记录中重命名',
  /**
   * 引擎崩溃但主进程还有重试次数时的那一行。
   *
   * **不给红色 Alert。** 退避是 250ms / 1s / 4s，一句话的工夫就自己好了，
   * 而红色告警会连着「重试启动」按钮一起摆出来 —— 报一个正在被处理的状况，
   * 又给一个用户根本不需要按的按钮。退避耗尽（主进程置 `failed`）时才是真的坏了，
   * 那一条走 `errors.engineNotReady`（ENG-001）。
   */
  engineRecovering: '引擎断开，正在重连',
  /**
   * 录音偏好在开始会话时写失败了。
   *
   * 原先这里还有一条 `recordingDemoHint`（「录音会随这场会议保存在本机…」），它挂在
   * 会话弹窗的保存录音开关下面。说明文字改用 Tooltip 之后并进了 `session.keepAudioHint`，
   * 这里就只剩失败提示。
   *
   * 那条小字曾经写过「当前演示不生成真实录音」，**别再写回去**：录音早就是真的了 ——
   * 主进程 `ipc.ts` 按 `recording.keepAudio` 给引擎注入 `recordingPath`，`meeting-store.ts`
   * 结束时按 WAV 字节数算出真实的 `audioDurationMs`，记录详情页的 `AudioPlayerBar` 放的就是
   * 那个文件。留着「演示」两个字会让用户以为关掉也没损失，反而不去开。
   */
  recordingPreferenceFailed: '录音偏好未保存，请重新开始同传',
} as const

export const workspaceEn: { [K in keyof typeof workspaceZh]: string } = {
  idleTitle: 'Start a live interpretation',
  input: 'Audio source',
  systemAudio: 'System audio',
  languages: 'Languages',
  translationOff: 'Disabled',
  fontSize: 'Text size',
  openOverlay: 'Floating captions',
  noLevel: 'Audio status illustration; live audio levels are unavailable',
  notesLocal: 'Saved with the meeting',
  notesLocalHint: 'Notes are stored locally with this meeting and stay readable in the record afterwards',
  notesExpand: 'Expand interpretation notes',
  overlayFailed: 'Could not open floating captions. Try again',
  titleFailed: 'The session started, but its name was not saved. Rename it in records',
  engineRecovering: 'The engine connection dropped. Reconnecting',
  recordingPreferenceFailed: 'The recording preference was not saved. Start the session again',
}
