import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { PerformanceMonitor } from './PerformanceMonitor'
import { performanceWindow } from './performance-monitor-data'
import type { GatewayPerformanceSnapshot } from '../../../shared/gateway-performance'

const snapshot: GatewayPerformanceSnapshot = {
  end: 605000,
  calls: [
    { at: 600000, model: 'HY-MT2 1.8B', duration: 58, queue: 20 },
    { at: 600001, model: 'HY-MT2 1.8B', duration: 15 },
    { at: 601000, model: 'MiMo TTS(API)', duration: 86 },
    { at: 602000, taskId: 'request-1', total: 86 },
    { at: 603000, total: 100 },
  ],
  tasks: [{ at: 200000, active: 1, queued: 0 }, { at: 600000, active: 0, queued: 1 }, { at: 602000, active: 0, queued: 0 }],
  hardware: [
    { at: 600000, cpu: 20, ram: 16, ramCapacity: 32, gpus: [
      { id: 'first', name: 'Test GPU', integrated: false, capacity: 8, used: 4, allocations: [
        { models: ['HY-MT2 1.8B'], used: 2 }, { models: ['Qwen 3.5 4B'], used: 1 },
      ] },
      { id: 'second', name: 'Test GPU', integrated: false, capacity: 8, used: 6, allocations: [
        { models: ['Qwen 3.5 4B'], used: 5 },
      ] },
    ] },
    { at: 605000, gpus: [{ id: 'first' }, { id: 'second' }] },
  ],
}

it('displays both adapters and filters model allocations on each independently', async () => {
  render(<PerformanceMonitor read={async () => snapshot} />)
  const user = userEvent.setup()
  const first = await screen.findByRole('region', { name: 'GPU 0 · Test GPU' })
  const second = screen.getByRole('region', { name: 'GPU 1 · Test GPU' })
  expect(within(first).getByText('HY-MT2 1.8B')).toBeVisible()
  expect(within(second).queryByText('HY-MT2 1.8B')).toBeNull()
  expect(within(second).getByText('Qwen 3.5 4B')).toBeVisible()
  await user.click(screen.getByRole('combobox', { name: '全部显卡' }))
  await user.click(await screen.findByRole('option', { name: 'GPU 1 · Test GPU' }))
  expect(screen.queryByRole('region', { name: 'GPU 0 · Test GPU' })).toBeNull()
  await user.click(screen.getByRole('combobox', { name: '全部模型' }))
  await user.click(await screen.findByRole('option', { name: 'MiMo TTS(API)' }))
  expect(within(second).queryByText('Qwen 3.5 4B')).toBeNull()
  await user.click(screen.getByRole('combobox', { name: '时间范围' }))
  await user.click(await screen.findByRole('option', { name: '1 分钟' }))
  await user.click(screen.getByRole('button', { name: '暂停' }))
  await user.click(screen.getByRole('button', { name: '恢复实时' }))
  expect(screen.getByRole('button', { name: '暂停' })).toBeVisible()
})

it('reports a failed read and shows machine readings without any model calls after refresh', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('Missing IPC handler'))
    .mockResolvedValue({ ...snapshot, calls: [], hardware: snapshot.hardware.slice(0, 1) })
  render(<PerformanceMonitor read={read} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('无法读取性能数据')
  await userEvent.click(screen.getByRole('button', { name: '立即刷新' }))
  expect(await screen.findByText('20 %')).toBeVisible()
  expect(screen.getByText('16 / 32 GiB')).toBeVisible()
  expect(screen.getByRole('region', { name: 'GPU 0 · Test GPU' })).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('keeps individual completion points, a task baseline, and missing readings', () => {
  const data = performanceWindow(snapshot, 1, 'all', 'Shared process')
  expect(data.eventData.map(row => row.at)).toEqual([600000, 600001, 601000, 602000])
  expect(data.eventData[0].queue).toBe(20)
  expect(data.eventData[1].queue).toBeNull()
  expect(data.eventData[3].total).toBe(86)
  expect(data.tasks[0]).toEqual({ at: 545000, active: 1, queued: 0 })
  expect(data.system.at(-1)?.cpu).toBeNull()
  expect(data.adapters.map(device => device.data[0].used)).toEqual([4, 6])
  expect(data.adapters.map(device => device.data.at(-1)?.used)).toEqual([null, null])
  expect(data.adapters.map(device => device.data[0][device.allocations.find(series => series.label === 'Qwen 3.5 4B')!.id])).toEqual([1, 5])
})

it('lists an already-loaded CPU model and shows one integrated GPU memory reading', async () => {
  render(<PerformanceMonitor read={async () => ({
    ...snapshot, calls: [], loadedModels: { 'sensevoice-small-crisp-q8-0': 'SenseVoiceSmall Q8_0' },
    hardware: [{ at: 605000, gpus: [{ id: 'intel', name: 'Intel', integrated: true, used: 0, sharedUsed: 1.42, capacity: 0.125 }] }],
  })} />)
  expect(await within(screen.getByRole('region', { name: '模型处理耗时' })).findByText('SenseVoiceSmall Q8_0')).toBeVisible()
  await userEvent.click(screen.getByRole('combobox', { name: '全部模型' }))
  expect(await screen.findByRole('option', { name: 'SenseVoiceSmall Q8_0' })).toBeVisible()
  expect(screen.getByText('1.42 GiB')).toBeVisible()
})

it('adds measured integrated GPU memory and leaves incomplete samples blank', () => {
  const data = performanceWindow({ ...snapshot, hardware: [
    { at: 603000, gpus: [{ id: 'intel', integrated: true, used: 0.125, sharedUsed: 1.5, capacity: 0.125 }] },
    { at: 604000, gpus: [{ id: 'intel', used: 0 }] },
    { at: 605000, gpus: [{ id: 'intel', used: 0, sharedUsed: 0 }] },
  ] }, 5, 'all', 'Shared process')
  const gpu = data.adapters[0]
  expect(gpu.capacity).toBeUndefined()
  expect(gpu.data.map(sample => sample.used)).toEqual([1.63, null, 0])
})

it('pauses polling, refreshes once while paused, and stops polling when unmounted', async () => {
  vi.useFakeTimers()
  try {
    const read = vi.fn().mockResolvedValue(snapshot)
    const view = render(<PerformanceMonitor read={read} />)
    await act(async () => {})
    expect(read).toHaveBeenCalledTimes(1)
    const click = (name: string) => act(() => screen.getByRole('button', { name }).click())
    click('立即刷新')
    await act(async () => {})
    click('暂停')
    await act(() => vi.advanceTimersByTimeAsync(15000))
    expect(read).toHaveBeenCalledTimes(2)
    click('立即刷新')
    await act(() => vi.advanceTimersByTimeAsync(15000))
    expect(read).toHaveBeenCalledTimes(3)
    click('恢复实时')
    await act(async () => {})
    expect(read).toHaveBeenCalledTimes(4)
    view.unmount()
    await act(() => vi.advanceTimersByTimeAsync(15000))
    expect(read).toHaveBeenCalledTimes(4)
  } finally { vi.useRealTimers() }
})

