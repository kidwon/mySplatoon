import * as THREE from 'three';

/**
 * ちいかわ角色组 — 程序化 Three.js 模型（依据 img2threejs 风格参考图重建）。
 *
 * 约定（与游戏角色一致）：原点在脚底，+Y 向上，面朝 -Z。
 * 层级（对齐参考图标注）：
 *   root
 *   ├─ 躯干部件（body / arm / foot / tail…）
 *   ├─ handSocket（ANCHOR_POINT: hand/tool_socket，可挂道具）
 *   └─ headGroup（ROTATION_PIVOT: head/neck，枢轴在颈部，可做点头/转头动画）
 *      └─ 头部所有部件（头/耳/眼/腮/嘴，头心局部坐标）
 * root.userData: { character, sockets: { head, hand }, collider: SIMPLE_COLLIDER 参数 }
 *
 * 已知近似（无法从单张参考图/纯几何达成）：绒毛质感（参考图为 procedural fur
 * texture）、ハチワレ花纹的 shader 渐变（此处为单色近似）、表情贴片系统
 * （EXPRESSION_SPRITE，此处为几何五官，不可切换表情）。
 */

const COLORS = {
  white: '#F7F5F0',
  earDark: '#3F3B3A',
  hachiBlue: '#8FB4D8',
  usagiYellow: '#F2DC85',
  shisaTan: '#D9B380',
  shisaMane: '#8A5A33',
  staffWood: '#9C7A4A',
  cheekPink: '#F4A7B5',
  eyeBlack: '#2B2B2B',
  mouthDark: '#5A3A38',
  tonguePink: '#E58A96',
  fangWhite: '#FFFFFF',
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string): THREE.MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
    matCache.set(color, m);
  }
  return m;
}

interface BallOpts {
  name: string;
  color: string;
  r: number;
  x?: number;
  y?: number;
  z?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  seg?: number;
}

function ball(o: BallOpts): THREE.Mesh {
  const seg = o.seg ?? 20;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(o.r, seg, Math.max(8, seg / 2)),
    mat(o.color)
  );
  mesh.name = o.name;
  mesh.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  mesh.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  mesh.castShadow = true;
  return mesh;
}

/** 带白色高光点的黑豆眼（参考图：大圆眼 + 高光） */
function addEyes(
  head: THREE.Group,
  o: { cy: number; headR: number; spread: number; ovalY?: number }
) {
  const r = o.headR * 0.11;
  for (const side of [-1, 1]) {
    head.add(
      ball({
        name: side < 0 ? 'eye-left' : 'eye-right',
        color: COLORS.eyeBlack,
        r,
        sy: o.ovalY ?? 1,
        x: side * o.spread,
        y: o.cy + o.headR * 0.1,
        z: -o.headR * 0.88,
        seg: 12,
      })
    );
    head.add(
      ball({
        name: side < 0 ? 'eye-highlight-left' : 'eye-highlight-right',
        color: COLORS.fangWhite,
        r: r * 0.3,
        x: side * o.spread - r * 0.3,
        y: o.cy + o.headR * 0.1 + r * 0.35 * (o.ovalY ?? 1),
        z: -o.headR * 0.88 - r * 0.75,
        seg: 8,
      })
    );
  }
}

function addCheeks(head: THREE.Group, o: { cy: number; headR: number }) {
  for (const side of [-1, 1]) {
    head.add(
      ball({
        name: side < 0 ? 'cheek-left' : 'cheek-right',
        color: COLORS.cheekPink,
        r: o.headR * 0.14,
        sy: 0.72,
        sz: 0.35,
        x: side * o.headR * 0.62,
        y: o.cy - o.headR * 0.14,
        z: -o.headR * 0.72,
        seg: 10,
      })
    );
  }
}

/** ちいかわ标志性 "ᆺ" 嘴：两条斜短线 + 下方小张嘴 */
function addChiikawaMouth(head: THREE.Group, o: { cy: number; headR: number }) {
  const z = -o.headR * 0.965;
  for (const side of [-1, 1]) {
    const stroke = new THREE.Mesh(
      new THREE.CapsuleGeometry(o.headR * 0.022, o.headR * 0.09, 3, 6),
      mat(COLORS.mouthDark)
    );
    stroke.name = side < 0 ? 'mouth-stroke-left' : 'mouth-stroke-right';
    stroke.position.set(side * o.headR * 0.055, o.cy - o.headR * 0.1, z);
    stroke.rotation.z = side * 1.05;
    stroke.castShadow = true;
    head.add(stroke);
  }
  head.add(
    ball({
      name: 'mouth-open',
      color: COLORS.mouthDark,
      r: o.headR * 0.055,
      sx: 1.15,
      sy: 0.85,
      sz: 0.3,
      y: o.cy - o.headR * 0.22,
      z,
      seg: 10,
    })
  );
}

