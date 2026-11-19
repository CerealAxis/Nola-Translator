import { useId, type CSSProperties, type ReactNode } from 'react'
import { useI18n } from '@/i18n'

function SignScan({ x, y, width, height, surface, original, children }: {
  x: number; y: number; width: number; height: number; surface: string; original: ReactNode; children: ReactNode
}) {
  const reveal = useId()
  return <g transform={`translate(${x} ${y})`} style={{ '--scan-distance': `${height}px` } as CSSProperties}>
    <clipPath id={reveal} clipPathUnits="objectBoundingBox">
      <rect className="screen-scan-reveal" width="1" height="1" />
    </clipPath>
    {original}
    <g clipPath={`url(#${reveal})`}>
      <rect width={width} height={height} fill={surface} />
      <g className="screen-scan-blur">{original}</g>
      {children}
    </g>
    <g className="screen-scan-frame" fill="none" stroke="#326983" strokeWidth="1.6">
      <path d={`M0 7V0h7 M${width - 7} 0h7v7 M${width} ${height - 7}v7h-7 M7 ${height}H0v-7`} />
      <path className="screen-scan-line" d={`M0 0H${width}`} />
    </g>
  </g>
}

export function HarborScene() {
  const { t } = useI18n()

  return <svg className="screen-scene-game" viewBox="0 0 460 208" role="img" aria-label={t('screen.sceneDescription')}>
    <rect x="-920" width="2300" height="208" fill="#e1ede9" />
    <circle cx="359" cy="46" r="26" fill="#f8e4b1" />
    <g fill="#f4f7ef">
      <path d="M-159 37q9-13 24-10 12-25 34-13 15-3 23 9 18-2 25 14Z" />
      <path d="M396 51q10-12 26-10 12-21 37-13 11-3 24 9 16-1 26 14Z" />
      <path d="M-15 56q8-8 20-7 13-14 34-4 13-1 22 11Z" />
    </g>
    <path fill="#aec8c2" d="M-920 103Q-365 101-262 87t143-11q34 0 67 14t112 14q71 9 139 5t144-12q50 0 88-15 46-20 100-14 54 6 98 23t751 6v57H-920Z" />
    <path fill="#84aaa3" d="M-920 113Q-400 112-256 107q45-4 71-19l34-6 29 16 39 5 19 10q84 9 179-3 71-9 134 0 86 11 171-13l30-13 29 5 17-11 49 8 31 18q109 17 804 8v45H-920Z" />
    <g transform="translate(487 59)" stroke="#5a777b" strokeWidth="1.5" strokeLinejoin="round">
      <path fill="#f8ecd1" d="M-6 29l2-22h9l2 22Z" />
      <path fill="#bf7963" d="M-5 16h11l1 7H-6Z" stroke="none" />
      <path fill="#eedaa9" d="M-5 0h11v8H-5Z" />
      <path fill="#52777b" d="M-8 1l8-8 9 8Zm1 6H8v3H-7Z" />
    </g>
    <path fill="#88b8b7" d="M-920 115H1380v93H-920Z" />
    <path fill="#6faaa9" d="M-920 151Q-100 127 51 149t295 2q123-25 245-12t789 10v59H-920Z" />
    <path fill="#64a09e" d="M-920 192Q-450 205-144 186t522 6q99 12 229-8t773 7v17H-920Z" />
    <g fill="none" stroke="#cce1d8" strokeWidth="1.5" strokeLinecap="round" opacity=".82">
      <path d="M-371 144h39m17 0h22m-65 27h27m44 26h51m-33-75h38m25 0h13m-24 67h47m-11-37h30m17 0h19m-20-21h43m15 50h34m-12 15h23M36 194h38m-9 7h21m62-7h69m20 0h16m60 4h43m46-8h37m7 0h14m-40-52h38m32 33h30m16 0h41m-51 27h57m-21-72h19m49 26h32m27 0h13m-3 34h32m43-50h55" />
      <path d="M376 53q4-3 8 1 5-4 9-1M54 40q4-4 8 0 5-4 9-1m-9-8q3-2 6 0 3-3 6-1" stroke="#658789" />
    </g>
    <g stroke="#4d6b70" strokeWidth="2" strokeLinejoin="round">
      <path fill="#776e5e" d="M-186 167h16v19h-16zm48 0h15v17h-15zm102 0h15v22h-15zm62 0h15v17H26zm82 0h15v22h-15zm90 0h15v18h-15zm88 0h15v23h-15zm66 0h14v19h-14Z" />
      <path fill="#b78f69" d="M-312 159h681l16 14H-312Z" />
      <path fill="#e4c498" d="M-312 150h669l27 17H-312Z" />
      <path fill="none" stroke="#ba9878" strokeWidth="1.4" d="M-222 155h576m-645 7h655m-441-12 8 17m68-17 9 17m55-17 9 17m184-17 9 17m42-17 12 17m32-17 16 17" />
      <path fill="none" stroke="#725f52" strokeWidth="3" d="M-37 135v22m52-22v22m44-22v22m-96-19h96m-96 11h96" />
    </g>
    <g stroke="#385964" strokeWidth="2.5" strokeLinejoin="round">
      <path fill="#7a9e9a" d="M60 64l41-24h41v18h24v95H60Z" />
      <path fill="#47747a" d="M55 63l45-28h51v6h-49L61 67h-6Z" />
      <path fill="#d9e1d1" d="M77 68h58v83H77Z" />
      <circle cx="105" cy="86" r="12" fill="#56818a" />
      <circle cx="105" cy="86" r="8.5" fill="#b8d4d0" />
      <path fill="none" stroke="#688f93" strokeWidth="1.2" d="M105 78v16m-8-8h16" />
      <path fill="#f2e3c0" d="M126 61h144v93H126Z" />
      <path fill="#b7c5ae" d="M270 61l20 15v78h-20Z" />
      <path fill="#356b72" d="M116 61l17-15h133l25 20h-16l-10-5Z" />
      <path fill="#5b8a8d" d="M129 56l10-9h117l15 9Z" stroke="none" />
      <path fill="#d8b18b" d="M78 146h213v9H78Z" />
      <path fill="#537e84" d="M141 116h27v20h-27zm34 0h24v20h-24zm35 0h39v37h-39Z" />
      <path fill="#b8d4c9" stroke="none" d="M144 119h20l-20 13Zm34 0h17l-17 13Zm35 0h15v31h-15Zm19 0h14v31h-14Z" />
      <path fill="#9d8169" d="M201 153h56l6 7h-68Z" />
      <path fill="none" stroke="#d1ba9a" strokeWidth="1.5" d="M81 112h40m-39 6h36m-31 21h32m158-52 9 7m-9 2 9 6m-9 29 9 5" />
      <path fill="#d0a16f" d="M93 137h19l-2 11H96Z" />
      <path fill="#73967e" stroke="none" d="M102 137q-10-2-12-11 10-2 13 8 0-10 9-12 4 8-8 15Z" />
    </g>
    <g stroke="#3e6569" strokeWidth="2" strokeLinejoin="round">
      <path fill="#477176" d="M355 135h10v14h-10Zm56-1h9v15h-9Z" />
      <path fill="#f2e6cc" d="M357 130v-23h22l8-12h32l13 16v19Z" />
      <path fill="#c78469" d="M382 97l6-6h32l9 8h-42Z" />
      <path fill="#68979a" d="M389 104h11v11h-15Zm15 0h12l9 11h-21Z" />
      <path fill="#c78469" d="M350 127h94l-10 17h-64q-14 0-20-17Z" />
      <path fill="#f5e6c7" d="M350 125h94l-4 8h-85Z" />
      <path fill="none" d="M413 91V78m-1 1-11 4 11 2m-45 40v-8m-8 2h17" />
      <path fill="none" stroke="#dfaf8b" d="M370 139h61" />
    </g>
    <g stroke="#476468" strokeWidth="2" strokeLinejoin="round">
      <path fill="#bc9b78" d="M306 127h6v35h-6zm30 0h6v35h-6z" />
      <rect x="131" y="64" width="135" height="43" rx="3" fill="#f7eccf" />
      <rect x="286" y="102" width="76" height="45" rx="3" fill="#f7eccf" />
    </g>
    <g fill="#294e57" textAnchor="middle" fontWeight="600">
      <SignScan x={135} y={68} width={127} height={35} surface="#f7eccf" original={<g>
        <text x="63.5" y="15" fontSize="14" letterSpacing="1.35">TIDEGLASS</text>
        <text x="63.5" y="29" fontSize="11" letterSpacing=".85">FERRY TERMINAL</text>
      </g>}>
        <text x="63.5" y="15" fontSize="14">{t('screen.sceneHarbor')}</text>
        <text x="63.5" y="30" fontSize="13">{t('screen.sceneTerminal')}</text>
      </SignScan>
      <SignScan x={290} y={106} width={68} height={18} surface="#f7eccf" original={
        <text x="34" y="12" fontSize="10">NEXT FERRY</text>
      }>
        <text x="34" y="13" fontSize="11">{t('screen.sceneDeparture')}</text>
      </SignScan>
      <text x="324" y="141" fontSize="15" letterSpacing="1">08:40</text>
    </g>
    <g transform="translate(267 139)" stroke="#4d6466" strokeWidth="1.5" strokeLinejoin="round">
      <ellipse cx="4" cy="30" rx="10" ry="2" fill="#886f5b" stroke="none" opacity=".35" />
      <path fill="#50737d" d="M-1 16h9l2 12H5l-2-7-2 7h-4Z" />
      <path fill="#cd8769" d="M0 3h7l4 12-4 3h-9l-1-5Z" />
      <path fill="#ddab80" d="M0-6h8l2 6-3 5H1l-3-4Z" />
      <path fill="#ecc582" d="M-3-4l2-6 7-2 4 4 3 4v2H-5Z" />
      <path fill="#667d6e" d="M-2 7h4v10h-6v-8Z" />
    </g>
    <g fill="#c48768" stroke="#48696b" strokeWidth="1.6">
      <path fill="none" d="M34 160q-4 9 4 21m421-20q4 9-3 21" />
      <path d="M31 182q5-6 11 0l2 4q-7 5-14 0Zm419 0q6-5 11 0l2 4q-7 5-14 0Z" />
    </g>
  </svg>
}
