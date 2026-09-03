import * as THREE from 'three';
import { Input } from './Input';
import { InkSystem, DEFAULT_TEAM_COLORS, Team, HitTarget } from './InkSystem';
import { audio } from './AudioManager';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterDef } from './models/characters';
import { ARENA_HALF, resolveObstacleCollisions, cameraObstruction } from './SceneManager';

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
const SHOULDER_OFFSET = 0.75; // 肩上视角：相机支点向右肩偏移，角色让开屏幕中心
const AIM_MAX_DIST = 40; // 准星射线最大瞄准距离
const CAM_DIST_MIN = 0.8; // 吊臂最短收缩距离（不贴进角色脑袋）
const CAM_MARGIN = 0.25; // 距遮挡面的安全间距
const CAM_RECOVER_SPEED = 5; // 遮挡消失后弹回的速度
const FADE_START_DIST = 3.2; // 吊臂短于此距离开始淡出角色
const FADE_MIN_OPACITY = 0.25; // 淡出下限
const FADE_PITCH_START = -0.7; // 俯角低于此开始淡出（低头涂脚下时大脑袋挡视线）
const FADE_PITCH_MIN_OPACITY = 0.35; // 俯角淡出下限
const FADE_OCCLUDE_RADIUS = 1.0; // 相机→对手视线距角色中心小于此半径视为挡住对手
const FADE_OCCLUDE_OPACITY = 0.3; // 挡住对手时的淡出目标
const FADE_OCCLUDE_SPEED = 8; // 该淡出的过渡速度
const PITCH_MIN = -1.15;
const PITCH_MAX = 0.55;

