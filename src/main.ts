import * as THREE from 'three';
import { SceneManager } from './game/SceneManager';
import { PlayerController, INK_MAX, HP_MAX } from './game/PlayerController';
import { InkSystem, Team, DEFAULT_TEAM_COLORS } from './game/InkSystem';
import { CHARACTER_DEFS, isCharacterKey } from './game/models/characters';
import type { ChiikawaCharacter } from './game/models/chiikawa';
import { EnemyBot, BotDifficulty } from './game/EnemyBot';
import { ModelShowcase } from './game/ModelShowcase';
import { OnlineSession } from './game/OnlineSession';
import { Input } from './game/Input';
import { TouchControls } from './game/TouchControls';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { CharacterSelect } from './ui/CharacterSelect';
import { OnlineLobby } from './ui/OnlineLobby';
import { applyStatic, getLang, setLang, Lang, t, fmt } from './ui/i18n';
import { audio } from './game/AudioManager';
import { INK_PALETTE } from './net/protocol';

/** 一局时长（秒） */
const MATCH_DURATION = 180;

type Mode = 'solo' | 'online';
type Overlay = 'start' | 'online' | 'enter' | 'select' | null;

class Game {
  private sceneManager: SceneManager;
  private inkSystem: InkSystem;
  private player: PlayerController;
  private bot: EnemyBot;
  private input: Input;
  private touch: TouchControls;
  private hud: HUD;
  private minimap = new Minimap();
  private showcase!: ModelShowcase;
  private charSelect = new CharacterSelect();
  private session: OnlineSession;
  private lobby = new OnlineLobby(INK_PALETTE);
  private clock = new THREE.Clock();
  private lastTickSecond = -1;

  private mode: Mode = 'solo';
  /** 角色选择页关闭后返回哪个覆盖层 */
  private selectReturn: Exclude<Overlay, null> = 'start';
  private timeLeft = MATCH_DURATION;
  private matchEnded = false;
  private difficulty: BotDifficulty = 'normal';
  private playerColor = DEFAULT_TEAM_COLORS.player;
  private enemyColor = DEFAULT_TEAM_COLORS.enemy;
  private playerChar: ChiikawaCharacter;
  private enemyChar: ChiikawaCharacter;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    // 角色选择（持久化）
    const savedPlayer = localStorage.getItem('mysplatoon-char-player');
    const savedEnemy = localStorage.getItem('mysplatoon-char-enemy');
    this.playerChar = isCharacterKey(savedPlayer) ? savedPlayer : 'hachiware';
    this.enemyChar = isCharacterKey(savedEnemy) ? savedEnemy : 'usagi';

