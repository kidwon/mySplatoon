import * as THREE from 'three';

/**
 * ドロ（Doro / 多萝）— 依据 img2threejs 参考图（Musan Pro meme 重构图）生成。
 * 白色圆润身体 + 粉色波波头（左侧螺旋丸子）+ 金芯紫蝴蝶结 + 卡哇伊脸。
 *
 * 造型基调（v2，按原画而非ちいかわ Q 版）：不是"大头 + 小身子"，
 * 而是头与身体融成一坨连续的白色圆润块（上窄下宽的梨形），
 * 四肢是短到几乎看不见的小凸起；头盔式波波头压得很低、
 * 发梢在脸颊高度平切外翘；脸位置低、占比小，
 * 大竖椭圆紫眼（上大下小双高光）+ ω 小嘴 + 眼外侧腮红。
 *
 * 双形态（本作首个乌贼形态替代模型）：
 *   - humanForm『doro-human』：直立二头身（参考图中央 schematic）
 *   - squidForm『doro-quad』：四脚着地 + 背部小白翼（参考图左上 meme 原姿势）
 *   两个形态同挂在 root 下，squidForm 默认隐藏；
 *   CharacterAvatar.setSquid 检测 userData.humanForm/squidForm 后切换可见性
 *   （代替默认的整体压扁）。发型与脸由共用 builder 按缩放系数生成两份。
 *
 * 层级：
 *   root（脚底原点，面朝 -Z）
 *   ├─ humanForm
 *   │   ├─ foot-left/right、arm-left/right（步行动画驱动）
 *   │   ├─ 躯干 / handSocket（持蝴蝶结喷射枪）
 *   │   └─ headGroup（颈部枢轴）→ 头 / 发型 / 蝴蝶结 / 脸
 *   └─ squidForm（四脚 + 头 + 发型 + 翼，隐藏）
 * root.userData: { character, sockets: { head, hand }, collider, humanForm, squidForm }
 *
 * 脸部构造原则：全部实体体积，不用球面 phi/theta 补丁。
 * 版权注意：Doro 为 NIKKE 衍生 meme 角色，仅供私人使用，
 * 公开部署前需替换（见 TECH_NOTES 路线图）。
 */

const C = {
  body: '#F7F4F0',
  hair: '#F2A0B8',
  hairDeep: '#E289A6',
  bow: '#8C6BC8',
  bowCore: '#E8C24A',
  iris: '#7E6BB5',
  pupil: '#3A3352',
  white: '#FFFFFF',
  blush: '#F5B8C4',
  mouth: '#6B4A55',
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

/**
 * 粉色波波头 + 左侧螺旋丸子 + 金芯紫蝴蝶结（共用 builder）。
 * parent 为头组，cy 为头心局部高度，s 为整体缩放（四脚形态用略小值）。
 */
function buildHair(parent: THREE.Group, cy: number, s: number) {
  const R = 0.33 * s; // 头半径基准（发型贴着头壳）

  // 头盔式发帽：包住整个头顶与后脑，压得低
  parent.add(ball('hair-cap', C.hair, R * 1.06, 0, cy + 0.035 * s, 0.03 * s, 1.02, 0.94, 1.0, 22));
  // 刘海：一排低垂扁球横过额头，直切齐刘海（压到眼睛上缘）
  const bangXs = [-0.235, -0.14, -0.045, 0.045, 0.14, 0.235];
  bangXs.forEach((bx, i) => {
    const dip = Math.abs(bx) < 0.1 ? 0.015 : 0; // 中间两撮略低
    parent.add(
      ball(`bang-${i}`, C.hair, 0.075 * s, bx * s, cy + (0.115 - dip) * s, -0.245 * s, 1.05, 1.5, 0.7, 12)
    );
  });
  // 发梢：脸颊高度一圈平切外翘的波波头下摆（前脸留空）
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    // 跳过正前方（留出脸）
    if (Math.cos(a) < -0.55 && Math.abs(Math.sin(a)) < 0.75) continue;
    const tip = ball(
      'hair-tip',
      C.hair,
      0.085 * s,
      Math.sin(a) * R * 1.02,
      cy - 0.10 * s,
      Math.cos(a) * R * 1.02,
      1.0,
      1.15,
      0.75,
      10
    );
    tip.rotation.y = a;
    tip.rotation.x = -0.18; // 发梢外翘
    parent.add(tip);
  }

  // 左侧螺旋丸子（角色左 = -X）：球 + 表面深粉螺旋环
  const bunX = -0.315 * s;
  const bunY = cy + 0.145 * s;
  const bunZ = 0.075 * s;
  parent.add(ball('bun', C.hair, 0.125 * s, bunX, bunY, bunZ, 1, 1, 1, 16));
  const spiral = mesh(
    'bun-spiral',
    new THREE.TorusGeometry(0.082 * s, 0.026 * s, 8, 20),
    mat(C.hairDeep, 0.45),
    bunX - 0.055 * s,
    bunY,
    bunZ
  );
  spiral.rotation.y = Math.PI / 2 - 0.35;
  spiral.rotation.x = -0.25;
  parent.add(spiral);
  // 紫蝴蝶结（丸子前下方）：双侧扁球结 + 金色芯 + 两条小垂带
  const bowX = bunX - 0.02 * s;
  const bowY = bunY - 0.115 * s;
  const bowZ = bunZ - 0.06 * s;
  for (const side of [-1, 1]) {
    const loop = ball('bow-loop', C.bow, 0.055 * s, bowX, bowY + side * 0.05 * s, bowZ + side * 0.012 * s, 0.7, 1.5, 0.75, 12);
    loop.rotation.x = side * 0.45;
    parent.add(loop);
  }
  parent.add(ball('bow-core', C.bowCore, 0.03 * s, bowX - 0.012 * s, bowY, bowZ, 1, 1, 0.9, 10));
  for (const side of [-1, 1]) {
    parent.add(ball('bow-tail', C.bow, 0.028 * s, bowX - 0.005 * s, bowY - 0.075 * s, bowZ + side * 0.03 * s, 0.6, 1.7, 0.55, 10));
  }
}