const UP = new THREE.Vector3(0, 1, 0);

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

  /** 出生点与初始朝向（联机时按队伍/席位设置） */
  private spawn = { x: 0, z: 18, yaw: 0 };

  /** 开火钩子（联机时广播给其他客户端）：枪口世界坐标 + 方向（已归一化） */
  onFire?: (origin: THREE.Vector3, dir: THREE.Vector3) => void;
  /** 被击倒钩子（联机时广播 ko 事件，参数为倒地位置） */
  onKnockout?: (pos: THREE.Vector3) => void;
  /** 本帧是否在己方墨中潜行（对敌方近乎隐身） */
  get swimming() {
    return this.form === 'squid' && this.onOwnInk;
  }
  /** 是否着地（供状态快照） */
  get isGrounded() {
    return this.grounded;
  }
  /** 本帧移动速度（供状态快照） */
  get moveSpeed() {
    return this.currentSpeed;
  }

  /** 当前视角朝向（供小地图） */
  get facingYaw() {
    return this.yaw;
  }

  private avatar: CharacterAvatar;
  private teamColor: string = DEFAULT_TEAM_COLORS.player;
  /** 本帧实际移动速度（供步行动画） */
  private currentSpeed = 0;
  /** 相机吊臂当前长度（被遮挡时即时收缩，解除后平滑弹回） */
  private camDist = CAM_DIST;
  /** 相机贴近时的角色淡出系数（1 = 不透明） */
  private camFade = 1;
  /** "挡住对手视线"淡出系数（平滑过渡） */
  private occlFade = 1;
  /** 对手位置（主循环每帧传入；null = 对手不在场） */
  private enemyPos: THREE.Vector3 | null = null;

  private yaw = 0;
  private pitch = -0.25;
  private velocityY = 0;
  private grounded = true;
  private fireCooldown = 0;

  // 复用的临时向量，避免每帧分配
  private tmpDir = new THREE.Vector3();
  private tmpMove = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpPivot = new THREE.Vector3();
  private tmpAim = new THREE.Vector3();
  private tmpMuzzle = new THREE.Vector3();
  private tmpVecA = new THREE.Vector3();
  private tmpVecB = new THREE.Vector3();
  private tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    def: CharacterDef
  ) {
    this.group = new THREE.Group();
    this.avatar = new CharacterAvatar(def, this.teamColor);
    this.group.add(this.avatar.group);

    this.group.position.set(this.spawn.x, 0, this.spawn.z);
    scene.add(this.group);
  }

  /** 设置出生点（下次 reset / respawn 生效） */
  setSpawn(x: number, z: number, yaw: number) {
    this.spawn = { x, z, yaw };
  }

  /** 更换队伍墨色（围巾 + 武器墨色部件，不染角色本体） */
  setColor(hex: string) {
    this.teamColor = hex;
    this.avatar.setColor(hex);
  }

  /** 更换角色（重建 avatar，保留队伍色；调用方随后应重置对局） */
  setCharacter(def: CharacterDef) {
    this.group.remove(this.avatar.group);
    this.avatar = new CharacterAvatar(def, this.teamColor);
    this.group.add(this.avatar.group);
    this.form = 'human';
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
    this.hp -= damage;
    this.flashTimer = HIT_FLASH_TIME;
    if (this.hp <= 0) this.knockout();
  }

  private knockout() {
    this.hp = 0;
    this.downed = true;
    this.respawnTimer = RESPAWN_TIME;
    this.group.visible = false;
    this.onKnockout?.(this.group.position);
  }

  private respawn() {
    this.downed = false;
    this.group.visible = true;
    this.group.position.set(this.spawn.x, 0, this.spawn.z);
    this.yaw = this.spawn.yaw;
    this.velocityY = 0;
    this.hp = HP_MAX;
    this.ink = INK_MAX;
    this.avatar.resetPose();
    audio.respawn();
  }

  /** 回到开局状态 */
  reset() {
    this.group.position.set(this.spawn.x, 0, this.spawn.z);
    this.yaw = this.spawn.yaw;
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
    this.avatar.resetPose();
  }

  update(dt: number, input: Input, inkSystem: InkSystem, enemyPos?: THREE.Vector3) {
    this.enemyPos = enemyPos ?? null;
    if (this.downed) {
      audio.setSwimming(false);
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      this.updateCamera(dt);
      return;
    }

    this.updateLook(input);
    this.updateForm(input, inkSystem);
    this.updateMovement(dt, input);
    this.updateShooting(dt, input, inkSystem);
    this.updateInkTank(dt);
    this.updateHealth(dt);
    this.avatar.animate(dt, {
      speed: this.currentSpeed,
      grounded: this.grounded,
      swimming: this.form === 'squid',
    });
    this.updateCamera(dt);
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
      this.avatar.setSquid(this.form === 'squid');
    }

    // 透明度统一在 applyOpacity()（updateCamera 末尾）处理：
    // 潜墨半透明 × 相机贴近淡出 两个因素合并
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
    this.currentSpeed = moving ? speed : 0;
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

  /** 相机/准星共用的瞄准支点：视线高度（按角色体型）+ 右肩偏移（限制在场内） */
  private aimPivot(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.group.position);
    out.y += this.avatar.def.camHeight;
    this.tmpRight.set(1, 0, 0).applyAxisAngle(UP, this.yaw);
    out.addScaledVector(this.tmpRight, SHOULDER_OFFSET);
    out.x = THREE.MathUtils.clamp(out.x, -ARENA_HALF + 0.1, ARENA_HALF - 0.1);
    out.z = THREE.MathUtils.clamp(out.z, -ARENA_HALF + 0.1, ARENA_HALF - 0.1);
    return out;
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

    // 1) 准星射线求瞄准点：沿相机中心方向，取地面/障碍/最大射程中最近者
    this.tmpEuler.set(this.pitch, this.yaw, 0);
    const forward = this.tmpDir.set(0, 0, -1).applyEuler(this.tmpEuler);
    const pivot = this.aimPivot(this.tmpPivot);

    let aimDist = AIM_MAX_DIST;
    if (forward.y < -1e-4) aimDist = Math.min(aimDist, pivot.y / -forward.y);
    aimDist = Math.min(aimDist, cameraObstruction(pivot, forward, aimDist));
    const aimPoint = this.tmpAim.copy(pivot).addScaledVector(forward, aimDist);

    // 2) 从武器枪口出弹，弹道向瞄准点收敛（muzzle-to-aimpoint）
    const muzzle = this.avatar.getMuzzleWorld(this.tmpMuzzle);

    const shootDir = aimPoint.sub(muzzle);
    if (shootDir.dot(forward) <= 0.05) {
      // 瞄准点近到枪口之后（顶着墙）：退回相机方向直射
      shootDir.copy(forward);
    }

    inkSystem.spawnBullet(muzzle, shootDir, 'player');
    audio.shoot();
    this.onFire?.(muzzle, shootDir.normalize());
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
    this.avatar.setFlash(intensity);
  }

  // ---------- 第三人称相机（含遮挡收缩） ----------
  private updateCamera(dt: number) {
    this.tmpEuler.set(this.pitch, this.yaw, 0);
    // 相机在玩家背后：沿 +Z（背向）偏移
    this.tmpDir.set(0, 0, 1).applyEuler(this.tmpEuler);

    // 支点带右肩偏移：角色让到画面左下，准星视线不再被自己挡住
    const target = this.aimPivot(this.tmpPivot);

    // 吊臂遮挡：即时收缩，解除后平滑弹回
    const clearDist = cameraObstruction(target, this.tmpDir, CAM_DIST);
    const desired = Math.max(CAM_DIST_MIN, Math.min(CAM_DIST, clearDist - CAM_MARGIN));
    if (desired < this.camDist) {
      this.camDist = desired; // 被挡的当帧立刻拉近，避免穿模
    } else {
      this.camDist += (desired - this.camDist) * Math.min(1, dt * CAM_RECOVER_SPEED);
    }

    const camPos = target.clone().addScaledVector(this.tmpDir, this.camDist);
    camPos.y = Math.max(camPos.y, 0.4); // 不要穿到地面下

    this.camera.position.copy(camPos);
    this.camera.lookAt(target);

    // 淡出因素 1：吊臂被压缩得越短角色越透明（贴墙/贴掩体）
    const distT = THREE.MathUtils.clamp(
      (this.camDist - CAM_DIST_MIN) / (FADE_START_DIST - CAM_DIST_MIN),
      0,
      1
    );
    const distFade = FADE_MIN_OPACITY + (1 - FADE_MIN_OPACITY) * distT;

    // 淡出因素 2：俯角越陡角色越透明（低头涂脚下时不被自己的头挡住）
    const pitchT = THREE.MathUtils.clamp(
      (this.pitch - PITCH_MIN) / (FADE_PITCH_START - PITCH_MIN),
      0,
      1
    );
    const pitchFade = FADE_PITCH_MIN_OPACITY + (1 - FADE_PITCH_MIN_OPACITY) * pitchT;

    // 淡出因素 3：相机→对手的视线穿过自己角色（对手被自己挡住）
    let occluding = false;
    if (this.enemyPos) {
      // 相机→对手方向与距离
      const toEnemy = this.tmpVecB.copy(this.enemyPos);
      toEnemy.y += 0.9;
      toEnemy.sub(this.camera.position);
      const enemyDist = toEnemy.length();
      toEnemy.normalize();
      // 角色身体中心到该视线的垂距
      const camToBody = this.tmpVecA.copy(this.group.position);
      camToBody.y += 0.9;
      camToBody.sub(this.camera.position);
      const tProj = camToBody.dot(toEnemy);
      if (tProj > 0 && tProj < enemyDist) {
        const perpSq = camToBody.lengthSq() - tProj * tProj;
        occluding = perpSq < FADE_OCCLUDE_RADIUS * FADE_OCCLUDE_RADIUS;
      }
    }
    const occlTarget = occluding ? FADE_OCCLUDE_OPACITY : 1;
    this.occlFade += (occlTarget - this.occlFade) * Math.min(1, dt * FADE_OCCLUDE_SPEED);

    this.camFade = Math.min(distFade, pitchFade, this.occlFade);
    this.applyOpacity();
  }

  /** 合并两个透明度因素：潜墨半透明 × 相机贴近淡出 */
  private applyOpacity() {
    const swimming = this.form === 'squid' && this.onOwnInk;
    this.avatar.setOpacity((swimming ? 0.45 : 1) * this.camFade);
  }
}
