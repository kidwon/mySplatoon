import * as THREE from 'three';

/** 竞技场半边长（场地为 ARENA_HALF*2 x ARENA_HALF*2） */
export const ARENA_HALF = 25;

/** 轴对齐障碍物盒（中心 + 半宽 + 高度） */
export interface ObstacleBox {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  height: number;
}

/**
 * 场地障碍物布局：关于中心旋转对称，保证双方出生侧公平。
 * 低墙（height 1.2）可以跳跃翻越，高箱（height 2）只能绕行。
 */
export const OBSTACLES: ObstacleBox[] = [
  { cx: 0, cz: 0, hx: 2.2, hz: 2.2, height: 2.2 }, // 中央高台
  { cx: -8, cz: -6, hx: 1.5, hz: 1.5, height: 2 },
  { cx: 8, cz: 6, hx: 1.5, hz: 1.5, height: 2 },
  { cx: -10, cz: 8, hx: 3, hz: 0.5, height: 1.2 }, // 低墙
  { cx: 10, cz: -8, hx: 3, hz: 0.5, height: 1.2 }, // 低墙
  { cx: -16, cz: 2, hx: 1.2, hz: 1.2, height: 2 },
  { cx: 16, cz: -2, hx: 1.2, hz: 1.2, height: 2 },
];

/**
 * 圆形碰撞体（半径 radius）与所有障碍物做推挤解算，原地修改 pos。
 * 脚底高于障碍物顶面时不碰撞（允许跳跃翻越低墙）。
 */
export function resolveObstacleCollisions(pos: THREE.Vector3, radius: number) {
  for (const o of OBSTACLES) {
    if (pos.y > o.height) continue;
    const nx = THREE.MathUtils.clamp(pos.x, o.cx - o.hx, o.cx + o.hx);
    const nz = THREE.MathUtils.clamp(pos.z, o.cz - o.hz, o.cz + o.hz);
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // 圆心在盒内：沿穿透最浅的轴推出
      const pushX = o.hx + radius - Math.abs(pos.x - o.cx);
      const pushZ = o.hz + radius - Math.abs(pos.z - o.cz);
      if (pushX < pushZ) {
        pos.x = o.cx + Math.sign(pos.x - o.cx || 1) * (o.hx + radius);
      } else {
        pos.z = o.cz + Math.sign(pos.z - o.cz || 1) * (o.hz + radius);
      }
    }
  }
}

interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** 相机遮挡检测用的 AABB 集合：全部障碍物 + 四面围墙（厚 1、高 2） */
const CAMERA_BLOCKERS: Aabb[] = [
  ...OBSTACLES.map((o) => ({
    minX: o.cx - o.hx,
    maxX: o.cx + o.hx,
    minY: 0,
    maxY: o.height,
    minZ: o.cz - o.hz,
    maxZ: o.cz + o.hz,
  })),
  { minX: -ARENA_HALF - 1, maxX: ARENA_HALF + 1, minY: 0, maxY: 2, minZ: -ARENA_HALF - 1, maxZ: -ARENA_HALF },
  { minX: -ARENA_HALF - 1, maxX: ARENA_HALF + 1, minY: 0, maxY: 2, minZ: ARENA_HALF, maxZ: ARENA_HALF + 1 },
  { minX: -ARENA_HALF - 1, maxX: -ARENA_HALF, minY: 0, maxY: 2, minZ: -ARENA_HALF - 1, maxZ: ARENA_HALF + 1 },
  { minX: ARENA_HALF, maxX: ARENA_HALF + 1, minY: 0, maxY: 2, minZ: -ARENA_HALF - 1, maxZ: ARENA_HALF + 1 },
];

/** 射线 vs AABB（slab 法）：返回进入距离 t，未命中返回 null */
function rayBoxEntry(
  o: THREE.Vector3,
  d: THREE.Vector3,
  box: Aabb,
  maxDist: number
): number | null {
  let tmin = 0;
  let tmax = maxDist;
  const axes: Array<[number, number, number, number]> = [
    [o.x, d.x, box.minX, box.maxX],
    [o.y, d.y, box.minY, box.maxY],
    [o.z, d.z, box.minZ, box.maxZ],
  ];
  for (const [op, dp, mn, mx] of axes) {
    if (Math.abs(dp) < 1e-8) {
      if (op < mn || op > mx) return null;
      continue;
    }
    let t1 = (mn - op) / dp;
    let t2 = (mx - op) / dp;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/**
 * 相机吊臂遮挡测距：从 origin 沿 dir 最多 maxDist，
 * 返回不被任何障碍物/围墙遮挡的最大距离。
 */
export function cameraObstruction(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number
): number {
  let nearest = maxDist;
  for (const box of CAMERA_BLOCKERS) {
    const t = rayBoxEntry(origin, dir, box, maxDist);
    if (t !== null && t < nearest) nearest = t;
  }
  return nearest;
}

/** 视线检测：a、b 两点（视线高度 eyeY）之间是否被障碍物挡住 */
export function segmentBlocked(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  eyeY = 1.2
): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(dist / 0.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    for (const o of OBSTACLES) {
      if (
        eyeY < o.height &&
        Math.abs(px - o.cx) <= o.hx &&
        Math.abs(pz - o.cz) <= o.hz
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 负责 Three.js 场景、相机、渲染器、灯光与静态布景（围墙）。
 * 渲染循环由 main.ts 驱动，这里只暴露 render()。
 */
export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14121f);
    this.scene.fog = new THREE.Fog(0x14121f, 60, 120);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(0, 5, 8);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLights();
    this.setupWalls();
    this.setupObstacles();

    window.addEventListener('resize', () => this.onResize());
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
    sun.position.set(20, 35, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -ARENA_HALF - 5;
    sun.shadow.camera.right = ARENA_HALF + 5;
    sun.shadow.camera.top = ARENA_HALF + 5;
    sun.shadow.camera.bottom = -ARENA_HALF - 5;
    sun.shadow.camera.far = 100;
    this.scene.add(sun);

    // 一点冷色补光，让暗部不至于死黑
    const fill = new THREE.HemisphereLight(0x8888ff, 0x223322, 0.35);
    this.scene.add(fill);
  }

  /** 四面低矮围墙，标出竞技场边界 */
  private setupWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2f2b45,
      roughness: 0.9,
    });
    const h = 2;
    const t = 1;
    const len = ARENA_HALF * 2 + t * 2;

    const make = (w: number, d: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    };

    make(len, t, 0, -ARENA_HALF - t / 2); // 北
    make(len, t, 0, ARENA_HALF + t / 2); // 南
    make(t, len, -ARENA_HALF - t / 2, 0); // 西
    make(t, len, ARENA_HALF + t / 2, 0); // 东
  }

  /** 根据 OBSTACLES 布局生成障碍物 Mesh */
  private setupObstacles() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x35314f,
      roughness: 0.9,
    });
    for (const o of OBSTACLES) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(o.hx * 2, o.height, o.hz * 2),
        mat
      );
      mesh.position.set(o.cx, o.height / 2, o.cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
