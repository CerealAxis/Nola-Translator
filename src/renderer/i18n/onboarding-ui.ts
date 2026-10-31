import { lessonsZh, lessonsEn, lessonsTW, lessonsHK, lessonsJa, lessonsKo } from './onboarding-lessons'

export const onboardingZh = {
  ...lessonsZh,
  welcomeTitle: '欢迎使用 Nola Translator',
  welcomeIntro: '本教程介绍模型选择、模型网关、快速同传和浏览器字幕。',
  starRequest: '若您觉得软件还不错，可以在 Github 给本项目点一个 Star 嘛，谢谢😊',
  later: '稍后再看', begin: '开始了解', helpDocs: '帮助文档', github: 'GitHub',
  title: '新手教程', replay: '再次查看', replayHint: '重新查看各个功能入口和配置方法。',
  next: '下一步', progress: '{current} / {total}',
  loading: '正在打开页面…', unavailable: '这个页面暂时没有加载完成。可以继续下一步，或稍后再次查看。',
  saveFailed: '教程显示状态未能保存，下次启动可能会再次显示。',
}

type OnboardingMessages = { [K in keyof typeof onboardingZh]: string }

export function onboardingEntries(messages: OnboardingMessages): { [K in keyof OnboardingMessages as `onboarding.${K}`]: string } {
  return Object.fromEntries(Object.entries(messages).map(([key, value]) => [`onboarding.${key}`, value])) as { [K in keyof OnboardingMessages as `onboarding.${K}`]: string }
}

export const onboardingEn: OnboardingMessages = {
  ...lessonsEn,
  welcomeTitle: 'Welcome to Nola Translator',
  welcomeIntro: 'This tour covers model selection, the model gateway, live interpretation, and browser captions.',
  starRequest: 'If you enjoy the app, please give this project a Star on GitHub. Thank you! 😊',
  later: 'Not now', begin: 'Start tutorial', helpDocs: 'Help docs', github: 'GitHub',
  title: 'Getting started', replay: 'View again', replayHint: 'Review the main features and where to configure them.',
  next: 'Next', progress: '{current} / {total}',
  loading: 'Opening the page…', unavailable: 'This page has not loaded yet. You can continue to the next step or try the tour again later.',
  saveFailed: 'Could not save the tour status. It may appear again next time you open the app.',
}

export const onboardingTW: OnboardingMessages = {
  ...lessonsTW,
  welcomeTitle: '歡迎使用 Nola Translator',
  welcomeIntro: '本教學介紹模型選擇、模型閘道、快速口譯和瀏覽器字幕。',
  starRequest: '若您覺得軟體還不錯，可以在 Github 為本專案點一個 Star，謝謝😊',
  later: '稍後再看', begin: '進入教程', helpDocs: '說明文件', github: 'GitHub',
  title: '新手教學', replay: '再次查看', replayHint: '重新查看各個功能入口和設定方法。',
  next: '下一步', progress: '{current} / {total}',
  loading: '正在開啟頁面…', unavailable: '這個頁面暫時尚未載入完成。可以繼續下一步，或稍後再次查看。',
  saveFailed: '無法儲存教學顯示狀態，下次啟動時可能會再次顯示。',
}

export const onboardingHK: OnboardingMessages = {
  ...onboardingTW,
  ...lessonsHK,
  welcomeTitle: '歡迎使用 Nola Translator',
  welcomeIntro: '本教學介紹模型選擇、模型閘道、快速口譯和瀏覽器字幕。',
  starRequest: '若您覺得軟件還不錯，可以在 Github 為本項目點一個 Star，謝謝😊',
  title: '新手教學', replayHint: '重新查看各個功能入口和設定方法。',
}

export const onboardingJa: OnboardingMessages = {
  ...lessonsJa,
  welcomeTitle: 'Nola Translator へようこそ',
  welcomeIntro: 'モデル選択、モデルゲートウェイ、同時通訳、ブラウザー字幕を紹介します。',
  starRequest: 'このアプリを気に入っていただけたら、GitHub で Star をお願いします。ありがとうございます😊',
  later: '後で見る', begin: 'チュートリアルに進む', helpDocs: 'ヘルプ', github: 'GitHub',
  title: '使い方ガイド', replay: 'もう一度見る', replayHint: '機能の入口と設定方法を確認します。',
  next: '次へ', progress: '{current} / {total}',
  loading: 'ページを開いています…', unavailable: 'ページを読み込めませんでした。次へ進むか、後からガイドをもう一度開いてください。',
  saveFailed: 'ガイドの表示状態を保存できませんでした。次回起動時に再び表示される場合があります。',
}

export const onboardingKo: OnboardingMessages = {
  ...lessonsKo,
  welcomeTitle: 'Nola Translator에 오신 것을 환영합니다',
  welcomeIntro: '모델 선택, 모델 게이트웨이, 실시간 통역과 브라우저 자막을 소개합니다.',
  starRequest: '앱이 마음에 드신다면 GitHub에서 Star를 눌러 주세요. 감사합니다😊',
  later: '나중에 보기', begin: '튜토리얼 시작', helpDocs: '도움말 문서', github: 'GitHub',
  title: '시작 안내', replay: '다시 보기', replayHint: '기능 위치와 설정 방법을 다시 확인합니다.',
  next: '다음', progress: '{current} / {total}',
  loading: '페이지를 여는 중…', unavailable: '페이지가 아직 로드되지 않았습니다. 다음 단계로 진행하거나 나중에 안내를 다시 열어 주세요.',
  saveFailed: '안내 표시 상태를 저장하지 못했습니다. 다음 실행 시 다시 표시될 수 있습니다.',
}
