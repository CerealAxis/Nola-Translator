import { useId } from 'react'

const ink = '#203755'
const blue = '#527bd4'
const deepBlue = '#315da9'
const lightBlue = '#b6d6f6'
const teal = '#2a9f98'
const mint = '#a9e5d6'
const violet = '#8b79c6'
const peach = '#ffd3ae'
const coral = '#ef9b89'
const cream = '#fff7e9'

function Student() {
  return (
    <>
      <path d="M113 192c-15 10-25 25-35 40-5 7-4 15 5 19l59 15 27-12-45-23 31-24Z" fill={deepBlue} />
      <path d="M169 188c24 5 34 25 48 43 5 8 3 17-7 19l-55 14-14-15 39-20-37-18Z" fill={blue} />
      <path d="m150 246 14 10-4 13-22 2c-6 0-10-5-6-9l10-7Zm20 6 25 2 12 10c3 4-1 8-6 8h-35c-8 0-9-8-5-13Z" fill={ink} />
      <path d="M130 121c-18 4-32 17-33 32l-3 50c22 13 62 13 92-2l-11-45c-3-17-15-30-29-34Z" fill={mint} />
      <path d="M103 151c-9 9-14 22-15 35-1 7 4 12 12 12l35-5-3-13-22 2 7-19m53-14 12 32 24-6 4 13-32 12c-8 3-14-1-16-8l-9-27" fill="#78cbbb" />
      <path d="m136 119-2 17c2 9 12 10 20 2l-4-19" fill={peach} />
      <path d="M127 90c0-16 12-28 27-27 17 1 26 14 25 31l-4 19c-2 10-9 17-19 16-16-1-28-16-29-39Z" fill={peach} />
      <path d="M125 103c-7-4-13-14-10-24 3-13 15-19 24-19 10-9 28-8 39 2 6 5 9 13 7 21-14 0-26-3-34-12-4 11-13 17-24 17l4 17Z" fill={ink} />
      <path d="M120 94c-4-14 4-30 17-35 16-7 34-1 42 12" fill="none" stroke={blue} strokeWidth="5" strokeLinecap="round" />
      <rect x="117" y="87" width="12" height="20" rx="6" fill={blue} transform="rotate(-12 123 97)" />
      <path d="m158 92 1 4m10-2v3m-11 14c3 3 7 3 10 1" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <path d="M129 173c13 0 22 4 30 10 10-10 22-14 37-13l-7 29c-11 0-19 3-29 9-13-4-24-8-38-8Z" fill={cream} />
      <path d="m122 200 38 8 29-9 2 4-31 11-39-10Z" fill={violet} />
      <path d="m159 183 1 25m-26-25 16 5m-18 2 15 5m21-6 15-7m-13 13 12-6" fill="none" stroke={violet} strokeWidth="1.6" strokeLinecap="round" />
      <path d="m111 183 17-4 6 4-8 4 5 5-16 2m80-18 8-4 7 6-4 7-13 5" fill={peach} />
    </>
  )
}

