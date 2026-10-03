import { describe, expect, it } from 'vitest'

import type { HubModelSummary, HubSearchResult, ResourceRecord } from '@/bridge'
import { hubCardRecord, installSlotOf, mergeHubResults } from './HubSearchTab'
import type { HubHit } from './HubSearchTab'

/**
 * 「能不能装」现在完全由引擎下发的 `compatibility` 决定，这组断言钉的就是"消费它"这件事。
 *
 * 它替换掉的是上一版那份测试：那份钉的是一段**已知不正确**的推导 ——
 * 把仓库名去掉 owner 段、去掉 gguf/hf/bin/safetensors/pt 包装后缀、只留字母数字转小写，
 * 然后看它是不是某条本地记录 resourceId 的前缀。`facebook/m2m100_418M` 能对上
 * `m2m100-418m` 靠的是"两边都去掉了下划线"这个约定，不是任何真实的兼容性声明；
 * 多档命中时它还会取目录顺序第一个，于是用户要 Q3 装到的是 Q4。那段推导与它的两条
 * 已知缺陷已随引擎侧判定一起删除（见 `HubSearchTab.tsx` 顶部注释）。
 *
 * 所以下面每条断言的方向都是"UI 不再自己判断"：判定、理由、slot 全部来自
 * `HubModelSummary.compatibility`，映射函数只负责把这份判定搬进 `ModelCard` 吃的那条记录。
 *
 * 夹具为什么内联而不是从 `@/bridge` 导入：原型那版的 `FIXTURE_HUB_MODELS` 随迁移删掉了，
 * 而这里需要构造**引擎真实下发的那种形状**（`pipelineTag` 缺席、evidence 带 revision），
 * 内联比复活整个 fixture 层便宜。
 */

/** 引擎判定：不可装，附一句给用户看的中文理由与原始依据。 */
function verdict(over: Partial<HubModelSummary['compatibility']> = {}): HubModelSummary['compatibility'] {
  return {
    compatible: false,
    reasonCode: 'llamaCppUnsupportedArchitecture',
    reason: 'llama.cpp 不支持架构 hy_v3。',
    languages: [],
    evidence: { 'gguf.architecture': 'hy_v3' },
    ...over,
  }
}

/** 一条 HF 搜索命中。`resourceId` 形如 `hub:owner/name`（引擎装上之后就用这个 id）。 */
function summary(over: Partial<HubModelSummary> = {}): HubModelSummary {
  return {
    repo: 'tencent/Hy-MT2-30B-A3B-GGUF',
    resourceId: 'hub:tencent/Hy-MT2-30B-A3B-GGUF',
    author: 'tencent',
    pipelineTag: 'translation',
    hasGguf: true,
    ggufArchitecture: 'hy_v3',
    fileCount: 6,
    downloadBytes: 50_222_474_139,
    installed: false,
    compatibility: verdict(),
    ...over,
  }
}

function hit(model: Partial<HubModelSummary> = {}, kind: HubHit['kind'] = 'mt'): HubHit {
  return { summary: summary(model), kind }
}

/** 一份 `HubSearchResult`，`candidates` 故意可以与 `models.length` 不同。 */
function result(over: Partial<HubSearchResult> = {}): HubSearchResult {
  return { query: 'asr', models: [], candidates: 0, rateLimited: false, ...over }
}