/**
 * 卡哇伊脸（共用 builder，按原画）：位置偏低、占比小，
 * 大竖椭圆紫眼（上大下小双高光）+ 眼外侧腮红 + ω 小嘴。
 */
function buildFace(parent: THREE.Group, cy: number, s: number) {
  const fz = -0.30 * s; // 脸壳表面深度
  const ey = cy - 0.015 * s; // 眼睛高度（低于头心）
  for (const side of [-1, 1]) {
    // 大竖椭圆眼（深紫瞳体，直接当整只眼）
    parent.add(ball(side < 0 ? 'eye-left' : 'eye-right', C.iris, 0.072 * s, side * 0.135 * s, ey, fz + 0.005 * s, 0.85, 1.35, 0.45, 16));
    parent.add(ball(side < 0 ? 'pupil-left' : 'pupil-right', C.pupil, 0.05 * s, side * 0.135 * s, ey - 0.012 * s, fz - 0.012 * s, 0.85, 1.2, 0.4, 12));
    // 双高光：上方大、下方小
    parent.add(ball('eye-glint-hi', C.white, 0.024 * s, side * 0.135 * s - 0.022 * s, ey + 0.045 * s, fz - 0.026 * s, 1, 1.1, 0.5, 10));
    parent.add(ball('eye-glint-lo', C.white, 0.013 * s, side * 0.135 * s + 0.026 * s, ey - 0.055 * s, fz - 0.024 * s, 1, 1, 0.5, 8));
    // 腮红：眼外侧、略低
    parent.add(ball('blush', C.blush, 0.05 * s, side * 0.235 * s, ey - 0.06 * s, fz + 0.045 * s, 1.25, 0.7, 0.45, 12));
  }
  // ω 小嘴：两个小峰拼出猫嘴
  for (const side of [-1, 1]) {
    const arc = ball('mouth-arc', C.mouth, 0.019 * s, side * 0.022 * s, cy - 0.115 * s, fz - 0.004 * s, 1.15, 0.75, 0.4, 8);
    arc.rotation.z = side * 0.5;
    parent.add(arc);
  }
}

