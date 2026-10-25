import { lessonsZh, lessonsEn, lessonsTW, lessonsHK, lessonsJa, lessonsKo } from './onboarding-lessons'

export const onboardingZh = {
  ...lessonsZh,
  welcomeTitle: 'Nola Translator 新手指引',
  welcomeIntro: '欢迎使用 Nola Translator。本指引会带您配置模型并认识各项功能。',
  starRequest: '若您觉得软件还不错，可以在 Github 给本项目点一个 Star 嘛，谢谢😊',
  later: '稍后再看', begin: '开始指引', helpDocs: '帮助文档', github: 'GitHub',
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
  welcomeTitle: 'Nola Translator Getting Started',
  welcomeIntro: 'Welcome to Nola Translator. This guide walks you through model setup and the main features.',
  starRequest: 'If you enjoy the app, please give this project a Star on GitHub. Thank you! 😊',
  later: 'Not now', begin: 'Start tour', helpDocs: 'Help docs', github: 'GitHub',
  title: 'Getting started', replay: 'View again', replayHint: 'Review the main features and where to configure them.',
  next: 'Next', progress: '{current} / {total}',
  loading: 'Opening the page…', unavailable: 'This page has not loaded yet. You can continue to the next step or try the tour again later.',
  saveFailed: 'Could not save the tour status. It may appear again next time you open the app.',
}

export const onboardingTW: OnboardingMessages = {
  ...lessonsTW,
  welcomeTitle: 'Nola Translator 新手指引',
  welcomeIntro: '歡迎使用 Nola Translator。本指引會帶您設定模型並認識各項功能。',
  starRequest: '若您覺得軟體還不錯，可以在 Github 為本專案點一個 Star，謝謝😊',
  later: '稍後再看', begin: '開始教學', helpDocs: '說明文件', github: 'GitHub',
  title: '新手教學', replay: '再次查看', replayHint: '重新查看各個功能入口和設定方法。',
  next: '下一步', progress: '{current} / {total}',
  loading: '正在開啟頁面…', unavailable: '這個頁面暫時尚未載入完成。可以繼續下一步，或稍後再次查看。',
  saveFailed: '無法儲存教學顯示狀態，下次啟動時可能會再次顯示。',
}

export const onboardingHK: OnboardingMessages = {
  ...lessonsHK,
  ...onboardingTW,
  welcomeTitle: 'Nola Translator 新手指引',
  welcomeIntro: '歡迎使用 Nola Translator。本指引會帶您設定模型並認識各項功能。',
  starRequest: '若您覺得軟件還不錯，可以在 Github 為本項目點一個 Star，謝謝😊',
  title: '新手教學', replayHint: '重新查看各個功能入口和設定方法。',
}

export const onboardingJa: OnboardingMessages = {
  ...lessonsJa,
  welcomeTitle: 'Nola Translator はじめてガイド',
  welcomeIntro: 'Nola Translator へようこそ。このガイドではモデルの設定と各機能をご案内します。',
  starRequest: 'このアプリを気に入っていただけたら、GitHub で Star をお願いします。ありがとうございます😊',
  later: '後で見る', begin: 'ガイドを開始', helpDocs: 'ヘルプ', github: 'GitHub',
  title: '使い方ガイド', replay: 'もう一度見る', replayHint: '機能の入口と設定方法を確認します。',
  next: '次へ', progress: '{current} / {total}',
  loading: 'ページを開いています…', unavailable: 'ページを読み込めませんでした。次へ進むか、後からガイドをもう一度開いてください。',
  saveFailed: 'ガイドの表示状態を保存できませんでした。次回起動時に再び表示される場合があります。',
}

export const onboardingKo: OnboardingMessages = {
  ...lessonsKo,
  welcomeTitle: 'Nola Translator 시작 안내',
  welcomeIntro: 'Nola Translator에 오신 것을 환영합니다. 이 안내에서 모델 설정과 각 기능을 안내해 드립니다.',
  starRequest: '앱이 마음에 드신다면 GitHub에서 Star를 눌러 주세요. 감사합니다😊',
  later: '나중에 보기', begin: '안내 시작', helpDocs: '도움말 문서', github: 'GitHub',
  title: '시작 안내', replay: '다시 보기', replayHint: '기능 위치와 설정 방법을 다시 확인합니다.',
  next: '다음', progress: '{current} / {total}',
  loading: '페이지를 여는 중…', unavailable: '페이지가 아직 로드되지 않았습니다. 다음 단계로 진행하거나 나중에 안내를 다시 열어 주세요.',
  saveFailed: '안내 표시 상태를 저장하지 못했습니다. 다음 실행 시 다시 표시될 수 있습니다.',
}
