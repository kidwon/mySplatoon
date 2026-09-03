import * as THREE from 'three';
import { CharacterAvatar } from '../game/CharacterAvatar';
import { CHARACTER_DEFS, CHARACTER_KEYS } from '../game/models/characters';
import type { ChiikawaCharacter } from '../game/models/chiikawa';

/**
 * 角色选择页：独立的 THREE.Scene（暗色影棚 + 台座 + 队伍色光环），
 * 复用主渲染器全屏渲染。预览用 CharacterAvatar（含围巾与专属武器），
 * 待机呼吸动画 + 自动旋转，可拖拽手动旋转。
 * UI（页签/箭头/确认）在 main.ts 接线，这里只管 3D。
 */
export class CharacterSelect {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** 是否处于选择页（主循环据此切换渲染目标） */
  active = false;
  side: 'player' | 'enemy' = 'player';
  previewKey: ChiikawaCharacter = 'hachiware';

  private turntable = new THREE.Group();
  private avatar: CharacterAvatar | null = null;
  private ringMat: THREE.MeshStandardMaterial;
  private color = '#9B51E0';
  private dragging = false;

  constructor() {
    this.scene.background = new THREE.Color(0x141220);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      50
    );
    this.camera.position.set(0, 1.35, 3.4);
    this.camera.lookAt(0, 0.85, 0);

    // 影棚灯光：环境 + 主光 + 冷色轮廓光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.4);
    key.position.set(2, 3, 2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8899ff, 0.6);
    rim.position.set(-2, 2, -3);
    this.scene.add(rim);

    // 台座 + 队伍色光环
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.5, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0x262238, roughness: 0.9 })
    );
    floor.position.y = -0.04;
    this.scene.add(floor);

    this.ringMat = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.color,
      emissiveIntensity: 0.8,
      roughness: 0.4,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 8, 48), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    this.scene.add(ring);

    this.scene.add(this.turntable);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  open(side: 'player' | 'enemy', key: ChiikawaCharacter, colorHex: string) {
    this.active = true;
    this.side = side;
    this.setPreview(key, colorHex);
  }

  close() {
    this.active = false;
  }

  /** 切换预览角色（重建 avatar，围巾/武器用当前侧的队伍色） */
  setPreview(key: ChiikawaCharacter, colorHex: string) {
    this.previewKey = key;
    this.color = colorHex;
    if (this.avatar) this.turntable.remove(this.avatar.group);
    this.avatar = new CharacterAvatar(CHARACTER_DEFS[key], colorHex);
    this.turntable.add(this.avatar.group);
    this.turntable.rotation.y = 0.35; // 开场微侧身，轮廓更立体
    this.ringMat.color.set(colorHex);
    this.ringMat.emissive.set(colorHex);
  }

  /** 左右循环切换 */
  cycle(dir: 1 | -1) {
    const idx = CHARACTER_KEYS.indexOf(this.previewKey);
    const next = CHARACTER_KEYS[(idx + dir + CHARACTER_KEYS.length) % CHARACTER_KEYS.length];
    this.setPreview(next, this.color);
  }

  /** 拖拽旋转 */
  rotateBy(deltaX: number) {
    this.turntable.rotation.y += deltaX;
  }

  setDragging(on: boolean) {
    this.dragging = on;
  }

  update(dt: number) {
    if (!this.dragging) this.turntable.rotation.y += dt * 0.55;
    // 待机呼吸
    this.avatar?.animate(dt, { speed: 0, grounded: true });
  }
}