/** 直立二头身形态（参考图中央 schematic） */
function buildHumanForm(): { form: THREE.Group; head: THREE.Group; hand: THREE.Group } {
  const form = new THREE.Group();
  form.name = 'doro-human';

  // 脚：短到几乎陷在身体里的小凸起（仍用动画器契约名，走路时微微交替）
  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    foot.name = side < 0 ? 'foot-left' : 'foot-right';
    foot.position.set(side * 0.13, 0, -0.02);
    foot.add(ball('foot', C.body, 0.085, 0, 0.07, 0, 1, 0.85, 1.25, 12));
    form.add(foot);
  }

  // 躯干：上窄下宽的梨形白块（与头融成一坨，无脖子）
  form.add(ball('torso', C.body, 0.34, 0, 0.42, 0, 1.02, 1.0, 0.95, 24));
  form.add(ball('torso-bottom', C.body, 0.3, 0, 0.28, 0.01, 1.12, 0.82, 1.05, 20));

  // 手：贴在身侧的小凸起（原画几乎看不见的短手）
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'arm-left' : 'arm-right';
    arm.position.set(side * 0.3, 0.48, 0);
    arm.add(ball('hand', C.body, 0.09, 0, -0.02, 0, 0.85, 1.05, 1.0, 12));
    form.add(arm);
  }

  // 头组（枢轴；头底深深压进身体，读作同一坨）
  const neckY = 0.62;
  const head = new THREE.Group();
  head.name = 'doro-head-pivot';
  head.position.y = neckY;
  form.add(head);

  const cy = 0.86 - neckY;
  head.add(ball('head', C.body, 0.33, 0, cy, 0, 1.03, 0.98, 0.97, 24));
  buildHair(head, cy, 1);
  buildFace(head, cy, 1);

  // 手部挂点（右手，持蝴蝶结喷射枪）
  const hand = new THREE.Group();
  hand.name = 'doro-hand-socket';
  hand.position.set(0.33, 0.44, -0.1);
  form.add(hand);

  return { form, head, hand };
}

/** 四脚着地形态（参考图左上 meme 原姿势；乌贼模式显示） */
function buildQuadForm(): THREE.Group {
  const form = new THREE.Group();
  form.name = 'doro-quad';
  form.visible = false;

  // 身体：与站立形态同一坨白块，只是横趴下来（屁股朝 +Z）
  form.add(ball('quad-body', C.body, 0.28, 0, 0.3, 0.16, 1.02, 0.95, 1.2, 22));

  // 四只小短腿（几乎陷在身体里的凸起）
  const legPos: [number, number][] = [
    [-0.16, -0.05],
    [0.16, -0.05],
    [-0.17, 0.34],
    [0.17, 0.34],
  ];
  legPos.forEach(([x, z], i) => {
    form.add(ball(`quad-leg-${i}`, C.body, 0.085, x, 0.09, z, 0.95, 0.9, 1.15, 12));
  });

  // 头（前方，与身体融在一起）：同款发型 + 脸
  const head = new THREE.Group();
  head.name = 'quad-head';
  head.position.set(0, 0.36, -0.22);
  form.add(head);
  head.add(ball('head', C.body, 0.31, 0, 0, 0, 1.02, 0.97, 0.96, 22));
  buildHair(head, 0, 0.94);
  buildFace(head, 0, 0.94);

  // 背部小白翼（meme 图的 wing-like structure）：每侧三片羽状扁球
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'quad-wing-left' : 'quad-wing-right';
    wing.position.set(side * 0.12, 0.44, 0.18);
    for (let i = 0; i < 3; i++) {
      const f = ball(`feather-${i}`, C.white, 0.06 - i * 0.011, side * (0.05 + i * 0.06), 0.03 + i * 0.04, 0.02 * i, 0.5, 1.5, 0.9, 10);
      f.rotation.z = -side * (0.5 + i * 0.3);
      wing.add(f);
    }
    form.add(wing);
  }

  return form;
}

/** ドロ模型工厂（双形态：直立 + 四脚乌贼替代形态） */
export function createDoroModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'doro';

  const { form: humanForm, head, hand } = buildHumanForm();
  const squidForm = buildQuadForm();
  root.add(humanForm);
  root.add(squidForm);

  root.userData = {
    character: 'doro',
    sockets: { head, hand },
    collider: { type: 'sphere', radius: 0.48 },
    humanForm,
    squidForm,
  };
  return root;
}
