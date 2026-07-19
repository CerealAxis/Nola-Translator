import { computeOverlayBounds } from '../../../src/main/windows'

const workArea = { x: 100, y: 50, width: 1920, height: 1040 }

describe('字幕浮层位置', () => {
  it('在工作区顶部和底部居中且不遮挡任务栏', () => {
    expect(computeOverlayBounds('top', workArea, { width: 900, height: 180 })).toEqual({
      x: 610,
      y: 74,
      width: 900,
      height: 180,
    })
    expect(computeOverlayBounds('bottom', workArea, { width: 900, height: 180 })).toEqual({
      x: 610,
      y: 886,
      width: 900,
      height: 180,
    })
  })

  it('自由位置超出显示器后会被夹回可见区域', () => {
    expect(
      computeOverlayBounds('free', workArea, { width: 900, height: 180, x: -500, y: 2000 })
    ).toEqual({ x: 100, y: 910, width: 900, height: 180 })
  })
})
