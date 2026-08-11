import * as THREE from 'three';
import { InkSystem, DEFAULT_TEAM_COLORS, Team, HitTarget } from './InkSystem';
import { createUsagiModel } from './models/chiikawa';
import { instantiateMaterials, addTeamScarf } from './models/characterUtils';
import { createSlosherWasher, attachWeapon, WeaponBuild } from './models/weapons';
import {
  ARENA_HALF,
  resolveObstacleCollisions,
  segmentBlocked,
} from './SceneManager';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

interface BotParams {
  /** 移动速度 */
  speed: number;
  /** 射击间隔（秒） */
  fireInterval: number;
  /** 墨迹大小倍率 */
  splatScale: number;
  /** 到达目标点后的休息时间（秒），期间不动不喷墨 */
  restTime: number;
  /** 发现玩家并反击的距离（0 = 不反击） */
  attackRange: number;
  /** 反击射击的散布（越小越准） */
  aimSpread: number;
}

const DIFFICULTY_PARAMS: Record<BotDifficulty, BotParams> = {
  easy: {
    speed: 3.5, fireInterval: 0.32, splatScale: 0.75, restTime: 1.6,
    attackRange: 0, aimSpread: 0.3,
  },
  normal: {
    speed: 4.8, fireInterval: 0.22, splatScale: 0.9, restTime: 0.7,
    attackRange: 9, aimSpread: 0.26,
  },
  hard: {
    speed: 5.5, fireInterval: 0.15, splatScale: 1.0, restTime: 0,
    attackRange: 15, aimSpread: 0.12,
  },
};

/** 主循环每帧传入的玩家状态（供索敌判断） */
export interface PlayerInfo {
  pos: THREE.Vector3;
  alive: boolean;
  /** 乌贼形态潜在己方墨汁中：视为隐身，不会被索敌 */
  hidden: boolean;
}

const RETARGET_TIME = 6;
const HP_MAX = 100;
const RESPAWN_TIME = 2.5;
const HIT_FLASH_TIME = 0.18;

/**
 * 简单 AI 涂地机器人（橙队）：
 * 随机挑选场内目标点 → 走过去 → 沿途朝行进方向喷墨涂地 → 短暂休息。
 * 难度决定移速 / 射速 / 墨迹大小 / 休息时长。
 */
export class EnemyBot implements HitTarget {
  readonly group = new THREE.Group();
  readonly team: Team = 'enemy';
  readonly radius = 0.55;
  readonly height = 1.7;

  private hp = HP_MAX;
  private downed = false;
  private respawnTimer = 0;
  private flashTimer = 0;

