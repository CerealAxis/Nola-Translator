import type { Translation } from 'vanilla-cookieconsent'
import type { InjectionKey, Ref } from 'vue'
import type { Locale } from './content'

export const languageNoticeReadyKey: InjectionKey<Ref<boolean>> = Symbol('languageNoticeReady')

interface ConsentCopy {
  title: string
  description: string
  accept: string
  necessary: string
  preferences: string
  save: string
  close: string
  necessaryTitle: string
  necessaryDescription: string
  analyticsTitle: string
  analyticsDescription: string
  privacy: string
}

const cookieConsentCopy: Record<Locale, ConsentCopy> = {
  'zh-CN': {
    title: 'Cookie 与隐私偏好',
    description: '本站使用 Cookie 和本地存储保存同意状态、语言和主题偏好。网站分析包含浏览量统计和会话录制，仅在你同意后启用。',
    accept: '全部接受', necessary: '仅必要', preferences: '管理偏好', save: '保存偏好', close: '关闭',
    necessaryTitle: '必要存储', necessaryDescription: '保存你的同意状态、语言和主题偏好，确保网站正常使用。此类别始终启用。',
    analyticsTitle: '网站分析', analyticsDescription: '不蒜子统计页面浏览量。Microsoft Clarity 收集网站互动数据，包括点击、滚动和会话录制。启用后，这些服务会收到 IP 地址、浏览器信息和所访问页面。',
    privacy: '隐私政策',
  },
  'zh-TW': {
    title: 'Cookie 與隱私偏好',
    description: '本站使用 Cookie 和本機儲存保存同意狀態、語言與主題偏好。網站分析包含瀏覽量統計與工作階段錄製，只會在你同意後啟用。',
    accept: '全部接受', necessary: '僅必要', preferences: '管理偏好', save: '儲存偏好', close: '關閉',
    necessaryTitle: '必要儲存', necessaryDescription: '保存你的同意狀態、語言與主題偏好，確保網站正常運作。此類別一律啟用。',
    analyticsTitle: '網站分析', analyticsDescription: '不蒜子統計頁面瀏覽量。Microsoft Clarity 收集網站互動資料，包括點擊、捲動與工作階段錄製。啟用後，這些服務會收到 IP 位址、瀏覽器資訊和瀏覽的頁面。',
    privacy: '隱私權政策',
  },
  'zh-HK': {
    title: 'Cookie 與私隱偏好',
    description: '本站使用 Cookie 和本機儲存保存同意狀態、語言及主題偏好。網站分析包括瀏覽量統計及工作階段錄製，只會在你同意後啟用。',
    accept: '全部接受', necessary: '僅必要', preferences: '管理偏好', save: '儲存偏好', close: '關閉',
    necessaryTitle: '必要儲存', necessaryDescription: '保存你的同意狀態、語言及主題偏好，確保網站正常運作。此類別一律啟用。',
    analyticsTitle: '網站分析', analyticsDescription: '不蒜子統計頁面瀏覽量。Microsoft Clarity 收集網站互動資料，包括點擊、捲動及工作階段錄製。啟用後，這些服務會收到 IP 位址、瀏覽器資訊和瀏覽的頁面。',
    privacy: '私隱政策',
  },
  en: {
    title: 'Cookies and privacy preferences',
    description: 'This site uses cookies and local storage to save consent, language, and theme preferences. Optional analytics include page views and session recordings and run only with your consent.',
    accept: 'Accept all', necessary: 'Necessary only', preferences: 'Manage preferences', save: 'Save preferences', close: 'Close',
    necessaryTitle: 'Necessary storage', necessaryDescription: 'Saves your consent, language, and theme preferences so the site works correctly. This category is always enabled.',
    analyticsTitle: 'Site analytics', analyticsDescription: 'Busuanzi counts page views. Microsoft Clarity collects interaction data, including clicks, scrolling, and session recordings. When enabled, these services receive your IP address, browser information, and pages visited.',
    privacy: 'Privacy policy',
  },
  ja: {
    title: 'Cookie とプライバシー設定',
    description: 'このサイトは Cookie とローカルストレージに同意状況、言語、テーマの設定を保存します。閲覧数の集計やセッションの記録は、同意した場合にのみ有効になります。',
    accept: 'すべて許可', necessary: '必須のみ', preferences: '設定を管理', save: '設定を保存', close: '閉じる',
    necessaryTitle: '必須のストレージ', necessaryDescription: 'サイトを正常に利用するために、同意状況、言語、テーマの設定を保存します。このカテゴリは常に有効です。',
    analyticsTitle: 'サイト利用状況の分析', analyticsDescription: 'Busuanzi は閲覧数を集計します。Microsoft Clarity はクリック、スクロール、セッションの記録などの操作データを収集します。有効にすると、各サービスに IP アドレス、ブラウザー情報、閲覧ページが送信されます。',
    privacy: 'プライバシーポリシー',
  },
  ko: {
    title: '쿠키 및 개인정보 설정',
    description: '이 사이트는 쿠키와 로컬 저장소에 동의 상태, 언어 및 테마 설정을 저장합니다. 페이지 조회수 집계와 세션 기록은 동의한 경우에만 활성화됩니다.',
    accept: '모두 허용', necessary: '필수 항목만', preferences: '설정 관리', save: '설정 저장', close: '닫기',
    necessaryTitle: '필수 저장소', necessaryDescription: '사이트가 정상적으로 작동하도록 동의 상태, 언어 및 테마 설정을 저장합니다. 이 항목은 항상 활성화됩니다.',
    analyticsTitle: '사이트 분석', analyticsDescription: 'Busuanzi는 페이지 조회수를 집계합니다. Microsoft Clarity는 클릭, 스크롤 및 세션 기록을 비롯한 상호작용 데이터를 수집합니다. 활성화하면 각 서비스에 IP 주소, 브라우저 정보 및 방문 페이지가 전송됩니다.',
    privacy: '개인정보 처리방침',
  },
}

export function cookieConsentTranslations(base: string): Record<Locale, Translation> {
  return Object.fromEntries(Object.entries(cookieConsentCopy).map(([locale, text]) => [locale, {
    consentModal: {
      title: text.title, description: text.description,
      acceptAllBtn: text.accept, acceptNecessaryBtn: text.necessary, showPreferencesBtn: text.preferences,
      footer: `<a href="${base}${locale}/legal/privacy-policy">${text.privacy}</a>`,
    },
    preferencesModal: {
      title: text.title, acceptAllBtn: text.accept, acceptNecessaryBtn: text.necessary,
      savePreferencesBtn: text.save, closeIconLabel: text.close,
      sections: [
        { title: text.necessaryTitle, description: text.necessaryDescription, linkedCategory: 'necessary' },
        { title: text.analyticsTitle, description: text.analyticsDescription, linkedCategory: 'analytics' },
      ],
    },
  }])) as Record<Locale, Translation>
}
