import * as THREE from 'three';
import { NetClient, NetStatus } from '../net/NetClient';
import {
  RoomState,
  PlayerInfo,
  TeamIndex,
  TeamCoverage,
  ServerErrorCode,
  spawnFor,
} from '../net/protocol';
import { InkSystem, Team, HitTarget, Coverage } from './InkSystem';
import { PlayerController } from './PlayerController';
import { RemotePlayer } from './RemotePlayer';
import { CHARACTER_DEFS, isCharacterKey } from './models/characters';
import type { MapMarker } from '../ui/Minimap';
import { audio } from './AudioManager';

/** 状态快照发送频率（Hz） */
const SNAPSHOT_RATE = 20;
/** 结束后等待房主结果的超时（秒），超时用本地覆盖率兜底 */
const RESULT_TIMEOUT = 2.5;

/**
 * 联机会话：把网络消息接到游戏对象上。
 *
 * 权威划分（无服务器模拟）：
 * - 自己的移动/墨槽/血量/倒地由本机结算，20Hz 广播快照；
 * - 自己发射的子弹由本机模拟：落地涂色与命中远端玩家都由本机判定（favor the shooter），
 *   涂色以 paint 事件、命中以 hit 事件广播；对方收到 hit 后自行扣血；
 * - 远端玩家的子弹在本机只做表现（cosmetic），不涂地不命中；
 * - 覆盖率网格对同一组 paint 事件是确定性的，但为了双方结算一致，
 *   结束时由房主上报覆盖率，服务器广播作为唯一结果。
 */
export class OnlineSession {
  readonly net = new NetClient();
  room: RoomState | null = null;
  readonly remotes = new Map<string, RemotePlayer>();

  private myTeam: TeamIndex = 0;
  private startAt = 0;
  private duration = 0;
  private started = false;
  private ended = false;
  private resultReceived = false;
  private resultTimer = 0;
  private sendTimer = 0;
  private tmpOrigin = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();

  // ---------- 供 Game 接线的回调 ----------
  onStatus?: (status: NetStatus) => void;
  onRoom?: (room: RoomState | null) => void;
  onError?: (code: ServerErrorCode) => void;
  /** 开局：传入本地语义的双方墨色，Game 应据此换色并重置对局 */
  onStart?: (colors: { player: string; enemy: string }) => void;
  onEnd?: (reason: 'time' | 'left') => void;
  /** 结算（本地语义覆盖率） */
  onResult?: (coverage: Coverage) => void;

  constructor(
    private scene: THREE.Scene,
    private inkSystem: InkSystem,
    private player: PlayerController
  ) {
    this.net.onStatus = (s) => {
      if (s !== 'connected') {
        this.room = null;
        this.onRoom?.(null);
        if (this.matchActive) this.finish('left');
      }
      this.onStatus?.(s);
    };
    this.net.on('room', (m) => {
      const prev = this.room?.phase;
      this.room = m.room;
      // 回到大厅：清理上一局的远端角色与钩子
      if (m.room.phase === 'lobby' && prev !== 'lobby' && prev !== undefined) this.cleanupMatch();
      this.onRoom?.(m.room);
    });
    this.net.on('error', (m) => this.onError?.(m.code));
    this.net.on('start', (m) => this.startMatch(m.startAt, m.duration, m.teamColors, m.players));
    this.net.on('end', (m) => this.finish(m.reason, m.hostId));
    this.net.on('result', (m) => this.receiveResult(m.coverage));
    this.net.on('left', (m) => {
      this.remotes.get(m.id)?.dispose();
      this.remotes.delete(m.id);
    });

    // 对局内事件
    this.net.on('state', (m) => {
      this.remotes.get(m.from)?.pushSnapshot(m);
    });
    this.net.on('fire', (m) => {
      const r = this.remotes.get(m.from);
      if (!r) return;
      this.tmpOrigin.set(m.x, m.y, m.z);
      this.tmpDir.set(m.dx, m.dy, m.dz);
      this.inkSystem.spawnBullet(this.tmpOrigin, this.tmpDir, r.team, m.scale, true);
    });
    this.net.on('paint', (m) => {
      this.inkSystem.applyRemotePaint(m.x, m.z, m.r, this.toLocalTeam(m.team));
    });
    this.net.on('hit', (m) => {
      if (m.to !== this.net.id || !this.player.alive || !this.matchActive) return;
      this.player.onHit(m.damage);
      audio.hurt();
    });
    this.net.on('ko', (m) => {
      const team = this.toLocalTeam(m.killerTeam);
      this.inkSystem.spawnBurst(new THREE.Vector3(m.x, 0.7, m.z), team, 20);
      audio.knockout();
    });
  }

