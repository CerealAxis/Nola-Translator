import type { Locale } from './content'

type AudienceId = 'students' | 'researchers' | 'teams' | 'creators' | 'players' | 'readers'
type FeatureId = 'web-translation' | 'live-captions' | 'game-translation' | 'comic-translation' | 'meeting-interpretation' | 'screen-translation'

interface Audience {
  id: AudienceId
  label: string
  title: string
  description: string
  keywords: string[]
}

interface Feature {
  id: FeatureId
  title: string
  description: string
  experimental?: boolean
}

interface LandingContent {
  heroSubtitle: string
  star: string
  audienceHeading: string
  audienceLabel: string
  keywordsLabel: string
  viewAudience: (label: string) => string
  audiences: Audience[]
  featureHeading: string
  featureIntro: string
  features: Feature[]
  experimentalLabel: string
  startDownload: string
  downloadKicker: string
  brandLabel: string
  brandPause: string
  brandResume: string
  brandNames: { hunyuan: string; google: string; microsoft: string }
}

export const landingContent: Record<Locale, LandingContent> = {
  'zh-CN': {
    heroSubtitle: '免费开源的实时翻译软件，集成视频字幕翻译、实时翻译、漫画翻译等功能于一体，支持本地推理+云端API调用，支持Qwen、混元、Index Translate、DeepSeek、GPT等顶尖 AI 翻译引擎，支持 100+语言互译。',
    star: '点个 Star',
    audienceHeading: '跨越语言障碍',
    audienceLabel: '按使用人群查看',
    keywordsLabel: '常见使用场景',
    viewAudience: label => `查看${label}卡片`,
    audiences: [
      { id: 'students', label: '学生', title: '读懂资料，听懂课堂', description: '从大学公开课到课程讲义和课外阅读，Nola Translator 用双语字幕帮你跟上讲解，用网页对照翻译帮你读懂资料。遇到新概念，还能回到原文仔细推敲。', keywords: ['MIT 公开课', '英文课程讲义', '课外阅读清单'] },
      { id: 'researchers', label: '科研人员', title: '读懂新研究，跟上前沿', description: '从论文摘要、模型评测到国际学术讲座，Nola Translator 通过网页对照翻译和视频双语字幕，帮你先抓住研究要点，再对照原文核对术语和结论。', keywords: ['arXiv 论文摘要', '模型评测报告', '学术会议录像'] },
      { id: 'teams', label: '跨境团队', title: '跨国协作，沟通更顺畅', description: '从客户演示到跨国项目周会，Nola Translator 将会议发言转成双语字幕。讨论需求、确认进度和交付日期时，可以直接对照同事的原话。', keywords: ['跨国项目周会', '客户产品演示', '交付排期讨论'] },
      { id: 'creators', label: '内容创作者', title: '好灵感，来自更大的世界', description: '看海外创作者的访谈、跟学剪辑教程，或浏览平台上的趋势文章。Nola Translator 用双语字幕和网页译文帮你读懂这些内容，把值得借鉴的想法带进下一次选题。', keywords: ['海外创作者访谈', 'DaVinci 剪辑教程', 'YouTube 热门视频'] },
      { id: 'players', label: '游戏玩家', title: '跟上剧情，尽兴探索', description: '从视觉小说的关键选项到角色扮演游戏的支线对白，Nola Translator 在浮动字幕中显示接入的游戏文本和译文。读懂角色话里的线索，再决定下一步怎么走。', keywords: ['视觉小说选项', 'RPG 支线任务', '日文角色对白'] },
      { id: 'readers', label: '漫画读者', title: '原版漫画，顺着分镜读', description: '从日漫单行本到韩漫长条页，Nola Translator 识别画面里的对白并将译文排回原页。调整气泡里的文字，顺着原来的分镜读完整个故事。', keywords: ['日漫单行本', '韩漫长条页', '彩色对白页'] },
    ],
    featureHeading: '网页、视频与桌面翻译',
    featureIntro: '在原网页、视频播放器或桌面应用中阅读译文。',
    features: [
      { id: 'web-translation', title: '网页翻译', description: '在原段落下方显示译文，保留网页的阅读顺序与排版。浏览外语文章或查阅资料时，可以对照原文，也可以切换为仅显示译文。' },
      { id: 'live-captions', title: '实时字幕', description: '将麦克风或系统音频中的语音转为双语字幕，在桌面悬浮窗中查看。浏览器扩展可翻译视频已有的字幕，也可从视频音频生成字幕。' },
      { id: 'game-translation', title: '游戏翻译', experimental: true, description: '通过 Hook 或剪贴板获取游戏对话，在游戏画面上方的独立字幕窗中显示原文和译文，边玩边阅读剧情。' },
      { id: 'comic-translation', title: '漫画翻译', experimental: true, description: '导入漫画页面后，识别并翻译画面中的文字，清理原文字区域，再把译文排回页面。可以逐个调整文本区域，查看翻译后的排版。' },
      { id: 'meeting-interpretation', title: '会议口译', description: '分别设置会议的收音和译音输出，把译音送到指定设备，同时在字幕窗口查看原文和译文。' },
      { id: 'screen-translation', title: '屏幕翻译', description: '选取屏幕上的区域或指定应用窗口，识别画面中的文字并显示译文，适合翻译无法直接选中复制的内容。' },
    ],
    experimentalLabel: '实验性功能', startDownload: '开始下载', downloadKicker: '随身使用 NOLA', brandLabel: 'AI 模型与翻译品牌', brandPause: '暂停品牌轮播', brandResume: '继续品牌轮播',
    brandNames: { hunyuan: '腾讯混元', google: '谷歌翻译', microsoft: '微软翻译' },
  },
  'zh-TW': {
    heroSubtitle: '免費開源的即時翻譯軟體，整合影片字幕、即時翻譯與漫畫翻譯，支援本機推論和雲端 API，以及 Qwen、混元、Index Translate、DeepSeek、GPT 等 AI 翻譯引擎，支援 100 多種語言互譯。',
    star: '給個 Star', audienceHeading: '跨越語言障礙', audienceLabel: '依使用族群查看', keywordsLabel: '常見使用情境', viewAudience: label => `查看${label}卡片`,
    audiences: [
      { id: 'students', label: '學生', title: '讀懂資料，聽懂課堂', description: '從大學公開課到課程講義與課外閱讀，Nola Translator 用雙語字幕幫你跟上講解，以網頁對照翻譯協助閱讀。遇到新概念，也能回到原文仔細推敲。', keywords: ['MIT 公開課', '英文課程講義', '課外閱讀清單'] },
      { id: 'researchers', label: '研究人員', title: '讀懂新研究，跟上前沿', description: '從論文摘要、模型評測到國際學術講座，透過網頁對照翻譯與影片雙語字幕掌握研究重點，再對照原文確認術語和結論。', keywords: ['arXiv 論文摘要', '模型評測報告', '學術會議錄影'] },
      { id: 'teams', label: '跨國團隊', title: '跨國協作，溝通更順暢', description: '從客戶展示到跨國專案週會，Nola Translator 將會議發言轉成雙語字幕。討論需求、確認進度和交付日期時，可以對照同事的原話。', keywords: ['跨國專案週會', '客戶產品展示', '交付時程討論'] },
      { id: 'creators', label: '內容創作者', title: '好靈感，來自更大的世界', description: '觀看海外創作者訪談、學習剪輯教學，或瀏覽平台上的趨勢文章。雙語字幕和網頁譯文幫你讀懂內容，為下一次創作尋找靈感。', keywords: ['海外創作者訪談', 'DaVinci 剪輯教學', 'YouTube 熱門影片'] },
      { id: 'players', label: '遊戲玩家', title: '跟上劇情，盡情探索', description: '從視覺小說的重要選項到角色扮演遊戲的支線對話，浮動字幕顯示接入的遊戲文字和譯文，幫你讀懂角色的線索。', keywords: ['視覺小說選項', 'RPG 支線任務', '日文角色對話'] },
      { id: 'readers', label: '漫畫讀者', title: '原版漫畫，順著分鏡讀', description: '從日漫單行本到韓漫長條頁，Nola Translator 辨識畫面對白並將譯文排回原頁，讓你調整對話框文字，順著分鏡閱讀。', keywords: ['日漫單行本', '韓漫長條頁', '彩色對白頁'] },
    ],
    featureHeading: '網頁、影片與桌面翻譯', featureIntro: '在原網頁、影片播放器或桌面應用程式中閱讀譯文。',
    features: [
      { id: 'web-translation', title: '網頁翻譯', description: '在原段落下方顯示譯文，保留網頁的閱讀順序與版面。瀏覽外語文章或查閱資料時，可對照原文或切換為僅顯示譯文。' },
      { id: 'live-captions', title: '即時字幕', description: '將麥克風或系統音訊中的語音轉為雙語字幕，在桌面浮動視窗中查看。瀏覽器擴充功能可翻譯既有字幕，也能從影片音訊產生字幕。' },
      { id: 'game-translation', title: '遊戲翻譯', experimental: true, description: '透過 Hook 或剪貼簿取得遊戲對話，在遊戲畫面上方的獨立字幕視窗顯示原文和譯文，邊玩邊閱讀劇情。' },
      { id: 'comic-translation', title: '漫畫翻譯', experimental: true, description: '匯入漫畫頁面後，辨識並翻譯畫面文字，清理原文字區域，再將譯文排回頁面。可以逐一調整文字區域與排版。' },
      { id: 'meeting-interpretation', title: '會議口譯', description: '分別設定會議收音和譯音輸出，將譯音送到指定裝置，同時在字幕視窗查看原文和譯文。' },
      { id: 'screen-translation', title: '螢幕翻譯', description: '選取螢幕區域或指定應用程式視窗，辨識畫面文字並顯示譯文，適合翻譯無法直接選取複製的內容。' },
    ],
    experimentalLabel: '實驗性功能', startDownload: '開始下載', downloadKicker: '隨身使用 NOLA', brandLabel: 'AI 模型與翻譯品牌', brandPause: '暫停品牌輪播', brandResume: '繼續品牌輪播',
    brandNames: { hunyuan: '騰訊混元', google: 'Google 翻譯', microsoft: '微軟翻譯' },
  },
  'zh-HK': {
    heroSubtitle: '免費開源的即時翻譯軟件，整合影片字幕、即時翻譯及漫畫翻譯，支援本機推論和雲端 API，以及 Qwen、混元、Index Translate、DeepSeek、GPT 等 AI 翻譯引擎，支援 100 多種語言互譯。',
    star: '給個 Star', audienceHeading: '跨越語言障礙', audienceLabel: '按使用人群查看', keywordsLabel: '常見使用場景', viewAudience: label => `查看${label}卡片`,
    audiences: [
      { id: 'students', label: '學生', title: '讀懂資料，聽懂課堂', description: '從大學公開課到課程講義與課外閱讀，Nola Translator 用雙語字幕幫你跟上講解，透過網頁對照翻譯理解資料，亦可回看原文。', keywords: ['MIT 公開課', '英文課程講義', '課外閱讀清單'] },
      { id: 'researchers', label: '科研人員', title: '讀懂新研究，跟上前沿', description: '從論文摘要、模型評測到國際學術講座，透過網頁對照翻譯及影片雙語字幕掌握重點，再對照原文確認術語和結論。', keywords: ['arXiv 論文摘要', '模型評測報告', '學術會議錄影'] },
      { id: 'teams', label: '跨境團隊', title: '跨國協作，溝通更順暢', description: '從客戶示範到跨國項目週會，Nola Translator 將會議發言轉成雙語字幕，討論需求與交付時間時可對照同事的原話。', keywords: ['跨國項目週會', '客戶產品示範', '交付時間討論'] },
      { id: 'creators', label: '內容創作者', title: '好靈感，來自更大的世界', description: '觀看海外創作者訪問、學習剪片教學，或瀏覽平台上的趨勢文章。雙語字幕和網頁譯文助你理解內容，為下一次創作尋找靈感。', keywords: ['海外創作者訪問', 'DaVinci 剪片教學', 'YouTube 熱門影片'] },
      { id: 'players', label: '遊戲玩家', title: '跟上劇情，盡情探索', description: '從視覺小說選項到角色扮演遊戲支線對白，懸浮字幕顯示接入的遊戲文字和譯文，讓你讀懂角色話中的線索。', keywords: ['視覺小說選項', 'RPG 支線任務', '日文角色對白'] },
      { id: 'readers', label: '漫畫讀者', title: '原版漫畫，順着分鏡讀', description: '從日漫單行本到韓漫長條頁，Nola Translator 辨識畫面對白並將譯文排回原頁。調整對話框文字，順着分鏡閱讀故事。', keywords: ['日漫單行本', '韓漫長條頁', '彩色對白頁'] },
    ],
    featureHeading: '網頁、影片與桌面翻譯', featureIntro: '在原網頁、影片播放器或桌面應用程式中閱讀譯文。',
    features: [
      { id: 'web-translation', title: '網頁翻譯', description: '在原段落下方顯示譯文，保留網頁的閱讀順序與排版。瀏覽外語文章或查閱資料時，可對照原文或切換為只顯示譯文。' },
      { id: 'live-captions', title: '即時字幕', description: '將咪高峰或系統音訊中的語音轉成雙語字幕，在桌面懸浮視窗查看。瀏覽器擴充功能可翻譯原有字幕，也可從影片音訊產生字幕。' },
      { id: 'game-translation', title: '遊戲翻譯', experimental: true, description: '透過 Hook 或剪貼簿取得遊戲對話，在遊戲畫面上方的獨立字幕視窗顯示原文和譯文，邊玩邊閱讀劇情。' },
      { id: 'comic-translation', title: '漫畫翻譯', experimental: true, description: '匯入漫畫頁面後，辨識及翻譯畫面文字，清理原文字區域，再將譯文排回頁面。可逐一調整文字區域和排版。' },
      { id: 'meeting-interpretation', title: '會議傳譯', description: '分別設定會議收音及譯音輸出，將譯音送到指定裝置，同時在字幕視窗查看原文及譯文。' },
      { id: 'screen-translation', title: '螢幕翻譯', description: '選取螢幕區域或指定應用程式視窗，辨識畫面文字並顯示譯文，適合翻譯無法直接選取複製的內容。' },
    ],
    experimentalLabel: '實驗性功能', startDownload: '開始下載', downloadKicker: '隨身使用 NOLA', brandLabel: 'AI 模型與翻譯品牌', brandPause: '暫停品牌輪播', brandResume: '繼續品牌輪播',
    brandNames: { hunyuan: '騰訊混元', google: 'Google 翻譯', microsoft: '微軟翻譯' },
  },
  en: {
    heroSubtitle: 'Free, open-source real-time translation for videos, conversations, and comics. Use local models or cloud APIs with AI translation engines including Qwen, Hunyuan, Index Translate, DeepSeek, and GPT across 100+ languages.',
    star: 'Star on GitHub', audienceHeading: 'Break through language barriers', audienceLabel: 'Explore by audience', keywordsLabel: 'Common use cases', viewAudience: label => `View ${label} card`,
    audiences: [
      { id: 'students', label: 'Students', title: 'Understand the material and the lesson', description: 'Follow university lectures with bilingual captions and read course notes and articles with side-by-side web translation. Return to the original whenever you want a closer look.', keywords: ['MIT OpenCourseWare', 'English lecture notes', 'Reading lists'] },
      { id: 'researchers', label: 'Researchers', title: 'Keep up with new research', description: 'From paper abstracts and model evaluations to international lectures, bilingual web translation and video captions help you grasp the key points and check terms against the original.', keywords: ['arXiv abstracts', 'Model evaluations', 'Conference recordings'] },
      { id: 'teams', label: 'Global teams', title: 'Collaborate across borders', description: 'Turn meeting speech into bilingual captions, from customer demos to international project meetings. Check the original wording as you discuss requirements and delivery dates.', keywords: ['Project meetings', 'Customer demos', 'Delivery planning'] },
      { id: 'creators', label: 'Creators', title: 'Find inspiration around the world', description: 'Watch creator interviews, learn from editing tutorials, and explore trending articles. Bilingual captions and web translations help you bring new ideas into your next project.', keywords: ['Creator interviews', 'DaVinci tutorials', 'Trending YouTube videos'] },
      { id: 'players', label: 'Gamers', title: 'Follow the story and explore', description: 'From visual novel choices to RPG side quests, see captured game text and its translation in a floating caption window as you play.', keywords: ['Visual novel choices', 'RPG side quests', 'Japanese dialogue'] },
      { id: 'readers', label: 'Comic readers', title: 'Read comics in their original layout', description: 'Translate dialogue in manga and webtoons, then place the translated text back on the page. Adjust text regions as you follow the story.', keywords: ['Manga volumes', 'Korean webtoons', 'Color comic pages'] },
    ],
    featureHeading: 'Translation for web, video, and desktop', featureIntro: 'Read translations in the original webpage, video player, or desktop app.',
    features: [
      { id: 'web-translation', title: 'Web translation', description: 'Show translations beneath the original paragraphs while preserving the webpage’s reading order and layout. Compare both languages or switch to translation only.' },
      { id: 'live-captions', title: 'Live captions', description: 'Turn microphone or system audio into bilingual captions in a desktop overlay. The browser extension can translate existing video captions or generate them from audio.' },
      { id: 'game-translation', title: 'Game translation', experimental: true, description: 'Capture game dialogue through a text hook or the clipboard, then read the original and translation in a separate caption window over your game.' },
      { id: 'comic-translation', title: 'Comic translation', experimental: true, description: 'Import comic pages to recognize and translate text, clean the original text regions, and place translations back on the page. Adjust individual text regions and layouts.' },
      { id: 'meeting-interpretation', title: 'Meeting interpretation', description: 'Configure meeting audio input and translated speech output separately. Send translated speech to your chosen device while reading both languages in the caption window.' },
      { id: 'screen-translation', title: 'Screen translation', description: 'Select a screen region or application window to recognize and translate text that cannot be selected or copied directly.' },
    ],
    experimentalLabel: 'Experimental', startDownload: 'Download', downloadKicker: 'TAKE NOLA WITH YOU', brandLabel: 'AI and translation brands', brandPause: 'Pause brand carousel', brandResume: 'Resume brand carousel',
    brandNames: { hunyuan: 'Tencent Hunyuan', google: 'Google Translate', microsoft: 'Microsoft Translator' },
  },
  ja: {
    heroSubtitle: '無料・オープンソースのリアルタイム翻訳ソフト。動画字幕、リアルタイム翻訳、漫画翻訳を備え、ローカル推論とクラウド API、Qwen、混元、Index Translate、DeepSeek、GPT などの AI 翻訳エンジンを利用でき、100 以上の言語に対応します。',
    star: 'GitHub で Star', audienceHeading: '言葉の壁を越えて', audienceLabel: '利用者別に見る', keywordsLabel: '主な利用シーン', viewAudience: label => `${label}のカードを見る`,
    audiences: [
      { id: 'students', label: '学生', title: '資料も授業も、もっとわかる', description: '大学の公開講座は二言語字幕で、講義資料や記事はウェブの対訳で読み進められます。気になる内容は原文に戻って確認できます。', keywords: ['MIT 公開講座', '英語の講義資料', '読書リスト'] },
      { id: 'researchers', label: '研究者', title: '新しい研究を読み、最前線へ', description: '論文要旨、モデル評価、国際学会の講演まで、ウェブ対訳と動画の二言語字幕で要点を把握し、用語や結論を原文と照らし合わせられます。', keywords: ['arXiv 論文要旨', 'モデル評価レポート', '学会の録画'] },
      { id: 'teams', label: '海外チーム', title: '国境を越えた円滑な協働', description: '顧客向けデモから海外プロジェクトの定例会まで、会議の発言を二言語字幕に変換。要件や納期を確認しながら発言の原文も参照できます。', keywords: ['海外プロジェクト定例会', '顧客向けデモ', '納期の相談'] },
      { id: 'creators', label: 'クリエイター', title: '世界から新しい発想を', description: '海外クリエイターのインタビューや編集チュートリアル、話題の記事を、二言語字幕とウェブ翻訳で理解し、次の制作に生かせます。', keywords: ['海外クリエイターの対談', 'DaVinci 編集講座', 'YouTube の話題動画'] },
      { id: 'players', label: 'ゲームプレイヤー', title: '物語を追い、探索を楽しむ', description: 'ビジュアルノベルの選択肢から RPG のサブクエストまで、取得したゲームテキストと翻訳をフローティング字幕に表示します。', keywords: ['ノベルゲームの選択肢', 'RPG のサブクエスト', '日本語の会話'] },
      { id: 'readers', label: '漫画読者', title: '原作漫画をコマの流れで読む', description: '漫画やウェブトゥーンの台詞を認識・翻訳し、訳文を元のページに配置。吹き出しの文字を調整しながら物語を楽しめます。', keywords: ['漫画単行本', '韓国ウェブトゥーン', 'カラー漫画'] },
    ],
    featureHeading: 'ウェブ・動画・デスクトップの翻訳', featureIntro: '元のウェブページ、動画プレーヤー、デスクトップアプリで訳文を読めます。',
    features: [
      { id: 'web-translation', title: 'ウェブ翻訳', description: '原文の段落の下に訳文を表示し、ページの順序とレイアウトを保ちます。原文との対照表示と訳文のみの表示を切り替えられます。' },
      { id: 'live-captions', title: 'リアルタイム字幕', description: 'マイクやシステム音声を二言語字幕に変換し、デスクトップのフローティングウィンドウに表示します。拡張機能では動画の既存字幕の翻訳や音声からの字幕生成もできます。' },
      { id: 'game-translation', title: 'ゲーム翻訳', experimental: true, description: 'Hook やクリップボードでゲームの会話を取得し、ゲーム画面上の字幕ウィンドウに原文と訳文を表示します。' },
      { id: 'comic-translation', title: '漫画翻訳', experimental: true, description: '漫画ページの文字を認識・翻訳し、元の文字領域を消して訳文を配置します。文字領域やレイアウトは個別に調整できます。' },
      { id: 'meeting-interpretation', title: '会議通訳', description: '会議の音声入力と翻訳音声の出力を個別に設定。指定した機器に翻訳音声を送りながら、字幕画面で原文と訳文を確認できます。' },
      { id: 'screen-translation', title: '画面翻訳', description: '画面の範囲やアプリのウィンドウを選択し、直接コピーできない文字を認識して訳文を表示します。' },
    ],
    experimentalLabel: '実験的な機能', startDownload: 'ダウンロード', downloadKicker: 'いつでも NOLA と', brandLabel: 'AI モデルと翻訳ブランド', brandPause: 'ブランドのスクロールを一時停止', brandResume: 'ブランドのスクロールを再開',
    brandNames: { hunyuan: 'Tencent Hunyuan', google: 'Google 翻訳', microsoft: 'Microsoft 翻訳' },
  },
  ko: {
    heroSubtitle: '동영상 자막, 실시간 번역, 만화 번역을 제공하는 무료 오픈 소스 소프트웨어입니다. 로컬 추론과 클라우드 API, Qwen, Hunyuan, Index Translate, DeepSeek, GPT 등의 AI 번역 엔진을 이용해 100개 이상의 언어를 번역할 수 있습니다.',
    star: 'GitHub Star', audienceHeading: '언어의 장벽을 넘어', audienceLabel: '사용자별로 보기', keywordsLabel: '주요 활용 사례', viewAudience: label => `${label} 카드 보기`,
    audiences: [
      { id: 'students', label: '학생', title: '자료를 읽고 수업을 이해하세요', description: '대학 공개 강의는 이중 언어 자막으로, 강의 자료와 읽을거리는 웹 대조 번역으로 살펴보세요. 새로운 개념은 원문으로 돌아가 확인할 수 있습니다.', keywords: ['MIT 공개 강의', '영어 강의 자료', '읽기 목록'] },
      { id: 'researchers', label: '연구자', title: '새로운 연구를 빠르게 이해하세요', description: '논문 초록과 모델 평가부터 국제 학술 강연까지, 웹 대조 번역과 이중 언어 자막으로 핵심을 파악하고 원문과 용어를 비교하세요.', keywords: ['arXiv 논문 초록', '모델 평가 보고서', '학술회의 녹화'] },
      { id: 'teams', label: '글로벌 팀', title: '국경을 넘어 원활하게 협업하세요', description: '고객 시연부터 해외 프로젝트 회의까지 발언을 이중 언어 자막으로 표시합니다. 요구사항과 일정을 논의하며 동료의 원문도 확인하세요.', keywords: ['글로벌 프로젝트 회의', '고객 제품 시연', '납기 일정 논의'] },
      { id: 'creators', label: '콘텐츠 제작자', title: '더 넓은 세상에서 영감을 얻으세요', description: '해외 제작자의 인터뷰와 편집 강좌, 인기 글을 이중 언어 자막과 웹 번역으로 이해하고 다음 콘텐츠에 새로운 아이디어를 담아보세요.', keywords: ['해외 제작자 인터뷰', 'DaVinci 편집 강좌', 'YouTube 인기 영상'] },
      { id: 'players', label: '게임 플레이어', title: '이야기를 따라 마음껏 탐험하세요', description: '비주얼 노벨의 선택지부터 RPG의 사이드 퀘스트까지, 가져온 게임 원문과 번역을 화면 위 자막 창에서 확인하세요.', keywords: ['비주얼 노벨 선택지', 'RPG 사이드 퀘스트', '일본어 대사'] },
      { id: 'readers', label: '만화 독자', title: '원본 만화를 장면 흐름대로 읽으세요', description: '만화와 웹툰의 대사를 인식하고 번역해 원래 페이지에 배치합니다. 말풍선 텍스트를 조정하며 이야기를 읽어보세요.', keywords: ['일본 만화 단행본', '한국 웹툰', '컬러 만화'] },
    ],
    featureHeading: '웹·동영상·데스크톱 번역', featureIntro: '원래 웹페이지, 동영상 플레이어 또는 데스크톱 앱에서 번역을 읽으세요.',
    features: [
      { id: 'web-translation', title: '웹 번역', description: '원문 문단 아래에 번역을 표시해 웹페이지의 읽기 순서와 배치를 유지합니다. 원문과 비교하거나 번역만 표시할 수 있습니다.' },
      { id: 'live-captions', title: '실시간 자막', description: '마이크나 시스템 오디오의 음성을 이중 언어 자막으로 변환해 데스크톱 오버레이에 표시합니다. 브라우저 확장에서 기존 영상 자막을 번역하거나 음성으로 자막을 생성할 수 있습니다.' },
      { id: 'game-translation', title: '게임 번역', experimental: true, description: 'Hook 또는 클립보드로 게임 대사를 가져와 게임 화면 위의 별도 자막 창에 원문과 번역을 표시합니다.' },
      { id: 'comic-translation', title: '만화 번역', experimental: true, description: '만화 페이지의 문자를 인식하고 번역한 뒤 원래 문자 영역을 지우고 번역문을 배치합니다. 각 텍스트 영역과 배치를 조정할 수 있습니다.' },
      { id: 'meeting-interpretation', title: '회의 통역', description: '회의 오디오 입력과 번역 음성 출력을 별도로 설정합니다. 지정한 장치로 번역 음성을 보내면서 자막 창에서 원문과 번역을 확인하세요.' },
      { id: 'screen-translation', title: '화면 번역', description: '화면 영역이나 앱 창을 선택해 직접 선택하거나 복사할 수 없는 텍스트를 인식하고 번역합니다.' },
    ],
    experimentalLabel: '실험 기능', startDownload: '다운로드', downloadKicker: '어디서나 NOLA와 함께', brandLabel: 'AI 모델 및 번역 브랜드', brandPause: '브랜드 슬라이드 일시 정지', brandResume: '브랜드 슬라이드 재개',
    brandNames: { hunyuan: 'Tencent Hunyuan', google: 'Google 번역', microsoft: 'Microsoft 번역' },
  },
}
