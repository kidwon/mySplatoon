import * as THREE from 'three';

/**
 * ニコリ（Nikori）v4 — 2 头身 Q 版比例（与ちいかわ系角色同风格）。
 * 头部直径约占总身高一半，短手短脚，五官摆在更大的"画布"上。
 *
 * 特征清单（detailInventory v2）：纯黑短波波头（齐刘海）、圆形粉腮红 +
 * 圆棕瞳 + ω 小嘴、粉色连帽卫衣（兔子徽章、帽兜、口袋）、蓝条纹短裤、
 * 粉色亮面双肩包 + 粉兔挂件、蓝色运动鞋。武器为刨冰泼桶（weapons.ts）。
 *
 * 层级（对齐参考图 RUNTIME HIERARCHY）：
 *   root（脚底原点，面朝 -Z）
 *   ├─ 腿部组 foot-left / foot-right（步行动画驱动）
 *   ├─ 躯干（卫衣）/ 短裤 / 背包（backpack-anchor）
 *   ├─ 手臂组 arm-left / arm-right（长袖短手）
 *   ├─ handSocket（右手，持刨冰武器）
 *   └─ headGroup（颈部枢轴）→ 大头 / 发 / 脸
 * root.userData: { character, sockets: { head, hand, backpack }, collider }
 *
 * 发型构造原则：脸部高度不用球面 phi/theta 补丁，全部实体构造。
 * 已知近似：徽章为浮雕小盘；不复刻真实人脸（刻意，仅风格化卡通）。
 */

const C = {
  skin: '#F5D3B8',
  hair: '#322A2E',
  hoodie: '#F2AEBB',
  hoodieDark: '#E693A6',
  badge: '#F5E6A8',
  shorts: '#BBD3EA',
  shortsStripe: '#6E93C4',
  shoe: '#7EB3E8',
  sole: '#F5F3EE',
  pack: '#F2A7C3',
  packDark: '#DE8FAE',
  eye: '#4A3527',
  white: '#FFFFFF',
  brow: '#3A3034',
  mouth: '#A65A55',
  blush: '#F5A8B0',
  charmPink: '#F5B8CE',
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.65): THREE.MeshStandardMaterial {
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

/** 头发：纯黑短波波头（发量厚重），实体构造不遮脸 */
function buildHair(head: THREE.Group, cy: number, headR: number) {
  // 短圆顶：只盖头顶，下缘停在眉毛上方
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(headR * 1.09, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.36),
    mat(C.hair, 0.75)
  );
  dome.name = 'hair-dome';
  dome.position.y = cy + 0.01;
  dome.castShadow = true;
  head.add(dome);

  // 后脑体积：波波头的圆润后摆
  head.add(ball('hair-back', C.hair, headR, 0, cy - 0.05, 0.09, 1.16, 1.18, 0.92, 20));

  // 齐刘海：额头上方一排发球，厚重平齐
  const bangsY = cy + 0.2;
  const bangsZ = -0.27;
  const bangsX = [-0.2, -0.1, 0, 0.1, 0.2];
  bangsX.forEach((x, i) => {
    head.add(
      ball(`hair-bangs-${i}`, C.hair, 0.078, x, bangsY - Math.abs(x) * 0.1, bangsZ, 1.1, 0.95, 0.6, 12)
    );
  });

  // 颊侧发束：波波头垂下的两侧内扣发（盖住耳朵位置）
  for (const side of [-1, 1]) {
    head.add(
      ball(side < 0 ? 'hair-side-left' : 'hair-side-right', C.hair, 0.12, side * 0.325, cy - 0.1, -0.02, 0.65, 1.6, 1.0, 12)
    );
  }
}

