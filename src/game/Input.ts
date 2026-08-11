/**
 * 集中管理键盘 / 鼠标输入状态。
 * 鼠标视角依赖 Pointer Lock：锁定后累计 movementX/Y 供相机消费。
 */
export class Input {
  private keys = new Set<string>();

  /** 本帧累计的鼠标位移（消费后清零） */
  mouseDX = 0;
  mouseDY = 0;

  /** 左键是否按住 */
  firing = false;

  /** 鼠标是否已锁定到画布 */
  pointerLocked = false;

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

  isDown(code: string): boolean {
    return this.keys.has(code);
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
