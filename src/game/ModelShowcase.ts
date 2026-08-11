import * as THREE from 'three';
import { CHIIKAWA_FACTORIES, ChiikawaCharacter } from './models/chiikawa';

/**
 * 角色模型展示台：在玩家出生点后方（z=22）陈列生成的角色，
 * 缓慢自转便于全方位查看。纯展示，无碰撞、不参与玩法。
 */
export class ModelShowcase {
  private turntables: THREE.Group[] = [];

  constructor(scene: THREE.Scene) {
    const lineup: ChiikawaCharacter[] = ['chiikawa', 'hachiware', 'usagi', 'shisa'];
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x4d4968, roughness: 0.8 });

    lineup.forEach((key, i) => {
      const x = (i - 1.5) * 2.8;
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 0.3, 24), pedestalMat);
      pedestal.position.set(x, 0.15, 22);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      scene.add(pedestal);

      const turntable = new THREE.Group();
      turntable.position.set(x, 0.3, 22);
      const model = CHIIKAWA_FACTORIES[key]();
      turntable.add(model);
      scene.add(turntable);
      this.turntables.push(turntable);
    });
  }

  update(dt: number) {
    for (const t of this.turntables) t.rotation.y += dt * 0.5;
  }
}
