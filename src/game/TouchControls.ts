import type { Input } from './Input';

/** 摇杆最大拖动半径（像素），超出按比例裁到这个圆上 */
const STICK_RADIUS = 46;
/** 摇杆死区：小于这个比例视为不动，防止手指轻微抖动触发移动 */
const DEAD_ZONE = 0.25;
/** 拖拽视角每像素对应的"鼠标位移"增益；与 movementX 同单位，先取 1，实机手感由用户再调 */
const LOOK_GAIN = 1;

/**
 * 触屏虚拟操作层：左半屏落指生成浮动摇杆（移动），右半屏拖拽转视角，
 * 底部按钮开火/跳跃/潜行，右上角按钮相当于桌面端的 ESC（释放操作、回到菜单）。
 * 只做"手势 → Input 状态"的翻译，不知道游戏规则；按 touch identifier 分别跟踪，
 * 移动摇杆和视角拖拽可以两根手指同时进行。
 */
export class TouchControls {
  /** 该设备是否该展示触屏控件：主输入是粗指针（触屏/触控笔），有精确鼠标的设备不显示 */
  static get supported(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  /** 用户点了右上角菜单按钮：main.ts 据此和桌面端"释放指针锁定"走同一套覆盖层逻辑 */
  onRelease?: () => void;

  private root = document.getElementById('touch-controls')!;
  private surface = document.getElementById('touch-surface')!;
  private stickBase = document.getElementById('touch-stick-base')!;
  private stick = document.getElementById('touch-stick')!;

  private moveId: number | null = null;
  private moveOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private squidOn = false;

  constructor(private input: Input) {
    this.surface.addEventListener('touchstart', this.onSurfaceStart, { passive: false });
    this.surface.addEventListener('touchmove', this.onSurfaceMove, { passive: false });
    this.surface.addEventListener('touchend', this.onSurfaceEnd, { passive: false });
    this.surface.addEventListener('touchcancel', this.onSurfaceEnd, { passive: false });

    // 开火 / 跳跃：按住有效，松手即停，和键鼠语义一致
    this.bindHold('touch-fire', (down) => (this.input.firing = down));
    this.bindHold('touch-jump', (down) => this.input.setTouchKey('Space', down));
    // 潜行：做成切换而不是按住——人形态才能开火，潜行时按住开火键没有意义，
    // 但右手拇指要同时"按住潜行"又要点开火又不方便，切换按钮更符合单手操作
    this.bindToggle('touch-squid', (down) => this.input.setTouchKey('ShiftLeft', down));

    document.getElementById('touch-menu')!.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
        this.onRelease?.();
      },
      { passive: false }
    );
  }

  show() {
    this.root.classList.remove('hidden');
  }

  /** 隐藏并清空所有虚拟按键状态，避免手指还按着但控件已经消失导致"卡键" */
  hide() {
    this.root.classList.add('hidden');
    this.resetMove();
    this.lookId = null;
    this.input.firing = false;
    this.input.setTouchKey('Space', false);
    this.input.setTouchKey('ShiftLeft', false);
    this.squidOn = false;
    document.getElementById('touch-squid')!.classList.remove('pressed');
  }

  /** 按住生效、松手即停的按钮（开火/跳跃） */
  private bindHold(id: string, onChange: (down: boolean) => void) {
    const el = document.getElementById(id)!;
    const set = (down: boolean) => {
      el.classList.toggle('pressed', down);
      onChange(down);
    };
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); set(true); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); set(false); }, { passive: false });
    el.addEventListener('touchcancel', (e) => { e.preventDefault(); e.stopPropagation(); set(false); }, { passive: false });
  }

  /** 每次点按切换一次状态的按钮（潜行） */
  private bindToggle(id: string, onChange: (down: boolean) => void) {
    const el = document.getElementById(id)!;
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.squidOn = !this.squidOn;
        el.classList.toggle('pressed', this.squidOn);
        onChange(this.squidOn);
      },
      { passive: false }
    );
  }

  private resetMove() {
    this.stickBase.classList.add('hidden');
    this.moveId = null;
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.input.setTouchKey(code, false);
  }

  /** 落指分派：左半屏没占用就当摇杆起点，否则（右半屏或摇杆已被占）当视角拖拽起点 */
  private onSurfaceStart = (e: TouchEvent) => {
    e.preventDefault();
    const half = this.surface.clientWidth / 2;
    for (const t of Array.from(e.changedTouches)) {
      if (this.moveId === null && t.clientX < half) {
        this.moveId = t.identifier;
        this.moveOrigin = { x: t.clientX, y: t.clientY };
        this.stickBase.classList.remove('hidden');
        this.stickBase.style.left = `${t.clientX}px`;
        this.stickBase.style.top = `${t.clientY}px`;
        this.stick.style.left = `${t.clientX}px`;
        this.stick.style.top = `${t.clientY}px`;
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
      // 摇杆和视角都已被占用时，多出来的手指（比如托底的手掌）直接忽略
    }
  };

  private onSurfaceMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveId) {
        let dx = t.clientX - this.moveOrigin.x;
        let dy = t.clientY - this.moveOrigin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > STICK_RADIUS) {
          dx = (dx / dist) * STICK_RADIUS;
          dy = (dy / dist) * STICK_RADIUS;
        }
        this.stick.style.left = `${this.moveOrigin.x + dx}px`;
        this.stick.style.top = `${this.moveOrigin.y + dy}px`;

        const nx = dx / STICK_RADIUS;
        const ny = dy / STICK_RADIUS;
        this.input.setTouchKey('KeyD', nx > DEAD_ZONE);
        this.input.setTouchKey('KeyA', nx < -DEAD_ZONE);
        this.input.setTouchKey('KeyS', ny > DEAD_ZONE);
        this.input.setTouchKey('KeyW', ny < -DEAD_ZONE);
      } else if (t.identifier === this.lookId) {
        const dx = t.clientX - this.lookLast.x;
        const dy = t.clientY - this.lookLast.y;
        this.lookLast = { x: t.clientX, y: t.clientY };
        this.input.addLookDelta(dx * LOOK_GAIN, dy * LOOK_GAIN);
      }
    }
  };

  private onSurfaceEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveId) this.resetMove();
      else if (t.identifier === this.lookId) this.lookId = null;
    }
  };
}