describe('命中 → 卡片记录：映射引擎的判定，不自己判断', () => {
  it('安装理由原样取自 compatibility.reason', () => {
    const record = hubCardRecord(hit())
    expect(record.description).toBe('llama.cpp 不支持架构 hy_v3。')
    expect(record.resourceId).toBe('hub:tencent/Hy-MT2-30B-A3B-GGUF')
    expect(record.downloadBytes).toBe(50_222_474_139)
  })

  it('两个名字相近的仓库，判定各按各的来，不看名字像不像', () => {
    // 旧推导里这两个都会因为"去掉下划线后能对上 m2m100-418m"而被判成可装。
    const refused = hubCardRecord(
      hit({ repo: 'facebook/m2m100_418M', resourceId: 'hub:facebook/m2m100_418M' }, 'mt'),
    )
    const allowed = hubCardRecord(
      hit({
        repo: 'facebook/m2m100_418M',
        resourceId: 'hub:facebook/m2m100_418M',
        compatibility: verdict({
          compatible: true,
          reasonCode: 'adapterMatched',
          reason: '可以用 M2M100 加载，服务翻译。',
          slot: 'translation',
          adapterId: 'm2m100',
        }),
      }, 'mt'),
    )
    expect(refused.description).toBe('llama.cpp 不支持架构 hy_v3。')
    expect(allowed.description).toBe('可以用 M2M100 加载，服务翻译。')
    expect(allowed.provider).toBe('m2m100')
  })

  it('类别与 provider 跟着判定走，读不到才落到通用值', () => {
    expect(hubCardRecord(hit({}, 'asr')).kind).toBe('recognitionModel')
    expect(hubCardRecord(hit({}, 'mt')).kind).toBe('translationModel')
    // 判定说这是翻译模型时，即便它是被 asr 搜索带回来的，类别也按判定走。
    expect(
      hubCardRecord(hit({ compatibility: verdict({ compatible: true, slot: 'translation' }) }, 'asr')).kind,
    ).toBe('translationModel')
    // loader 与 adapterId 都缺席时不能编一个具体适配器出来。
    expect(hubCardRecord(hit()).provider).toBe('huggingface')
  })

  it('引擎说装上了就照它说的画成已安装，卸载才有着落', () => {
    expect(hubCardRecord(hit({ installed: true })).installed).toBe(true)
    expect(hubCardRecord(hit({ installed: false })).installed).toBe(false)
  })
})

describe('安装 slot：优先用引擎的判定，其次用这条命中是被哪次搜索带回来的', () => {
  it('判定带了 slot 就用它', () => {
    expect(installSlotOf(hit({ compatibility: verdict({ compatible: true, slot: 'recognition' }) }, 'mt'))).toBe(
      'recognition',
    )
  })

  it('判定没带 slot 时按搜索 kind 兜底', () => {
    expect(installSlotOf(hit({}, 'asr'))).toBe('recognition')
    expect(installSlotOf(hit({}, 'mt'))).toBe('translation')
  })
})

describe('两次搜索的合并：不隐藏截断，也不重复画同一条仓库', () => {
  it('同一条仓库被两次搜索各带一次时只留一条', () => {
    const merged = mergeHubResults([
      { kind: 'asr', result: result({ models: [summary()], candidates: 1 }) },
      { kind: 'mt', result: result({ models: [summary()], candidates: 1 }) },
    ])
    expect(merged.hits).toHaveLength(1)
  })

  it('candidates 与实际精检条数分开留着，界面才说得出"这不是全集"', () => {
    // 引擎深检有硬上限：hub 列出 4 个候选，只有 2 个拿到了判定。
    const merged = mergeHubResults([
      { kind: 'asr', result: result({ models: [summary(), summary({ repo: 'a/b', resourceId: 'hub:a/b' })], candidates: 4 }) },
    ])
    expect(merged.hits).toHaveLength(2)
    expect(merged.candidates).toBe(4)
    expect(merged.candidates > merged.hits.length).toBe(true)
  })

  it('限流只要有一次就是限流，不能被另一次成功平均掉', () => {
    const merged = mergeHubResults([
      { kind: 'asr', result: result({ rateLimited: true }) },
      { kind: 'mt', result: result({ rateLimited: false }) },
    ])
    expect(merged.rateLimited).toBe(true)
    expect(mergeHubResults([{ kind: 'asr', result: result() }]).rateLimited).toBe(false)
  })

  it('两次搜索的候选数相加，命中带回来的 kind 留着给 slot 兜底用', () => {
    const merged = mergeHubResults([
      { kind: 'asr', result: result({ models: [summary({ repo: 'a/b', resourceId: 'hub:a/b' })], candidates: 3 }) },
      { kind: 'mt', result: result({ models: [summary()], candidates: 2 }) },
    ])
    expect(merged.candidates).toBe(5)
    expect(merged.hits.map((item) => item.kind)).toEqual(['asr', 'mt'])
  })
})

describe('合成记录仍是合法的 ResourceRecord', () => {
  it('形状与本地记录同构，ModelCard 不需要为搜索结果改签名', () => {
    const record: ResourceRecord = hubCardRecord(hit())
    expect(record.state).toBe('idle')
    expect(record.cancellable).toBe(false)
    expect(record.installedBytes).toBe(0)
    expect(record.languages).toEqual([])
  })

  it('pipeline_tag 缺席也不会影响映射（那不是界面该补的字段）', () => {
    const record = hubCardRecord(hit({ pipelineTag: undefined, compatibility: verdict({ compatible: true }) }, 'asr'))
    expect(record.kind).toBe('recognitionModel')
    expect(record.description).toBe('llama.cpp 不支持架构 hy_v3。')
  })
})
