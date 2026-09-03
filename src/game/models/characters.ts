import * as THREE from 'three';
import { CHIIKAWA_FACTORIES, ChiikawaCharacter } from './chiikawa';
import { WEAPON_FACTORIES, WeaponBuild } from './weapons';

/**
 * 角色注册表：把"一个可选角色"所需的全部数据收拢成一条记录。
 * 模型/武器工厂 + 每角色差异参数（围巾挂点、碰撞体、相机支点高度）。
 * 新角色只需在模型/武器表注册后在这里加一行。
 */
export interface CharacterDef {
  key: ChiikawaCharacter;
  createModel: () => THREE.Group;
  createWeapon: (inkColor: string) => WeaponBuild;
  /** 队伍围巾：挂点高度与半径（需大于该高度处的身体/头部截面半径才可见） */
  scarfY: number;
  scarfRadius: number;
  /** 人形碰撞胶囊（乌贼形态按 ×0.85 半径 / ×0.35 高度换算） */
  radius: number;
  height: number;
  /** 相机 / 瞄准支点高度（约为视线高度） */
  camHeight: number;
}

export const CHARACTER_DEFS: Record<ChiikawaCharacter, CharacterDef> = {
  chiikawa: {
    key: 'chiikawa',
    createModel: CHIIKAWA_FACTORIES.chiikawa,
    createWeapon: WEAPON_FACTORIES.chiikawa,
    scarfY: 0.5,
    scarfRadius: 0.42,
    radius: 0.5,
    height: 1.55,
    camHeight: 1.4,
  },
  hachiware: {
    key: 'hachiware',
    createModel: CHIIKAWA_FACTORIES.hachiware,
    createWeapon: WEAPON_FACTORIES.hachiware,
    scarfY: 0.5,
    scarfRadius: 0.44,
    radius: 0.5,
    height: 1.6,
    camHeight: 1.45,
  },
  usagi: {
    key: 'usagi',
    createModel: CHIIKAWA_FACTORIES.usagi,
    createWeapon: WEAPON_FACTORIES.usagi,
    scarfY: 0.58,
    scarfRadius: 0.45,
    radius: 0.5,
    height: 1.8,
    camHeight: 1.55,
  },
  shisa: {
    key: 'shisa',
    createModel: CHIIKAWA_FACTORIES.shisa,
    createWeapon: WEAPON_FACTORIES.shisa,
    scarfY: 0.6,
    scarfRadius: 0.5,
    radius: 0.52,
    height: 1.3,
    camHeight: 1.15,
  },
  nikori: {
    key: 'nikori',
    createModel: CHIIKAWA_FACTORIES.nikori,
    createWeapon: WEAPON_FACTORIES.nikori,
    scarfY: 0.56,
    scarfRadius: 0.28,
    radius: 0.48,
    height: 1.3,
    camHeight: 1.1,
  },
  onizaru: {
    key: 'onizaru',
    createModel: CHIIKAWA_FACTORIES.onizaru,
    createWeapon: WEAPON_FACTORIES.onizaru,
    scarfY: 0.92,
    scarfRadius: 0.27,
    radius: 0.52,
    height: 1.62,
    camHeight: 1.3,
  },
  doro: {
    key: 'doro',
    createModel: CHIIKAWA_FACTORIES.doro,
    createWeapon: WEAPON_FACTORIES.doro,
    scarfY: 0.6,
    scarfRadius: 0.34,
    radius: 0.46,
    height: 1.25,
    camHeight: 1.05,
  },
};

export const CHARACTER_KEYS = Object.keys(CHARACTER_DEFS) as ChiikawaCharacter[];

export function isCharacterKey(v: string | null): v is ChiikawaCharacter {
  return v !== null && v in CHARACTER_DEFS;
}
