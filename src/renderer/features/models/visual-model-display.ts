import type { UiLanguage } from '@/i18n'
import type { ResourceRecord } from '../../../shared/contracts'

const series = {
  'pp-ocrv5': 'PP-OCR',
  'manga-ocr-onnx': 'Manga OCR',
  'baberu-ocr-onnx': 'Baberu OCR',
  'paddleocr-vl-1.6-onnx': 'PaddleOCR-VL',
  'comic-rtdetr-onnx': 'RT-DETR v2',
  'comic-rfdetr-seg-onnx': 'Koharu Layout',
  'comic-anglenet-onnx': 'AngleNet',
  'comic-font-classifier-onnx': 'Storia Font',
  'comic-yuzu-font-onnx': 'YuzuMarker Font',
  'lama-manga': 'LaMa',
} as const

type Series = keyof typeof series

const columns = { 'zh-CN': 0, 'zh-TW': 1, 'zh-HK': 1, en: 2, ja: 3, ko: 4 } as const

const descriptions: Record<Series, readonly [string, string, string, string, string]> = {
  'pp-ocrv5': ['PaddleOCR 的多语言文字识别系列，提供按语言选用的 v5 Mobile 和覆盖多种文字的 v6 Medium。', 'PaddleOCR 的多語言文字辨識系列，提供按語言選用的 v5 Mobile 和涵蓋多種文字的 v6 Medium。', 'PaddleOCR’s multilingual text recognition family includes language-specific v5 Mobile models and the multilingual v6 Medium.', 'PaddleOCR の多言語文字認識シリーズで、言語別の v5 Mobile と多言語対応の v6 Medium を備えます。', 'PaddleOCR의 다국어 문자 인식 시리즈로, 언어별 v5 Mobile과 다국어 v6 Medium을 제공합니다.'],
  'manga-ocr-onnx': ['识别日漫对白中的横排和竖排日文。', '辨識日漫對白中的橫排和直排日文。', 'Recognizes horizontal and vertical Japanese dialogue in manga.', '漫画のセリフにある横書きと縦書きの日本語を認識します。', '만화 대사의 가로쓰기와 세로쓰기 일본어를 인식합니다.'],
  'baberu-ocr-onnx': ['识别漫画对白中的日文、中文和英文。', '辨識漫畫對白中的日文、中文和英文。', 'Recognizes Japanese, Chinese, and English dialogue in comics.', '漫画のセリフにある日本語、中国語、英語を認識します。', '만화 대사의 일본어, 중국어, 영어를 인식합니다.'],
  'paddleocr-vl-1.6-onnx': ['PaddleOCR 的视觉语言模型，用于识别图像中的多语言文字。', 'PaddleOCR 的視覺語言模型，用於辨識影像中的多語言文字。', 'PaddleOCR’s vision-language model recognizes multilingual text in images.', '画像内の多言語テキストを認識する PaddleOCR の視覚言語モデルです。', '이미지 속 다국어 문자를 인식하는 PaddleOCR의 시각 언어 모델입니다.'],
  'comic-rtdetr-onnx': ['检测漫画页中的文字和对白气泡，并标出它们的位置。', '偵測漫畫頁中的文字和對白氣泡，並標出它們的位置。', 'Locates text and speech bubbles on comic pages.', '漫画ページ内の文字と吹き出しの位置を検出します。', '만화 페이지에서 글자와 말풍선의 위치를 찾습니다.'],
  'comic-rfdetr-seg-onnx': ['识别漫画页中的文字和气泡区域，并生成贴合轮廓的分割遮罩。', '辨識漫畫頁中的文字和氣泡區域，並產生貼合輪廓的分割遮罩。', 'Segments text and speech bubble regions on comic pages with masks that follow their outlines.', '漫画ページの文字や吹き出しを輪郭に沿ったマスクで分割します。', '만화 페이지의 글자와 말풍선 영역을 윤곽에 맞춘 마스크로 분할합니다.'],
  'comic-anglenet-onnx': ['估计漫画文字区域的旋转角度，便于校正倾斜文字。', '估計漫畫文字區域的旋轉角度，以便校正傾斜文字。', 'Estimates the rotation of comic text regions so tilted text can be straightened.', '漫画の文字領域の回転角度を推定し、傾いた文字の補正に使います。', '만화 글자 영역의 회전 각도를 추정해 기울어진 글자를 바로잡는 데 사용합니다.'],
  'comic-font-classifier-onnx': ['识别漫画原文中的拉丁字母字体类别，帮助译文排版匹配原有风格。', '辨識漫畫原文中的拉丁字母字型類別，協助譯文排版貼近原有風格。', 'Classifies Latin-script lettering to help translated text match the comic’s style.', 'ラテン文字の書体を分類し、翻訳文を元の漫画に近いスタイルで組むのに役立ちます。', '라틴 문자 글꼴을 분류해 번역문을 원래 만화의 스타일에 맞춰 배치하도록 돕습니다.'],
  'comic-yuzu-font-onnx': ['识别日漫文字使用的字体，帮助译文选择相近的字形。', '辨識日漫文字使用的字型，協助譯文選擇相近的字形。', 'Identifies fonts in Japanese manga lettering to help match the translated text.', '日本の漫画で使われたフォントを識別し、翻訳文に近い書体を選ぶのに役立ちます。', '일본 만화에 사용된 글꼴을 식별해 번역문에 비슷한 글꼴을 선택하도록 돕습니다.'],
  'lama-manga': ['补全擦除文字后的图像背景，提供通用版和面向漫画线条与网点的 Manga 版。', '補全擦除文字後的影像背景，提供通用版和針對漫畫線條與網點的 Manga 版。', 'Reconstructs image backgrounds after text removal, with general-purpose and manga variants.', '文字を消した後の背景を補完するモデルで、汎用版と漫画向けの Manga 版があります。', '글자를 지운 뒤 배경을 복원하는 모델로, 범용 버전과 만화용 Manga 버전을 제공합니다.'],
}

export function visualSeriesOf(record: Pick<ResourceRecord, 'resourceId' | 'provider'>) {
  const id = record.resourceId
  const key = record.provider === 'pp-ocrv5' || id === 'pp-ocrv6-medium-onnx' ? 'pp-ocrv5'
    : id === 'comic-lama-onnx' || id === 'comic-lama-manga-onnx' ? 'lama-manga' : id
  if (!Object.hasOwn(series, key)) return undefined
  return { key: key as Series, name: series[key as Series] }
}

export function visualModelName(record: ResourceRecord): string {
  const family = visualSeriesOf(record)
  if (!family) return record.name
  switch (record.resourceId) {
    case 'pp-ocrv6-medium-onnx': return 'PP-OCRv6 Medium'
    case 'comic-rfdetr-seg-onnx': return 'Koharu RF-DETR 2XL'
    case 'paddleocr-vl-1.6-onnx': return 'PaddleOCR-VL 1.6'
    case 'lama-manga':
    case 'comic-lama-manga-onnx': return 'LaMa Manga'
    case 'comic-lama-onnx': return 'LaMa'
  }
  if (record.provider === 'pp-ocrv5') {
    if (record.resourceId === 'pp-ocrv5-mobile-ch-onnx') return 'PP-OCRv5 Mobile · ZH / EN / JA'
    return record.name.replace('mobile', 'Mobile')
  }
  return family.name
}

export function visualModelDescription(record: ResourceRecord, language: UiLanguage) {
  const family = visualSeriesOf(record)
  return family ? descriptions[family.key][columns[language]] : undefined
}
