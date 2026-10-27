import type { Translation } from 'vanilla-cookieconsent'
import type { Locale } from './content'

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

export const cookieConsentCopy: Record<Locale, ConsentCopy> = {
  'zh-CN': {
    title: 'Cookie 与隐私偏好',
    description: '本站使用 Cookie 和本地存储保存同意状态、语言和主题偏好。可选的浏览量统计仅在你同意后启用。',
    accept: '全部接受', necessary: '仅必要', preferences: '管理偏好', save: '保存偏好', close: '关闭',
    necessaryTitle: '必要存储', necessaryDescription: '保存你的同意状态、语言和主题偏好，确保网站正常使用。此类别始终启用。',
    analyticsTitle: '浏览量统计', analyticsDescription: '启用不蒜子第三方浏览量服务。加载时会向服务发送访问请求，包括 IP 地址、浏览器信息和所访问页面。你可以随时关闭此类别，停止后续统计请求。',
    privacy: '隐私政策',
  },
  'zh-TW': {
    title: 'Cookie 與隱私偏好',
    description: '本站使用 Cookie 和本機儲存保存同意狀態、語言與主題偏好。選用的瀏覽量統計只會在你同意後啟用。',
    accept: '全部接受', necessary: '僅必要', preferences: '管理偏好', save: '儲存偏好', close: '關閉',
    necessaryTitle: '必要儲存', necessaryDescription: '保存你的同意狀態、語言與主題偏好，確保網站正常運作。此類別一律啟用。',
    analyticsTitle: '瀏覽量統計', analyticsDescription: '啟用不蒜子第三方瀏覽量服務。載入時會向服務傳送瀏覽請求，包括 IP 位址、瀏覽器資訊和瀏覽的頁面。你可以隨時關閉此類別，停止後續統計請求。',
    privacy: '隱私權政策',
  },
  'zh-HK': {
    title: 'Cookie 與私隱偏好',
    description: '本站使用 Cookie 和本機儲存保存同意狀態、語言及主題偏好。選用的瀏覽量統計只會在你同意後啟用。',
    accept: '全部接受', necessary: '僅必要', preferences: '管理偏好', save: '儲存偏好', close: '關閉',
    necessaryTitle: '必要儲存', necessaryDescription: '保存你的同意狀態、語言及主題偏好，確保網站正常運作。此類別一律啟用。',
    analyticsTitle: '瀏覽量統計', analyticsDescription: '啟用不蒜子第三方瀏覽量服務。載入時會向服務傳送瀏覽請求，包括 IP 位址、瀏覽器資訊和瀏覽的頁面。你可以隨時關閉此類別，停止後續統計請求。',
    privacy: '私隱政策',
  },
  en: {
    title: 'Cookies and privacy preferences',
    description: 'This site uses cookies and local storage to save consent, language, and theme preferences. Optional page-view analytics run only with your consent.',
    accept: 'Accept all', necessary: 'Necessary only', preferences: 'Manage preferences', save: 'Save preferences', close: 'Close',
    necessaryTitle: 'Necessary storage', necessaryDescription: 'Saves your consent, language, and theme preferences so the site works correctly. This category is always enabled.',
    analyticsTitle: 'Page-view analytics', analyticsDescription: 'Enables the third-party Busuanzi page-view service. Loading it sends a visit request, including your IP address, browser information, and visited page. You can disable this category at any time to stop future analytics requests.',
    privacy: 'Privacy policy',
  },
  ja: {
    title: 'Cookie とプライバシー設定',
    description: 'このサイトは Cookie とローカルストレージに同意状況、言語、テーマの設定を保存します。任意の閲覧数統計は、同意した場合にのみ有効になります。',
    accept: 'すべて許可', necessary: '必須のみ', preferences: '設定を管理', save: '設定を保存', close: '閉じる',
    necessaryTitle: '必須のストレージ', necessaryDescription: 'サイトを正常に利用するために、同意状況、言語、テーマの設定を保存します。このカテゴリは常に有効です。',
    analyticsTitle: '閲覧数の統計', analyticsDescription: '外部の Busuanzi 閲覧数サービスを有効にします。読み込み時に IP アドレス、ブラウザー情報、閲覧ページを含むアクセスリクエストが送信されます。いつでも無効にして、以降の統計リクエストを停止できます。',
    privacy: 'プライバシーポリシー',
  },
  ko: {
    title: '쿠키 및 개인정보 설정',
    description: '이 사이트는 쿠키와 로컬 저장소에 동의 상태, 언어 및 테마 설정을 저장합니다. 선택적인 조회수 통계는 동의한 경우에만 활성화됩니다.',
    accept: '모두 허용', necessary: '필수 항목만', preferences: '설정 관리', save: '설정 저장', close: '닫기',
    necessaryTitle: '필수 저장소', necessaryDescription: '사이트가 정상적으로 작동하도록 동의 상태, 언어 및 테마 설정을 저장합니다. 이 항목은 항상 활성화됩니다.',
    analyticsTitle: '조회수 통계', analyticsDescription: '외부 Busuanzi 조회수 서비스를 활성화합니다. 로드 시 IP 주소, 브라우저 정보 및 방문 페이지를 포함한 방문 요청이 전송됩니다. 언제든지 이 항목을 비활성화하여 이후 통계 요청을 중지할 수 있습니다.',
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