  // ---------- 连接 / 房间 ----------

  async connect(url: string): Promise<boolean> {
    try {
      await this.net.connect(url);
      return true;
    } catch {
      return false;
    }
  }

  disconnect() {
    this.cleanupMatch();
    this.room = null;
    this.net.disconnect();
  }

  createRoom(char: string, color: string) {
    this.net.send({ t: 'create', char, color });
  }

  joinRoom(code: string, char: string, color: string) {
    this.net.send({ t: 'join', code: code.trim().toUpperCase(), char, color });
  }

  setLobby(patch: { char?: string; color?: string; ready?: boolean }) {
    this.net.send({ t: 'lobby', ...patch });
  }

  leaveRoom() {
    this.cleanupMatch();
    this.net.send({ t: 'leave' });
    this.room = null;
    this.onRoom?.(null);
  }

  get myId() {
    return this.net.id;
  }
  get inRoom() {
    return this.room !== null;
  }
  get isHost() {
    return this.room?.hostId === this.net.id;
  }
  get me(): PlayerInfo | undefined {
    return this.room?.players.find((p) => p.id === this.net.id);
  }

  // ---------- 对局时钟 ----------

  /** 开局前倒计时（秒），已开始则 ≤ 0 */
  get countdown(): number {
    return (this.startAt - this.net.serverNow()) / 1000;
  }
  /** 对局进行中（已过倒计时且未结束） */
  get playing(): boolean {
    return this.started && !this.ended && this.countdown <= 0;
  }
  /** 从开局到结算前 */
  get matchActive(): boolean {
    return this.started && !this.ended;
  }
  get timeLeft(): number {
    if (!this.started) return this.duration / 1000;
    const left = (this.startAt + this.duration - this.net.serverNow()) / 1000;
    return THREE.MathUtils.clamp(left, 0, this.duration / 1000);
  }

  // ---------- 队伍语义转换 ----------

  toLocalTeam(idx: TeamIndex): Team {
    return idx === this.myTeam ? 'player' : 'enemy';
  }
  toTeamIndex(team: Team): TeamIndex {
    return team === 'player' ? this.myTeam : (((this.myTeam + 1) % 2) as TeamIndex);
  }
  private coverageToTeam(c: Coverage): TeamCoverage {
    return this.myTeam === 0 ? [c.player, c.enemy] : [c.enemy, c.player];
  }
  private coverageToLocal(c: TeamCoverage): Coverage {
    return this.myTeam === 0 ? { player: c[0], enemy: c[1] } : { player: c[1], enemy: c[0] };
  }

  // ---------- 供主循环使用 ----------

  targets(): HitTarget[] {
    return [...this.remotes.values()];
  }

