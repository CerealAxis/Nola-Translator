export interface ScreenTextProbe {
  id: string; regionId: string; sourceHash: string
  imageWidth: number; imageHeight: number
  x: number; y: number; width: number; height: number
  color: [number, number, number]; mask: string
}

type Pixels = { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
const colorKey = (data: Pixels['data'], offset: number) => (data[offset] >> 4) * 256 + (data[offset + 1] >> 4) * 16 + (data[offset + 2] >> 4)
const distance = (data: Pixels['data'], offset: number, color: number[]) => (data[offset] - color[0]) ** 2 + (data[offset + 1] - color[1]) ** 2 + (data[offset + 2] - color[2]) ** 2

/** Keep glyph evidence separate from scene pixels; no text similarity threshold may swallow a changed digit. */
export function createScreenTextProbe(image: Pixels, quad: number[][]): Omit<ScreenTextProbe, 'id' | 'regionId' | 'sourceHash'> | undefined {
  if (quad.length !== 4 || quad.some(point => point.length !== 2 || point.some(value => !Number.isFinite(value)))) return
  const left = Math.max(0, Math.floor(Math.min(...quad.map(point => point[0])))), top = Math.max(0, Math.floor(Math.min(...quad.map(point => point[1]))))
  const right = Math.min(image.width, Math.ceil(Math.max(...quad.map(point => point[0])))), bottom = Math.min(image.height, Math.ceil(Math.max(...quad.map(point => point[1]))))
  if (right <= left || bottom <= top || image.data.length !== image.width * image.height * 4) return
  const margin = Math.max(2, Math.ceil((bottom - top) / 2))
  const x = Math.max(0, left - margin), y = Math.max(0, top - margin)
  const width = Math.min(image.width, right + margin) - x, height = Math.min(image.height, bottom + margin) - y
  if (width * height > 1_000_000) return
  const inside = new Uint32Array(4096), border = new Uint32Array(4096)
  let insideCount = 0, borderCount = 0
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const key = colorKey(image.data, (py * image.width + px) * 4)
    if (px >= left && px < right && py >= top && py < bottom) { inside[key]++; insideCount++ }
    else { border[key]++; borderCount++ }
  }
  let selected = -1, best = 0
  for (let key = 0; key < inside.length; key++) {
    const score = inside[key] - border[key] / Math.max(1, borderCount) * insideCount
    if (inside[key] >= 5 && score > best) { best = score; selected = key }
  }
  if (selected < 0 || best < 5) return
  const color: [number, number, number] = [0, 0, 0]
  let samples = 0
  for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
    const offset = (py * image.width + px) * 4
    if (colorKey(image.data, offset) !== selected) continue
    for (let channel = 0; channel < 3; channel++) color[channel] += image.data[offset + channel]
    samples++
  }
  for (let channel = 0; channel < 3; channel++) color[channel] = Math.round(color[channel] / samples)
  const mask = new Uint8Array(Math.ceil(width * height / 8))
  let ink = 0
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const index = py * width + px
    if (distance(image.data, ((py + y) * image.width + px + x) * 4, color) <= 32 ** 2) { mask[index >> 3] |= 1 << (index & 7); ink++ }
  }
  if (ink < 5 || ink > width * height * .75) return
  let raw = ''
  for (let start = 0; start < mask.length; start += 8192) raw += String.fromCharCode(...mask.subarray(start, start + 8192))
  return { imageWidth: image.width, imageHeight: image.height, x, y, width, height, color, mask: btoa(raw) }
}

export function matchesScreenTextProbe(image: Pixels, probe: ScreenTextProbe): boolean {
  if (image.width !== probe.imageWidth || image.height !== probe.imageHeight || image.data.length !== image.width * image.height * 4) return false
  const raw = atob(probe.mask)
  const columns = Math.ceil(probe.width / 16), changes = new Uint8Array(columns * Math.ceil(probe.height / 16))
  for (let py = 0; py < probe.height; py++) for (let px = 0; px < probe.width; px++) {
    const index = py * probe.width + px, ink = (raw.charCodeAt(index >> 3) & (1 << (index & 7))) !== 0
    const delta = distance(image.data, ((py + probe.y) * image.width + px + probe.x) * 4, probe.color)
    // Hysteresis ignores antialias blending while requiring the actual ink strokes to survive.
    if (ink ? delta > 48 ** 2 : delta < 20 ** 2) {
      const tile = Math.floor(py / 16) * columns + Math.floor(px / 16)
      if (++changes[tile] > 1) return false
    }
  }
  return true
}
