import * as THREE from 'three';

/**
 * ニコリ（Nikori）v3 — 依据更新版 img2threejs 参考图的程序化模型。
 * v3 调整：整体圆润化（宽脸、粗手脚、桶状卫衣），眼睛缩小；
 * 刨冰不再是左手零食，改为她的专属武器（见 weapons.ts createShavedIceWeapon）。
 *
 * 特征清单（detailInventory v2）：纯黑短波波头（panda-like form，齐刘海）、
 * 圆形粉腮红 + 圆棕瞳 + ω 小嘴（人类小女孩）、粉色连帽卫衣（兔子徽章、
 * 帽兜、口袋）、蓝条纹短裤、粉色亮面双肩包 + 粉兔挂件、蓝色运动鞋。
 *
 * 层级（对齐参考图 RUNTIME HIERARCHY）：
 *   root（脚底原点，面朝 -Z）
 *   ├─ 腿部组 foot-left / foot-right（步行动画驱动）
 *   ├─ 躯干（卫衣）/ 短裤 / 背包（backpack-anchor）
 *   ├─ 手臂组 arm-left / arm-right（长袖）
 *   ├─ handSocket（右手，持武器）
 *   └─ headGroup（颈部枢轴）→ 头 / 发 / 脸
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
  head.add(ball('hair-back', C.hair, headR, 0, cy - 0.04, 0.075, 1.18, 1.2, 0.92, 20));

  // 齐刘海：额头上方一排发球，厚重平齐
  const bangsY = cy + 0.17;
  const bangsZ = -0.225;
  const bangsX = [-0.17, -0.085, 0, 0.085, 0.17];
  bangsX.forEach((x, i) => {
    head.add(
      ball(`hair-bangs-${i}`, C.hair, 0.066, x, bangsY - Math.abs(x) * 0.1, bangsZ, 1.1, 0.95, 0.6, 12)
    );
  });

  // 颊侧发束：波波头垂下的两侧内扣发（盖住耳朵位置）
  for (const side of [-1, 1]) {
    head.add(
      ball(side < 0 ? 'hair-side-left' : 'hair-side-right', C.hair, 0.105, side * 0.275, cy - 0.09, -0.02, 0.65, 1.7, 1.0, 12)
    );
  }
}

/** 脸部：圆棕瞳（v3 缩小）+ 高光、细眉、ω 小嘴、圆形粉腮红 */
function buildFace(head: THREE.Group, cy: number) {
  const faceZ = -0.26;
  for (const side of [-1, 1]) {
    head.add(ball(side < 0 ? 'eye-left' : 'eye-right', C.eye, 0.046, side * 0.1, cy - 0.005, faceZ, 1, 1.15, 0.5, 12));
    head.add(
      ball(
        side < 0 ? 'eye-highlight-left' : 'eye-highlight-right',
        C.white,
        0.014,
        side * 0.1 - 0.016,
        cy + 0.016,
        faceZ - 0.02,
        1,
        1,
        1,
        8
      )
    );
    const brow = mesh(
      side < 0 ? 'brow-left' : 'brow-right',
      new THREE.BoxGeometry(0.055, 0.01, 0.01),
      mat(C.brow),
      side * 0.1,
      cy + 0.095,
      faceZ - 0.002
    );
    brow.rotation.z = side * 0.12;
    head.add(brow);
    // 圆形粉腮红（更大更低，贴合胖脸颊）
    head.add(
      ball(side < 0 ? 'blush-left' : 'blush-right', C.blush, 0.05, side * 0.175, cy - 0.075, -0.215, 1, 0.8, 0.3, 10)
    );
  }
  // ω 小嘴：两条微弯短线拼成
  for (const side of [-1, 1]) {
    const stroke = mesh(
      side < 0 ? 'mouth-left' : 'mouth-right',
      new THREE.CapsuleGeometry(0.006, 0.024, 3, 6),
      mat(C.mouth),
      side * 0.014,
      cy - 0.1,
      -0.268
    );
    stroke.rotation.z = side * 1.15;
    head.add(stroke);
  }
}

/** 卫衣胸前的兔子徽章：黄色圆盘 + 白色小兔头 */
function buildBadge(root: THREE.Group) {
  const badge = new THREE.Group();
  badge.name = 'hoodie-badge';
  badge.position.set(0.055, 0.79, -0.175);
  badge.add(ball('badge-disc', C.badge, 0.03, 0, 0, 0, 1, 1, 0.3, 10));
  badge.add(ball('badge-bunny-head', C.white, 0.013, 0, -0.002, -0.008, 1, 1, 0.6, 8));
  for (const side of [-1, 1]) {
    const ear = mesh(
      'badge-bunny-ear',
      new THREE.CapsuleGeometry(0.004, 0.012, 3, 6),
      mat(C.white),
      side * 0.006,
      0.016,
      -0.008
    );
    ear.rotation.z = -side * 0.15;
    badge.add(ear);
  }
  root.add(badge);
}

