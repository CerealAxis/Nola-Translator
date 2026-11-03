/** VB-CABLE names its playback end Input and its recording end Output. */
export function vbCablePair(name: string, end: 'Input' | 'Output'): string | undefined {
  if (!/\bVB[- ]?Audio\b/i.test(name)) return
  const match = /\bCABLE(?:[- ]([A-D]))?\s+(Input|Output)\b/i.exec(name)
  if (match?.[2]?.toLowerCase() === end.toLowerCase()) return match[1]?.toUpperCase() ?? 'standard'
}
