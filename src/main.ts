import * as THREE from 'three';
import { SceneManager } from './game/SceneManager';
import { PlayerController, INK_MAX, HP_MAX } from './game/PlayerController';
import { InkSystem, Team, DEFAULT_TEAM_COLORS } from './game/InkSystem';
import { EnemyBot, BotDifficulty } from './game/EnemyBot';
import { Input } from './game/Input';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { applyStatic, getLang, setLang, Lang } from './ui/i18n';
import { audio } from './game/AudioManager';

/** 一局时长（秒） */
const MATCH_DURATION = 180;

/**
 * 可选墨色调色板。
 * 任意两色（以及与地板底色/网格线）至少有一个 RGB 通道相差 ≥46，
 * 保证 InkSystem 像素采样判定不会混色。
 */
const INK_PALETTE = [
  '#9B51E0', // 紫
  '#F2A33C', // 橙
  '#29D9C2', // 青
  '#B3E62C', // 黄绿
  '#F04C93', // 粉
  '#3D5BF5', // 蓝
];

class Game {
  private sceneManager: SceneManager;
  private inkSystem: InkSystem;
  private player: PlayerController;
  private bot: EnemyBot;
  private input: Input;
  private hud: HUD;
  private minimap = new Minimap();
  private clock = new THREE.Clock();
  private lastTickSecond = -1;

  private timeLeft = MATCH_DURATION;
  private matchEnded = false;
  private difficulty: BotDifficulty = 'normal';
  private playerColor = DEFAULT_TEAM_COLORS.player;
  private enemyColor = DEFAULT_TEAM_COLORS.enemy;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    this.sceneManager = new SceneManager(canvas);
    this.inkSystem = new InkSystem(this.sceneManager.scene);
    this.player = new PlayerController(
      this.sceneManager.scene,
      this.sceneManager.camera
    );
    this.bot = new EnemyBot(this.sceneManager.scene, this.inkSystem);
    this.input = new Input(canvas);
    this.hud = new HUD();

    // 命中反馈：准星脉冲 + 音效
    this.inkSystem.onTargetHit = (shooter, killed) => {
      if (shooter === 'player') {
        this.hud.pulseCrosshair();
        audio.hitConfirm();
      } else {
        audio.hurt();
      }
      if (killed) audio.knockout();
    };

