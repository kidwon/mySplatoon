import * as THREE from 'three';
import { Input } from './Input';
import { InkSystem, DEFAULT_TEAM_COLORS, Team, HitTarget } from './InkSystem';
import { audio } from './AudioManager';
import { createHachiwareModel } from './models/chiikawa';
import { instantiateMaterials, addTeamScarf } from './models/characterUtils';
import { createInkShooter, attachWeapon, WeaponBuild } from './models/weapons';
import { ARENA_HALF, resolveObstacleCollisions } from './SceneManager';

export type PlayerForm = 'human' | 'squid';

// 移动参数
const BASE_SPEED = 8;
const SQUID_INK_MULT = 1.5; // 己方墨汁中潜行：1.5 倍速
const SQUID_DRY_MULT = 0.5; // 非己方墨汁上潜行：减半
const ENEMY_INK_MULT = 0.55; // 人形踩在敌方墨汁上：明显减速
const JUMP_VELOCITY = 10;
const GRAVITY = -30;

// 血量参数
export const HP_MAX = 100;
const ENEMY_INK_DPS = 10; // 站在敌方墨汁上的持续掉血/秒
const DOT_HP_FLOOR = 15; // 敌方墨汁伤害不会致死，最低掉到这里
const HP_REGEN_SWIM = 35; // 己方墨汁潜行回血/秒
const HP_REGEN_IDLE = 4; // 其余情况被动回血/秒
const RESPAWN_TIME = 2.5;
const HIT_FLASH_TIME = 0.18;

// 墨水槽参数
export const INK_MAX = 100;
const INK_SHOT_COST = 2.2;
const INK_REGEN_SWIM = 55; // 潜墨回复 / 秒
const INK_REGEN_IDLE = 6; // 人形被动回复 / 秒
const FIRE_INTERVAL = 0.11; // 射击间隔（秒）

// 视角参数
const MOUSE_SENS = 0.0024;
const CAM_DIST = 7;
const CAM_HEIGHT = 1.6;
const PITCH_MIN = -1.15;
const PITCH_MAX = 0.55;

/**
 * 玩家控制器：移动 / 跳跃 / 形态切换 / 射击 / 墨水槽 / 第三人称相机。
 */
export class PlayerController implements HitTarget {
  readonly group: THREE.Group;
  readonly team: Team = 'player';
  form: PlayerForm = 'human';
  ink = INK_MAX;
  hp = HP_MAX;
  /** 当前是否处于己方墨汁上（供 HUD / 调试） */
  onOwnInk = false;
  /** 倒地状态 */
  downed = false;
  /** 距重生剩余秒数 */
  respawnTimer = 0;
  /** 脚下墨色归属 */
  private groundInk: Team | null = null;
  private flashTimer = 0;

  /** 当前视角朝向（供小地图） */
  get facingYaw() {
    return this.yaw;
  }

  private model: THREE.Group;
  private modelMats: THREE.MeshStandardMaterial[];
  private scarfMat: THREE.MeshStandardMaterial;
  private weapon: WeaponBuild;

  private yaw = 0;
  private pitch = -0.25;
  private velocityY = 0;
  private grounded = true;
  private fireCooldown = 0;

  // 复用的临时向量，避免每帧分配
  private tmpDir = new THREE.Vector3();
  private tmpMove = new THREE.Vector3();
  private tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();

    // ハチワレ角色模型（材质按实例克隆，受击闪白不影响其他同款模型）
    this.model = createHachiwareModel();
    this.modelMats = instantiateMaterials(this.model);
    this.scarfMat = addTeamScarf(this.model, 0.68, 0.38, DEFAULT_TEAM_COLORS.player);
    // 墨枪与射击机制匹配（ハチワレ本命的墨辊等做了辊类武器机制再换回）
    this.weapon = createInkShooter(DEFAULT_TEAM_COLORS.player);
    attachWeapon(this.model, this.weapon);
    this.group.add(this.model);

