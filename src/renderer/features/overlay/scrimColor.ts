/** Composite the configured card colour over its scheme base, then darken it for the toolbar fade. */
export function captionScrimColor(color: string, opacity: number, scheme: 'dark' | 'light'): string {
  const alpha = Math.max(0, Math.min(1, opacity))
  const schemeBase = scheme === 'dark' ? '#0d0e10' : '#f7f7f7'
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)
  if (!match) {
    return `color-mix(in srgb, color-mix(in srgb, ${color} ${alpha * 100}%, ${schemeBase}) 82%, black 18%)`
  }
  const hex = match[1].length === 3
    ? [...match[1]].map(channel => channel + channel).join('')
    : match[1]
  const channels = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number]
  const baseChannels = [0, 2, 4].map(index => Number.parseInt(schemeBase.slice(index + 1, index + 3), 16)) as [number, number, number]
  const darkened = channels.map((channel, index) => Math.max(0, Math.round(channel * alpha + baseChannels[index] * (1 - alpha)) - 24))
  return `#${darkened.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}
