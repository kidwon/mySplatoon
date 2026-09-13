/**
 * 集中管理键盘 / 鼠标 / 触屏输入状态。
 * 鼠标视角依赖 Pointer Lock：锁定后累计 movementX/Y 供相机消费。
 * 触屏没有指针锁定这回事：TouchControls 通过 setTouchKey / addLookDelta
 * 把手势转成和键鼠一样的状态，游戏逻辑（PlayerController）完全不用区分来源。
 */
export class Input {
  private keys = new Set<string>();
  /** 触屏虚拟按键（摇杆方向 / 跳跃 / 潜行按钮），与 keys 同名空间，isDown 两边都查 */
  private touchKeys = new Set<string>();

  /** 本帧累计的鼠标位移（消费后清零） */
  mouseDX = 0;
  mouseDY = 0;

  /** 左键是否按住（触屏开火按钮也直接写这个字段） */
  firing = false;

  /** 鼠标是否已锁定到画布 */
  pointerLocked = false;
  /** 触屏是否已"进入战场"（对应桌面端指针锁定，由 main.ts 在点击进入覆盖层时置位） */
  touchActive = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      // 防止 Space 滚动页面 / Shift+WASD 触发浏览器行为
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // 失焦时清空，避免按键“卡住”
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.firing = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.pointerLocked) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) this.firing = false;
    });
  }

  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  /** 是否处于"操作中"：桌面指针锁定，或触屏已进入战场 */
  get engaged() {
    return this.pointerLocked || this.touchActive;
  }

  /** 触屏虚拟按键按下/松开，复用与键盘相同的 code（'KeyW' / 'Space' / 'ShiftLeft' …） */
  setTouchKey(code: string, down: boolean) {
    if (down) this.touchKeys.add(code);
    else this.touchKeys.delete(code);
  }

  /** 触屏拖拽视角：与鼠标累积到同一对字段，不依赖指针锁定 */
  addLookDelta(dx: number, dy: number) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  isDown(code: string): boolean {
    return this.keys.has(code) || this.touchKeys.has(code);
  }

  get moveForward() {
    return this.isDown('KeyW');
  }
  get moveBackward() {
    return this.isDown('KeyS');
  }
  get moveLeft() {
    return this.isDown('KeyA');
  }
  get moveRight() {
    return this.isDown('KeyD');
  }
  get jump() {
    return this.isDown('Space');
  }
  get squid() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  /** 每帧结束后调用，清空累计的鼠标位移 */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