    this.sceneManager = new SceneManager(canvas);
    this.inkSystem = new InkSystem(this.sceneManager.scene);
    this.player = new PlayerController(
      this.sceneManager.scene,
      this.sceneManager.camera,
      CHARACTER_DEFS[this.playerChar]
    );
    this.bot = new EnemyBot(
      this.sceneManager.scene,
      this.inkSystem,
      'normal',
      CHARACTER_DEFS[this.enemyChar]
    );
    this.showcase = new ModelShowcase(this.sceneManager.scene);
    this.input = new Input(canvas);
    this.touch = new TouchControls(this.input);
    if (TouchControls.supported) document.body.classList.add('touch-device');
    this.hud = new HUD();
    this.session = new OnlineSession(this.sceneManager.scene, this.inkSystem, this.player);

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
    this.setupOnline();
    this.loop();
  }

  /** 统一管理四个互斥覆盖层；null = 全部隐藏（对局中） */
  private showOverlay(which: Overlay) {
    document.getElementById('start-overlay')!.classList.toggle('hidden', which !== 'start');
    document.getElementById('online-overlay')!.classList.toggle('hidden', which !== 'online');
    document.getElementById('enter-overlay')!.classList.toggle('hidden', which !== 'enter');
    document.getElementById('select-overlay')!.classList.toggle('hidden', which !== 'select');
    document.getElementById('hud')!.classList.toggle('hidden', which === 'select');
  }

  /** 开始覆盖层（锁鼠标/触屏进入战场）与结算覆盖层（重开） */
  private setupOverlays() {
    const startOverlay = document.getElementById('start-overlay')!;
    // 桌面端走 Pointer Lock；触屏没有这个 API，直接进战场，
    // 右上角菜单按钮（touch.onRelease）承担桌面端 ESC 释放指针锁定的角色
    const engageControls = () => {
      audio.ensureStarted(); // AudioContext 需要用户手势才能启动
      if (TouchControls.supported) {
        this.input.touchActive = true;
        this.touch.show();
        this.showOverlay(null);
      } else {
        this.input.requestPointerLock();
      }
    };
    startOverlay.addEventListener('click', engageControls);
    document.getElementById('enter-overlay')!.addEventListener('click', engageControls);
    this.touch.onRelease = () => {
      this.input.touchActive = false;
      this.releaseControlsUI();
    };

    // M 键静音开关
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !this.typingInInput(e)) audio.toggleMute();
    });

    // 难度选择：点按钮只切难度，不触发开始（阻断冒泡）
    startOverlay.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.changeDifficulty(btn.dataset.difficulty as BotDifficulty);
      });
    });

    // 对局中 1/2/3 快捷键切难度（仅单机）
    const hotkeys: Record<string, BotDifficulty> = {
      Digit1: 'easy',
      Digit2: 'normal',
      Digit3: 'hard',
    };
    window.addEventListener('keydown', (e) => {
      const d = hotkeys[e.code];
      if (d && this.mode === 'solo' && !this.typingInInput(e)) this.changeDifficulty(d, true);
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
        this.lobby.refreshLocale();
        this.markCharacters(); // 入口按钮文案是动态拼接的，需手动刷新
      });
    });
    // 角色选择页入口（按钮文案显示当前选择，由 markCharacters 刷新）
    for (const side of ['player', 'enemy'] as const) {
      document.getElementById(`open-select-${side}`)!.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectReturn = 'start';
        this.openSelect(side);
      });
    }
    document.getElementById('open-online')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.enterOnline();
    });
    this.setupSelectOverlay();

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
    this.markCharacters();

    document.addEventListener('pointerlockchange', () => {
      if (this.input.pointerLocked) {
        this.showOverlay(null);
        return;
      }
      this.releaseControlsUI();
    });

    document.getElementById('restart-btn')!.addEventListener('click', () => {
      if (this.mode === 'online') this.backToLobby();
      else this.resetMatch();
    });
  }

  /** 焦点在文本框里时不响应游戏快捷键 */
  private typingInInput(e: KeyboardEvent) {
    return (e.target as HTMLElement)?.tagName === 'INPUT';
  }

  /**
   * 操作被释放后（桌面端指针锁定丢失 / 触屏点了菜单按钮）该弹哪个覆盖层：
   * 结算界面、角色选择页显示期间不弹；否则按当前模式回到开始页或联机的等待/大厅页。
   */
  private releaseControlsUI() {
    this.touch.hide();
    if (this.matchEnded || this.charSelect.active) return;
    if (this.mode === 'online') {
      this.showOverlay(this.session.matchActive ? 'enter' : 'online');
    } else {
      this.showOverlay('start');
    }
  }

  /** 对局结束：桌面端解锁鼠标，触屏端一并退出"进入战场"状态并隐藏虚拟按键 */
  private exitControls() {
    document.exitPointerLock();
    this.input.touchActive = false;
    this.touch.hide();
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

  /** 角色选择页：页签 / 箭头 / 确认 / 返回 / 拖拽旋转 */
  private setupSelectOverlay() {
    const overlay = document.getElementById('select-overlay')!;

    for (const side of ['player', 'enemy'] as const) {
      document.getElementById(`select-tab-${side}`)!.addEventListener('click', () => {
        this.charSelect.side = side;
        this.charSelect.setPreview(
          side === 'player' ? this.playerChar : this.enemyChar,
          side === 'player' ? this.playerColor : this.enemyColor
        );
        this.refreshSelectUI();
      });
    }
    document.getElementById('select-prev')!.addEventListener('click', () => {
      this.charSelect.cycle(-1);
      this.refreshSelectUI();
    });
    document.getElementById('select-next')!.addEventListener('click', () => {
      this.charSelect.cycle(1);
      this.refreshSelectUI();
    });
    document.getElementById('select-confirm')!.addEventListener('click', () => {
      this.pickCharacter(this.charSelect.side, this.charSelect.previewKey);
      this.closeSelect();
    });
    document.getElementById('select-back')!.addEventListener('click', () => this.closeSelect());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.charSelect.active) this.closeSelect();
    });

    // 拖拽旋转（按在按钮上不触发）
    overlay.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      this.charSelect.setDragging(true);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.charSelect.active) this.charSelect.rotateBy(e.movementX * 0.008);
    });
    window.addEventListener('mouseup', () => this.charSelect.setDragging(false));
  }

  private openSelect(side: 'player' | 'enemy') {
    this.charSelect.open(
      side,
      side === 'player' ? this.playerChar : this.enemyChar,
      side === 'player' ? this.playerColor : this.enemyColor
    );
    // 联机大厅只能选自己的角色
    document
      .getElementById('select-tab-enemy')!
      .classList.toggle('hidden', this.selectReturn === 'online');
    this.showOverlay('select');
    this.refreshSelectUI();
  }

  private closeSelect() {
    this.charSelect.close();
    this.showOverlay(this.selectReturn);
  }

  /** 刷新选择页的页签选中态与角色名 */
  private refreshSelectUI() {
    for (const side of ['player', 'enemy'] as const) {
      document
        .getElementById(`select-tab-${side}`)!
        .classList.toggle('selected', this.charSelect.side === side);
    }
    document.getElementById('select-name')!.textContent = t(
      `char_${this.charSelect.previewKey}`
    );
  }

  /** 选角色：重建对应 avatar；单机清场重开，联机同步到房间 */
  private pickCharacter(side: 'player' | 'enemy', key: ChiikawaCharacter) {
    if (side === 'player') {
      if (key === this.playerChar) return;
      this.playerChar = key;
      localStorage.setItem('mysplatoon-char-player', key);
      this.player.setCharacter(CHARACTER_DEFS[key]);
    } else {
      if (key === this.enemyChar) return;
      this.enemyChar = key;
      localStorage.setItem('mysplatoon-char-enemy', key);
      this.bot.setCharacter(CHARACTER_DEFS[key]);
    }
    this.markCharacters();
    if (this.mode === 'online') {
      this.session.setLobby({ char: this.playerChar });
      this.lobby.render(this.session.room, this.session.myId, this.playerChar, this.playerColor);
    } else {
      this.resetMatch();
    }
  }

  /** 同步选择入口按钮文案与展示台台座发光 */
  private markCharacters() {
    document.getElementById('open-select-player')!.textContent = `${t('yourChar')}: ${t(
      `char_${this.playerChar}`
    )}`;
    document.getElementById('open-select-enemy')!.textContent = `${t('enemyChar')}: ${t(
      `char_${this.enemyChar}`
    )}`;
    // 台座发光：对手先写、玩家后写——双方同角色时玩家色优先
    const highlights: Partial<Record<ChiikawaCharacter, string>> = {};
    highlights[this.enemyChar] = this.enemyColor;
    highlights[this.playerChar] = this.playerColor;
    this.showcase.setHighlights(highlights);
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
    this.applyTeamColors(this.playerColor, this.enemyColor);

    document.querySelectorAll<HTMLElement>('.swatches[data-team]').forEach((row) => {
      const selected = row.dataset.team === 'player' ? this.playerColor : this.enemyColor;
      row.querySelectorAll<HTMLElement>('.swatch').forEach((s) => {
        s.classList.toggle('selected', s.dataset.hex === selected);
      });
    });
    // 换色后台座发光颜色同步
    this.markCharacters();
  }

  /** 把一组本地语义的双方墨色应用到渲染/涂地/HUD（单机与联机共用） */
  private applyTeamColors(player: string, enemy: string) {
    document.documentElement.style.setProperty('--player-color', player);
    document.documentElement.style.setProperty('--enemy-color', enemy);
    this.inkSystem.setTeamColors(player, enemy);
    this.player.setColor(player);
    this.bot.setColor(enemy);
  }

  private endMatch() {
    this.matchEnded = true;
    audio.whistle();
    audio.setSwimming(false);
    this.exitControls();
    this.hud.showResult(this.inkSystem.getCoverage());
    // exitPointerLock 是异步的，这里显式再藏一次覆盖层
    this.showOverlay(null);
  }

  private resetMatch() {
    this.inkSystem.reset();
    this.player.reset();
    this.bot.reset();
    this.timeLeft = MATCH_DURATION;
    this.lastTickSecond = -1;
    this.matchEnded = false;
    this.hud.hideResult();
    this.hud.setBanner(null);
    this.showOverlay('start');
  }

  // ---------- 联机 ----------

  private setupOnline() {
    const s = this.session;
    const l = this.lobby;

    l.onBack = () => this.leaveOnline();
    l.onConnect = (url) => this.connectOnline(url);
    l.onCreate = () => s.createRoom(this.playerChar, this.playerColor);
    l.onJoin = (code) => s.joinRoom(code, this.playerChar, this.playerColor);
    l.onReady = (ready) => s.setLobby({ ready });
    l.onLeave = () => s.leaveRoom();
    l.onOpenChar = () => {
      this.selectReturn = 'online';
      this.openSelect('player');
    };
    l.onColor = (hex) => {
      this.playerColor = hex;
      this.applyColors();
      s.setLobby({ color: hex });
      l.render(s.room, s.myId, this.playerChar, this.playerColor);
    };

    s.onStatus = (status) => l.setStatus(status);
    s.onRoom = (room) => {
      l.setError('');
      l.render(room, s.myId, this.playerChar, this.playerColor);
    };
    s.onError = (code) => l.setError(l.errorText(code));
    s.onStart = (colors) => this.startOnlineMatch(colors);
    s.onEnd = (reason) => this.endOnlineMatch(reason);
    s.onResult = (coverage) => {
      this.hud.setBanner(null);
      this.hud.showResult(coverage, t('backToRoom'));
    };
  }

  private enterOnline() {
    this.mode = 'online';
    this.bot.group.visible = false;
    this.hud.setNet(this.session.net.rtt);
    this.lobby.render(null, '', this.playerChar, this.playerColor);
    this.lobby.loadLanAddresses();
    this.showOverlay('online');
    if (!this.session.net.connected) this.connectOnline(this.lobby.serverUrl());
  }

  private async connectOnline(url: string) {
    this.lobby.setError('');
    await this.session.connect(url);
  }

  /** 退出联机回到单机：恢复机器人与单机配色 */
  private leaveOnline() {
    this.session.disconnect();
    this.mode = 'solo';
    this.bot.group.visible = true;
    this.hud.setNet(null);
    this.applyColors();
    this.resetMatch();
  }

  private startOnlineMatch(colors: { player: string; enemy: string }) {
    this.applyTeamColors(colors.player, colors.enemy);
    this.inkSystem.reset();
    this.player.reset();
    this.matchEnded = false;
    this.lastTickSecond = -1;
    this.hud.hideResult();
    this.showOverlay('enter');
  }

  private endOnlineMatch(reason: 'time' | 'left') {
    this.matchEnded = true;
    audio.whistle();
    audio.setSwimming(false);
    this.exitControls();
    this.showOverlay(null);
    this.hud.setBanner(reason === 'left' ? t('opponentLeft') : t('waitingResult'));
  }

  private backToLobby() {
    this.matchEnded = false;
    this.hud.hideResult();
    this.hud.setBanner(null);
    this.lobby.render(this.session.room, this.session.myId, this.playerChar, this.playerColor);
    this.showOverlay('online');
  }

  /** 联机对局的每帧逻辑 */
  private updateOnline(dt: number) {
    const s = this.session;
    const live = s.matchActive && !this.matchEnded;

    if (live && s.playing && this.input.engaged) {
      this.player.update(dt, this.input, this.inkSystem, s.nearestEnemyPos());
    } else {
      audio.setSwimming(false);
    }
    // 世界持续运转（远端子弹表现 / 粒子），即使自己释放了鼠标
    if (live) this.inkSystem.update(dt, s.targets());
    s.update(dt);

    // 倒计时提示（覆盖层里与 HUD 上各一份）
    const cd = live ? Math.ceil(s.countdown) : 0;
    const cdEl = document.getElementById('enter-countdown')!;
    cdEl.classList.toggle('hidden', cd <= 0);
    if (cd > 0) {
      cdEl.textContent = String(cd);
      this.hud.setBanner(fmt('startsIn', { s: cd }));
    } else if (live && !this.player.downed) {
      this.hud.setBanner(null);
    }

    // 最后 10 秒每秒嘀嗒
    const sec = Math.ceil(s.timeLeft);
    if (live && s.playing && sec <= 10 && sec >= 1 && sec !== this.lastTickSecond) {
      this.lastTickSecond = sec;
      audio.tick();
    }

    this.hud.setNet(s.net.rtt);
    this.hud.update(this.player.ink, INK_MAX, this.player.form, this.player.hp, HP_MAX);
    this.hud.setRespawn(this.player.downed ? this.player.respawnTimer : null);
    this.minimap.update(
      this.inkSystem.canvasEl,
      this.player.getPosition(),
      this.player.facingYaw,
      this.playerColorInUse(),
      s.markers()
    );
    this.hud.updateMatch(s.timeLeft, this.inkSystem.getCoverage());
  }

  /** 当前生效的己方墨色（联机开局后可能与单机选色不同） */
  private playerColorInUse(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--player-color').trim() ||
      this.playerColor;
  }

  /** 单机对局的每帧逻辑 */
  private updateSolo(dt: number) {
    const active = this.input.engaged && !this.matchEnded;

    if (active) {
      this.timeLeft -= dt;
      this.player.update(
        dt,
        this.input,
        this.inkSystem,
        this.bot.alive ? this.bot.getPosition() : undefined
      );
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

    this.hud.update(this.player.ink, INK_MAX, this.player.form, this.player.hp, HP_MAX);
    this.hud.setRespawn(this.player.downed ? this.player.respawnTimer : null);
    this.minimap.update(
      this.inkSystem.canvasEl,
      this.player.getPosition(),
      this.player.facingYaw,
      this.playerColor,
      [{ pos: this.bot.getPosition(), color: this.enemyColor, visible: this.bot.alive }]
    );
    this.hud.updateMatch(this.timeLeft, this.inkSystem.getCoverage());
  }

  private loop = () => {
    requestAnimationFrame(this.loop);

    // 限制 dt，避免切后台回来后瞬移
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 角色选择页：渲染选择场景，跳过游戏世界
    if (this.charSelect.active) {
      this.charSelect.update(dt);
      this.sceneManager.renderer.render(this.charSelect.scene, this.charSelect.camera);
      this.input.endFrame();
      return;
    }

    this.showcase.update(dt);

    if (this.mode === 'online') this.updateOnline(dt);
    else this.updateSolo(dt);

    this.sceneManager.render();
    this.input.endFrame();
  };
}

new Game();