/** 开口笑（ハチワレ）/ 呐喊（うさぎ）：暗色口腔 + 粉舌 */
function addOpenMouth(
  head: THREE.Group,
  o: { cy: number; headR: number; big?: boolean }
) {
  const s = o.big ? 1.8 : 1;
  const z = -o.headR * 0.94;
  head.add(
    ball({
      name: 'mouth',
      color: COLORS.mouthDark,
      r: o.headR * 0.1 * s,
      sx: o.big ? 0.9 : 1.35,
      sy: o.big ? 1.15 : 0.85,
      sz: 0.3,
      y: o.cy - o.headR * 0.18,
      z,
      seg: 12,
    })
  );
  head.add(
    ball({
      name: 'tongue',
      color: COLORS.tonguePink,
      r: o.headR * 0.05 * s,
      sx: 1.1,
      sy: 0.55,
      sz: 0.3,
      y: o.cy - o.headR * 0.18 - o.headR * 0.055 * s,
      z: z - 0.005,
      seg: 8,
    })
  );
}

/** 短手短脚小圆尾 */
function addLimbs(
  g: THREE.Group,
  o: { color: string; bodyY: number; bodyR: number; footScaleZ?: number; tailR?: number }
) {
  for (const side of [-1, 1]) {
    g.add(
      ball({
        name: side < 0 ? 'arm-left' : 'arm-right',
        color: o.color,
        r: o.bodyR * 0.24,
        sx: 0.8,
        sz: 0.8,
        x: side * o.bodyR * 1.02,
        y: o.bodyY + o.bodyR * 0.35,
        z: -o.bodyR * 0.1,
        seg: 12,
      })
    );
    g.add(
      ball({
        name: side < 0 ? 'foot-left' : 'foot-right',
        color: o.color,
        r: o.bodyR * 0.3,
        sx: 0.9,
        sy: 0.55,
        sz: o.footScaleZ ?? 1.2,
        x: side * o.bodyR * 0.42,
        y: o.bodyR * 0.17,
        z: -o.bodyR * 0.1,
        seg: 12,
      })
    );
  }
  g.add(
    ball({
      name: 'tail',
      color: o.color,
      r: o.tailR ?? o.bodyR * 0.2,
      y: o.bodyY + o.bodyR * 0.2,
      z: o.bodyR * 1.0,
      seg: 10,
    })
  );
}

/** 组装根节点：头部枢轴组 + 手部挂点 + userData 契约 */
function assemble(
  name: string,
  neckY: number,
  bodyColliderR: number,
  handAnchor: THREE.Vector3
): { root: THREE.Group; head: THREE.Group; hand: THREE.Group } {
  const root = new THREE.Group();
  root.name = name;

  const head = new THREE.Group();
  head.name = `${name}-head-pivot`;
  head.position.y = neckY;
  root.add(head);

  const hand = new THREE.Group();
  hand.name = `${name}-hand-socket`;
  hand.position.copy(handAnchor);
  root.add(hand);

  root.userData = {
    character: name,
    sockets: { head, hand },
    collider: { type: 'sphere', radius: bodyColliderR },
  };
  return { root, head, hand };
}

/** ちいかわ：白色仓鼠熊，深色圆耳、大高光眼、"ᆺ"嘴 */
export function createChiikawaModel(): THREE.Group {
  const headR = 0.58;
  const headCY = 1.04; // 头心世界高度
  const neckY = headCY - headR * 0.6;
  const { root, head } = assemble('chiikawa', neckY, 0.5, new THREE.Vector3(0.4, 0.55, -0.05));
  const cy = headCY - neckY; // 头心在枢轴组内的局部高度

  root.add(ball({ name: 'body', color: COLORS.white, r: 0.38, sy: 0.85, sz: 0.95, y: 0.38 }));
  head.add(ball({ name: 'head', color: COLORS.white, r: headR, y: cy }));

  // 深色圆耳（参考图：黑耳，无粉内耳）
  for (const side of [-1, 1]) {
    head.add(
      ball({
        name: side < 0 ? 'ear-left' : 'ear-right',
        color: COLORS.earDark,
        r: 0.14,
        sy: 1.1,
        sz: 0.75,
        x: side * 0.3,
        y: cy + headR * 0.88,
        z: -0.02,
        seg: 14,
      })
    );
  }

  addEyes(head, { cy, headR, spread: 0.21 });
  addCheeks(head, { cy, headR });
  addChiikawaMouth(head, { cy, headR });
  addLimbs(root, { color: COLORS.white, bodyY: 0.38, bodyR: 0.38 });

  return root;
}