    this.group.position.set(0, 0, 18);
    scene.add(this.group);
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
  get radius() {
    return this.form === 'squid' ? 0.45 : 0.55;
  }
  get height() {
    return this.form === 'squid' ? 0.6 : 1.7;
  }
  get alive() {
    return !this.downed;
  }
  getPosition() {
    return this.group.position;
  }
  onHit(damage: number) {
    this.hp -= damage;
    this.flashTimer = HIT_FLASH_TIME;
    if (this.hp <= 0) this.knockout();
  }

  private knockout() {
    this.hp = 0;
    this.downed = true;
    this.respawnTimer = RESPAWN_TIME;
    this.group.visible = false;
  }

  private respawn() {
    this.downed = false;
    this.group.visible = true;
    this.group.position.set(0, 0, 18);
    this.velocityY = 0;
    this.hp = HP_MAX;
    this.ink = INK_MAX;
    audio.respawn();
  }

  /** 回到开局状态 */
  reset() {
    this.group.position.set(0, 0, 18);
    this.yaw = 0;
    this.pitch = -0.25;
    this.velocityY = 0;
    this.grounded = true;
    this.fireCooldown = 0;
    this.ink = INK_MAX;
    this.hp = HP_MAX;
    this.downed = false;
    this.respawnTimer = 0;
    this.flashTimer = 0;
    this.group.visible = true;
    this.form = 'human';
    this.model.scale.set(1, 1, 1);
    this.weapon.group.visible = true;
  }

  update(dt: number, input: Input, inkSystem: InkSystem) {
    if (this.downed) {
      audio.setSwimming(false);
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      this.updateCamera();
      return;
    }

    this.updateLook(input);
    this.updateForm(input, inkSystem);
    this.updateMovement(dt, input);
    this.updateShooting(dt, input, inkSystem);
    this.updateInkTank(dt);
    this.updateHealth(dt);
    this.updateCamera();
  }