/** 脸部：小圆棕瞳 + 高光、细眉、ω 小嘴、大圆粉腮红（2 头身大脸画布） */
function buildFace(head: THREE.Group, cy: number) {
  const faceZ = -0.305;
  for (const side of [-1, 1]) {
    head.add(ball(side < 0 ? 'eye-left' : 'eye-right', C.eye, 0.05, side * 0.115, cy - 0.005, faceZ, 1, 1.15, 0.5, 12));
    head.add(
      ball(
        side < 0 ? 'eye-highlight-left' : 'eye-highlight-right',
        C.white,
        0.015,
        side * 0.115 - 0.017,
        cy + 0.018,
        faceZ - 0.022,
        1,
        1,
        1,
        8
      )
    );
    const brow = mesh(
      side < 0 ? 'brow-left' : 'brow-right',
      new THREE.BoxGeometry(0.06, 0.011, 0.01),
      mat(C.brow),
      side * 0.115,
      cy + 0.11,
      faceZ - 0.002
    );
    brow.rotation.z = side * 0.12;
    head.add(brow);
    // 大圆粉腮红
    head.add(
      ball(side < 0 ? 'blush-left' : 'blush-right', C.blush, 0.06, side * 0.2, cy - 0.09, -0.25, 1, 0.8, 0.3, 10)
    );
  }
  // ω 小嘴：两条微弯短线拼成
  for (const side of [-1, 1]) {
    const stroke = mesh(
      side < 0 ? 'mouth-left' : 'mouth-right',
      new THREE.CapsuleGeometry(0.007, 0.026, 3, 6),
      mat(C.mouth),
      side * 0.015,
      cy - 0.11,
      -0.315
    );
    stroke.rotation.z = side * 1.15;
    head.add(stroke);
  }
}

/** 卫衣胸前的兔子徽章：黄色圆盘 + 白色小兔头 */
function buildBadge(root: THREE.Group) {
  const badge = new THREE.Group();
  badge.name = 'hoodie-badge';
  badge.position.set(0.06, 0.47, -0.19);
  badge.add(ball('badge-disc', C.badge, 0.028, 0, 0, 0, 1, 1, 0.3, 10));
  badge.add(ball('badge-bunny-head', C.white, 0.012, 0, -0.002, -0.008, 1, 1, 0.6, 8));
  for (const side of [-1, 1]) {
    const ear = mesh(
      'badge-bunny-ear',
      new THREE.CapsuleGeometry(0.004, 0.011, 3, 6),
      mat(C.white),
      side * 0.006,
      0.015,
      -0.008
    );
    ear.rotation.z = -side * 0.15;
    badge.add(ear);
  }
  root.add(badge);
}

/** 粉色亮面双肩包 + 肩带 + 粉兔挂件（随 Q 版体型缩小） */
function buildBackpack(root: THREE.Group): THREE.Group {
  const anchor = new THREE.Group();
  anchor.name = 'backpack-anchor';
  anchor.position.set(0, 0.44, 0.22);

  anchor.add(mesh('pack-body', new THREE.BoxGeometry(0.2, 0.2, 0.1), mat(C.pack, 0.3)));
  anchor.add(mesh('pack-flap', new THREE.BoxGeometry(0.2, 0.08, 0.11), mat(C.packDark, 0.3), 0, 0.09, 0.005));
  anchor.add(mesh('pack-pocket', new THREE.BoxGeometry(0.12, 0.09, 0.03), mat(C.packDark, 0.3), 0, -0.04, 0.06));

  // 粉兔挂件（整只粉色、白色缎带）
  const charm = new THREE.Group();
  charm.name = 'bunny-charm';
  charm.position.set(0.13, -0.01, 0.02);
  charm.add(ball('charm-body', C.charmPink, 0.024, 0, 0, 0, 1, 1.15, 0.9, 10));
  charm.add(ball('charm-head', C.charmPink, 0.019, 0, 0.036, 0, 1, 1, 1, 10));
  charm.add(ball('charm-ribbon', C.white, 0.009, 0, 0.022, -0.014, 1.6, 0.7, 0.6, 6));
  for (const side of [-1, 1]) {
    const ear = mesh(
      'charm-ear',
      new THREE.CapsuleGeometry(0.006, 0.024, 3, 6),
      mat(C.charmPink),
      side * 0.009,
      0.064,
      0
    );
    ear.rotation.z = -side * 0.15;
    charm.add(ear);
  }
  anchor.add(charm);

  root.add(anchor);

  // 肩带（胸前两条）
  for (const side of [-1, 1]) {
    root.add(
      mesh(
        side < 0 ? 'strap-left' : 'strap-right',
        new THREE.BoxGeometry(0.03, 0.14, 0.015),
        mat(C.pack, 0.4),
        side * 0.08,
        0.48,
        -0.175
      )
    );
  }
  return anchor;
}

