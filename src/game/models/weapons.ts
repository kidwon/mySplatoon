import * as THREE from 'three';

/**
 * ちいかわ角色的墨汁武器组 — 程序化模型（依据 img2threejs 武器参考图）。
 *
 * 约定：原点在握持点（挂到角色 handSocket 即持起），面朝 -Z。
 * 每件武器返回 { group, inkMats }：inkMats 是需要跟随队伍墨色的材质
 * （枪口、墨仓、辊筒、滚筒墨旋涡等），换队伍色时统一重染。
 * 材质全部按实例新建（不缓存），避免多实例换色互相污染。
 */

export interface WeaponBuild {
  group: THREE.Group;
  /** 跟随队伍墨色的材质 */
  inkMats: THREE.MeshStandardMaterial[];
}

const BODY_GRAY = '#E8E6E2';
const DARK_GRAY = '#5A5650';
const WOOD = '#8A6A42';

function solid(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
}

function inkMat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    emissive: color,
    emissiveIntensity: 0.25,
  });
}

function mesh(
  name: string,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

/** 墨枪（Shooter）：横置枪身 + 前喷嘴（MOP-LIKE INK TIP）+ 上方墨仓 */
export function createInkShooter(inkColor: string): WeaponBuild {
  const g = new THREE.Group();
  g.name = 'weapon-shooter';
  const ink = inkMat(inkColor);
  const body = solid(BODY_GRAY);

  g.add(mesh('grip', new THREE.BoxGeometry(0.06, 0.16, 0.08), solid(DARK_GRAY), 0, -0.06, 0.02, 0.25));
  const barrel = mesh('body', new THREE.CapsuleGeometry(0.07, 0.2, 4, 12), body, 0, 0.05, -0.06);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  const nozzle = mesh('nozzle', new THREE.CylinderGeometry(0.045, 0.055, 0.12, 10), body, 0, 0.05, -0.24);
  nozzle.rotation.x = Math.PI / 2;
  g.add(nozzle);
  // 墨色喷嘴尖（尖朝 -Z）
  g.add(mesh('ink-tip', new THREE.ConeGeometry(0.055, 0.09, 10), ink, 0, 0.05, -0.34, -Math.PI / 2));
  // 墨仓：外壳 + 墨芯
  g.add(mesh('tank-shell', new THREE.CylinderGeometry(0.06, 0.06, 0.15, 10), body, 0, 0.13, 0.1, 0.35));
  g.add(mesh('tank-ink', new THREE.CylinderGeometry(0.048, 0.048, 0.11, 10), ink, 0, 0.13, 0.1, 0.35));

  return { group: g, inkMats: [ink] };
}

/** 墨辊（Roller）：斜握长柄 + 横置辊筒（ROLLER HEAD）+ 滴墨 */
export function createInkRoller(inkColor: string): WeaponBuild {
  const g = new THREE.Group();
  g.name = 'weapon-roller';
  const ink = inkMat(inkColor);

  const handle = mesh('handle', new THREE.CylinderGeometry(0.028, 0.028, 0.55, 8), solid(DARK_GRAY), 0, -0.06, -0.22);
  handle.rotation.x = 1.15;
  g.add(handle);
  g.add(mesh('frame', new THREE.BoxGeometry(0.3, 0.04, 0.05), solid(BODY_GRAY), 0, -0.17, -0.44));
  const drum = mesh('roller-head', new THREE.CylinderGeometry(0.095, 0.095, 0.34, 14), ink, 0, -0.23, -0.5);
  drum.rotation.z = Math.PI / 2;
  g.add(drum);
  // 滴墨
  g.add(mesh('drip-1', new THREE.SphereGeometry(0.035, 8, 6), ink, 0.08, -0.31, -0.5));
  g.add(mesh('drip-2', new THREE.SphereGeometry(0.025, 8, 6), ink, -0.1, -0.29, -0.46));

  return { group: g, inkMats: [ink] };
}

/** 洗衣机泼桶（Slosher）：双手抱持的滚筒洗衣机 + 舱门墨旋涡 + 溢出墨 */
export function createSlosherWasher(inkColor: string): WeaponBuild {
  const g = new THREE.Group();
  g.name = 'weapon-slosher';
  const ink = inkMat(inkColor);
  const body = solid('#F2F0EC');

  // 双手抱在身前：整体相对手部挂点偏移到胸前
  g.position.set(-0.28, -0.08, -0.14);

  g.add(mesh('drum-body', new THREE.BoxGeometry(0.34, 0.36, 0.28), body, 0, 0, 0));
  g.add(mesh('door-ring', new THREE.TorusGeometry(0.11, 0.024, 8, 20), solid(DARK_GRAY), 0, -0.02, -0.15));
  const glass = mesh('door-glass', new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16), solid('#3A3734'), 0, -0.02, -0.15);
  glass.rotation.x = Math.PI / 2;
  g.add(glass);
  // 墨旋涡（ROTATING AGITATOR 的视觉核心，命名独立便于以后转动）
  g.add(mesh('ink-swirl', new THREE.SphereGeometry(0.065, 10, 8), ink, 0, -0.02, -0.155));
  // 顶部面板 + 旋钮
  g.add(mesh('panel', new THREE.BoxGeometry(0.34, 0.05, 0.1), solid(BODY_GRAY), 0, 0.2, 0.08));
  g.add(mesh('knob-1', new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), solid(DARK_GRAY), -0.08, 0.23, 0.08));
  g.add(mesh('knob-2', new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), solid(DARK_GRAY), 0.08, 0.23, 0.08));
  // 顶部溢出的墨
  g.add(mesh('ink-spill-1', new THREE.SphereGeometry(0.05, 8, 6), ink, 0.1, 0.22, -0.06));
  g.add(mesh('ink-spill-2', new THREE.SphereGeometry(0.035, 8, 6), ink, 0.16, 0.19, -0.1));

  return { group: g, inkMats: [ink] };
}

