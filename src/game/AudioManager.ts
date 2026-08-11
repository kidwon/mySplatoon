/**
 * 音效管理器：全部声音用 Web Audio API 实时合成，零素材依赖。
 * AudioContext 必须由用户手势创建 —— ensureStarted() 在点击开始时调用。
 * 模块单例：import { audio } 直接调用。
 */
const STORAGE_KEY = 'mysplatoon-muted';
const MASTER_VOL = 0.5;
const BPM = 132;

interface ToneOpts {
  type?: OscillatorType;
  dur?: number;
  slideTo?: number;
  vol?: number;
  /** 相对当前时刻的延迟秒数 */
  when?: number;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private muted = localStorage.getItem(STORAGE_KEY) === '1';
  private noiseBuffer: AudioBuffer | null = null;
  private lastSplat = 0;

  // 潜墨循环音
  private swimOsc: OscillatorNode | null = null;
  private swimGain: GainNode | null = null;

  // BGM 调度
  private bgmTimer: number | null = null;
  private nextBar = 0;
  private barCount = 0;

  get isMuted() {
    return this.muted;
  }

  /** 在用户手势（点击开始）里调用；重复调用安全 */
  ensureStarted() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOL;
      this.master.connect(this.ctx.destination);
      this.startBgm();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    if (this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : MASTER_VOL,
        this.ctx.currentTime,
        0.02
      );
    }
    return this.muted;
  }

  // ---------- 基础合成原语 ----------

  private tone(freq: number, opts: ToneOpts = {}) {
    if (!this.ctx) return;
    const { type = 'square', dur = 0.1, slideTo, vol = 0.2, when = 0 } = opts;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(opts: { dur?: number; vol?: number; filter?: number; when?: number } = {}) {
    if (!this.ctx) return;
    const { dur = 0.1, vol = 0.2, filter = 1200, when = 0 } = opts;
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // ---------- 游戏音效 ----------

  /** 玩家开火 */
  shoot() {
    this.tone(700 + Math.random() * 160, {
      type: 'square',
      dur: 0.07,
      slideTo: 320,
      vol: 0.1,
    });
    this.noise({ dur: 0.04, vol: 0.05, filter: 2500 });
  }

  /** 墨弹落地（内部节流，避免弹幕刷屏） */
  splat() {
    if (!this.ctx || this.ctx.currentTime - this.lastSplat < 0.07) return;
    this.lastSplat = this.ctx.currentTime;
    this.noise({ dur: 0.12, vol: 0.1, filter: 900 });
    this.tone(170 + Math.random() * 60, {
      type: 'triangle',
      dur: 0.1,
      slideTo: 90,
      vol: 0.07,
    });
  }

  /** 打中敌人（确认音） */
  hitConfirm() {
    this.tone(1100, { type: 'triangle', dur: 0.06, slideTo: 1550, vol: 0.16 });
  }

  /** 自己被击中 */
  hurt() {
    this.tone(210, { type: 'sawtooth', dur: 0.15, slideTo: 120, vol: 0.22 });
    this.noise({ dur: 0.1, vol: 0.12, filter: 700 });
  }

  /** 有人被击倒（大墨爆） */
  knockout() {
    this.tone(500, { type: 'sawtooth', dur: 0.45, slideTo: 60, vol: 0.25 });
    this.noise({ dur: 0.4, vol: 0.3, filter: 600 });
  }

  /** 重生 */
  respawn() {
    [392, 523.25, 784].forEach((f, i) =>
      this.tone(f, { type: 'triangle', dur: 0.12, vol: 0.15, when: i * 0.09 })
    );
  }

  /** 跳跃 */
  jump() {
    this.tone(300, { type: 'sine', dur: 0.09, slideTo: 520, vol: 0.07 });
  }

  /** 最后 10 秒倒计时嘀嗒 */
  tick() {
    this.tone(1250, { type: 'square', dur: 0.05, vol: 0.1 });
  }

  /** 比赛结束哨声 */
  whistle() {
    this.tone(1400, { type: 'square', dur: 0.3, vol: 0.18 });
    this.tone(1400, { type: 'square', dur: 0.5, vol: 0.18, when: 0.35 });
    this.tone(933, { type: 'square', dur: 0.5, vol: 0.14, when: 0.35 });
  }

  /** 潜墨游动循环音开关 */
  setSwimming(on: boolean) {
    if (!this.ctx) return;
    if (on && !this.swimOsc) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 85;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 280;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.09, this.ctx.currentTime, 0.05);
      // 8Hz 咕噜咕噜的颤音
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 8;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 40;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(lp).connect(g).connect(this.master);
      osc.start();
      lfo.start();
      this.swimOsc = osc;
      this.swimGain = g;
    } else if (!on && this.swimOsc && this.swimGain) {
      const osc = this.swimOsc;
      this.swimGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      window.setTimeout(() => osc.stop(), 300);
      this.swimOsc = null;
      this.swimGain = null;
    }
  }

  // ---------- BGM：8 步进 chiptune 循环 ----------

  private startBgm() {
    if (!this.ctx || this.bgmTimer !== null) return;
    const barLen = (60 / BPM) * 4;
    this.nextBar = this.ctx.currentTime + 0.15;
    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextBar < this.ctx.currentTime + 0.4) {
        this.scheduleBar(this.nextBar);
        this.nextBar += barLen;
      }
    }, 150);
  }

  private scheduleBar(barStart: number) {
    if (!this.ctx) return;
    const eighth = 60 / BPM / 2;
    const offset = barStart - this.ctx.currentTime;

    // 低音线（A 小调律动，两小节交替）
    const bassA = [110, 0, 110, 0, 130.81, 0, 98, 110];
    const bassB = [98, 0, 98, 0, 110, 0, 146.83, 130.81];
    const bass = this.barCount % 2 === 0 ? bassA : bassB;
    bass.forEach((f, i) => {
      if (f) {
        this.tone(f, {
          type: 'triangle',
          dur: eighth * 0.85,
          vol: 0.09,
          when: offset + i * eighth,
        });
      }
    });

    // 踩镲
    for (let i = 0; i < 8; i++) {
      this.noise({
        dur: 0.03,
        vol: i % 2 === 0 ? 0.035 : 0.018,
        filter: 6000,
        when: offset + i * eighth,
      });
    }

    // 每 4 小节来一句旋律
    if (this.barCount % 4 === 2) {
      [440, 523.25, 659.25, 587.33].forEach((f, i) => {
        this.tone(f, {
          type: 'square',
          dur: eighth * 1.6,
          vol: 0.04,
          when: offset + i * eighth * 2,
        });
      });
    }

    this.barCount++;
  }
}

export const audio = new AudioManager();
