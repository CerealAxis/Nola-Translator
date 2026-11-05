import { expect, it } from 'vitest'
import { metadataTracks, hlsSubtitleTracks } from './platform-track-metadata'
it('discovers Netflix timed text download URLs while ignoring video downloads and credentials', () => {
  const result = metadataTracks({ result: { video_tracks: [{ downloadUrls: { a: 'https://cdn.nflxvideo.net/video' } }], timedtexttracks: [{ bcp47: 'en', languageDescription: 'English', ttDownloadables: { webvtt: { downloadUrls: { a: 'https://cdn.nflxvideo.net/subtitle' } } } }] }, token: 'private' }, 'netflix')
  expect(result).toEqual([{ id: 'metadata-0', language: 'en', label: 'English', url: 'https://cdn.nflxvideo.net/subtitle' }])
})
it('extracts only subtitle HLS media references from allowed media hosts', () => {
  expect(hlsSubtitleTracks('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="sub/en.m3u8"', 'https://video.twimg.com/video/master.m3u8', 'x')).toEqual([{ id: 'hls-1', language: 'en', label: 'English', url: 'https://video.twimg.com/video/sub/en.m3u8' }])
})
