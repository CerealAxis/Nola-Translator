/**
 * `allocateCaptionLines` 的回归基线。**逐字来自主仓
 * `tests/unit/renderer/line-budget.test.ts`**，未改。
 *
 * 搬测试和搬实现是同一件事：这个算法决定"每条字幕轨道能露出几行"，算错的表现是
 * 字幕溢出被裁掉、或者一条轨道整条空白，两者都不报错，只在真跑起来才看得见。
 * 主仓的测试里每一句注释都记着一次真实事故（对半分先罚高的那条 → 原文整条消失），
 * 那些注释不能丢。
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/bridge'
import { allocateCaptionLines } from './lineBudget'

const source = { visible: true, fontSize: 28, lineHeight: 1.3 }
const translation = { visible: true, fontSize: 22, lineHeight: 1.35 }

describe('allocateCaptionLines', () => {
  it('两条轨道都可见时对半分 stage', () => {
    // 96px / 2 = 每边 48px。原文行高 36.4px（放得下 1 行），译文行高 29.7px（放得下 1 行）。
    expect(allocateCaptionLines(96, [source, translation], 0)).toEqual([1, 1])
    // 160px / 2 = 每边 80px。原文放得下 2 行（72.8px），译文放得下 2 行（59.4px）。
    expect(allocateCaptionLines(160, [source, translation], 0)).toEqual([2, 2])
  })

  it('译文隐藏时原文占满整个 stage', () => {
    const small = { ...source, fontSize: 17 }
    // 行高 22.1px，66 / 22.1 ≈ 2.98，整个 stage 放得下 2 行。
    expect(allocateCaptionLines(66, [small, { ...translation, visible: false }], 0)).toEqual([2, 0])
  })

  it('两半相遇时只扣一次 gap', () => {
    // 280px stage 加 6px gap：每边 (280 - 6) / 2 = 137px。
    // 原文 36.4px 放得下 3 行；译文 29.7px 放得下 4 行。
    expect(allocateCaptionLines(280, [source, translation], 6)).toEqual([3, 4])
  })

  it('各填各的，不互相匀余量', () => {
    // 400px stage 每边 200px，两条各自在自己的份额里长。
    const result = allocateCaptionLines(400, [source, translation], 6)
    expect(result[0]).toBeGreaterThan(1)
    expect(result[1]).toBeGreaterThan(1)
    expect(Math.abs(result[0] - result[1])).toBeLessThanOrEqual(1)
  })

  it('首行都放不下就分到 0', () => {
    // 一行都放不下就没什么可溢出的：stage 会裁掉溢出，轨道又不肯缩，
    // 分给它一行放不下的高度等于把另一条挤出可视区。
    const small = { ...source, fontSize: 17 }
    expect(allocateCaptionLines(20, [small, { ...translation, visible: false }], 0)).toEqual([0, 0])
    expect(allocateCaptionLines(0, [source, translation], 6)).toEqual([0, 0])
  })

  it('把 stage 的余量补给没抢到自己那一份的轨道', () => {
    // 用出厂默认（17/1.3 与 16/1.35）算，因为那是用户把浮窗拖矮时真正会遇到的尺寸。
    // 50px stage 对半分是每边 22px，原文行高 22.1px，差一点点没抢到，而译文放得下。
    // 没有这次补给，用户自己的话会整条消失、只剩译文。
    const live = [
      { visible: true, fontSize: DEFAULT_SETTINGS.overlay.fontSize, lineHeight: DEFAULT_SETTINGS.overlay.lineHeight },
      {
        visible: true,
        fontSize: DEFAULT_SETTINGS.overlay.translationFontSize,
        lineHeight: DEFAULT_SETTINGS.overlay.translationLineHeight,
      },
    ]
    // 22.1 + 21.6 + 6px gap = 49.7px，仍然塞得进 50。
    expect(allocateCaptionLines(50, live, 6)).toEqual([1, 1])
    expect(allocateCaptionLines(49, live, 6)).toEqual([1, 0])
  })

  it('只够放一行时保原文，不保译文', () => {
    // 72px 的原文行塞不进 40px stage（与 29.7px 的译文并列时），但能独占整个 stage，
    // 而原文才是用户正在说的话。
    const large = { ...source, fontSize: 72 }
    expect(allocateCaptionLines(40, [large, translation], 0)).toEqual([0, 1])
    // 比译文行高还矮就真的没地方了。
    expect(allocateCaptionLines(20, [large, translation], 0)).toEqual([0, 0])
  })

  it('设置文件里来一个 0 行高也不会挂死', () => {
    // settings.json 是原样展开加载的，fontSize 或 lineHeight 可能以 0 进来。
    // 下面那个填充循环每轮都加 lineHeights[index]，为 0 就永远不终止。
    const zeroHeight = { visible: true, fontSize: 28, lineHeight: 0 }
    const zeroSize = { visible: true, fontSize: 0, lineHeight: 1.3 }
    // share = (400 - 6) / 2 = 197px；健康的译文轨道每行 29.7px，仍能拿到 6 行。
    expect(allocateCaptionLines(400, [zeroHeight, translation], 6)).toEqual([0, 6])
    expect(allocateCaptionLines(400, [zeroSize, translation], 6)).toEqual([0, 6])
  })
})
