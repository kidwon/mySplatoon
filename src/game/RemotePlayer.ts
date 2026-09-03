import * as THREE from 'three';
import { Team, HitTarget } from './InkSystem';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterDef } from './models/characters';
import type { PlayerForm } from './PlayerController';

/** 渲染滞后于最新快照的时间（秒）：两个发送间隔，吸收网络抖动 */
const INTERP_DELAY = 0.1;
/** 快照缓冲保留时长（秒） */
const BUFFER_KEEP = 1.0;
const HIT_FLASH_TIME = 0.18;

interface Snapshot {
  /** 本地接收时刻（秒） */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  form: PlayerForm;
  speed: number;
  grounded: boolean;
  swimming: boolean;
  hp: number;
  downed: boolean;
}

/**
 * 远端玩家：只负责"呈现"——按快照缓冲做插值（位置/朝向），
 * 驱动形态/动画/半透明；不跑任何本地模拟。
 * 作为 HitTarget 让本地子弹能打中它：命中判定由射手客户端做出（shooter-authoritative），
 * onHit 不直接扣血，而是通过回调把伤害发给对方，由对方自己结算。
 */
export class RemotePlayer implements HitTarget {
  readonly id: string;
  readonly group = new THREE.Group();
  readonly team: Team;
  form: PlayerForm = 'human';
  hp = 100;
  downed = false;

  /** 本地子弹命中时触发（由联机会话转发为 hit 消息） */
  onLocalHit?: (damage: number) => void;

  private avatar: CharacterAvatar;
  private snaps: Snapshot[] = [];
  private flashTimer = 0;
  private swimming = false;
  private lastSpeed = 0;
  private lastGrounded = true;
  private tmpYaw = 0;

  constructor(
    private scene: THREE.Scene,
    id: string,
    def: CharacterDef,
    team: Team,
    color: string,
    spawn: { x: number; z: number; yaw: number }
  ) {
    this.id = id;
    this.team = team;
    this.avatar = new CharacterAvatar(def, color);
    this.group.add(this.avatar.group);
    this.group.position.set(spawn.x, 0, spawn.z);
    this.group.rotation.y = spawn.yaw;
    this.tmpYaw = spawn.yaw;
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
  }

  setColor(hex: string) {
    this.avatar.setColor(hex);
  }

  // ---------- HitTarget ----------
  get radius() {
    const r = this.avatar.def.radius;
    return this.form === 'squid' ? r * 0.85 : r;
  }
  get height() {
    const h = this.avatar.def.height;
    return this.form === 'squid' ? h * 0.35 : h;
  }
  get alive() {
    return !this.downed;
  }
  getPosition() {
    return this.group.position;
  }
  onHit(damage: number) {
    this.flashTimer = HIT_FLASH_TIME;
    this.onLocalHit?.(damage);
  }

  /** 接收一条状态快照 */
  pushSnapshot(s: Omit<Snapshot, 't'>) {
    const now = performance.now() / 1000;
    this.snaps.push({ ...s, t: now });
    // 丢弃过旧的快照
    while (this.snaps.length > 2 && this.snaps[0].t < now - BUFFER_KEEP) this.snaps.shift();

    // 离散状态（形态 / 倒地 / 血量）直接采用最新值
    if (s.form !== this.form) {
      this.form = s.form;
      this.avatar.setSquid(this.form === 'squid');
    }
    this.hp = s.hp;
    if (s.downed !== this.downed) {
      this.downed = s.downed;
      this.group.visible = !s.downed;
      if (!s.downed) {
        this.avatar.resetPose();
        this.avatar.setSquid(this.form === 'squid');
        // 重生瞬移：清掉旧快照避免从倒地点滑过去
        this.snaps = this.snaps.slice(-1);
        this.group.position.set(s.x, s.y, s.z);
      }
    }
    this.swimming = s.swimming;
    this.lastSpeed = s.speed;
    this.lastGrounded = s.grounded;
  }

  update(dt: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.avatar.setFlash(1.5 * Math.max(this.flashTimer / HIT_FLASH_TIME, 0));
    } else {
      this.avatar.setFlash(0);
    }

    this.interpolate();

    this.avatar.animate(dt, {
      speed: this.lastSpeed,
      grounded: this.lastGrounded,
      swimming: this.form === 'squid',
    });
    this.avatar.setOpacity(this.swimming ? 0.45 : 1);
  }

  /** 在快照缓冲上按 (now - INTERP_DELAY) 做线性插值；超出缓冲末端则停在最新快照 */
  private interpolate() {
    const n = this.snaps.length;
    if (n === 0) return;
    const renderT = performance.now() / 1000 - INTERP_DELAY;

    let a = this.snaps[n - 1];
    let b = a;
    for (let i = n - 1; i >= 0; i--) {
      if (this.snaps[i].t <= renderT) {
        a = this.snaps[i];
        b = this.snaps[Math.min(i + 1, n - 1)];
        break;
      }
      if (i === 0) {
        a = this.snaps[0];
        b = this.snaps[Math.min(1, n - 1)];
      }
    }

    let k = 0;
    if (b !== a && b.t > a.t) {
      k = THREE.MathUtils.clamp((renderT - a.t) / (b.t - a.t), 0, 1);
    }
    this.group.position.set(
      THREE.MathUtils.lerp(a.x, b.x, k),
      THREE.MathUtils.lerp(a.y, b.y, k),
      THREE.MathUtils.lerp(a.z, b.z, k)
    );
    // 朝向按最短弧插值
    let dy = b.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.tmpYaw = a.yaw + dy * k;
    this.group.rotation.y = this.tmpYaw;
  }
}