/** ハチワレ：白猫，浅蓝渐变花纹盖住双耳，蓝色上翘长尾，开口笑 */
export function createHachiwareModel(): THREE.Group {
  const headR = 0.56;
  const headCY = 1.02;
  const neckY = headCY - headR * 0.6;
  const { root, head } = assemble('hachiware', neckY, 0.5, new THREE.Vector3(0.4, 0.55, -0.05));
  const cy = headCY - neckY;

  root.add(ball({ name: 'body', color: COLORS.white, r: 0.4, sy: 0.88, sz: 0.95, y: 0.4 }));
  head.add(ball({ name: 'head', color: COLORS.white, r: headR, y: cy }));

  // 八割花纹：浅蓝顶盖（盖住双耳基部）+ 额头两侧前叶，中间留白色面纹
  const shellR = headR * 1.015;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(shellR, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.4),
    mat(COLORS.hachiBlue)
  );
  cap.name = 'marking-cap';
  cap.position.y = cy;
  cap.castShadow = true;
  head.add(cap);

  for (const side of [-1, 1]) {
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(shellR, 12, 8, -0.3, 0.6, Math.PI * 0.32, Math.PI * 0.26),
      mat(COLORS.hachiBlue)
    );
    lobe.name = side < 0 ? 'marking-lobe-left' : 'marking-lobe-right';
    lobe.position.y = cy;
    lobe.rotation.y = Math.PI / 2 + side * 0.6;
    lobe.castShadow = true;
    head.add(lobe);
  }

  // 三角猫耳（浅蓝，位于花纹上，POSEABLE_JOINT → 各自独立 Mesh）
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 10), mat(COLORS.hachiBlue));
    ear.name = side < 0 ? 'ear-left' : 'ear-right';
    ear.position.set(side * 0.3, cy + headR * 0.98, 0);
    ear.rotation.z = -side * 0.25;
    ear.castShadow = true;
    head.add(ear);
  }

  addEyes(head, { cy, headR, spread: 0.2 });
  addCheeks(head, { cy, headR });
  addOpenMouth(head, { cy, headR });
  addLimbs(root, { color: COLORS.white, bodyY: 0.4, bodyR: 0.4, tailR: 0.001 });

  // 蓝色上翘长尾（两段弯曲，ANIMATION_READY → 独立命名段）
  const tailBase = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), mat(COLORS.hachiBlue));
  tailBase.name = 'tail-base';
  tailBase.position.set(0, 0.62, 0.5);
  tailBase.rotation.x = 0.9;
  tailBase.castShadow = true;
  root.add(tailBase);
  const tailTip = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 10), mat(COLORS.hachiBlue));
  tailTip.name = 'tail-tip';
  tailTip.position.set(0, 0.9, 0.62);
  tailTip.rotation.x = 0.25;
  tailTip.castShadow = true;
  root.add(tailTip);

  return root;
}

/** うさぎ：黄兔，纯黄长立耳（微外弯）、竖椭圆眼、呐喊大张嘴、手持木棒 */
export function createUsagiModel(): THREE.Group {
  const headR = 0.52;
  const headCY = 1.08;
  const neckY = headCY - headR * 0.6;
  const { root, head, hand } = assemble('usagi', neckY, 0.48, new THREE.Vector3(0.42, 0.62, -0.12));
  const cy = headCY - neckY;

  root.add(
    ball({ name: 'body', color: COLORS.usagiYellow, r: 0.4, sx: 0.95, sy: 1.05, sz: 0.9, y: 0.47 })
  );
  head.add(ball({ name: 'head', color: COLORS.usagiYellow, r: headR, y: cy }));

  // 纯黄长立耳，微微外弯（参考图无粉内耳；DYNAMICS/JOINT_LIMITS → 独立 Mesh）
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 10), mat(COLORS.usagiYellow));
    ear.name = side < 0 ? 'ear-left' : 'ear-right';
    ear.position.set(side * 0.17, cy + headR * 0.85 + 0.28, 0.02);
    ear.rotation.z = -side * 0.18;
    ear.castShadow = true;
    head.add(ear);
  }

  addEyes(head, { cy, headR, spread: 0.18, ovalY: 1.5 });
  addCheeks(head, { cy, headR });
  addOpenMouth(head, { cy, headR, big: true });
  addLimbs(root, { color: COLORS.usagiYellow, bodyY: 0.47, bodyR: 0.4, footScaleZ: 1.5, tailR: 0.11 });

  // 木棒（ITEM_SLOT：挂在 handSocket 上，斜握横过身前）
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 8), mat(COLORS.staffWood));
  staff.name = 'staff';
  staff.rotation.z = 1.0;
  staff.rotation.y = 0.35;
  staff.castShadow = true;
  hand.add(staff);

  return root;
}