/** 粉色亮面双肩包 + 肩带 + 粉兔挂件 */
function buildBackpack(root: THREE.Group): THREE.Group {
  const anchor = new THREE.Group();
  anchor.name = 'backpack-anchor';
  anchor.position.set(0, 0.74, 0.21);

  anchor.add(mesh('pack-body', new THREE.BoxGeometry(0.26, 0.28, 0.12), mat(C.pack, 0.3)));
  anchor.add(mesh('pack-flap', new THREE.BoxGeometry(0.26, 0.1, 0.13), mat(C.packDark, 0.3), 0, 0.12, 0.005));
  anchor.add(mesh('pack-pocket', new THREE.BoxGeometry(0.15, 0.12, 0.03), mat(C.packDark, 0.3), 0, -0.05, 0.075));

  // 粉兔挂件（整只粉色、白色缎带）
  const charm = new THREE.Group();
  charm.name = 'bunny-charm';
  charm.position.set(0.16, -0.02, 0.02);
  charm.add(ball('charm-body', C.charmPink, 0.028, 0, 0, 0, 1, 1.15, 0.9, 10));
  charm.add(ball('charm-head', C.charmPink, 0.022, 0, 0.042, 0, 1, 1, 1, 10));
  charm.add(ball('charm-ribbon', C.white, 0.01, 0, 0.026, -0.016, 1.6, 0.7, 0.6, 6));
  for (const side of [-1, 1]) {
    const ear = mesh(
      'charm-ear',
      new THREE.CapsuleGeometry(0.007, 0.028, 3, 6),
      mat(C.charmPink),
      side * 0.01,
      0.075,
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
        new THREE.BoxGeometry(0.035, 0.22, 0.015),
        mat(C.pack, 0.4),
        side * 0.085,
        0.78,
        -0.16
      )
    );
  }
  return anchor;
}

/** ニコリ模型工厂（v3：圆润体型） */
export function createNikoriModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'nikori';

  // ---- 腿 + 鞋（步行动画组；腿加粗）----
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'foot-left' : 'foot-right';
    leg.position.set(side * 0.095, 0, -0.01);
    leg.add(mesh('leg', new THREE.CapsuleGeometry(0.06, 0.2, 4, 10), mat(C.skin), 0, 0.29, 0));
    leg.add(mesh('shoe', new THREE.BoxGeometry(0.12, 0.08, 0.21), mat(C.shoe, 0.5), 0, 0.06, -0.03));
    leg.add(mesh('sole', new THREE.BoxGeometry(0.125, 0.03, 0.22), mat(C.sole, 0.6), 0, 0.015, -0.03));
    leg.add(mesh('shoe-strap', new THREE.BoxGeometry(0.122, 0.02, 0.06), mat(C.sole, 0.6), 0, 0.085, -0.05));
    root.add(leg);
  }

  // ---- 短裤（蓝条纹；随体型加宽）----
  root.add(mesh('shorts-hip', new THREE.BoxGeometry(0.33, 0.14, 0.23), mat(C.shorts), 0, 0.5, 0));
  for (const side of [-1, 1]) {
    root.add(
      mesh(
        side < 0 ? 'shorts-cuff-left' : 'shorts-cuff-right',
        new THREE.CylinderGeometry(0.095, 0.1, 0.12, 12),
        mat(C.shorts),
        side * 0.095,
        0.42,
        0
      )
    );
    root.add(
      mesh(
        'shorts-stripe',
        new THREE.CylinderGeometry(0.098, 0.098, 0.025, 12),
        mat(C.shortsStripe),
        side * 0.095,
        0.44,
        0
      )
    );
  }

  // ---- 躯干（粉色连帽卫衣；桶状圆润）----
  root.add(mesh('torso', new THREE.CapsuleGeometry(0.175, 0.18, 4, 14), mat(C.hoodie), 0, 0.72, 0));
  root.add(mesh('hoodie-hem', new THREE.CylinderGeometry(0.18, 0.185, 0.06, 14), mat(C.hoodieDark), 0, 0.585, 0));
  root.add(ball('hood', C.hoodieDark, 0.105, 0, 0.9, 0.14, 1.35, 0.8, 0.9, 12));
  root.add(mesh('hoodie-pocket', new THREE.BoxGeometry(0.17, 0.09, 0.03), mat(C.hoodieDark), 0, 0.63, -0.17));
  buildBadge(root);

  // ---- 手臂组（长袖加粗）----
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'arm-left' : 'arm-right';
    arm.position.set(side * 0.245, 0.68, 0);
    arm.add(mesh('sleeve', new THREE.CapsuleGeometry(0.058, 0.15, 4, 10), mat(C.hoodie), 0, -0.04, 0));
    arm.add(mesh('cuff', new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), mat(C.hoodieDark), 0, -0.125, 0));
    arm.add(ball('hand', C.skin, 0.05, 0, -0.155, 0, 1, 1, 1, 10));
    root.add(arm);
  }

  // ---- 背包 ----
  const backpackAnchor = buildBackpack(root);

  // ---- 头部（颈部枢轴组；宽脸圆润）----
  const neckY = 0.95;
  const head = new THREE.Group();
  head.name = 'nikori-head-pivot';
  head.position.y = neckY;
  root.add(head);

  root.add(mesh('neck', new THREE.CylinderGeometry(0.05, 0.055, 0.08, 10), mat(C.skin), 0, 0.93, 0));

  const headR = 0.29;
  const cy = 1.24 - neckY; // 头心局部高度
  head.add(ball('head', C.skin, headR, 0, cy, 0, 1.05, 1.0, 0.98, 22));

  buildHair(head, cy, headR);
  buildFace(head, cy);

  // ---- 手部挂点（右手，持刨冰武器）----
  const hand = new THREE.Group();
  hand.name = 'nikori-hand-socket';
  hand.position.set(0.25, 0.52, -0.05);
  root.add(hand);

  root.userData = {
    character: 'nikori',
    sockets: { head, hand, backpack: backpackAnchor },
    collider: { type: 'sphere', radius: 0.45 },
  };
  return root;
}
