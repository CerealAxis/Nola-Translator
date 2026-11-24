const languages = ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko'] as const
type Language = typeof languages[number]

const messages = {
  preview: ['游戏画面预览', '遊戲畫面預覽', '遊戲畫面預覽', 'Game preview', 'ゲーム画面のプレビュー', '게임 화면 미리 보기'],
  scene: ['澪在文具店柜台后举着一封信，窗外是山间小镇', '澪在文具店櫃檯後舉著一封信，窗外是山間小鎮', '澪在文具店櫃枱後舉着一封信，窗外是山間小鎮', 'Mio holds up a letter at the stationery counter, with a hill town outside', '澪が文具店のカウンターで手紙を掲げ、窓の外に山あいの町が見える', '미오가 문구점 계산대 뒤에서 편지를 들고 있고 창밖에는 산골 마을이 보인다'],
  next: ['下一句对白', '下一句對白', '下一句對白', 'Next dialogue', '次の台詞', '다음 대사'],
  drag: ['在游戏画面上拖动框选，或直接选择对白框和任务提示。', '在遊戲畫面上拖曳框選，或直接選擇對白框和任務提示。', '在遊戲畫面上拖曳框選，或直接選擇對白框和任務提示。', 'Drag over the game or select the dialogue box or quest prompt.', 'ゲーム画面をドラッグするか、セリフ欄や任務表示を選んでください。', '게임 화면에서 드래그하거나 대화창 또는 퀘스트 알림을 선택하세요.'],
  dialogue: ['对白框', '對白框', '對白框', 'Dialogue box', 'セリフ欄', '대화창'],
  quest: ['任务提示', '任務提示', '任務提示', 'Quest prompt', '任務表示', '퀘스트 알림'],
  confirm: ['确认范围', '確認範圍', '確認範圍', 'Confirm area', '範囲を確定', '영역 확인'],
  cancel: ['取消', '取消', '取消', 'Cancel', 'キャンセル', '취소'],
  multi: ['多重区域', '多重區域', '多重區域', 'Multiple regions', '複数領域', '다중 영역'],
  inPlace: ['原地显示', '原地顯示', '原位顯示', 'Show in place', 'その場に表示', '원래 위치에 표시'],
  borders: ['显示范围框', '顯示範圍框', '顯示範圍框', 'Show region borders', '範囲枠を表示', '영역 테두리 표시'],
  clear: ['清除 OCR 范围', '清除 OCR 範圍', '清除 OCR 範圍', 'Clear OCR regions', 'OCR 範囲をクリア', 'OCR 영역 지우기'],
  noText: ['在此范围内未识别到文字', '在此範圍內未辨識到文字', '在此範圍內未辨識到文字', 'No text recognized in this area', 'この範囲に文字が見つかりませんでした', '이 영역에서 인식된 텍스트가 없습니다'],
  noLast: ['先进行一次 OCR，再对同一位置复扫。', '先進行一次 OCR，再重新掃描相同位置。', '請先進行一次 OCR，然後重新掃描同一位置。', 'Run OCR once to save an area for rescanning.', '一度 OCR を実行すると同じ範囲を再認識できます。', '먼저 OCR을 한 번 실행하면 같은 영역을 다시 인식할 수 있습니다.'],
  content: ['剪贴板内容', '剪貼簿內容', '剪貼簿內容', 'Clipboard text', 'クリップボードの内容', '클립보드 내용'],
  copy: ['复制文本', '複製文字', '複製文字', 'Copy text', 'テキストをコピー', '텍스트 복사'],
  append: ['追加到原文', '附加到原文', '附加至原文', 'Append to source text', '原文に追記', '원문에 덧붙이기'],
  copied: ['已复制', '已複製', '已複製', 'Copied', 'コピーしました', '복사했습니다'],
  once: ['一次 OCR', '單次 OCR', '單次 OCR', 'One-time OCR', '一回だけ OCR', '일회성 OCR'],
  ongoing: ['持续 OCR', '持續 OCR', '持續 OCR', 'Continuous OCR', '継続 OCR', '연속 OCR'],
  regions: ['OCR 区域', 'OCR 區域', 'OCR 區域', 'OCR regions', 'OCR 領域', 'OCR 영역'],
  nextTime: ['推进游戏时间', '推進遊戲時間', '推進遊戲時間', 'Advance game time', 'ゲーム内時刻を進める', '게임 시간 넘기기'],
  execution: ['自动化执行方法', '自動化執行方法', '自動化執行方式', 'Automatic OCR method', '自動実行方法', '자동 실행 방식'],
  periodic: ['周期执行', '週期執行', '週期執行', 'Periodic', '定期実行', '주기 실행'],
  image: ['分析图像更新', '分析影像更新', '分析圖像更新', 'Analyze image changes', '画像の更新を解析', '이미지 변경 분석'],
  trigger: ['鼠标键盘触发＋等待稳定', '滑鼠鍵盤觸發＋等待穩定', '滑鼠鍵盤觸發＋等待穩定', 'Mouse or keyboard, then wait for stability', 'マウス・キー入力後、安定を待つ', '마우스·키보드 입력 후 안정 대기'],
  period: ['周期（秒）', '週期（秒）', '週期（秒）', 'Interval (seconds)', '間隔（秒）', '주기(초)'],
  direction: ['识别方向', '辨識方向', '辨識方向', 'Text direction', '認識方向', '인식 방향'],
  auto: ['自适应', '自適應', '自適應', 'Automatic', '自動', '자동'],
  horizontal: ['横向', '橫向', '橫向', 'Horizontal', '横書き', '가로'],
  vertical: ['竖向', '縱向', '縱向', 'Vertical', '縦書き', '세로'],
  merge: ['合并临近行', '合併鄰近行', '合併鄰近行', 'Merge nearby lines', '隣接する行を結合', '인접한 줄 결합'],
  distance: ['合并距离系数', '合併距離係數', '合併距離系數', 'Merge distance factor', '結合距離係数', '결합 거리 계수'],
  stability: ['图像稳定性阈值', '影像穩定性閾值', '圖像穩定性閾值', 'Image stability threshold', '画像安定性のしきい値', '이미지 안정성 임계값'],
  similarity: ['图像一致性阈值', '影像一致性閾值', '圖像一致性閾值', 'Image similarity threshold', '画像一致度のしきい値', '이미지 유사도 임계값'],
  textDifference: ['文本相似度阈值', '文字相似度閾值', '文字相似度閾值', 'Text similarity threshold', 'テキスト類似度のしきい値', '텍스트 유사도 임계값'],
  delay: ['延迟（秒）', '延遲（秒）', '延遲（秒）', 'Delay (seconds)', '遅延（秒）', '지연(초)'],
  shotFailed: ['无法保存当前画面', '無法儲存目前畫面', '無法儲存目前畫面', 'Could not save the current scene', '現在の画面を保存できませんでした', '현재 화면을 저장할 수 없습니다'],
  closeInline: ['关闭原地译文', '關閉原地譯文', '關閉原位譯文', 'Close in-place translation', 'その場の訳文を閉じる', '원래 위치의 번역 닫기'],
} satisfies Record<string, readonly [string, string, string, string, string, string]>

export function sceneText(language: Language) {
  const index = languages.indexOf(language)
  return (key: keyof typeof messages) => messages[key][index]
}
