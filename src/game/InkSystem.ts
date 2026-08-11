import * as THREE from 'three';
import { ARENA_HALF, OBSTACLES } from './SceneManager';
import { audio } from './AudioManager';

export type Team = 'player' | 'enemy';

/** 默认队伍颜色（可在游戏内更换） */
export const DEFAULT_TEAM_COLORS: Record<Team, string> = {
  player: '#9B51E0', // 亮紫
  enemy: '#F2A33C', // 橙色
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** 地面涂色纹理分辨率 */
const TEX_SIZE = 1024;
/** 世界坐标 -> 纹理像素的缩放 */
const WORLD_TO_TEX = TEX_SIZE / (ARENA_HALF * 2);

/** 覆盖率统计用的粗粒度网格（0=未涂 1=player 2=enemy） */
const GRID = 128;
const WORLD_TO_GRID = GRID / (ARENA_HALF * 2);

const GRAVITY = -28;
const BULLET_SPEED = 26;
const BULLET_LIFE = 3;
/** 每发墨弹对角色的伤害 */
const HIT_DAMAGE = 25;

interface Bullet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  team: Team;
  splatScale: number;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

/** 可被墨弹击中的目标（玩家 / 机器人实现此接口） */
export interface HitTarget {
  team: Team;
  /** 脚底世界坐标 */
  getPosition(): THREE.Vector3;
  /** 碰撞胶囊半径 */
  radius: number;
  /** 碰撞胶囊高度 */
  height: number;
  /** 是否可被命中（倒地后为 false） */
  alive: boolean;
  onHit(damage: number): void;
}

export interface Coverage {
  /** 占全场比例 0-1 */
  player: number;
  enemy: number;
}

/**
 * 墨汁系统（双队伍版）：
 * - 地面 Mesh 的贴图为动态 Canvas 2D 离屏纹理（CanvasTexture）
 * - 管理双方墨汁子弹的发射 / 抛物线飞行 / 落地涂色
 * - 像素采样查询脚下墨色（潜行/回墨判定）
 * - 粗粒度网格记录涂色归属，提供全场覆盖率统计
 */
export class InkSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private grid = new Uint8Array(GRID * GRID);
  private particleGeo = new THREE.SphereGeometry(0.09, 6, 6);

  /** 命中回调：shooter 为开火方，killed 表示该发击倒了目标 */
  onTargetHit?: (shooter: Team, killed: boolean) => void;

  /** 涂地离屏 Canvas（供小地图绘制） */
  get canvasEl(): HTMLCanvasElement {
    return this.canvas;
  }

  private colors: Record<Team, string> = { ...DEFAULT_TEAM_COLORS };
  private rgb: Record<Team, { r: number; g: number; b: number }> = {
    player: hexToRgb(DEFAULT_TEAM_COLORS.player),
    enemy: hexToRgb(DEFAULT_TEAM_COLORS.enemy),
  };

  private bulletGeo = new THREE.SphereGeometry(0.16, 8, 8);
  private bulletMats: Record<Team, THREE.MeshStandardMaterial>;

  constructor(private scene: THREE.Scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TEX_SIZE;
    this.canvas.height = TEX_SIZE;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    this.drawBaseFloor();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.bulletMats = {
      player: this.makeBulletMat('player'),
      enemy: this.makeBulletMat('enemy'),
    };

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
      new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.85 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  private makeBulletMat(team: Team) {
    return new THREE.MeshStandardMaterial({
      color: this.colors[team],
      emissive: this.colors[team],
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
  }

  /**
   * 更换双方墨色。已画在地面上的旧墨迹不会重绘，
   * 调用方应随后 reset() 清场（当前由换色触发整局重置保证）。
   */
  setTeamColors(playerColor: string, enemyColor: string) {
    this.colors = { player: playerColor, enemy: enemyColor };
    this.rgb = { player: hexToRgb(playerColor), enemy: hexToRgb(enemyColor) };
    for (const team of ['player', 'enemy'] as Team[]) {
      this.bulletMats[team].color.set(this.colors[team]);
      this.bulletMats[team].emissive.set(this.colors[team]);
    }
  }

  /** 底色 + 网格线，模拟测试场地 */
  private drawBaseFloor() {
    const ctx = this.ctx;
    ctx.fillStyle = '#23212e';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    ctx.strokeStyle = '#3a3750';
    ctx.lineWidth = 2;
    const step = TEX_SIZE / (ARENA_HALF * 2); // 每 1 米一格
    ctx.beginPath();
    for (let i = 0; i <= ARENA_HALF * 2; i++) {
      const p = i * step;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, TEX_SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(TEX_SIZE, p);
    }
    ctx.stroke();

    // 中心线加粗，便于辨认方位
    ctx.strokeStyle = '#4d4968';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(TEX_SIZE / 2, 0);
    ctx.lineTo(TEX_SIZE / 2, TEX_SIZE);
    ctx.moveTo(0, TEX_SIZE / 2);
    ctx.lineTo(TEX_SIZE, TEX_SIZE / 2);
    ctx.stroke();
  }

  /** 重置到开局状态：清空墨迹 / 子弹 / 粒子 / 覆盖网格 */
  reset() {
    for (let i = this.bullets.length - 1; i >= 0; i--) this.removeBullet(i);
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0;
    this.grid.fill(0);
    this.drawBaseFloor();
    this.texture.needsUpdate = true;
  }

  /** 世界坐标(x,z) -> 纹理像素坐标 */
  private worldToTex(x: number, z: number): { px: number; py: number } {
    return {
      px: (x + ARENA_HALF) * WORLD_TO_TEX,
      py: (z + ARENA_HALF) * WORLD_TO_TEX,
    };
  }

  /** 发射一颗墨汁子弹（splatScale 控制落地墨迹大小倍率） */
  spawnBullet(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    team: Team,
    splatScale = 1
  ) {
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMats[team]);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);

    // 稍微上抬一点角度，形成 Splatoon 式抛物线弹道
    const velocity = direction
      .clone()
      .normalize()
      .multiplyScalar(BULLET_SPEED)
      .add(new THREE.Vector3(0, 2.5, 0));

    this.bullets.push({ mesh, velocity, age: 0, team, splatScale });
  }

  update(dt: number, targets: HitTarget[] = []) {
    let painted = false;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;
      b.velocity.y += GRAVITY * dt;
      b.mesh.position.addScaledVector(b.velocity, dt);

      const { x, y, z } = b.mesh.position;
      const inArena =
        Math.abs(x) <= ARENA_HALF && Math.abs(z) <= ARENA_HALF;

      // 命中敌对角色：结算伤害 + 迸溅 + 脚下小墨迹
      let hitSomeone = false;
      for (const target of targets) {
        if (target.team === b.team || !target.alive) continue;
        const tp = target.getPosition();
        const dx = x - tp.x;
        const dz = z - tp.z;
        const rr = target.radius + 0.16;
        if (dx * dx + dz * dz <= rr * rr && y >= tp.y && y <= tp.y + target.height) {
          target.onHit(HIT_DAMAGE);
          this.spawnBurst(b.mesh.position, b.team, 8);
          this.paintSplat(tp.x, tp.z, 0.7, b.team);
          painted = true;

          const killed = !target.alive;
          if (killed) {
            // 击倒：目标位置爆出一大片墨迹（Splatoon 式惩罚）
            this.paintSplat(tp.x, tp.z, 3.2, b.team);
            this.spawnBurst(new THREE.Vector3(tp.x, 0.7, tp.z), b.team, 20);
          }
          this.onTargetHit?.(b.team, killed);
          this.removeBullet(i);
          hitSomeone = true;
          break;
        }
      }
      if (hitSomeone) continue;

      // 撞上障碍物：小迸溅后消弹（MVP 不做墙面涂色）
      let hitObstacle = false;
      for (const o of OBSTACLES) {
        if (
          y > 0 &&
          y <= o.height + 0.05 &&
          Math.abs(x - o.cx) <= o.hx + 0.16 &&
          Math.abs(z - o.cz) <= o.hz + 0.16
        ) {
          this.spawnBurst(b.mesh.position, b.team, 4);
          audio.splat();
          this.removeBullet(i);
          hitObstacle = true;
          break;
        }
      }
      if (hitObstacle) continue;

      // 落地：涂色并移除
      if (y <= 0.1 && inArena) {
        this.paintSplat(x, z, (1.1 + Math.random() * 0.8) * b.splatScale, b.team);
        painted = true;
        audio.splat();
        this.removeBullet(i);
        continue;
      }
      // 飞出场外 / 超时：直接移除
      if (b.age > BULLET_LIFE || y < -2 || !inArena) {
        this.removeBullet(i);
      }
    }

    this.updateParticles(dt);

    if (painted) this.texture.needsUpdate = true;
  }

  /** 命中/击倒时的墨滴迸溅粒子 */
  spawnBurst(pos: THREE.Vector3, team: Team, count: number) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.bulletMats[team]);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const maxLife = 0.3 + Math.random() * 0.3;
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(6),
          2 + Math.random() * 4,
          THREE.MathUtils.randFloatSpread(6)
        ),
        life: maxLife,
        maxLife,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y += GRAVITY * 0.6 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.scale.setScalar(Math.max(p.life / p.maxLife, 0.01));
    }
  }

  private removeBullet(index: number) {
    const b = this.bullets[index];
    this.scene.remove(b.mesh);
    this.bullets.splice(index, 1);
  }

  /**
   * 在地面画一块不规则墨迹：一个主圆斑 + 若干随机小飞溅。
   * 统一使用纯色填充，保证 getInkAt 像素采样稳定。
   * 同时把主斑范围写入覆盖率网格。
   */
  paintSplat(worldX: number, worldZ: number, radiusWorld: number, team: Team) {
    const { px, py } = this.worldToTex(worldX, worldZ);
    const r = radiusWorld * WORLD_TO_TEX;
    const ctx = this.ctx;

    ctx.fillStyle = this.colors[team];

    // 主斑：用几个错位圆叠出不规则边缘
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.35;
      const rr = r * (0.65 + Math.random() * 0.35);
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 周边小飞溅
    const drops = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (1.1 + Math.random() * 0.9);
      const rr = r * (0.08 + Math.random() * 0.14);
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    this.markGrid(worldX, worldZ, radiusWorld * 0.85, team);
  }

  /** 把圆形区域写入覆盖率网格 */
  private markGrid(worldX: number, worldZ: number, radiusWorld: number, team: Team) {
    const gx = (worldX + ARENA_HALF) * WORLD_TO_GRID;
    const gy = (worldZ + ARENA_HALF) * WORLD_TO_GRID;
    const gr = radiusWorld * WORLD_TO_GRID;
    const value = team === 'player' ? 1 : 2;

    const x0 = Math.max(0, Math.floor(gx - gr));
    const x1 = Math.min(GRID - 1, Math.ceil(gx + gr));
    const y0 = Math.max(0, Math.floor(gy - gr));
    const y1 = Math.min(GRID - 1, Math.ceil(gy + gr));
    const gr2 = gr * gr;

    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const dx = ix + 0.5 - gx;
        const dy = iy + 0.5 - gy;
        if (dx * dx + dy * dy <= gr2) {
          this.grid[iy * GRID + ix] = value;
        }
      }
    }
  }

  /** 全场覆盖率统计 */
  getCoverage(): Coverage {
    let p = 0;
    let e = 0;
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === 1) p++;
      else if (this.grid[i] === 2) e++;
    }
    const total = this.grid.length;
    return { player: p / total, enemy: e / total };
  }

  /** 查询世界坐标 (x, z) 处的墨色归属（像素采样 + 容差比较） */
  getInkAt(worldX: number, worldZ: number): Team | null {
    if (Math.abs(worldX) > ARENA_HALF || Math.abs(worldZ) > ARENA_HALF) {
      return null;
    }
    const { px, py } = this.worldToTex(worldX, worldZ);
    const data = this.ctx.getImageData(
      Math.min(Math.max(px | 0, 0), TEX_SIZE - 1),
      Math.min(Math.max(py | 0, 0), TEX_SIZE - 1),
      1,
      1
    ).data;

    const tol = 46;
    for (const team of ['player', 'enemy'] as Team[]) {
      const c = this.rgb[team];
      if (
        Math.abs(data[0] - c.r) < tol &&
        Math.abs(data[1] - c.g) < tol &&
        Math.abs(data[2] - c.b) < tol
      ) {
        return team;
      }
    }
    return null;
  }
}
