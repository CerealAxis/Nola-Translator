import ChatGLM from '@lobehub/icons/es/ChatGLM/components/Color'
import Claude from '@lobehub/icons/es/Claude/components/Color'
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Color'
import Gemini from '@lobehub/icons/es/Gemini/components/Color'
import Kimi from '@lobehub/icons/es/Kimi/components/Color'
import MiniMax from '@lobehub/icons/es/Minimax/components/Color'
import Mistral from '@lobehub/icons/es/Mistral/components/Color'
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'
import Qwen from '@lobehub/icons/es/Qwen/components/Color'
import MiMo from '@lobehub/icons/es/XiaomiMiMo/components/Mono'
import { useEffect, useRef } from 'react'

const providers = [
  { name: 'MiniMax', Mark: MiniMax },
  { name: 'Qwen', Mark: Qwen },
  { name: 'GLM', Mark: ChatGLM },
  { name: 'Claude', Mark: Claude },
  { name: 'Gemini', Mark: Gemini },
  { name: 'DeepSeek', Mark: DeepSeek },
  { name: 'MiMo', Mark: MiMo },
  { name: 'Kimi', Mark: Kimi },
  { name: 'OpenAI', Mark: OpenAI },
  { name: 'Mistral', Mark: Mistral },
]

const stageSize = 208
const sphereRadius = 72
const markSize = 42

// 球面排布和 Canvas 投影改自 Magic UI Icon Cloud（MIT，见 THIRD_PARTY_NOTICES.md）。
// https://magicui.design/r/icon-cloud.json
const points = providers.map((_, index) => {
  const y = (2 * (index + 0.5)) / providers.length - 1
  const ringRadius = Math.sqrt(1 - y * y)
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  return { x: Math.cos(angle) * ringRadius, y, z: Math.sin(angle) * ringRadius, index }
})

export function ProviderIconCloud({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const marksRef = useRef<HTMLDivElement>(null)
  const updatePlayback = useRef<(playing: boolean) => void>(null)

  useEffect(() => {
    if (typeof CanvasRenderingContext2D === 'undefined') return

    const canvas = canvasRef.current
    const marks = marksRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !marks) return

    const serializer = new XMLSerializer()
    let sprites: HTMLImageElement[] = []
    let frameId = 0
    let lastTime = 0
    let visible = typeof IntersectionObserver === 'undefined'
    let playing = false
    let pitch = 0.45
    let yaw = 1.06
    let drag: { id: number; x: number; y: number } | null = null

    function draw() {
      if (!context) return

      const cosPitch = Math.cos(pitch)
      const sinPitch = Math.sin(pitch)
      const cosYaw = Math.cos(yaw)
      const sinYaw = Math.sin(yaw)
      const positions = points.map(point => {
        const x = point.x * cosYaw - point.z * sinYaw
        const z = point.x * sinYaw + point.z * cosYaw
        return {
          x,
          y: point.y * cosPitch + z * sinPitch,
          depth: z * cosPitch - point.y * sinPitch,
          index: point.index,
        }
      })
      // 先绘制远处标志，避免后方图形遮住前方标志。
      positions.sort((left, right) => left.depth - right.depth)

      context.clearRect(0, 0, stageSize, stageSize)
      for (const position of positions) {
        const sprite = sprites[position.index]
        if (!sprite?.naturalWidth) continue

        const size = markSize * (0.78 + position.depth * 0.25)
        context.globalAlpha = 0.68 + position.depth * 0.32
        context.drawImage(
          sprite,
          stageSize / 2 + position.x * sphereRadius - size / 2,
          stageSize / 2 + position.y * sphereRadius - size / 2,
          size,
          size,
        )
      }
    }

    function animate(time: number) {
      const elapsed = lastTime ? Math.min(time - lastTime, 32) : 0
      lastTime = time
      if (!drag) {
        yaw += elapsed * 0.00038
        pitch += elapsed * 0.0001
      }
      draw()
      frameId = requestAnimationFrame(animate)
    }

    function syncMotion() {
      if (visible && playing) {
        if (!frameId) frameId = requestAnimationFrame(animate)
      } else {
        cancelAnimationFrame(frameId)
        frameId = 0
        lastTime = 0
        draw()
      }
    }

    function loadSprites() {
      if (!canvas || !marks) return

      // 单色 SVG 随主题读取卡片前景色，其他 SVG 保留品牌颜色。
      const foreground = getComputedStyle(canvas).color
      for (const sprite of sprites) sprite.onload = null
      sprites = Array.from(marks.querySelectorAll('svg'), mark => {
        const svg = mark.cloneNode(true) as SVGSVGElement
        svg.style.color = foreground
        const sprite = new Image()
        sprite.onload = draw
        sprite.src = 'data:image/svg+xml,' + encodeURIComponent(serializer.serializeToString(svg))
        return sprite
      })
    }

    function startDrag(event: PointerEvent) {
      if (!canvas || event.button !== 0 || drag) return

      drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
    }

    function moveDrag(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId) return

      pitch += (event.clientY - drag.y) * 0.012
      yaw += (event.clientX - drag.x) * 0.012
      drag.x = event.clientX
      drag.y = event.clientY
      draw()
    }

    function endDrag(event: PointerEvent) {
      if (drag?.id === event.pointerId) drag = null
    }

    // 以 CSS 像素为投影单位，根据设备像素比增加 Canvas 分辨率。
    const density = window.devicePixelRatio || 1
    canvas.width = Math.round(stageSize * density)
    canvas.height = Math.round(stageSize * density)
    context.scale(density, density)
    loadSprites()

    const viewport = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      syncMotion()
    })
    viewport?.observe(canvas)
    updatePlayback.current = active => {
      playing = active
      syncMotion()
    }

    const theme = new MutationObserver(loadSprites)
    theme.observe(document.documentElement, { attributeFilter: ['class'] })

    canvas.addEventListener('pointerdown', startDrag)
    canvas.addEventListener('pointermove', moveDrag)
    canvas.addEventListener('lostpointercapture', endDrag)
    return () => {
      updatePlayback.current = null
      viewport?.disconnect()
      theme.disconnect()
      cancelAnimationFrame(frameId)
      for (const sprite of sprites) sprite.onload = null
      canvas.removeEventListener('pointerdown', startDrag)
      canvas.removeEventListener('pointermove', moveDrag)
      canvas.removeEventListener('lostpointercapture', endDrag)
    }
  }, [])

  useEffect(() => {
    updatePlayback.current?.(playing)
  }, [playing])

  return (
    <div className="nola-home-provider-cloud">
      <div ref={marksRef} hidden>
        {providers.map(({ name, Mark }) => <Mark key={name} size={96} />)}
      </div>
      <canvas
        ref={canvasRef}
        width={stageSize}
        height={stageSize}
        role="img"
        aria-label={'模型厂商标志：' + providers.map(({ name }) => name).join('、')}
      />
    </div>
  )
}
