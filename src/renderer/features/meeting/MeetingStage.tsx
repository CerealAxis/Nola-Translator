import { useId } from 'react'
import { AudioLines, Headphones, Mic, UserRound } from 'lucide-react'
import type { MeetingAudioTestResult, MeetingModeSettings, MeetingModeSnapshot } from '../../../shared/meeting-mode'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n, type TranslationKey } from '@/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type WireState = 'idle' | 'connected' | 'active' | 'failed'
type Checks = Partial<Record<'microphoneId' | 'uplinkOutputId' | 'downlinkInputId' | 'headphonesId', MeetingAudioTestResult>>

export function MeetingStage({ mode, snapshot, checks, heard }: {
  mode: MeetingModeSettings
  snapshot: MeetingModeSnapshot
  checks: Checks
  heard: boolean
}) {
  const { t } = useI18n()
  const arrowId = useId().replaceAll(':', '')
  const states = (direction: 'uplink' | 'downlink'): [WireState, WireState] => {
    const enabled = direction === 'uplink' ? mode.uplinkEnabled : mode.downlinkEnabled
    if (!enabled || snapshot.state === 'unknown' || snapshot.state === 'stopping') return ['idle', 'idle']
    if (snapshot.error && (!snapshot.error.direction || snapshot.error.direction === direction)) return ['failed', 'failed']
    const input = checks[direction === 'uplink' ? 'microphoneId' : 'downlinkInputId']
    const output = checks[direction === 'uplink' ? 'uplinkOutputId' : 'headphonesId']
    const lane = snapshot.state === 'running' ? snapshot.telemetry?.[direction] : undefined
    const fresh = lane?.inputAgeMs != null && lane.inputAgeMs < 1500
    const receiving = fresh && lane.inputPeak > 0.01 && !snapshot.paused
    const playing = lane?.playback === 'playing' && !snapshot.paused
    // An output write alone cannot verify that the selected headphones are audible.
    return [receiving ? 'active' : fresh ? 'connected' : input?.error ? 'failed' : input?.hasSignal ? 'connected' : 'idle',
      playing ? 'active' : lane?.playback === 'finished' ? 'connected' : output?.error ? 'failed'
        : (direction === 'uplink' ? output?.hasSignal : heard) ? 'connected' : 'idle']
  }
  const [upInput, upOutput] = states('uplink')
  const [downInput, downOutput] = states('downlink')
  const statusLabel = (direction: 'uplink' | 'downlink', output: boolean, state: WireState) => {
    const enabled = direction === 'uplink' ? mode.uplinkEnabled : mode.downlinkEnabled
    const key: TranslationKey = !enabled ? 'meeting.sceneDisabled' : snapshot.state === 'unknown' ? 'meeting.sceneUnknown'
      : state === 'failed' ? 'meeting.sceneFailed' : snapshot.paused ? 'meeting.scenePaused'
      : state === 'active' ? output ? 'meeting.scenePlaying' : 'meeting.liveSignal'
      : state === 'connected' ? 'meeting.sceneConnected' : 'meeting.sceneWaiting'
    return t(key)
  }
  const pair = (direction: 'uplink' | 'downlink', input: WireState, output: WireState) => <div className="nola-meeting-link">
    <svg className="nola-meeting-wires" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
      <defs>{(['idle', 'connected', 'active', 'failed'] as const).map(state => <marker key={state} id={`${arrowId}-${direction}-${state}`} className="nola-meeting-marker" data-state={state} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker>)}</defs>
      {[input, output].map((state, index) => {
        const forward = (direction === 'uplink') === (index === 0)
        const path = forward ? `M5 ${index ? 32 : 16} H95` : `M95 ${index ? 32 : 16} H5`
        return <g key={index} data-testid={`meeting-wire-${direction}-${index ? 'output' : 'input'}`} data-state={state} className="nola-meeting-wire">
          <path className="nola-meeting-wire__track" d={path} markerEnd={`url(#${arrowId}-${direction}-${state})`} />
          {state === 'active' ? <path className="nola-meeting-wire__pulse" d={path} pathLength="100" /> : null}
        </g>
      })}
    </svg>
    {[input, output].map((state, index) => {
      const label = `${t(direction === 'uplink' ? 'meeting.sendDirection' : 'meeting.receiveDirection')} · ${t(index ? 'meeting.sceneOutput' : 'meeting.sceneInput')} · ${statusLabel(direction, index === 1, state)}`
      return <Tooltip key={index}><TooltipTrigger render={<span tabIndex={0} role="img" />} className="nola-meeting-wire-hit" data-output={index === 1} aria-label={label} /><TooltipContent>{label}</TooltipContent></Tooltip>
    })}
  </div>

  return <Card data-slot="meeting-stage" className="nola-meeting-preview" role="region" aria-label={t('meeting.sceneTitle')}>
    <CardContent>
      <div className="nola-overlay-stage nola-meeting-scene">
        <span className="nola-meeting-endpoint" aria-label={t('meeting.sendDirection')}><Mic aria-hidden="true" /></span>
        {pair('uplink', upInput, upOutput)}
        <div className="nola-meeting-call" aria-hidden="true">
          <div className="nola-meeting-call__participants">
            {(['me', 'remote'] as const).map((person, index) => <div key={person} className="nola-meeting-participant" data-person={person}>
              <div className="nola-meeting-room"><span className="nola-meeting-room__window" /><span className="nola-meeting-room__shelf" />
                <Avatar size="lg"><AvatarFallback><UserRound /></AvatarFallback></Avatar>
              </div>
              <div className="nola-meeting-participant__name"><span>{t(`meeting.${person}`)}</span><AudioLines data-active={(index === 0 ? upInput : downInput) === 'active'} /></div>
            </div>)}
          </div>
        </div>
        {pair('downlink', downInput, downOutput)}
        <span className="nola-meeting-endpoint" aria-label={t('meeting.receiveDirection')}><Headphones aria-hidden="true" /></span>
      </div>
    </CardContent>
  </Card>
}
