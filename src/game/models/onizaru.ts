import * as THREE from 'three';

/**
 * オニザル（Onizaru / 小鬼猴）— 依据中国电影《牛来》角色参考图生成。
 * 非ちいかわ系 Q 版；按参考图还原幼儿体型 v3：
 * 大宽头直接压在蛋形大肚身上（无脖子）、溜肩、粗短四肢、
 * 浅粉白的手掌与两瓣蹄形脚。
 *
 * 特征清单（detailInventory v3）：金色绒毛（Gold Faint Fur 用纯色近似）、
 * 一对内弯小牛角（骨色偏绿，双段拼弧）、大尖耳平伸（金外粉内）、
 * 眼周金毛 + 半睁耷拉眼（上眼皮遮眼）+ 压低浓眉、
 * 占下半脸的粉色大宽吻 + 类人猿厚唇 + 嘴缝线。
 * 武器为香蕉喷射枪（weapons.ts）。
 *
 * 层级（对齐参考图 HIERARCHY BOX）：
 *   root（脚底原点，面朝 -Z）
 *   ├─ 腿组 foot-left / foot-right（步行动画驱动）
 *   ├─ 躯干（单一蛋形）/ 肚皮
 *   ├─ 手臂组 arm-left / arm-right（溜肩枢轴）
 *   ├─ handSocket（右手，持香蕉枪）
 *   └─ headGroup（颈部枢轴）→ 头 / 角(horns-pivot) / 耳(ear-left/right) / 脸
 * root.userData: { character, sockets: { head, hand }, collider }
 *
 * 脸部构造原则：不用球面 phi/theta 补丁，全部实体体积
 * （粉吻为外凸实体球，眼皮/眉毛为覆盖眼睛上缘的扁实体球）。
 * 版权注意：电影角色仅供私人使用，公开部署前需替换（见 TECH_NOTES 路线图）。
 */

const C = {
  fur: '#E2A93B',
  belly: '#F0CC80',
  muzzle: '#DDA8A0',
  lip: '#C08A88',
  mouthLine: '#7A4A44',
  nostril: '#8A5A52',
  horn: '#C4CBAD',
  earInner: '#E0AFA8',
  paw: '#EDD3CC',
  iris: '#3E7A44',
  pupil: '#241E18',
  white: '#FFFFFF',
  brow: '#5A431F',
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.7): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness });
    matCache.set(key, m);
  }
  return m;
}

