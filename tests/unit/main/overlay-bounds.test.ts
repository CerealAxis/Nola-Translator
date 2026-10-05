import { computeOverlayBounds, createOverlayWindowOptions, getOverlayInteractionPolicy } from '../../../src/main/windows'

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

  it('锁定时仍可点击关闭和解锁，解锁后可移动和缩放', () => {
    expect(getOverlayInteractionPolicy(false)).toEqual({
      focusable: true,
      ignoreMouseEvents: false,
      movable: true,
      resizable: true,
    })
    expect(getOverlayInteractionPolicy(true)).toEqual({
      focusable: true,
      ignoreMouseEvents: false,
      movable: false,
      resizable: false,
    })
  })

  it('为 Windows 无边框浮层保留原生边缘缩放框', () => {
    expect(createOverlayWindowOptions('C:\\app\\preload.cjs')).toMatchObject({
      frame: false,
      resizable: true,
      movable: true,
      thickFrame: true,
      // The renderer paints the background at the user's opacity, so the window must not
      // use system Acrylic: a 0% opacity would still leave a frosted backdrop.
      backgroundMaterial: 'none',
      hasShadow: false,
    })
  })

  it('默认宽度接近录屏中的紧凑控制条', () => {
    // At 218 the card leaves 190 of stage content after the card and stage padding; the two
    // tracks split that evenly, so four lines fit each at the default type scale.
    expect(createOverlayWindowOptions('C:\\app\\preload.cjs', 1920)).toMatchObject({ width: 883, height: 218 })
    expect(createOverlayWindowOptions('C:\\app\\preload.cjs', 2560)).toMatchObject({ width: 940, height: 218 })
  })
})