function Researcher() {
  return (
    <>
      <path d="m148 195 40 1 5 66-15 2-11-49-5 48-16 2Z" fill={deepBlue} />
      <path d="m148 258 14 1 3 10c1 4-1 6-5 6h-27c-5 0-6-5-2-7Zm31 0 14-1 8 10c3 4 1 8-5 8h-20c-5 0-7-5-4-8Z" fill={ink} />
      <path d="M152 118c-17 3-27 13-31 27l-7 27 15 7 10-23-6 56c16 7 41 8 68 1l-9-59 12 16 17-7-13-28c-8-14-26-20-40-21Z" fill="#79cbbf" />
      <path d="m151 122 15 23 13-23 7 86-34 5Z" fill={cream} />
      <path d="m151 121-10 16 10 7-7 10 7 18m28-49 10 15-8 9 9 8-7 17m-44 12 12 2-1 11-13-1m52-11 7-1" fill="none" stroke={teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m157 107-1 19c1 6 14 10 20 1l-4-20" fill="#b97c5a" />
      <path d="M147 79c1-15 14-22 29-20 16 3 23 16 18 35-3 12-11 24-25 23-15-1-25-16-22-38Z" fill="#c98b65" />
      <path d="M147 96c-8-2-14-13-11-23 2-7 6-11 12-14 2-9 11-15 21-14 5 0 10 3 13 5 15-2 24 9 21 21-11 6-23 2-30-5-5 9-14 13-24 13Z" fill={ink} />
      <path d="M146 92c-5-5-1-11 4-9 5 2 6 8 4 12" fill="#c98b65" />
      <path d="M158 85c3-4 9-3 14-1l-1 9c-2 5-10 5-12 0Zm16 0 3 1m1 0c4-3 10-3 14 0l-2 8c-2 5-10 4-11-1Zm-21-1-5-1m18 22c3 2 6 1 8-1" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M112 128h27v48h-37v-39Z" fill={cream} transform="rotate(-12 121 152)" />
      <path d="m110 140 16-3m-16 10 20-4m-19 11 17-3m-15 10 12-3" fill="none" stroke={deepBlue} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M210 133h32v46h-37v-41Z" fill={lightBlue} transform="rotate(12 222 156)" />
      <path d="m213 148 19 4m-20 2 15 3m-18 10 7-6 3 4 8-6" fill="none" stroke={deepBlue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M118 164c-4-3-9-1-9 3-1 6 5 12 10 11l10-6-3-9Zm91-3c4-3 9-1 11 2 3 5 0 10-5 13l-9-2-3-9Z" fill="#c98b65" />
    </>
  )
}

function TeamMember() {
  return (
    <>
      <path d="M182 180h60l-4 65h-58Z" fill="#d3e9f8" />
      <path d="M197 198v66m31-65v67m-47-66h53" fill="none" stroke={deepBlue} strokeWidth="4" strokeLinecap="round" />
      <path d="M181 105c6 8 9 18 13 28 4 9 8 12 15 18-12 11-42 16-60 8l-12-43Z" fill="#684952" />
      <path d="M142 187c-9 15-6 32 9 37l25 9 5 28 15-3-2-42c-1-10-9-18-24-25Z" fill={deepBlue} />
      <path d="M159 182c21 4 31 13 42 24l15 48-14 6-25-38-33-13Z" fill={blue} />
      <path d="m182 254 13-1 8 11c3 4 1 7-4 7h-28c-4 0-5-5-1-8Zm20 0 15-4 11 10c4 5 1 8-4 8l-22 2c-4 0-5-4-3-8Z" fill={ink} />
      <path d="M140 119c-19 3-32 20-29 38l7 38c18 9 41 10 62-2l-11-48c-4-15-11-23-29-26Z" fill={violet} />
      <path d="M151 129c10 7 15 19 19 32l25-2 3 13-34 10c-8 0-13-7-15-14l-7-23" fill="#7362af" />
      <path d="m138 112-3 15c3 6 13 8 18 0l-2-15" fill={coral} />
      <path d="M124 86c0-14 10-25 25-25 15 0 26 12 26 29 0 17-9 29-23 29-15 0-27-13-28-33Z" fill={peach} />
      <path d="M126 103c-11-4-14-16-13-26 1-10 11-20 22-21 10-9 26-5 35 4 7 5 10 15 8 24-14-2-24-10-28-20-5 13-13 19-25 22l5 16Z" fill="#684952" />
      <path d="M118 93c-3-15 3-30 15-36 11-6 23-5 32 1m-42 41c3 8 10 12 20 13" fill="none" stroke={deepBlue} strokeWidth="3.6" strokeLinecap="round" />
      <rect x="116" y="86" width="12" height="19" rx="6" fill={blue} transform="rotate(-12 122 96)" />
      <circle cx="144" cy="112" r="3" fill={deepBlue} />
      <path d="M151 90v4m13-3v4m-11 9c4 4 8 4 11 0" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <path d="m191 166 9-9 14 2c4 1 4 6 0 7l-17 6Z" fill={peach} />
      <path d="M214 118h40l-8 44h-44Z" fill={deepBlue} />
      <path d="M217 122h33l-6 34h-36Z" fill={lightBlue} />
      <path d="M217 149c2-6 8-9 12-6 3 1 4 3 4 6m7-11h5m-6 5h5" fill="none" stroke={deepBlue} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="225" cy="137" r="4" fill={deepBlue} />
      <path d="M186 161h61v6h-58c-3 0-5-3-3-6Z" fill={blue} />
    </>
  )
}

function Creator() {
  return (
    <>
      <path d="M123 191h65v11h-65Z" fill={deepBlue} />
      <path d="m132 201-10 65m56-65 12 65m-62-24h56" fill="none" stroke={deepBlue} strokeWidth="4" strokeLinecap="round" />
      <path d="M139 178c14-6 38-5 51 5l25 44 4 33-13 4-13-35-32-27Z" fill={teal} />
      <path d="M131 182c22-6 43 0 54 16l3 41-20 27-13-5 14-27-10-22c-23 2-34-7-28-30Z" fill="#69bfad" />
      <path d="m156 257 14 4 1 10c0 4-3 7-7 7h-27c-5 0-5-5-1-8Zm49 1 14-3 14 10c4 3 2 8-3 8h-24c-7 0-7-9-1-15Z" fill={ink} />
      <path d="M135 111c-14 4-26 17-27 35l-2 43c12 10 44 9 62-2l-7-47c-3-18-13-29-26-29Z" fill={violet} />
      <path d="M150 135c7 6 9 18 15 23l28 1 2 13-37 3c-10-1-16-9-20-21m-23-16c-5 10-7 22-4 31 1 4 4 6 11 5l19-6" fill="none" stroke="#6b59a7" strokeWidth="2.6" strokeLinecap="round" />
      <path d="m132 104-3 15c4 7 11 8 17 1l-1-14" fill="#b57557" />
      <path d="M123 76c2-14 14-23 28-22 16 2 26 13 23 30-2 19-12 30-25 29-17-1-28-16-26-37Z" fill="#cd9471" />
      <circle cx="135" cy="54" r="13" fill={ink} />
      <path d="M125 96c-9-3-15-11-13-21-1-16 16-27 30-25 12-7 27-4 35 8 6 9 2 18-4 21l-5-12c-10 9-23 11-35 7l-6 19Z" fill={ink} />
      <path d="M121 82c-1-9 2-16 10-21m20 22v4m13-4v4m-12 10c2 3 7 3 10 0" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <rect x="118" y="81" width="11" height="17" rx="5" fill="#f8bc82" transform="rotate(-10 123 89)" />
      <path d="m186 163 10-6 11 4c3 1 2 4 0 5l-15 7Z" fill="#cd9471" />
      <path d="M210 116h46l-9 52h-52Z" fill={ink} />
      <path d="M212 121h39l-5 26h-42Z" fill={lightBlue} />
      <path d="m221 126-2 13 12-6Z" fill={deepBlue} />
      <path d="M207 152h13m4 0h17m-36 5h15m3 0h7m3 0h8" fill="none" stroke={mint} strokeWidth="2" strokeLinecap="round" />
      <path d="M179 166h68v5h-65c-3 0-4-3-3-5Z" fill={blue} />
      <path d="M208 89h25v16h-25Z" fill={violet} transform="rotate(10 220 97)" />
      <path d="m207 88 25-5 1 6-25 5Z" fill={ink} />
      <path d="m211 88 4 5m3-6 4 4m3-6 4 5" fill="none" stroke={cream} strokeWidth="1.5" />
    </>
  )
}

function Player() {
  return (
    <>
      <path d="M205 85h55a5 5 0 0 1 5 5l-4 38a5 5 0 0 1-5 5h-55a5 5 0 0 1-5-5l4-38a5 5 0 0 1 5-5Z" fill={ink} />
      <path d="M206 90h54l-4 37h-54Z" fill={lightBlue} />
      <path d="m207 112 14-12 10 10 9-6 13 8Z" fill={deepBlue} opacity=".66" />
      <path d="M207 115h43l-1 9h-43Z" fill={ink} />
      <path d="M211 119h16m4 0h11" fill="none" stroke={cream} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M123 190c20-8 48-6 65 3 16 10 36 26 48 45 8 13 4 25-8 29-30 10-100 9-124-2-20-9-23-25-9-44Z" fill={lightBlue} />
      <path d="M104 245c27 7 67 10 100-6" fill="none" stroke="#8eb9e9" strokeWidth="2" strokeLinecap="round" />
      <path d="M136 182c-16 9-21 20-13 31l31 25 12 22 16-4-12-36-23-24Z" fill={deepBlue} />
      <path d="M169 182c23-3 37 10 49 26 7 11 4 21-8 27l-37 19-11-13 29-21-30-10Z" fill={blue} />
      <path d="m163 247 17 2 5 10c3 6 0 9-6 9h-32c-4 0-5-5-2-8Zm31-8 15-4 13 10c4 5 1 9-5 9h-26c-6 0-8-5-5-9Z" fill={ink} />
      <path d="M133 117c-16 5-28 19-29 39l2 34c14 12 49 12 75-1l-2-39c-3-18-14-30-31-32Z" fill="#f3b575" />
      <path d="M108 151c-5 8-6 19 0 23 7 5 18 2 26-1m32-21c6 12 9 14 23 13" fill="none" stroke="#c98364" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m132 117 7 18 12-2 9-14" fill="#f5cb91" stroke="#d58b6e" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m137 107-2 14c2 7 12 9 18 2l-3-15" fill={coral} />
      <path d="M123 82c1-15 13-25 28-23 17 2 26 15 23 32-3 15-12 26-24 24-18-2-29-18-27-33Z" fill={peach} />
      <path d="M126 100c-10-3-15-10-16-20-2-13 6-24 16-25-1-7 7-10 12-6 4-8 13-7 19-2 8-5 19 0 22 9 7 5 7 15 0 21-12-1-22-5-30-14-3 10-12 17-24 19Z" fill={ink} />
      <path d="M148 86v4m13-4v4m-12 11c4 4 9 3 12-1" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <path d="M139 158c10-5 21-5 32 0l12-1c8 0 11 5 12 11l2 13c1 7-5 11-10 7l-12-10h-29l-10 11c-5 5-12 0-11-6l2-14c1-6 5-9 12-11Z" fill={ink} />
      <path d="M137 167h12m-6-6v12m31-7h.1m7 5h.1m-8 5h.1m-6-5h.1" fill="none" stroke={mint} strokeWidth="2.7" strokeLinecap="round" />
      <path d="M124 162c6-4 10-3 11 1 2 6-3 12-8 15l-8-5Zm66-1c4-4 10-3 12 2l1 10-9 6c-5-4-7-12-4-18Z" fill={peach} />
    </>
  )
}

function Reader() {
  return (
    <>
      <path d="M106 202c24-14 54-10 82-3 20 5 42 17 50 32 10 16-1 28-17 32-25 7-100 8-126-5-22-11-15-38 11-56Z" fill="#bde8de" />
      <path d="M108 234c13 13 32 20 50 17m34-38c15 5 26 13 32 23" fill="none" stroke="#87c9bb" strokeWidth="2" strokeLinecap="round" />
      <path d="M170 178c16-6 36 2 48 22l11 25-14 13-24-27-28-5Z" fill={deepBlue} />
      <path d="M154 182c18 0 29 10 42 22l10 26-11 15-22-20-38-15Z" fill={blue} />
      <path d="m195 230 12-5 18 8c5 2 4 8-2 9l-29 6c-8 0-9-6-4-11Zm20-8 14-4 15 8c5 3 2 8-4 9l-23 4c-6 0-8-5-5-9Z" fill={ink} />
      <path d="M145 76c-10-21-28-22-35-10-5 8-1 20 4 29 9-10 19-13 31-19Z" fill="#694d57" />
      <path d="M128 124c-17 4-29 17-35 36l-5 38c18 14 49 15 80 6l3-42c0-20-12-31-26-36Z" fill={coral} />
      <path d="M96 157c-9 10-13 22-8 29 3 6 11 8 18 4l28-14-5-11-21 10 5-10m37-30c11 9 14 22 15 34l20 1-1 12-27 7c-7 1-12-3-14-9l-9-29" fill="#e68a82" />
      <path d="m136 117-5 13c2 8 11 10 17 2l1-15" fill={peach} />
      <path d="M126 92c4-16 18-25 34-20 15 4 21 18 16 34-5 15-16 23-29 21-16-4-25-18-21-35Z" fill={peach} />
      <path d="M129 111c-10-3-16-13-14-26 2-12 10-19 22-20 13-7 28-2 37 9 5 5 6 11 6 17-14-1-23-9-27-17-6 12-14 20-25 21Z" fill="#694d57" />
      <path d="m152 97 1 3m12-3v4m-15 11c3 3 8 3 11 0" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <path d="M125 151c16-4 30-2 43 5 9-8 22-13 39-14l-4 39c-12 0-24 5-35 13-15-6-27-6-40-5Z" fill={cream} />
      <path d="m127 188 41 6 35-13v6l-35 13-40-6Z" fill={violet} />
      <path d="M168 156v38m-34-34 26 5 1 9-27-4Zm40 3 23-8-1 13-23 7Zm-37 10 22 4m15 2 18-6" fill="none" stroke={violet} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m118 172 9-7c4-3 8 0 6 4l-8 7 7-1c3 0 3 3 1 4l-14 7Zm78 2 6-6c4-3 8 0 8 4l-2 8-11 6-6-7Z" fill={peach} />
    </>
  )
}

const audienceFigures = {
  students: Student,
  researchers: Researcher,
  teams: TeamMember,
  creators: Creator,
  players: Player,
  readers: Reader,
}

const languageRibbons = {
  students: `M-120-125H126
    C127-76 165-51 172-15C180 25 156 45 171 76
    C184 102 204 109 203 138C202 159 189 168 181 186
    C172 180 165 171 164 152C162 129 132 122 104 123
    C57 124 35 97 6 89C-33 78-76 92-120 68Z`,
  researchers: `M-120-125H133
    C128-79 157-57 169-26C179 1 165 29 180 55
    C194 79 210 76 218 96C225 114 225 127 222 147
    C206 142 200 130 196 118C187 99 169 102 141 111
    C93 127 58 112 32 99C-20 74-68 96-120 63Z`,
  teams: `M-120-125H119
    C129-83 162-60 170-24C177 8 159 24 176 51
    C191 74 217 78 229 98C234 109 234 125 228 137
    C218 128 205 123 196 114C178 95 164 98 143 106
    C93 126 55 108 26 93C-20 68-73 91-120 64Z`,
  creators: `M-120-125H133
    C141-83 173-56 178-22C184 11 165 38 183 61
    C196 77 223 83 229 103C235 120 228 128 225 141
    C214 131 201 128 192 115C176 94 160 101 133 112
    C87 131 55 114 24 100C-21 80-73 94-120 72Z`,
  players: `M-120-125H132
    C141-77 171-55 174-22C176 9 160 29 181 53
    C196 68 219 74 228 95C232 105 230 111 225 118
    C208 115 197 110 188 100C175 85 160 91 137 102
    C98 121 58 114 29 100C-17 78-64 93-120 66Z`,
  readers: `M-120-125H125
    C131-80 161-56 169-22C176 9 157 31 170 57
    C181 79 208 98 209 121C210 138 194 152 187 169
    C176 161 170 149 169 136C167 116 141 117 115 122
    C73 130 43 109 14 99C-28 84-70 95-120 70Z`,
}

export function LandingAudienceArt({ audience }: { audience: keyof typeof audienceFigures }) {
  const Figure = audienceFigures[audience]
  const gradientId = useId()

  return (
    <svg className="site-audience-illustration" aria-hidden="true" focusable="false" viewBox="0 0 300 300">
      <defs>
        <linearGradient id={gradientId} x1="-22" y1="-42" x2="214" y2="155" gradientUnits="userSpaceOnUse">
          <stop stopColor="#168BD9" />
          <stop offset="1" stopColor="#2255C7" />
        </linearGradient>
      </defs>
      <g className="site-audience-language-ribbon">
        <path d={languageRibbons[audience]} fill={`url(#${gradientId})`} />
        <g fill="white" fontFamily="system-ui, sans-serif" fontWeight="600" opacity=".88">
          <text x="28" y="-10" fontSize="17" transform="rotate(-12 28 -10)">β</text>
          <text x="103" y="4" fontSize="20" transform="rotate(14 103 4)">文</text>
          <text x="48" y="28" fontSize="20" transform="rotate(-17 48 28)">한</text>
          <text x="123" y="36" fontSize="20" transform="rotate(12 123 36)">あ</text>
          <text x="9" y="55" fontSize="20" transform="rotate(13 9 55)">A</text>
          <text x="78" y="71" fontSize="18" transform="rotate(-11 78 71)">é</text>
          <text x="101" y="96" fontSize="17" transform="rotate(12 101 96)">א</text>
          <path d="m88 18 1 8m-5-3 9-2m-58 41 2 10m-6-4 10-1m74-12 1 6m-4-2 7-2" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </g>
      <ellipse cx="165" cy="273" rx="87" ry="7" fill={deepBlue} opacity=".09" />
      <Figure />
    </svg>
  )
}