function mesh(
  name: string,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function ball(
  name: string,
  color: string,
  r: number,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  seg = 16
): THREE.Mesh {
  const m = mesh(name, new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), mat(color), x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

/** 一对内弯小牛角：下段圆柱外撇 + 上段圆锥回勾，拼出弯弧 */
function buildHorns(head: THREE.Group, cy: number) {
  const pivot = new THREE.Group();
  pivot.name = 'horns-pivot';
  pivot.position.y = cy;
  for (const side of [-1, 1]) {
    const horn = new THREE.Group();
    horn.name = side < 0 ? 'horn-left' : 'horn-right';
    horn.position.set(side * 0.14, 0.28, -0.02);
    // 下段：微微外撇
    const base = mesh('horn-base', new THREE.CylinderGeometry(0.028, 0.04, 0.09, 10), mat(C.horn, 0.55), 0, 0.03, 0);
    base.rotation.z = -side * 0.35;
    horn.add(base);
    // 上段：向内回勾的尖
    const tip = mesh('horn-tip', new THREE.ConeGeometry(0.028, 0.11, 10), mat(C.horn, 0.55), side * 0.006, 0.12, 0);
    tip.rotation.z = side * 0.25;
    horn.add(tip);
    pivot.add(horn);
  }
  head.add(pivot);
}

/** 大尖耳：近水平外伸（Pointed Ear Shape），金外粉内，命名供动画器甩动 */
function buildEars(head: THREE.Group, cy: number) {
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.name = side < 0 ? 'ear-left' : 'ear-right';
    ear.position.set(side * 0.32, cy + 0.03, 0);
    const outer = mesh('ear-outer', new THREE.ConeGeometry(0.08, 0.18, 10), mat(C.fur));
    outer.rotation.z = -side * 1.35;
    ear.add(outer);
    const inner = mesh('ear-inner', new THREE.ConeGeometry(0.05, 0.12, 8), mat(C.earInner), -side * 0.006, 0.004, -0.016);
    inner.rotation.z = -side * 1.35;
    ear.add(inner);
    head.add(ear);
  }
}

/**
 * 猴子脸 v3：眼周金毛（无粉底盘），半睁耷拉眼 + 压低浓眉，
 * 粉色大宽吻占下半脸 + 类人猿厚唇 + 嘴缝线。
 */
function buildFace(head: THREE.Group, cy: number) {
  for (const side of [-1, 1]) {
    // 绿瞳 + 黑瞳孔 + 高光
    head.add(ball(side < 0 ? 'eye-left' : 'eye-right', C.iris, 0.04, side * 0.09, cy + 0.055, -0.285, 1, 1, 0.5, 12));
    head.add(ball(side < 0 ? 'pupil-left' : 'pupil-right', C.pupil, 0.02, side * 0.09, cy + 0.05, -0.302, 1, 1, 0.5, 8));
    head.add(
      ball(
        side < 0 ? 'eye-highlight-left' : 'eye-highlight-right',
        C.white,
        0.009,
        side * 0.09 - 0.012,
        cy + 0.062,
        -0.31,
        1,
        1,
        1,
        8
      )
    );
    // 上眼皮：金毛扁球盖住眼睛上半，做出半睁的耷拉神态
    head.add(ball(side < 0 ? 'eyelid-left' : 'eyelid-right', C.fur, 0.05, side * 0.09, cy + 0.093, -0.283, 1.25, 0.62, 0.55, 12));
    // 浓眉：深褐扁球压在眼皮上缘（参考图严肃神态）
    const brow = ball(side < 0 ? 'brow-left' : 'brow-right', C.brow, 0.045, side * 0.095, cy + 0.125, -0.272, 1.7, 0.38, 0.45, 10);
    brow.rotation.z = side * 0.25;
    head.add(brow);
  }

  // 粉色大宽吻：占下半张脸，明显外凸
  head.add(ball('muzzle', C.muzzle, 0.17, 0, cy - 0.115, -0.165, 1.35, 0.88, 0.92, 20));
  // 鼻孔（宽间距）
  for (const side of [-1, 1]) {
    head.add(ball(side < 0 ? 'nostril-left' : 'nostril-right', C.nostril, 0.012, side * 0.05, cy - 0.045, -0.316, 1, 1.3, 0.5, 6));
  }
  // 类人猿厚唇：上下两条宽扁球 + 中间深色嘴缝线
  head.add(ball('lip-upper', C.lip, 0.05, 0, cy - 0.125, -0.315, 2.8, 0.55, 0.6, 12));
  head.add(ball('mouth-line', C.mouthLine, 0.03, 0, cy - 0.155, -0.322, 3.6, 0.28, 0.4, 10));
  head.add(ball('lip-lower', C.lip, 0.045, 0, cy - 0.19, -0.305, 2.4, 0.6, 0.6, 12));
}

/** オニザル模型工厂 v3（大头压蛋形身、无脖子、粗短四肢） */
export function createOnizaruModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'onizaru';

  // ---- 腿组（粗短金毛腿 + 两瓣蹄形浅粉脚）----
  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    foot.name = side < 0 ? 'foot-left' : 'foot-right';
    foot.position.set(side * 0.15, 0, -0.01);
    foot.add(mesh('thigh', new THREE.CapsuleGeometry(0.105, 0.1, 4, 12), mat(C.fur), 0, 0.24, 0));
    // 两瓣蹄形脚：脚跟 + 前端左右两瓣
    foot.add(ball('heel', C.paw, 0.062, 0, 0.055, 0.015, 1.05, 0.85, 1.0, 12));
    foot.add(ball('hoof-inner', C.paw, 0.048, -side * 0.032, 0.05, -0.075, 1, 0.9, 1.4, 10));
    foot.add(ball('hoof-outer', C.paw, 0.048, side * 0.032, 0.05, -0.07, 1, 0.9, 1.35, 10));
    root.add(foot);
  }

  // ---- 躯干（单一蛋形大肚 + 浅金肚皮）----
  root.add(ball('torso', C.fur, 0.34, 0, 0.55, 0, 1.02, 1.15, 0.95, 22));
  root.add(ball('belly', C.belly, 0.2, 0, 0.5, -0.16, 1.25, 1.2, 0.55, 16));

  // ---- 手臂组（溜肩枢轴；粗臂下垂 + 浅粉手掌）----
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'arm-left' : 'arm-right';
    arm.position.set(side * 0.28, 0.82, 0);
    const limb = mesh('arm', new THREE.CapsuleGeometry(0.078, 0.24, 4, 12), mat(C.fur), side * 0.025, -0.16, 0);
    limb.rotation.z = side * 0.14;
    arm.add(limb);
    arm.add(ball('hand', C.paw, 0.066, side * 0.05, -0.34, 0, 1, 0.9, 1.15, 10));
    root.add(arm);
  }

  // ---- 大宽头（颈部枢轴组；直接压在身体上，无脖子）----
  const neckY = 0.95;
  const head = new THREE.Group();
  head.name = 'onizaru-head-pivot';
  head.position.y = neckY;
  root.add(head);

  const cy = 1.22 - neckY; // 头心局部高度（世界 1.22，头底与躯干上缘重叠）
  head.add(ball('head', C.fur, 0.32, 0, cy, 0, 1.12, 1.0, 0.96, 22));

  buildHorns(head, cy);
  buildEars(head, cy);
  buildFace(head, cy);

  // ---- 手部挂点（右手，持香蕉枪）----
  const hand = new THREE.Group();
  hand.name = 'onizaru-hand-socket';
  hand.position.set(0.31, 0.44, -0.1);
  root.add(hand);

  root.userData = {
    character: 'onizaru',
    sockets: { head, hand },
    collider: { type: 'sphere', radius: 0.5 },
  };
  return root;
}
