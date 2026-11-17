export const COMIC_VISUAL_RESOURCE_IDS = [
  'lama-manga', 'comic-lama-onnx', 'comic-lama-manga-onnx', 'comic-anglenet-onnx',
  'comic-rtdetr-onnx', 'comic-rfdetr-seg-onnx', 'manga-ocr-onnx',
  'baberu-ocr-onnx', 'pp-ocrv6-medium-onnx', 'paddleocr-vl-1.6-onnx',
  'comic-font-classifier-onnx',
  'comic-yuzu-font-onnx',
] as const
export const isManagedComicVisualResource = (resourceId: string): boolean =>
  COMIC_VISUAL_RESOURCE_IDS.some(id => id === resourceId) || /^pp-ocrv5-mobile(?:-[a-z]+)?-onnx$/.test(resourceId)

