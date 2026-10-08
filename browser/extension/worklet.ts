class NolaPcmProcessor extends AudioWorkletProcessor {
  private samples: number[] = []
  private enabled = false
  private epoch = 0
  private peak = 0
  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<{ enabled: boolean; epoch: number }>) => { this.enabled = event.data.enabled; this.epoch = event.data.epoch; this.samples = []; this.peak = 0 }
  }
  process(inputs: Float32Array[][]): boolean {
    if (!this.enabled) return true
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let index = 0; index < channels[0].length; index++) {
      let sum = 0
      for (const channel of channels) sum += channel[index] ?? 0
      const sample = sum / channels.length
      const magnitude = sample < 0 ? -sample : sample
      if (magnitude > this.peak) this.peak = magnitude
      this.samples.push(sample)
    }
    const length = Math.round(sampleRate / 10)
    while (this.samples.length >= length) {
      const pcm = new Int16Array(length)
      for (let index = 0; index < length; index++) pcm[index] = Math.round(Math.max(-1, Math.min(1, this.samples[index])) * 32767)
      this.samples.splice(0, length)
      this.port.postMessage({ buffer: pcm.buffer, sampleRate, epoch: this.epoch, workletPeak: this.peak }, [pcm.buffer])
      this.peak = 0
    }
    return true
  }
}
registerProcessor('nola-pcm', NolaPcmProcessor)
