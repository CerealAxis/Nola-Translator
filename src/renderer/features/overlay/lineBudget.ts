/**
 * 字幕区的高度分配。**逐字来自主仓 `src/renderer/overlay/line-budget.ts`**，未改。
 *
 * 搬它的理由：这块算法是主仓打磨出来的、也是最容易写错的一块——高度算错的表现是
 * "字幕溢出被裁掉"或者"两条轨道一条有字一条空白"，都不报错，只在真跑起来才看得见。
 * 重写一遍只会引入一个新的、没人验证过的版本。
 *
 * 纯函数，无副作用，`line-budget.test.ts` 直接对着它断言。
 */

export type CaptionLineRequest = {
  /** 该轨道当前有没有字；不可见的轨道分不到任何高度。 */
  visible: boolean
  fontSize: number
  lineHeight: number
}

/**
 * 把 stage 能匀出来的高度分给各条轨道。
 *
 * 两条都可见时对半分；只可见一条时那条占满。每条可见轨道填满自己那一份。
 * 首行放不下的轨道分到 0 而不是让它溢出：stage 会裁掉溢出，轨道又不肯缩，
 * 分多了会把下一条整个挤出可视区。
 */
export function allocateCaptionLines(contentHeight: number, requests: CaptionLineRequest[], gap = 0): number[] {
  const visibleCount = requests.filter((request) => request.visible).length
  if (visibleCount === 0) return requests.map(() => 0)
  const lineHeights = requests.map((request) => request.fontSize * request.lineHeight)
  const share = visibleCount === 1 ? contentHeight : (contentHeight - gap * (visibleCount - 1)) / 2
  // 行高为 0 或负数可以从手改过的设置文件里进来（设置是原样展开加载的，没有数值校验），
  // 下面那个填充循环会永远不终止。
  const result = requests.map((request, index) =>
    request.visible && lineHeights[index] > 0 && lineHeights[index] <= share ? 1 : 0
  )

  // 每条可见轨道住在自己那一份里，填满了就换下一条。
  for (let index = 0; index < requests.length; index += 1) {
    if (result[index] === 0) continue
    let used = lineHeights[index]
    while (used + lineHeights[index] <= share) {
      result[index] += 1
      used += lineHeights[index]
    }
  }

  // 某条轨道可能在自己的那一份里没放下，而整体还空着——对半分先罚高的那条，
  // 结果就是"原文没了只剩译文"甚至整个浮层空白。把剩下的高度按顺序补给它们，
  // 原文优先拿到，保证屏幕上始终有东西。
  const visible = requests.map((request, index) => (request.visible ? index : -1)).filter((index) => index >= 0)
  const occupied = (): number => {
    const filled = visible.filter((index) => result[index] > 0)
    const lines = filled.reduce((total, index) => total + result[index] * lineHeights[index], 0)
    return filled.length > 1 ? lines + gap * (filled.length - 1) : lines
  }
  for (const index of visible) {
    if (result[index] !== 0 || lineHeights[index] <= 0) continue
    result[index] = 1
    if (occupied() > contentHeight) result[index] = 0
  }
  return result
}
