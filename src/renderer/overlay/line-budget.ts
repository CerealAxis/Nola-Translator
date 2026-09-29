import { rollingCaptionPages } from './caption-roll'

export type CaptionLineRequest = {
  text: string | null
  fontSize: number
  lineHeight: number
  maxLines: number
}

/** Give every active track one line, then add more only while the next line still fits in `contentHeight`. */
export function allocateCaptionLines(
  contentHeight: number,
  width: number,
  requests: CaptionLineRequest[],
): number[] {
  const active = requests.map((request) => Boolean(request.text))
  const lineHeights = requests.map((request) => request.fontSize * request.lineHeight)
  const wanted = requests.map((request, index) => active[index]
    ? Math.min(request.maxLines, rollingCaptionPages(request.text!, width, request.fontSize).length)
    : 0)
  const result: number[] = active.map((visible) => visible ? 1 : 0)
  let remaining = contentHeight - result.reduce((used, lines, index) => used + lines * lineHeights[index], 0)

  while (true) {
    const next = requests.findIndex((_, index) =>
      result[index] < wanted[index] && remaining >= lineHeights[index])
    if (next < 0) break
    result[next] += 1
    remaining -= lineHeights[next]
  }
  return result
}
