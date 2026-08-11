import * as THREE from 'three';

interface RestPose {
  pos: THREE.Vector3;
  rot: THREE.Euler;
}

/**
 * 程序化步行动画器：驱动 Q 版角色的命名部件做步行循环，消除"滑行感"。
 * - 脚（foot-left/right）：前后交替摆 + 抬脚
 * - 手（arm-left/right）：与同侧脚反向摆
 * - 身体（model 根）：垂直颠簸 + 左右摇摆（waddle）
 * - 头（sockets.head）：随步伐微点头；耳朵（ear-left/right）甩动
 * - 静止：轻微呼吸起伏；离地：双脚收起；潜墨移动：快速左右摆尾
 * 所有偏移都以构造时记录的 rest 姿态为基准、按 blend 权重叠加，
 * 停止移动时自然滑回原位，不会累积漂移。
 */
export class CharacterAnimator {
  private phase = 0;
  private blend = 0;
  private idleT = 0;
  private rest = new Map<THREE.Object3D, RestPose>();

  private footL?: THREE.Object3D;
  private footR?: THREE.Object3D;
  private armL?: THREE.Object3D;
  private armR?: THREE.Object3D;
  private earL?: THREE.Object3D;
  private earR?: THREE.Object3D;
  private head?: THREE.Object3D;

  constructor(private model: THREE.Group) {
    const grab = (name: string): THREE.Object3D | undefined => {
      const obj = model.getObjectByName(name);
      if (obj) this.rest.set(obj, { pos: obj.position.clone(), rot: obj.rotation.clone() });
      return obj;
    };
    this.footL = grab('foot-left');
    this.footR = grab('foot-right');
    this.armL = grab('arm-left');
    this.armR = grab('arm-right');
    this.earL = grab('ear-left');
    this.earR = grab('ear-right');

    const head = model.userData.sockets?.head as THREE.Object3D | undefined;
    if (head) {
      this.head = head;
      this.rest.set(head, { pos: head.position.clone(), rot: head.rotation.clone() });
    }
    this.rest.set(model, { pos: model.position.clone(), rot: model.rotation.clone() });
  }

  update(dt: number, o: { speed: number; grounded: boolean; swimming?: boolean }) {
    this.idleT += dt;
    const moving = o.speed > 0.1;
    const walking = moving && o.grounded && !o.swimming;

    this.blend += ((walking ? 1 : 0) - this.blend) * Math.min(1, dt * 10);
    if (walking) {
      const freq = 1.6 + (o.speed / 8) * 1.2; // 步频随移速
      this.phase += dt * Math.PI * 2 * freq;
    }

    const b = this.blend;
    const s = Math.sin(this.phase);
    const lift = (ph: number) => Math.max(0, Math.sin(ph));

    // 脚：前后交替 + 抬脚
    this.setOffset(this.footL, { z: s * 0.14 * b, y: lift(this.phase) * 0.07 * b });
    this.setOffset(this.footR, { z: -s * 0.14 * b, y: lift(this.phase + Math.PI) * 0.07 * b });
    // 手：与同侧脚反向摆
    this.setOffset(this.armL, { z: -s * 0.1 * b });
    this.setOffset(this.armR, { z: s * 0.1 * b });

    // 离地：双脚收起
    if (!o.grounded && !o.swimming) {
      this.setOffset(this.footL, { y: 0.08 });
      this.setOffset(this.footR, { y: 0.08 });
    }

    // 身体：颠簸 + 摇摆；潜墨移动时改为快速摆尾
    const modelRest = this.rest.get(this.model)!;
    this.model.position.y = modelRest.pos.y + Math.abs(s) * 0.045 * b;
    let roll = s * 0.07 * b;
    if (o.swimming && moving) roll = Math.sin(this.idleT * 12) * 0.09;
    this.model.rotation.z = modelRest.rot.z + roll;

    // 头部微点头（每步两次）
    if (this.head) {
      const hr = this.rest.get(this.head)!;
      this.head.rotation.x = hr.rot.x + Math.sin(this.phase * 2) * 0.05 * b;
    }
    // 耳朵甩动
    for (const [ear, dir] of [
      [this.earL, 1],
      [this.earR, -1],
    ] as const) {
      if (!ear) continue;
      const er = this.rest.get(ear)!;
      ear.rotation.z = er.rot.z + dir * s * 0.06 * b;
    }

    // 待机呼吸
    if (b < 0.05 && o.grounded && !o.swimming) {
      this.model.position.y = modelRest.pos.y + Math.sin(this.idleT * 2.2) * 0.012;
    }
  }

  /** 恢复全部 rest 姿态（重生/重开时调用） */
  reset() {
    for (const [obj, r] of this.rest) {
      obj.position.copy(r.pos);
      obj.rotation.copy(r.rot);
    }
    this.phase = 0;
    this.blend = 0;
  }

  private setOffset(
    obj: THREE.Object3D | undefined,
    off: { x?: number; y?: number; z?: number }
  ) {
    if (!obj) return;
    const r = this.rest.get(obj)!;
    obj.position.set(r.pos.x + (off.x ?? 0), r.pos.y + (off.y ?? 0), r.pos.z + (off.z ?? 0));
  }
}
