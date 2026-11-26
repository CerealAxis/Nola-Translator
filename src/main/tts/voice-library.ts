import { DatabaseSync } from 'node:sqlite'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ttsVoiceProfileSchema, type TtsVoiceProfile } from '../../shared/tts/voice-profile'
import { voiceBindingSchema, type TtsVoiceBinding } from '../../shared/tts/voice-binding'
import type { ResolvedTtsRequest } from '../../shared/tts/synthesis'
import type { VoiceAsset } from './voice-assets'
import { TtsCompatibilityError } from '../../shared/tts/errors'

export class VoiceLibrary {
  private constructor(private readonly db: DatabaseSync) {}

  static async open(root: string): Promise<VoiceLibrary> {
    await mkdir(root, { recursive: true })
    const db = new DatabaseSync(join(root, 'voices.sqlite3'))
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS voice_profiles(
        id TEXT PRIMARY KEY, revision INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
        default_language TEXT, metadata_json TEXT NOT NULL, consent_json TEXT, license_json TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS voice_profile_revisions(
        profile_id TEXT NOT NULL REFERENCES voice_profiles(id), revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL, PRIMARY KEY(profile_id, revision));
      CREATE TABLE IF NOT EXISTS voice_assets(
        id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, role TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE,
        mime TEXT NOT NULL, sha256 TEXT NOT NULL, duration_ms REAL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_bindings(
        id TEXT NOT NULL, revision INTEGER NOT NULL, profile_id TEXT NOT NULL, profile_revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL, PRIMARY KEY(id, revision));
      CREATE TABLE IF NOT EXISTS voice_samples(
        profile_id TEXT NOT NULL, profile_revision INTEGER NOT NULL, asset_id TEXT NOT NULL REFERENCES voice_assets(id),
        transcript TEXT NOT NULL, PRIMARY KEY(profile_id, profile_revision));
      CREATE TABLE IF NOT EXISTS tts_generations(
        id TEXT PRIMARY KEY, request_json TEXT NOT NULL, state TEXT NOT NULL, output_asset_id TEXT,
        error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    return new VoiceLibrary(db)
  }

  list(includeDeleted = false): TtsVoiceProfile[] {
    const rows = this.db.prepare(`SELECT metadata_json FROM voice_profiles ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY updated_at DESC`).all()
    return rows.map(row => {
      const profile = ttsVoiceProfileSchema.parse(JSON.parse(String(row.metadata_json)))
      return this.profile(profile.id, profile.revision)!
    })
  }

  profile(id: string, revision?: number): TtsVoiceProfile | undefined {
    const latest = this.db.prepare('SELECT metadata_json, deleted_at FROM voice_profiles WHERE id=?').get(id)
    if (!latest) return
    const row = revision === undefined ? latest : this.db.prepare('SELECT snapshot_json AS metadata_json FROM voice_profile_revisions WHERE profile_id=? AND revision=?').get(id, revision)
    if (!row) return
    const profile = ttsVoiceProfileSchema.parse({ ...JSON.parse(String(row.metadata_json)), ...(latest.deleted_at ? { deletedAt: latest.deleted_at } : {}) })
    const sample = this.db.prepare('SELECT asset_id, transcript FROM voice_samples WHERE profile_id=? AND profile_revision=?').get(id, profile.revision)
    if (sample && !profile.lockedSampleAssetId) {
      profile.lockedSampleAssetId = String(sample.asset_id)
      profile.representations.push({ kind: 'reference-audio', assetId: String(sample.asset_id), transcript: String(sample.transcript) })
    }
    return profile
  }

  save(input: TtsVoiceProfile, expectedRevision?: number, binding?: TtsVoiceBinding): TtsVoiceProfile {
    const profile = ttsVoiceProfileSchema.parse(input)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.profile(profile.id)
      if (previous?.revision !== expectedRevision || previous?.deletedAt) throw new Error('voiceRevisionConflict')
      const now = new Date().toISOString()
      const next = { ...profile, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now }
      if (previous?.kind === 'design' && JSON.stringify(previous.representations.find(item => item.kind === 'design-recipe'))
        !== JSON.stringify(profile.representations.find(item => item.kind === 'design-recipe'))) {
        delete next.lockedSampleAssetId
        next.representations = next.representations.filter(item => item.kind !== 'reference-audio' || item.assetId !== previous.lockedSampleAssetId)
          .map(item => item.kind === 'design-recipe' ? { ...item, renderedSampleAssetId: undefined } : item)
      }
      const body = JSON.stringify(next)
      this.db.prepare(`INSERT INTO voice_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, name=excluded.name, kind=excluded.kind,
        default_language=excluded.default_language, metadata_json=excluded.metadata_json,
        consent_json=excluded.consent_json, license_json=excluded.license_json,
        updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`).run(next.id, next.revision, next.name, next.kind,
        next.defaultLanguage ?? null, body, next.consent ? JSON.stringify(next.consent) : null,
        next.license ? JSON.stringify(next.license) : null, next.createdAt, next.updatedAt, next.deletedAt ?? null)
      this.db.prepare('INSERT INTO voice_profile_revisions VALUES(?,?,?)').run(next.id, next.revision, body)
      if (binding) this.saveBinding({ ...binding, profileId: next.id, profileRevision: next.revision })
      if (previous && JSON.stringify(previous.representations) === JSON.stringify(profile.representations)
        && previous.primaryReferenceAssetId === profile.primaryReferenceAssetId && !next.deletedAt) {
        for (const entry of this.bindings(previous.id, previous.revision)) this.saveBinding({ ...entry, id: randomUUID(), revision: 1, profileRevision: next.revision })
      }
      this.db.exec('COMMIT')
      return next
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  delete(id: string, expectedRevision: number): TtsVoiceProfile {
    const profile = this.profile(id)
    if (!profile) throw new Error('voiceMissing')
    return this.save({ ...profile, deletedAt: new Date().toISOString() }, expectedRevision)
  }

  addAsset(asset: VoiceAsset): void {
    this.db.prepare('INSERT INTO voice_assets VALUES(?,?,?,?,?,?,?,?,?)').run(asset.id, asset.profileId, asset.role,
      asset.relativePath, asset.mime, asset.sha256, asset.durationMs ?? null, asset.bytes, asset.createdAt)
  }

  lockSample(profileId: string, revision: number, assetId: string, transcript: string): void {
    this.db.prepare('INSERT INTO voice_samples VALUES(?,?,?,?) ON CONFLICT(profile_id, profile_revision) DO NOTHING')
      .run(profileId, revision, assetId, transcript)
  }

  asset(id: string): VoiceAsset {
    const row = this.db.prepare('SELECT * FROM voice_assets WHERE id=?').get(id)
    if (!row) throw new TtsCompatibilityError('ASSET_INVALID', { assetId: id })
    return { id: String(row.id), profileId: String(row.profile_id), role: String(row.role) as VoiceAsset['role'],
      relativePath: String(row.relative_path), mime: String(row.mime), sha256: String(row.sha256), bytes: Number(row.bytes),
      durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms), createdAt: String(row.created_at) }
  }

  bindings(profileId: string, revision: number): TtsVoiceBinding[] {
    return this.db.prepare(`SELECT snapshot_json FROM voice_bindings b WHERE profile_id=? AND profile_revision=?
      AND revision=(SELECT MAX(revision) FROM voice_bindings WHERE id=b.id)`).all(profileId, revision)
      .map(row => voiceBindingSchema.parse(JSON.parse(String(row.snapshot_json))))
  }

  saveBinding(input: TtsVoiceBinding): void {
    const binding = voiceBindingSchema.parse(input)
    this.db.prepare('INSERT INTO voice_bindings VALUES(?,?,?,?,?)').run(binding.id, binding.revision,
      binding.profileId, binding.profileRevision, JSON.stringify(binding))
  }

  activateBinding(request: ResolvedTtsRequest): void {
    if (request.conditioning.kind !== 'provider-voice' || !request.profileId || !request.profileRevision) return
    const condition = request.conditioning
    const binding = this.bindings(request.profileId, request.profileRevision).find(item => item.id === condition.bindingId)
    if (binding && !binding.activatedAt && binding.voiceId === condition.voiceId) {
      this.saveBinding({ ...binding, revision: binding.revision + 1, activatedAt: new Date().toISOString() })
    }
  }

  enqueue(request: ResolvedTtsRequest): string {
    const id = randomUUID(), now = new Date().toISOString()
    this.db.prepare('INSERT INTO tts_generations VALUES(?,?,?,?,?,?,?)').run(id, JSON.stringify(request), 'queued', null, null, now, now)
    return id
  }

  finish(id: string, state: 'complete' | 'failed' | 'cancelled', outputAssetId?: string, errorCode?: string): void {
    this.db.prepare(`UPDATE tts_generations SET state=?, output_asset_id=?, error_code=?, updated_at=? WHERE id=? AND state='queued'`)
      .run(state, outputAssetId ?? null, errorCode ?? null, new Date().toISOString(), id)
  }

  history(): Array<{ id: string; request: ResolvedTtsRequest; state: string; outputAssetId?: string }> {
    return this.db.prepare('SELECT * FROM tts_generations ORDER BY created_at DESC LIMIT 200').all().map(row => ({
      id: String(row.id), request: JSON.parse(String(row.request_json)), state: String(row.state),
      outputAssetId: row.output_asset_id === null ? undefined : String(row.output_asset_id),
    }))
  }

  close(): void { this.db.close() }
}