  // ---------- 视角 ----------
  private updateLook(input: Input) {
    this.yaw -= input.mouseDX * MOUSE_SENS;
    this.pitch -= input.mouseDY * MOUSE_SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch, PITCH_MIN, PITCH_MAX);
    this.group.rotation.y = this.yaw;
  }

  // ---------- 形态 ----------
  private updateForm(input: Input, inkSystem: InkSystem) {
    const wantSquid = input.squid;
    const newForm: PlayerForm = wantSquid ? 'squid' : 'human';

    this.groundInk = inkSystem.getInkAt(
      this.group.position.x,
      this.group.position.z
    );
    this.onOwnInk = this.groundInk === 'player';

    if (newForm !== this.form) {
      this.form = newForm;
      if (this.form === 'squid') {
        // 整体压扁，模拟乌贼形态 & 缩小碰撞体积；武器收起
        this.model.scale.set(1.15, 0.34, 1.15);
        this.weapon.group.visible = false;
      } else {
        this.model.scale.set(1, 1, 1);
        this.weapon.group.visible = true;
      }
    }

    // 潜入己方墨汁时半透明下沉的视觉反馈
    const swimming = this.form === 'squid' && this.onOwnInk;
    for (const mat of this.modelMats) {
      mat.transparent = swimming;
      mat.opacity = swimming ? 0.45 : 1;
    }
    this.scarfMat.transparent = swimming;
    this.scarfMat.opacity = swimming ? 0.45 : 1;
  }

  // ---------- 移动 ----------
  private updateMovement(dt: number, input: Input) {
    let speed = BASE_SPEED;
    if (this.form === 'squid') {
      speed *= this.onOwnInk ? SQUID_INK_MULT : SQUID_DRY_MULT;
    } else if (this.groundInk === 'enemy') {
      speed *= ENEMY_INK_MULT; // 敌方墨汁粘脚
    }

    // 相对相机 yaw 的方向输入
    this.tmpMove.set(
      (input.moveRight ? 1 : 0) - (input.moveLeft ? 1 : 0),
      0,
      (input.moveBackward ? 1 : 0) - (input.moveForward ? 1 : 0)
    );
    const moving = this.tmpMove.lengthSq() > 0;
    if (moving) {
      this.tmpMove
        .normalize()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)
        .multiplyScalar(speed * dt);
      this.group.position.add(this.tmpMove);
    }

    // 潜墨游动循环音
    audio.setSwimming(
      this.form === 'squid' && this.onOwnInk && moving && this.grounded
    );

    // 跳跃与重力
    if (input.jump && this.grounded) {
      this.velocityY = JUMP_VELOCITY;
      this.grounded = false;
      audio.jump();
    }
    this.velocityY += GRAVITY * dt;
    this.group.position.y += this.velocityY * dt;
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocityY = 0;
      this.grounded = true;
    }

    // 障碍物碰撞（脚底高于低墙顶时可跳跃翻越）
    resolveObstacleCollisions(this.group.position, this.radius);

    // 限制在竞技场内
    const margin = 0.6;
    this.group.position.x = THREE.MathUtils.clamp(
      this.group.position.x,
      -ARENA_HALF + margin,
      ARENA_HALF - margin
    );
    this.group.position.z = THREE.MathUtils.clamp(
      this.group.position.z,
      -ARENA_HALF + margin,
      ARENA_HALF - margin
    );
  }

  // ---------- 射击 ----------
  private updateShooting(dt: number, input: Input, inkSystem: InkSystem) {
    this.fireCooldown -= dt;
    if (
      !input.firing ||
      this.form !== 'human' ||
      this.fireCooldown > 0 ||
      this.ink < INK_SHOT_COST
    ) {
      return;
    }

    this.fireCooldown = FIRE_INTERVAL;
    this.ink -= INK_SHOT_COST;

    // 沿相机瞄准方向发射（yaw + pitch）
    this.tmpEuler.set(this.pitch, this.yaw, 0);
    this.tmpDir.set(0, 0, -1).applyEuler(this.tmpEuler);

    const origin = this.group.position
      .clone()
      .add(new THREE.Vector3(0, 1.2, 0))
      .addScaledVector(this.tmpDir, 0.7);

    inkSystem.spawnBullet(origin, this.tmpDir, 'player');
    audio.shoot();
  }

  // ---------- 墨水槽 ----------
  private updateInkTank(dt: number) {
    if (this.form === 'squid' && this.onOwnInk) {
      this.ink += INK_REGEN_SWIM * dt;
    } else if (this.form === 'human') {
      this.ink += INK_REGEN_IDLE * dt;
    }
    this.ink = THREE.MathUtils.clamp(this.ink, 0, INK_MAX);
  }

  // ---------- 血量：敌墨掉血 / 回血 / 受击闪白 ----------
  private updateHealth(dt: number) {
    if (this.groundInk === 'enemy') {
      // 敌方墨汁持续伤害，但不会致死
      this.hp = Math.max(DOT_HP_FLOOR, this.hp - ENEMY_INK_DPS * dt);
    } else if (this.form === 'squid' && this.onOwnInk) {
      this.hp = Math.min(HP_MAX, this.hp + HP_REGEN_SWIM * dt);
    } else {
      this.hp = Math.min(HP_MAX, this.hp + HP_REGEN_IDLE * dt);
    }

    let intensity = 0;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      intensity = 1.5 * Math.max(this.flashTimer / HIT_FLASH_TIME, 0);
    }
    for (const mat of this.modelMats) mat.emissiveIntensity = intensity;
  }

  // ---------- 第三人称相机 ----------
  private updateCamera() {
    this.tmpEuler.set(this.pitch, this.yaw, 0);
    // 相机在玩家背后：沿 +Z（背向）偏移
    this.tmpDir.set(0, 0, 1).applyEuler(this.tmpEuler);

    const target = this.group.position.clone().add(new THREE.Vector3(0, CAM_HEIGHT, 0));
    const camPos = target.clone().addScaledVector(this.tmpDir, CAM_DIST);
    camPos.y = Math.max(camPos.y, 0.4); // 不要穿到地面下

    this.camera.position.copy(camPos);
    this.camera.lookAt(target);
  }
}
