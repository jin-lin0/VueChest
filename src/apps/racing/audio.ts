// racing 程序化音效：全部用 WebAudio 合成，无外部音频资源。
// 单例；init() 必须在用户手势（点击"开始比赛"）之后调用，否则浏览器会挂起 AudioContext。

class RacingAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineOsc1: OscillatorNode | null = null
  private engineOsc2: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  /** 初始化（可重复调用，幂等）。 */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)

    // 预生成 1 秒白噪声，供撞车/氮气等音效裁剪使用
    const len = this.ctx.sampleRate
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  /** 启动引擎嗡鸣（双锯齿波 + 低通）。 */
  startEngine(): void {
    if (!this.ctx || !this.master || this.engineOsc1) return
    const ctx = this.ctx
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0.0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900

    this.engineOsc1 = ctx.createOscillator()
    this.engineOsc1.type = 'sawtooth'
    this.engineOsc2 = ctx.createOscillator()
    this.engineOsc2.type = 'square'
    this.engineOsc1.frequency.value = 60
    this.engineOsc2.frequency.value = 31

    this.engineOsc1.connect(filter)
    this.engineOsc2.connect(filter)
    filter.connect(this.engineGain)
    this.engineGain.connect(this.master)
    this.engineOsc1.start()
    this.engineOsc2.start()
  }

  /** 每帧根据速度比例更新引擎音调。speedRatio: 0~1+，boosting: 氮气中 */
  setEngine(speedRatio: number, boosting: boolean): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain) return
    const t = this.ctx.currentTime
    const ratio = Math.max(0, Math.min(speedRatio, 1.4))
    const base = 55 + ratio * 165 + (boosting ? 45 : 0)
    this.engineOsc1.frequency.setTargetAtTime(base, t, 0.06)
    this.engineOsc2.frequency.setTargetAtTime(base / 2 + 1.5, t, 0.06)
    this.engineGain.gain.setTargetAtTime(0.05 + ratio * 0.045, t, 0.1)
  }

  stopEngine(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    try {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.08)
      this.engineOsc1?.stop(t + 0.3)
      this.engineOsc2?.stop(t + 0.3)
    } catch {
      /* osc 可能已停止，忽略 */
    }
    this.engineOsc1 = null
    this.engineOsc2 = null
    this.engineGain = null
  }

  /** 播放一个短促蜂鸣。 */
  private tone(freq: number, duration: number, type: OscillatorType, volume: number, when = 0): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime + when
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  }

  /** 倒计时蜂鸣：前 3 声低音，GO 高音长鸣。 */
  countBeep(isGo: boolean): void {
    if (isGo) {
      this.tone(880, 0.5, 'square', 0.22)
      this.tone(1320, 0.5, 'sine', 0.12, 0.02)
    } else {
      this.tone(440, 0.18, 'square', 0.18)
    }
  }

  /** 选车 / 界面切换：短促双音 blip。 */
  uiSwitch(): void {
    this.tone(660, 0.08, 'sine', 0.15)
    this.tone(990, 0.1, 'sine', 0.1, 0.05)
  }

  /** 收集金币：连击越高音调越高。 */
  collect(combo: number): void {
    const step = Math.min(Math.max(combo, 1), 10)
    const freq = 620 * Math.pow(1.059, step) // 半音阶上行
    this.tone(freq, 0.12, 'sine', 0.2)
    this.tone(freq * 1.5, 0.15, 'sine', 0.12, 0.05)
  }

  /** 撞墙 / 撞车：低通噪声 + 低频砰。 */
  crash(intensity = 1): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500 + 500 * intensity
    const gain = this.ctx.createGain()
    const v = 0.25 * Math.min(intensity, 1.5)
    gain.gain.setValueAtTime(v, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + 0.3)
    this.tone(70, 0.2, 'sine', 0.25 * Math.min(intensity, 1.2))
  }

  /** 氮气：上升扫频噪声。 */
  nitro(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 2
    filter.frequency.setValueAtTime(300, t)
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.5)
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + 0.65)
  }

  /** 导弹发射。 */
  missile(): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(900, t)
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.35)
    gain.gain.setValueAtTime(0.16, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.45)
  }

  /** 冲线 / 胜利小号角。 */
  finish(won: boolean): void {
    const notes = won ? [523, 659, 784, 1047] : [392, 330, 262]
    notes.forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, i * 0.16))
  }

  /** 组件卸载时彻底释放。 */
  dispose(): void {
    this.stopEngine()
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
      this.master = null
      this.noiseBuffer = null
    }
  }
}

export const racingAudio = new RacingAudio()