  /** 最近的敌方玩家位置（相机自遮挡淡出用） */
  nearestEnemyPos(): THREE.Vector3 | undefined {
    let best: RemotePlayer | undefined;
    let bestD = Infinity;
    const me = this.player.getPosition();
    for (const r of this.remotes.values()) {
      if (r.team !== 'enemy' || !r.alive) continue;
      const d = r.getPosition().distanceToSquared(me);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best?.getPosition();
  }

  markers(): MapMarker[] {
    const out: MapMarker[] = [];
    const colors = this.teamColorsLocal;
    for (const r of this.remotes.values()) {
      out.push({ pos: r.getPosition(), color: colors[r.team], visible: r.alive });
    }
    return out;
  }

  private teamColorsLocal: Record<Team, string> = { player: '#9B51E0', enemy: '#F2A33C' };

  update(dt: number) {
    for (const r of this.remotes.values()) r.update(dt);

    if (this.matchActive) {
      this.sendTimer += dt;
      if (this.sendTimer >= 1 / SNAPSHOT_RATE) {
        this.sendTimer = 0;
        this.sendSnapshot();
      }
    }

    if (this.ended && !this.resultReceived) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        // 房主结果迟迟未到：用本地覆盖率兜底
        this.receiveResult(this.coverageToTeam(this.inkSystem.getCoverage()));
      }
    }
  }

  private sendSnapshot() {
    const p = this.player;
    const pos = p.getPosition();
    this.net.send({
      t: 'state',
      x: +pos.x.toFixed(3),
      y: +pos.y.toFixed(3),
      z: +pos.z.toFixed(3),
      yaw: +p.facingYaw.toFixed(3),
      form: p.form,
      speed: +p.moveSpeed.toFixed(2),
      grounded: p.isGrounded,
      swimming: p.swimming,
      hp: Math.round(p.hp),
      downed: p.downed,
    });
  }

  // ---------- 开局 / 结束 ----------

  private startMatch(
    startAt: number,
    duration: number,
    teamColors: [string, string],
    players: PlayerInfo[]
  ) {
    this.cleanupMatch();
    const me = players.find((p) => p.id === this.net.id);
    if (!me) return;
    this.myTeam = me.team;
    this.startAt = startAt;
    this.duration = duration;
    this.started = true;
    this.ended = false;
    this.resultReceived = false;
    this.sendTimer = 0;
    this.teamColorsLocal = {
      player: teamColors[this.myTeam],
      enemy: teamColors[(this.myTeam + 1) % 2],
    };

    // 出生点：按队伍/席位
    const sp = spawnFor(me.team, me.slot);
    this.player.setSpawn(sp.x, sp.z, sp.yaw);

    // 远端玩家
    for (const p of players) {
      if (p.id === me.id) continue;
      const def = CHARACTER_DEFS[isCharacterKey(p.char) ? p.char : 'hachiware'];
      const team = this.toLocalTeam(p.team);
      const remote = new RemotePlayer(
        this.scene,
        p.id,
        def,
        team,
        this.teamColorsLocal[team],
        spawnFor(p.team, p.slot)
      );
      remote.onLocalHit = (damage) => this.net.send({ t: 'hit', to: p.id, damage });
      this.remotes.set(p.id, remote);
    }

    // 本地权威事件 → 广播
    this.player.onFire = (origin, dir) =>
      this.net.send({
        t: 'fire',
        x: +origin.x.toFixed(3),
        y: +origin.y.toFixed(3),
        z: +origin.z.toFixed(3),
        dx: +dir.x.toFixed(4),
        dy: +dir.y.toFixed(4),
        dz: +dir.z.toFixed(4),
        scale: 1,
      });
    this.player.onKnockout = (pos) => {
      // 自己被击倒：脚下爆一大片敌方墨迹（经 onPaint 广播）+ 通知对方播特效
      this.inkSystem.paintSplat(pos.x, pos.z, 3.2, 'enemy');
      this.inkSystem.spawnBurst(new THREE.Vector3(pos.x, 0.7, pos.z), 'enemy', 20);
      audio.knockout();
      this.net.send({ t: 'ko', x: pos.x, z: pos.z, killerTeam: this.toTeamIndex('enemy') });
    };
    this.inkSystem.onPaint = (x, z, r, team) =>
      this.net.send({
        t: 'paint',
        x: +x.toFixed(3),
        z: +z.toFixed(3),
        r: +r.toFixed(3),
        team: this.toTeamIndex(team),
      });

    this.onStart?.({ ...this.teamColorsLocal });
  }

  private finish(reason: 'time' | 'left', hostId?: string) {
    if (!this.started || this.ended) return;
    this.ended = true;
    this.resultTimer = RESULT_TIMEOUT;
    // 断开钩子：结算后不再广播
    this.player.onFire = undefined;
    this.player.onKnockout = undefined;
    this.inkSystem.onPaint = undefined;
    this.onEnd?.(reason);
    const host = hostId ?? this.room?.hostId;
    if (host === this.net.id) {
      this.net.send({ t: 'result', coverage: this.coverageToTeam(this.inkSystem.getCoverage()) });
    }
  }

  private receiveResult(coverage: TeamCoverage) {
    if (this.resultReceived) return;
    this.resultReceived = true;
    this.onResult?.(this.coverageToLocal(coverage));
  }

  /** 清理远端角色与本地钩子（回大厅 / 离开 / 断线） */
  private cleanupMatch() {
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.player.onFire = undefined;
    this.player.onKnockout = undefined;
    this.inkSystem.onPaint = undefined;
    this.started = false;
    this.ended = false;
  }
}