    this.setupOverlays();
    this.loop();
  }

  /** 开始覆盖层（锁鼠标）与结算覆盖层（重开） */
  private setupOverlays() {
    const startOverlay = document.getElementById('start-overlay')!;
    startOverlay.addEventListener('click', () => {
      audio.ensureStarted(); // AudioContext 需要用户手势才能启动
      this.input.requestPointerLock();
    });

    // M 键静音开关
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') audio.toggleMute();
    });

    // 难度选择：点按钮只切难度，不触发开始（阻断冒泡）
    startOverlay.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.changeDifficulty(btn.dataset.difficulty as BotDifficulty);
      });
    });

    // 对局中 1/2/3 快捷键切难度
    const hotkeys: Record<string, BotDifficulty> = {
      Digit1: 'easy',
      Digit2: 'normal',
      Digit3: 'hard',
    };
    window.addEventListener('keydown', (e) => {
      const d = hotkeys[e.code];
      if (d) this.changeDifficulty(d, true);
    });

    // 语言选择：应用词典并刷新 HUD 缓存文案
    const langBtns = startOverlay.querySelectorAll<HTMLButtonElement>('.lang-btn');
    const markLang = () => {
      langBtns.forEach((b) =>
        b.classList.toggle('selected', b.dataset.lang === getLang())
      );
    };
    langBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setLang(btn.dataset.lang as Lang);
        markLang();
        this.hud.refreshLocale();
      });
    });
    // 墨色选择：为双方生成色板按钮
    startOverlay.querySelectorAll<HTMLElement>('.swatches').forEach((row) => {
      const team = row.dataset.team as Team;
      for (const hex of INK_PALETTE) {
        const btn = document.createElement('button');
        btn.className = 'swatch';
        btn.style.background = hex;
        btn.dataset.hex = hex;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.pickColor(team, hex);
        });
        row.appendChild(btn);
      }
    });

    applyStatic();
    markLang();
    this.changeDifficulty(this.difficulty);
    this.applyColors();

    document.addEventListener('pointerlockchange', () => {
      // 结算界面显示期间不弹开始覆盖层
      startOverlay.classList.toggle(
        'hidden',
        this.input.pointerLocked || this.matchEnded
      );
    });

    document.getElementById('restart-btn')!.addEventListener('click', () => {
      this.resetMatch();
    });
  }

  /** 统一入口：同步机器人参数、开始界面按钮选中态、HUD 徽章 */
  private changeDifficulty(difficulty: BotDifficulty, flash = false) {
    this.difficulty = difficulty;
    this.bot.setDifficulty(difficulty);
    document.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((b) => {
      b.classList.toggle('selected', b.dataset.difficulty === difficulty);
    });
    this.hud.showDifficulty(difficulty, flash);
  }

  /** 选色；若与另一方撞色则交换双方颜色。换色会清场重开一局 */
  private pickColor(team: Team, hex: string) {
    if (team === 'player') {
      if (hex === this.enemyColor) this.enemyColor = this.playerColor;
      this.playerColor = hex;
    } else {
      if (hex === this.playerColor) this.playerColor = this.enemyColor;
      this.enemyColor = hex;
    }
    this.applyColors();
    this.resetMatch();
  }

  /** 同步墨色到 3D 材质、涂地系统、CSS 变量与色板选中态 */
  private applyColors() {
    document.documentElement.style.setProperty('--player-color', this.playerColor);
    document.documentElement.style.setProperty('--enemy-color', this.enemyColor);
    this.inkSystem.setTeamColors(this.playerColor, this.enemyColor);
    this.player.setColor(this.playerColor);
    this.bot.setColor(this.enemyColor);

    document.querySelectorAll<HTMLElement>('.swatches').forEach((row) => {
      const selected = row.dataset.team === 'player' ? this.playerColor : this.enemyColor;
      row.querySelectorAll<HTMLElement>('.swatch').forEach((s) => {
        s.classList.toggle('selected', s.dataset.hex === selected);
      });
    });
  }

  private endMatch() {
    this.matchEnded = true;
    audio.whistle();
    audio.setSwimming(false);
    document.exitPointerLock();
    this.hud.showResult(this.inkSystem.getCoverage());
    // exitPointerLock 是异步的，这里显式再藏一次开始覆盖层
    document.getElementById('start-overlay')!.classList.add('hidden');
  }

  private resetMatch() {
    this.inkSystem.reset();
    this.player.reset();
    this.bot.reset();
    this.timeLeft = MATCH_DURATION;
    this.lastTickSecond = -1;
    this.matchEnded = false;
    this.hud.hideResult();
    document.getElementById('start-overlay')!.classList.remove('hidden');
  }

  private loop = () => {
    requestAnimationFrame(this.loop);

    // 限制 dt，避免切后台回来后瞬移
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const active = this.input.pointerLocked && !this.matchEnded;

    if (active) {
      this.timeLeft -= dt;
      this.player.update(dt, this.input, this.inkSystem);
      this.bot.update(dt, {
        pos: this.player.getPosition(),
        alive: this.player.alive,
        hidden: this.player.form === 'squid' && this.player.onOwnInk,
      });
      this.inkSystem.update(dt, [this.player, this.bot]);

      // 最后 10 秒每秒嘀嗒
      const sec = Math.ceil(this.timeLeft);
      if (sec <= 10 && sec >= 1 && sec !== this.lastTickSecond) {
        this.lastTickSecond = sec;
        audio.tick();
      }

      if (this.timeLeft <= 0) this.endMatch();
    } else {
      audio.setSwimming(false);
    }

    this.hud.update(
      this.player.ink,
      INK_MAX,
      this.player.form,
      this.player.hp,
      HP_MAX
    );
    this.hud.setRespawn(this.player.downed ? this.player.respawnTimer : null);

    this.minimap.update(
      this.inkSystem.canvasEl,
      this.player.getPosition(),
      this.player.facingYaw,
      this.playerColor,
      this.bot.getPosition(),
      this.bot.alive,
      this.enemyColor
    );
    this.hud.updateMatch(this.timeLeft, this.inkSystem.getCoverage());

    this.sceneManager.render();
    this.input.endFrame();
  };
}

new Game();
