import * as THREE from 'three';
import { CHIIKAWA_FACTORIES, ChiikawaCharacter } from './models/chiikawa';
import { WEAPON_FACTORIES, attachWeapon } from './models/weapons';

/** 展示台武器墨色（贴近参考图配色） */
const SHOWCASE_INK: Record<ChiikawaCharacter, string> = {
  chiikawa: '#58C24A',
  hachiware: '#4A90D9',
  usagi: '#69C25A',
  shisa: '#4AC2B8',
  nikori: '#F04C93',
  onizaru: '#F2C230',
  doro: '#9B6BD8',
};

/**
 * 角色模型展示台：在玩家出生点后方（z=22）陈列生成的角色，
 * 缓慢自转便于全方位查看。纯展示，无碰撞、不参与玩法。
 */
export class ModelShowcase {
  private turntables: THREE.Group[] = [];
  private pedestalMats = new Map<ChiikawaCharacter, THREE.MeshStandardMaterial>();

  constructor(scene: THREE.Scene) {
    const lineup: ChiikawaCharacter[] = ['chiikawa', 'hachiware', 'nikori', 'doro', 'onizaru', 'usagi', 'shisa'];

    lineup.forEach((key, i) => {
      const x = (i - (lineup.length - 1) / 2) * 2.8;
      // 每台座独立材质，供选中发光
      const pedestalMat = new THREE.MeshStandardMaterial({
        color: 0x4d4968,
        roughness: 0.8,
        emissive: 0x000000,
      });
      this.pedestalMats.set(key, pedestalMat);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 0.3, 24), pedestalMat);
      pedestal.position.set(x, 0.15, 22);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      scene.add(pedestal);

      const turntable = new THREE.Group();
      turntable.position.set(x, 0.3, 22);
      const model = CHIIKAWA_FACTORIES[key]();
      attachWeapon(model, WEAPON_FACTORIES[key](SHOWCASE_INK[key]));
      turntable.add(model);
      scene.add(turntable);
      this.turntables.push(turntable);
    });
  }

  /** 被选中角色的台座按队伍色发光（未选中的熄灭） */
  setHighlights(selection: Partial<Record<ChiikawaCharacter, string>>) {
    for (const [key, m] of this.pedestalMats) {
      const color = selection[key];
      if (color) {
        m.emissive.set(color);
        m.emissiveIntensity = 0.55;
      } else {
        m.emissiveIntensity = 0;
      }
    }
  }

  update(dt: number) {
    for (const t of this.turntables) t.rotation.y += dt * 0.5;
  }
}
