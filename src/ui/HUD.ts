import type { PlayerForm } from '../game/PlayerController';
import type { Coverage } from '../game/InkSystem';
import type { BotDifficulty } from '../game/EnemyBot';
import { t, fmt } from './i18n';

/**
 * HUD：墨水条 / 形态徽章 / 对战计时器 / 覆盖率条 / 结算界面。
 * 准星与操作说明为纯静态 CSS，无需 JS 更新。
 */
export class HUD {
  private inkBar = document.getElementById('ink-bar') as HTMLDivElement;
  private inkLabel = document.getElementById('ink-label') as HTMLSpanElement;
  private formBadge = document.getElementById('form-badge') as HTMLDivElement;

  private timerEl = document.getElementById('match-timer') as HTMLDivElement;
  private covPlayer = document.getElementById('cov-player') as HTMLDivElement;
  private covNeutral = document.getElementById('cov-neutral') as HTMLDivElement;
  private covEnemy = document.getElementById('cov-enemy') as HTMLDivElement;

  private resultOverlay = document.getElementById('result-overlay') as HTMLDivElement;
  private resultTitle = document.getElementById('result-title') as HTMLHeadingElement;
  private resultScore = document.getElementById('result-score') as HTMLParagraphElement;

  private difficultyBadge = document.getElementById(
    'difficulty-badge'
  ) as HTMLDivElement;

  private hpBar = document.getElementById('hp-bar') as HTMLDivElement;
  private respawnMsg = document.getElementById('respawn-msg') as HTMLDivElement;
  private crosshair = document.getElementById('crosshair') as HTMLDivElement;
  private crosshairTimeout: number | undefined;

  private lastForm: PlayerForm | null = null;
  private lastDifficulty: BotDifficulty | null = null;

  update(ink: number, inkMax: number, form: PlayerForm, hp: number, hpMax: number) {
    const pct = (ink / inkMax) * 100;
    this.inkBar.style.width = `${pct}%`;
    this.inkBar.classList.toggle('low', pct < 25);
    this.inkLabel.textContent = String(Math.round(ink));

    const hpPct = (hp / hpMax) * 100;
    this.hpBar.style.width = `${hpPct}%`;
    this.hpBar.classList.toggle('low', hpPct < 35);

    if (form !== this.lastForm) {
      this.lastForm = form;
      this.formBadge.textContent = t(form);
      this.formBadge.classList.toggle('human', form === 'human');
      this.formBadge.classList.toggle('squid', form === 'squid');
    }
  }

  /** 倒地重生倒计时；传 null 隐藏 */
  setRespawn(secondsLeft: number | null) {
    if (secondsLeft === null) {
      this.respawnMsg.classList.add('hidden');
    } else {
      this.respawnMsg.classList.remove('hidden');
      this.respawnMsg.textContent = fmt('respawnMsg', {
        s: Math.max(0, secondsLeft).toFixed(1),
      });
    }
  }

  /** 命中敌人时准星脉冲 */
  pulseCrosshair() {
    this.crosshair.classList.add('hit');
    window.clearTimeout(this.crosshairTimeout);
    this.crosshairTimeout = window.setTimeout(() => {
      this.crosshair.classList.remove('hit');
    }, 120);
  }

  /** 显示当前难度；flash 为 true 时播放切换闪烁动画 */
  showDifficulty(difficulty: BotDifficulty, flash = false) {
    this.lastDifficulty = difficulty;
    this.difficultyBadge.textContent = `${t('difficulty')}: ${t(difficulty)}`;
    if (flash) {
      this.difficultyBadge.classList.remove('flash');
      // 强制 reflow，让同名动画可以连续重播
      void this.difficultyBadge.offsetWidth;
      this.difficultyBadge.classList.add('flash');
    }
  }

  /** 语言切换后调用：强制重刷带缓存的文案 */
  refreshLocale() {
    this.lastForm = null;
    if (this.lastDifficulty) this.showDifficulty(this.lastDifficulty);
  }

  updateMatch(timeLeft: number, coverage: Coverage) {
    const t = Math.max(0, Math.ceil(timeLeft));
    const m = Math.floor(t / 60);
    const s = t % 60;
    this.timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.timerEl.classList.toggle('urgent', t <= 30);

    // flex-grow 三段式：紫 / 未涂 / 橙
    this.covPlayer.style.flexGrow = String(coverage.player);
    this.covEnemy.style.flexGrow = String(coverage.enemy);
    this.covNeutral.style.flexGrow = String(
      Math.max(0, 1 - coverage.player - coverage.enemy)
    );
  }

  showResult(coverage: Coverage) {
    const p = coverage.player * 100;
    const e = coverage.enemy * 100;
    const win = p > e;
    const draw = Math.abs(p - e) < 0.05;

    this.resultTitle.textContent = draw ? t('draw') : win ? t('victory') : t('defeat');
    this.resultTitle.className = win ? 'win' : 'lose';
    this.resultScore.textContent = fmt('score', {
      p: p.toFixed(1),
      e: e.toFixed(1),
    });
    this.resultOverlay.classList.remove('hidden');
  }

  hideResult() {
    this.resultOverlay.classList.add('hidden');
  }
}