  private params: BotParams = DIFFICULTY_PARAMS.normal;
  private modelMats!: THREE.MeshStandardMaterial[];
  private scarfMat!: THREE.MeshStandardMaterial;
  private weapon!: WeaponBuild;
  private target = new THREE.Vector3();
  private retargetTimer = 0;
  private restTimer = 0;
  private fireCooldown = 0;
  private tmpDir = new THREE.Vector3();
  private tmpShoot = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private inkSystem: InkSystem,
    difficulty: BotDifficulty = 'normal'
  ) {
    // うさぎ角色模型（双手抱洗衣机泼桶），材质按实例克隆
    const model = createUsagiModel();
    this.modelMats = instantiateMaterials(model);
    this.scarfMat = addTeamScarf(model, 0.77, 0.36, DEFAULT_TEAM_COLORS.enemy);
    this.weapon = createSlosherWasher(DEFAULT_TEAM_COLORS.enemy);
    attachWeapon(model, this.weapon);
    this.group.add(model);

    scene.add(this.group);
    this.setDifficulty(difficulty);
    this.reset();
  }

  setDifficulty(difficulty: BotDifficulty) {
    this.params = DIFFICULTY_PARAMS[difficulty];
  }

  /** 更换队伍墨色（围巾 + 武器墨色部件，不染角色本体） */
  setColor(hex: string) {
    this.scarfMat.color.set(hex);
    this.scarfMat.emissive.set(hex);
    for (const m of this.weapon.inkMats) {
      m.color.set(hex);
      m.emissive.set(hex);
    }
  }

  // ---------- HitTarget ----------
  get alive() {
    return !this.downed;
  }
  getPosition() {
    return this.group.position;
  }
  onHit(damage: number) {
    this.hp -= damage;
    this.flashTimer = HIT_FLASH_TIME;
    if (this.hp <= 0) {
      this.downed = true;
      this.respawnTimer = RESPAWN_TIME;
      this.group.visible = false;
    }
  }

  private respawn() {
    this.downed = false;
    this.group.visible = true;
    this.group.position.set(0, 0, -18);
    this.hp = HP_MAX;
    this.pickTarget();
  }

  reset() {
    this.group.position.set(0, 0, -18);
    this.fireCooldown = 0;
    this.restTimer = 0;
    this.hp = HP_MAX;
    this.downed = false;
    this.respawnTimer = 0;
    this.flashTimer = 0;
    this.group.visible = true;
    this.pickTarget();
  }

  private pickTarget() {
    const margin = 3;
    this.target.set(
      THREE.MathUtils.randFloatSpread((ARENA_HALF - margin) * 2),
      0,
      THREE.MathUtils.randFloatSpread((ARENA_HALF - margin) * 2)
    );
    this.retargetTimer = RETARGET_TIME;
  }

  update(dt: number, player?: PlayerInfo) {
    // 倒地：等待重生
    if (this.downed) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    // 受击闪白衰减
    let flashIntensity = 0;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      flashIntensity = 1.5 * Math.max(this.flashTimer / HIT_FLASH_TIME, 0);
    }
    for (const m of this.modelMats) m.emissiveIntensity = flashIntensity;

    // 休息中：原地待机
    if (this.restTimer > 0) {
      this.restTimer -= dt;
      return;
    }

    this.retargetTimer -= dt;
    this.fireCooldown -= dt;

    // 索敌：玩家在反击距离内、未潜墨隐身、视线未被障碍物遮挡 → 转火
    if (player && this.params.attackRange > 0 && player.alive && !player.hidden) {
      const dx = player.pos.x - this.group.position.x;
      const dz = player.pos.z - this.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (
        dist < this.params.attackRange &&
        !segmentBlocked(
          this.group.position.x,
          this.group.position.z,
          player.pos.x,
          player.pos.z
        )
      ) {
        this.attack(dt, player.pos, dist);
        return;
      }
    }

    this.wander(dt);
  }

  /** 巡逻涂地（原有行为） */
  private wander(dt: number) {
    this.tmpDir.subVectors(this.target, this.group.position);
    this.tmpDir.y = 0;

    if (this.tmpDir.lengthSq() < 1 || this.retargetTimer <= 0) {
      this.restTimer = this.params.restTime;
      this.pickTarget();
      return;
    }

    this.tmpDir.normalize();
    this.group.position.addScaledVector(this.tmpDir, this.params.speed * dt);
    resolveObstacleCollisions(this.group.position, this.radius);
    // 身体默认朝 -Z，转向行进方向
    this.group.rotation.y = Math.atan2(-this.tmpDir.x, -this.tmpDir.z);

    // 边走边朝前方喷墨（带一点随机散布）
    if (this.fireCooldown <= 0) {
      this.fireCooldown = this.params.fireInterval;
      this.tmpShoot
        .copy(this.tmpDir)
        .add(
          new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(0.3),
            -0.05 + THREE.MathUtils.randFloatSpread(0.1),
            THREE.MathUtils.randFloatSpread(0.3)
          )
        )
        .normalize();

      this.fire();
    }
  }

  /** 反击模式：面向玩家，距离远则逼近，朝玩家射击（精度由难度决定） */
  private attack(dt: number, playerPos: THREE.Vector3, dist: number) {
    this.tmpDir.subVectors(playerPos, this.group.position);
    this.tmpDir.y = 0;
    this.tmpDir.normalize();
    this.group.rotation.y = Math.atan2(-this.tmpDir.x, -this.tmpDir.z);

    if (dist > 6) {
      this.group.position.addScaledVector(this.tmpDir, this.params.speed * dt);
      resolveObstacleCollisions(this.group.position, this.radius);
    }

    if (this.fireCooldown <= 0) {
      this.fireCooldown = this.params.fireInterval;
      // 瞄准躯干，并按距离稍微抬高补偿弹道下坠
      const aimY = playerPos.y + 1.2 + dist * 0.05;
      this.tmpShoot
        .set(
          playerPos.x - this.group.position.x,
          aimY - 1.2,
          playerPos.z - this.group.position.z
        )
        .normalize()
        .add(
          new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(this.params.aimSpread),
            THREE.MathUtils.randFloatSpread(this.params.aimSpread * 0.6),
            THREE.MathUtils.randFloatSpread(this.params.aimSpread)
          )
        )
        .normalize();

      this.fire();
    }
  }

  private fire() {
    const origin = this.group.position
      .clone()
      .add(new THREE.Vector3(0, 1.2, 0))
      .addScaledVector(this.tmpShoot, 0.7);
    this.inkSystem.spawnBullet(origin, this.tmpShoot, 'enemy', this.params.splatScale);
  }
}
