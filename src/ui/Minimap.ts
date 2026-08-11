import * as THREE from 'three';
import { ARENA_HALF, OBSTACLES } from '../game/SceneManager';

const SIZE = 160;

/**
 * 小地图：直接把 InkSystem 的涂地离屏 Canvas 缩放绘制到 HUD 角落，
 * 再叠加玩家（带朝向三角）与机器人的位置标记。
 */
export class Minimap {
  private canvas = document.getElementById('minimap') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;

  update(
    inkCanvas: HTMLCanvasElement,
    playerPos: THREE.Vector3,
    playerYaw: number,
    playerColor: string,
    botPos: THREE.Vector3,
    botAlive: boolean,
    botColor: string
  ) {
    const ctx = this.ctx;
    ctx.drawImage(inkCanvas, 0, 0, inkCanvas.width, inkCanvas.height, 0, 0, SIZE, SIZE);

    // 障碍物轮廓
    const s = SIZE / (ARENA_HALF * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    for (const o of OBSTACLES) {
      const x = (o.cx - o.hx + ARENA_HALF) * s;
      const y = (o.cz - o.hz + ARENA_HALF) * s;
      ctx.fillRect(x, y, o.hx * 2 * s, o.hz * 2 * s);
      ctx.strokeRect(x, y, o.hx * 2 * s, o.hz * 2 * s);
    }

    if (botAlive) this.drawDot(botPos, botColor);
    this.drawArrow(playerPos, playerYaw, playerColor);
  }

  private toMap(pos: THREE.Vector3): { x: number; y: number } {
    const s = SIZE / (ARENA_HALF * 2);
    return { x: (pos.x + ARENA_HALF) * s, y: (pos.z + ARENA_HALF) * s };
  }

  private drawDot(pos: THREE.Vector3, color: string) {
    const { x, y } = this.toMap(pos);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  /** 玩家标记：指向朝向的三角箭头 */
  private drawArrow(pos: THREE.Vector3, yaw: number, color: string) {
    const { x, y } = this.toMap(pos);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    // yaw=0 时面向世界 -Z，即地图上方
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }
}
