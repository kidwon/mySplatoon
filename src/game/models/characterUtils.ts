import * as THREE from 'three';

/**
 * 把角色模型的共享材质克隆为本实例专属（保持实例内共享关系），
 * 并预置白色 emissive（intensity 0）供受击闪白使用。
 * 返回克隆后的材质列表。
 */
export function instantiateMaterials(model: THREE.Group): THREE.MeshStandardMaterial[] {
  const cloneMap = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      let clone = cloneMap.get(obj.material);
      if (!clone) {
        clone = obj.material.clone();
        clone.emissive = new THREE.Color(0xffffff);
        clone.emissiveIntensity = 0;
        // 预置 transparent：运行时只改 opacity（纯 uniform）即可淡出。
        // 运行时切换 transparent 需要 needsUpdate 重编译，否则不生效。
        clone.transparent = true;
        cloneMap.set(obj.material, clone);
      }
      obj.material = clone;
    }
  });
  return [...cloneMap.values()];
}

/**
 * 队伍色围巾：绕颈的墨色环带，正反面都能辨认敌我。
 * 返回围巾材质（换队伍色时更新 color + emissive）。
 */
export function addTeamScarf(
  model: THREE.Group,
  neckY: number,
  radius: number,
  colorHex: string
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.5,
    emissive: colorHex,
    emissiveIntensity: 0.15,
    transparent: true, // 与角色一起淡出
  });
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.07, 10, 20), mat);
  scarf.name = 'team-scarf';
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = neckY;
  scarf.castShadow = true;
  model.add(scarf);
  return mat;
}
