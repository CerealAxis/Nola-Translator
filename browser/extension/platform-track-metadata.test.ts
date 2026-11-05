import { expect, it } from 'vitest'
import { metadataTracks, hlsSubtitleTracks, xPlaylistOwners } from './platform-track-metadata'
it('discovers Netflix timed text download URLs while ignoring video downloads and credentials', () => {
  const result = metadataTracks({ result: { video_tracks: [{ downloadUrls: { a: 'https://cdn.nflxvideo.net/video' } }], timedtexttracks: [{ bcp47: 'en', languageDescription: 'English', ttDownloadables: { webvtt: { downloadUrls: { a: 'https://cdn.nflxvideo.net/subtitle' } } } }] }, token: 'private' }, 'netflix')
  expect(result).toEqual([{ id: 'metadata-0', language: 'en', label: 'English', url: 'https://cdn.nflxvideo.net/subtitle' }])
})
it('extracts only subtitle HLS media references from allowed media hosts', () => {
  expect(hlsSubtitleTracks('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="sub/en.m3u8"', 'https://video.twimg.com/video/master.m3u8', 'x')).toEqual([{ id: 'hls-1', language: 'en', label: 'English', url: 'https://video.twimg.com/video/sub/en.m3u8' }])
})

it('associates X GraphQL captions with each tweet and media rather than the page URL', () => {
  const tweet = (id: string, media: string) => ({ __typename: 'Tweet', rest_id: id, legacy: { full_text: 'Post', extended_entities: { media: [{ media_key: media, type: 'video', subtitles: [{ language_code: 'en', url: 'https://video.twimg.com/shared.vtt' }] }] } } })
  const tracks = metadataTracks({ timeline: [tweet('100', '7_1'), tweet('200', '7_2')] }, 'x')
  expect(tracks.map(track => ({ videoId: track.videoId, mediaId: track.mediaId, language: track.language }))).toEqual([{ videoId: '100', mediaId: '7_1', language: 'en' }, { videoId: '200', mediaId: '7_2', language: 'en' }])
})
it('does not invent an X owner from user IDs or expose unrelated video variants', () => {
  expect(metadataTracks({ user: { rest_id: '100' }, video_info: { variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/video.mp4' }] } }, 'x')).toEqual([])
  expect(metadataTracks({ subtitles: [{ src: 'https://video.twimg.com/captions.vtt' }] }, 'x')[0].videoId).toBeUndefined()
})
it('reads Netflix manifest-v4 textTracks downloadables without admitting video download URLs', () => {
  const tracks = metadataTracks({ textTracks: [{ language: 'ja', displayName: 'Japanese', downloadables: [{ urls: { primary: 'https://cdn.nflxvideo.net/track?format=webvtt' } }] }], videoTracks: [{ urls: { primary: 'https://cdn.nflxvideo.net/video' } }] }, 'netflix')
  expect(tracks).toHaveLength(1)
  expect(tracks[0]).toMatchObject({ language: 'ja', label: 'Japanese', url: 'https://cdn.nflxvideo.net/track?format=webvtt' })
})
it('handles quoted subtitle type and a comma inside an HLS label', () => {
  expect(hlsSubtitleTracks('#EXT-X-MEDIA:TYPE="SUBTITLES",NAME="English, CC",LANGUAGE="en",URI="en.vtt"', 'https://video.twimg.com/master.m3u8', 'x')[0]).toMatchObject({ language: 'en', label: 'English, CC' })
})

it('exposes owned X video masters separately from subtitle track choices', () => {
  const payload = { __typename: 'Tweet', rest_id: '100', legacy: { extended_entities: { media: [{ media_key: '7_1', video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/vid/master.m3u8?tag=1' }, { content_type: 'video/mp4', url: 'https://video.twimg.com/vid/video.mp4' }] } }] } } }
  expect(metadataTracks(payload, 'x')).toEqual([])
  expect(xPlaylistOwners(payload)).toEqual([{ id: 'metadata-0', language: 'auto', label: 'x', url: 'https://video.twimg.com/vid/master.m3u8?tag=1', videoId: '100', mediaId: '7_1' }])
  expect(xPlaylistOwners({ variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/unowned.m3u8' }] })).toEqual([])
})
