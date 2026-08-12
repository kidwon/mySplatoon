import * as THREE from 'three';
import { CharacterDef } from './models/characters';
import { instantiateMaterials, addTeamScarf } from './models/characterUtils';
import { attachWeapon, WeaponBuild } from './models/weapons';
import { CharacterAnimator } from './models/CharacterAnimator';

/** 乌贼形态的整体压扁比例 */
const SQUID_SCALE = new THREE.Vector3(1.15, 0.34, 1.15);
/** 未标定枪口的武器使用的兜底枪口位置（武器组局部坐标） */
const DEFAULT_MUZZLE = new THREE.Vector3(0, 0.05, -0.38);

/**
 * 角色外观代理：模型 + 步行动画器 + 队伍围巾 + 专属武器的组装与状态管理。
 * 玩家与机器人各持有一个实例；换角色 = 换实例。
 * 统一收口：换队伍色 / 受击闪白 / 淡出透明度 / 乌贼形态切换 / 姿态重置。
 */
export class CharacterAvatar {
  /** 模型根（挂到持有者的 group 下） */
  readonly group: THREE.Group;
  readonly def: CharacterDef;

  private modelMats: THREE.MeshStandardMaterial[];
  private scarfMat: THREE.MeshStandardMaterial;
  private weapon: WeaponBuild;
  private weaponMats: THREE.MeshStandardMaterial[] = [];
  private animator: CharacterAnimator;
  private squid = false;

  constructor(def: CharacterDef, teamColor: string) {
    this.def = def;
    this.group = def.createModel();
    // 材质按实例克隆（预置 transparent，闪白/淡出不跨实例污染）
    this.modelMats = instantiateMaterials(this.group);
    this.scarfMat = addTeamScarf(this.group, def.scarfY, def.scarfRadius, teamColor);
    this.weapon = def.createWeapon(teamColor);
    attachWeapon(this.group, this.weapon);
    // 收集武器全部材质（本就按实例新建），预置 transparent 供淡出
    this.weapon.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        if (!this.weaponMats.includes(obj.material)) {
          obj.material.transparent = true;
          this.weaponMats.push(obj.material);
        }
      }
    });
    this.animator = new CharacterAnimator(this.group);
  }

  /** 更换队伍墨色（围巾 + 武器墨色部件，不染角色本体） */
  setColor(hex: string) {
    this.scarfMat.color.set(hex);
    this.scarfMat.emissive.set(hex);
    for (const m of this.weapon.inkMats) {
      m.color.set(hex);
      m.emissive.set(hex);
    }
  }

  /** 受击闪白强度（0 = 无） */
  setFlash(intensity: number) {
    for (const m of this.modelMats) m.emissiveIntensity = intensity;
  }

  /** 整体不透明度（潜墨 / 相机淡出用；材质已预置 transparent） */
  setOpacity(opacity: number) {
    for (const m of this.modelMats) m.opacity = opacity;
    this.scarfMat.opacity = opacity;
    for (const m of this.weaponMats) m.opacity = opacity;
  }

  /** 乌贼形态：整体压扁 + 收起武器 */
  setSquid(on: boolean) {
    if (on === this.squid) return;
    this.squid = on;
    if (on) {
      this.group.scale.copy(SQUID_SCALE);
    } else {
      this.group.scale.set(1, 1, 1);
    }
    this.weapon.group.visible = !on;
  }

  /** 步行动画（转发给 CharacterAnimator） */
  animate(dt: number, opts: { speed: number; grounded: boolean; swimming?: boolean }) {
    this.animator.update(dt, opts);
  }

  /** 武器枪口的世界坐标（写入 out 并返回） */
  getMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.weapon.group.updateWorldMatrix(true, false);
    out.copy(this.weapon.muzzle ?? DEFAULT_MUZZLE);
    return this.weapon.group.localToWorld(out);
  }

  /** 回到默认姿态（重生/重开/换人时） */
  resetPose() {
    this.animator.reset();
    this.setSquid(false);
    this.setFlash(0);
    this.setOpacity(1);
  }
}