/** 蓄力狙（Charger）：木质枪托 + 长枪管 + 瞄准镜（SCOPE）+ 墨压罐 */
export function createInkCharger(inkColor: string): WeaponBuild {
  const g = new THREE.Group();
  g.name = 'weapon-charger';
  const ink = inkMat(inkColor);
  const wood = solid(WOOD);

  g.rotation.y = 0.45; // 斜抱在身前

  g.add(mesh('stock', new THREE.BoxGeometry(0.06, 0.1, 0.28), wood, 0, -0.03, 0.16, 0.15));
  g.add(mesh('receiver', new THREE.BoxGeometry(0.055, 0.07, 0.3), wood, 0, 0.02, -0.06));
  const barrelC = mesh('barrel', new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), solid(DARK_GRAY), 0, 0.03, -0.42);
  barrelC.rotation.x = Math.PI / 2;
  g.add(barrelC);
  g.add(mesh('muzzle-ink', new THREE.ConeGeometry(0.03, 0.06, 8), ink, 0, 0.03, -0.69, -Math.PI / 2));
  const scope = mesh('scope', new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), solid(DARK_GRAY), 0, 0.09, -0.1);
  scope.rotation.x = Math.PI / 2;
  g.add(scope);
  // 墨压罐（PRESSURE GAUGE 简化为墨色罐体）
  const tank = mesh('pressure-tank', new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10), ink, 0, -0.05, -0.2);
  tank.rotation.x = Math.PI / 2;
  g.add(tank);

  return { group: g, inkMats: [ink] };
}

/** 刨冰泼桶（ニコリ专属）：蓝杯 + 墨色冰山（跟随队伍色）+ 木勺 */
export function createShavedIceWeapon(inkColor: string): WeaponBuild {
  const g = new THREE.Group();
  g.name = 'weapon-shavedice';
  const ink = inkMat(inkColor);
  const cup = solid('#A8CBE8');

  // 双手抱持感：整体略移向身前
  g.position.set(-0.06, -0.02, -0.06);

  g.add(mesh('ice-cup', new THREE.CylinderGeometry(0.09, 0.065, 0.12, 14), cup, 0, 0, 0));
  g.add(mesh('ice-cup-rim', new THREE.CylinderGeometry(0.094, 0.094, 0.02, 14), solid('#F5F3EE'), 0, 0.055, 0));
  // 墨色冰山（武器的"墨仓"视觉，随队伍换色）
  const mound = mesh('ice-mound', new THREE.SphereGeometry(0.095, 14, 10), ink, 0, 0.1, 0);
  mound.scale.set(1, 0.95, 1);
  g.add(mound);
  g.add(mesh('ice-lump-1', new THREE.SphereGeometry(0.055, 10, 8), ink, -0.045, 0.16, -0.015));
  g.add(mesh('ice-lump-2', new THREE.SphereGeometry(0.048, 10, 8), ink, 0.05, 0.155, 0.02));
  g.add(mesh('ice-peak', new THREE.SphereGeometry(0.04, 10, 8), ink, 0.005, 0.195, -0.01));
  // 冰晶高光（GLINT IN SHAVED ICE）
  g.add(mesh('ice-glint', new THREE.SphereGeometry(0.018, 8, 6), solid('#FFFFFF'), -0.03, 0.19, -0.04));
  const spoon = mesh('ice-spoon', new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6), solid('#B08A5A'), 0.07, 0.2, 0);
  spoon.rotation.z = -0.45;
  g.add(spoon);

  return { group: g, inkMats: [ink] };
}

/** 角色 ↔ 武器的官方配对（参考图） */
export const WEAPON_FACTORIES = {
  chiikawa: createInkShooter,
  hachiware: createInkRoller,
  usagi: createSlosherWasher,
  shisa: createInkCharger,
  nikori: createShavedIceWeapon,
} as const;

/** 把武器挂到角色的 handSocket 上 */
export function attachWeapon(model: THREE.Group, build: WeaponBuild) {
  const hand = model.userData.sockets?.hand as THREE.Group | undefined;
  (hand ?? model).add(build.group);
}
