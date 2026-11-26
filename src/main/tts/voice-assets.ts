import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, rm, lstat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { voiceAssetIdSchema } from '../../shared/tts/voice-profile'
import { TtsCompatibilityError } from '../../shared/tts/errors'

export interface VoiceAsset {
  id: string;
  profileId: string;
  role: 'reference' | 'sample' | 'consent' | 'output';
  relativePath: string;
  mime: string;
  sha256: string;
  bytes: number;
  durationMs?: number;
  createdAt: string;
}

function contained(root: string, path: string): boolean {
  const value = relative(root, path)
  return !!value && !value.startsWith('..') && !isAbsolute(value)
}

export async function resolveVoiceAssetPath(root: string, relativePath: string): Promise<string> {
  if (isAbsolute(relativePath) || relativePath.includes(':') || relativePath.includes('\\')) throw new TtsCompatibilityError('ASSET_INVALID')
  const base = await realpath(root)
  const target = resolve(base, relativePath)
  if (!contained(base, target)) throw new TtsCompatibilityError('ASSET_INVALID')
  let current = base
  for (const segment of relative(base, target).split(/[\\/]/)) {
    current = join(current, segment)
    if ((await lstat(current)).isSymbolicLink()) throw new TtsCompatibilityError('ASSET_INVALID')
  }
  const resolved = await realpath(target)
  if (!contained(base, resolved)) throw new TtsCompatibilityError('ASSET_INVALID')
  return resolved
}

export function inspectVoiceAudio(data: Buffer): { mime: string; extension: string; durationMs?: number } {
  if (data.length >= 44 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE') {
    let byteRate = 0, bytes = 0
    for (let offset = 12; offset + 8 <= data.length;) {
      const size = data.readUInt32LE(offset + 4)
      if (offset + 8 + size > data.length) throw new TtsCompatibilityError('ASSET_INVALID')
      const kind = data.toString('ascii', offset, offset + 4)
      if (kind === 'fmt ' && size >= 16) byteRate = data.readUInt32LE(offset + 16)
      if (kind === 'data') bytes += size
      offset += 8 + size + (size % 2)
    }
    if (!byteRate || !bytes) throw new TtsCompatibilityError('ASSET_INVALID')
    return { mime: 'audio/wav', extension: 'wav', durationMs: bytes / byteRate * 1000 }
  }
  if (data.length >= 4 && (data.toString('ascii', 0, 3) === 'ID3' || data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) {
    let offset = 0, durationMs = 0, frames = 0
    if (data.toString('ascii', 0, 3) === 'ID3') {
      if (data.length < 10 || [...data.subarray(6, 10)].some(value => value > 127)) throw new TtsCompatibilityError('ASSET_INVALID')
      offset = 10 + (data[6] << 21 | data[7] << 14 | data[8] << 7 | data[9]) + (data[5] & 0x10 ? 10 : 0)
    }
    while (offset + 4 <= data.length) {
      if (data.toString('ascii', offset, offset + 3) === 'TAG' && data.length - offset === 128) break
      const header = data.readUInt32BE(offset), version = header >>> 19 & 3
      const layer = header >>> 17 & 3, bitrateIndex = header >>> 12 & 15, rateIndex = header >>> 10 & 3
      if ((header >>> 21) !== 0x7ff || version === 1 || layer !== 1 || !bitrateIndex || bitrateIndex === 15 || rateIndex === 3) throw new TtsCompatibilityError('ASSET_INVALID')
      const bitrate = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex] * 1000
      const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4)
      const size = Math.floor((version === 3 ? 144 : 72) * bitrate / rate) + (header >>> 9 & 1)
      if (offset + size > data.length) throw new TtsCompatibilityError('ASSET_INVALID')
      durationMs += (version === 3 ? 1152 : 576) / rate * 1000
      frames++; offset += size
    }
    if (!frames) throw new TtsCompatibilityError('ASSET_INVALID')
    return { mime: 'audio/mpeg', extension: 'mp3', durationMs }
  }
  throw new TtsCompatibilityError('ASSET_INVALID')
}

export class VoiceAssets {
  constructor(readonly root: string) {}

  async write(profileId: string, role: VoiceAsset['role'], data: Buffer): Promise<VoiceAsset> {
    voiceAssetIdSchema.parse(profileId)
    if (!data.length || data.length > 32 * 1024 * 1024) throw new TtsCompatibilityError('ASSET_INVALID')
    const audio = inspectVoiceAudio(data)
    await mkdir(this.root, { recursive: true })
    const base = await realpath(this.root)
    try { await mkdir(join(base, profileId)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const verified = await resolveVoiceAssetPath(base, profileId)
    const id = randomUUID()
    const relativePath = `${profileId}/${id}.${audio.extension}`
    const target = join(verified, `${id}.${audio.extension}`)
    const temporary = join(dirname(target), `${id}.tmp`)
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(data)
      await handle.sync()
    } finally { await handle.close() }
    try { await rename(temporary, target) } finally { await rm(temporary, { force: true }) }
    return { id, profileId, role, relativePath, mime: audio.mime, sha256: createHash('sha256').update(data).digest('hex'),
      bytes: data.length, durationMs: audio.durationMs, createdAt: new Date().toISOString() }
  }

  async read(asset: VoiceAsset): Promise<Buffer> {
    const path = await resolveVoiceAssetPath(this.root, asset.relativePath)
    const data = await readFile(path)
    if (data.length !== asset.bytes || createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new TtsCompatibilityError('ASSET_INVALID')
    return data
  }
}