/** ニコリ模型工厂（v4：2 头身 Q 版） */
export function createNikoriModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'nikori';

  // ---- 短腿 + 鞋（步行动画组）----
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'foot-left' : 'foot-right';
    leg.position.set(side * 0.1, 0, -0.01);
    leg.add(mesh('leg', new THREE.CapsuleGeometry(0.055, 0.07, 4, 10), mat(C.skin), 0, 0.16, 0));
    leg.add(mesh('shoe', new THREE.BoxGeometry(0.12, 0.08, 0.2), mat(C.shoe, 0.5), 0, 0.06, -0.03));
    leg.add(mesh('sole', new THREE.BoxGeometry(0.125, 0.03, 0.21), mat(C.sole, 0.6), 0, 0.015, -0.03));
    leg.add(mesh('shoe-strap', new THREE.BoxGeometry(0.122, 0.02, 0.06), mat(C.sole, 0.6), 0, 0.085, -0.05));
    root.add(leg);
  }

  // ---- 短裤（蓝条纹，露出卫衣下摆一点）----
  root.add(mesh('shorts-hip', new THREE.BoxGeometry(0.31, 0.1, 0.22), mat(C.shorts), 0, 0.27, 0));
  for (const side of [-1, 1]) {
    root.add(
      mesh(
        side < 0 ? 'shorts-cuff-left' : 'shorts-cuff-right',
        new THREE.CylinderGeometry(0.09, 0.095, 0.08, 12),
        mat(C.shorts),
        side * 0.1,
        0.23,
        0
      )
    );
    root.add(
      mesh(
        'shorts-stripe',
        new THREE.CylinderGeometry(0.093, 0.093, 0.02, 12),
        mat(C.shortsStripe),
        side * 0.1,
        0.245,
        0
      )
    );
  }

  // ---- 躯干（粉色连帽卫衣；矮胖桶状）----
  const torso = mesh('torso', new THREE.CapsuleGeometry(0.19, 0.12, 4, 14), mat(C.hoodie), 0, 0.42, 0);
  torso.scale.set(1, 0.9, 0.95);
  root.add(torso);
  root.add(mesh('hoodie-hem', new THREE.CylinderGeometry(0.195, 0.2, 0.05, 14), mat(C.hoodieDark), 0, 0.31, 0));
  root.add(ball('hood', C.hoodieDark, 0.1, 0, 0.52, 0.16, 1.35, 0.75, 0.9, 12));
  root.add(mesh('hoodie-pocket', new THREE.BoxGeometry(0.16, 0.08, 0.03), mat(C.hoodieDark), 0, 0.35, -0.185));
  buildBadge(root);

  // ---- 短手臂组（长袖）----
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'arm-left' : 'arm-right';
    arm.position.set(side * 0.235, 0.44, 0);
    arm.add(mesh('sleeve', new THREE.CapsuleGeometry(0.055, 0.08, 4, 10), mat(C.hoodie), 0, -0.02, 0));
    arm.add(mesh('cuff', new THREE.CylinderGeometry(0.056, 0.056, 0.025, 10), mat(C.hoodieDark), 0, -0.075, 0));
    arm.add(ball('hand', C.skin, 0.045, 0, -0.1, 0, 1, 1, 1, 10));
    root.add(arm);
  }

  // ---- 背包 ----
  const backpackAnchor = buildBackpack(root);

  // ---- 大头（颈部枢轴组；2 头身核心）----
  const neckY = 0.58;
  const head = new THREE.Group();
  head.name = 'nikori-head-pivot';
  head.position.y = neckY;
  root.add(head);

  const headR = 0.34;
  const cy = 0.95 - neckY; // 头心局部高度（世界 0.95）
  head.add(ball('head', C.skin, headR, 0, cy, 0, 1.05, 1.0, 0.98, 22));

  buildHair(head, cy, headR);
  buildFace(head, cy);

  // ---- 手部挂点（右手，持刨冰武器）----
  const hand = new THREE.Group();
  hand.name = 'nikori-hand-socket';
  hand.position.set(0.24, 0.32, -0.06);
  root.add(hand);

  root.userData = {
    character: 'nikori',
    sockets: { head, hand, backpack: backpackAnchor },
    collider: { type: 'sphere', radius: 0.48 },
  };
  return root;
}