/** シーサー：棕色卷毛鬃圈的坐姿狮子犬，小白獠牙 */
export function createShisaModel(): THREE.Group {
  const headR = 0.44;
  const headCY = 1.02;
  const neckY = headCY - headR * 0.55;
  const { root, head } = assemble('shisa', neckY, 0.5, new THREE.Vector3(0.35, 0.5, -0.25));
  const cy = headCY - neckY;

  // 坐姿身体：躯干 + 两侧后臀 + 前腿前爪（PAW_ANCHORS）
  root.add(ball({ name: 'body', color: COLORS.shisaTan, r: 0.45, sy: 0.95, sz: 1.05, y: 0.5 }));
  for (const side of [-1, 1]) {
    root.add(
      ball({
        name: side < 0 ? 'haunch-left' : 'haunch-right',
        color: COLORS.shisaTan,
        r: 0.22,
        sy: 0.8,
        x: side * 0.33,
        y: 0.24,
        z: 0.2,
        seg: 12,
      })
    );
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 10), mat(COLORS.shisaTan));
    leg.name = side < 0 ? 'foreleg-left' : 'foreleg-right';
    leg.position.set(side * 0.19, 0.32, -0.33);
    leg.castShadow = true;
    root.add(leg);
    root.add(
      ball({
        name: side < 0 ? 'paw-left' : 'paw-right',
        color: COLORS.shisaTan,
        r: 0.11,
        sy: 0.55,
        sz: 1.3,
        x: side * 0.19,
        y: 0.07,
        z: -0.38,
        seg: 10,
      })
    );
  }

  head.add(ball({ name: 'head', color: COLORS.shisaTan, r: headR, y: cy }));

  // 鬃圈：围绕面部一圈的棕色卷毛团（SHISA_TUFTS，确定性布置无随机）
  const tufts = 11;
  for (let i = 0; i < tufts; i++) {
    const a = (i / tufts) * Math.PI * 2;
    const ring = headR * 1.02;
    const size = 0.13 + 0.035 * (i % 3); // 大小节律变化，模拟卷毛
    head.add(
      ball({
        name: `mane-tuft-${i}`,
        color: COLORS.shisaMane,
        r: size,
        x: Math.cos(a) * ring,
        y: cy + Math.sin(a) * ring * 0.95,
        z: 0.1,
        seg: 10,
      })
    );
  }
  // 头顶双卷
  for (const side of [-1, 1]) {
    head.add(
      ball({
        name: side < 0 ? 'mane-top-left' : 'mane-top-right',
        color: COLORS.shisaMane,
        r: 0.12,
        x: side * 0.14,
        y: cy + headR * 0.95,
        z: -0.05,
        seg: 10,
      })
    );
  }

  addEyes(head, { cy, headR, spread: 0.16 });
  addCheeks(head, { cy, headR });
  addOpenMouth(head, { cy, headR });

  // 小白獠牙：嘴角两颗朝下的小锥（FACE_LANDMARKS 中的标志性细节）
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 6), mat(COLORS.fangWhite));
    fang.name = side < 0 ? 'fang-left' : 'fang-right';
    fang.position.set(side * 0.1, cy - headR * 0.24, -headR * 0.9);
    fang.rotation.x = Math.PI; // 尖朝下
    fang.castShadow = true;
    head.add(fang);
  }

  // 上翘卷尾
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.25, 4, 10), mat(COLORS.shisaMane));
  tail.name = 'tail';
  tail.position.set(0, 0.75, 0.5);
  tail.rotation.x = 0.5;
  tail.castShadow = true;
  root.add(tail);

  return root;
}

export const CHIIKAWA_FACTORIES = {
  chiikawa: createChiikawaModel,
  hachiware: createHachiwareModel,
  usagi: createUsagiModel,
  shisa: createShisaModel,
} as const;

export type ChiikawaCharacter = keyof typeof CHIIKAWA_FACTORIES;
