/**
 * 联机协议：客户端与中继服务器共用的消息类型。
 * 服务器（server/index.ts）只理解房间/大厅/时钟消息，
 * 对局内消息（state/fire/paint/hit/ko）原样转发并附上发送者 id 与全局序号。
 *
 * 设计原则（N 人 / 两队）：
 * - 玩家由 slot（房间内席位）与 team（0/1）标识；席位按加入顺序交替分配队伍。
 * - 客户端本地仍沿用 'player' | 'enemy' 语义：自己所在队 = player，另一队 = enemy。
 * - 队伍墨色 = 该队席位最小玩家的选色；开局时服务器保证两队不撞色。
 */

/** 房间上限（1v1 = 2；开放 2v2 时改为 4，出生点见 spawnFor） */
export const MAX_PLAYERS = 2;
/** 一局时长（毫秒） */
export const MATCH_DURATION_MS = 180_000;
/** 开局倒计时（毫秒） */
export const COUNTDOWN_MS = 3_000;
/** 默认服务器端口 */
export const DEFAULT_PORT = 8787;

/** 可选墨色调色板（与 main.ts 保持一致；服务器用来解决撞色） */
export const INK_PALETTE = [
  '#9B51E0', // 紫
  '#F2A33C', // 橙
  '#29D9C2', // 青
  '#B3E62C', // 黄绿
  '#F04C93', // 粉
  '#3D5BF5', // 蓝
];

export type TeamIndex = 0 | 1;
export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'ended';

export interface PlayerInfo {
  id: string;
  slot: number;
  team: TeamIndex;
  char: string;
  color: string;
  ready: boolean;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: PlayerInfo[];
}

/** 结算覆盖率（按队伍索引，0-1） */
export type TeamCoverage = [number, number];

// ---------- 客户端 → 服务器 ----------

export type ClientMsg =
  | { t: 'create'; char: string; color: string }
  | { t: 'join'; code: string; char: string; color: string }
  | { t: 'lobby'; char?: string; color?: string; ready?: boolean }
  | { t: 'leave' }
  | { t: 'ping'; c: number }
  /** 房主在收到 end 后上报本地覆盖率，服务器广播给全员作为统一结果 */
  | { t: 'result'; coverage: TeamCoverage }
  | RelayMsg;

/** 对局内转发消息（服务器附加 from / seq 后广播给房间内其他人） */
export type RelayMsg =
  | {
      t: 'state';
      x: number;
      y: number;
      z: number;
      yaw: number;
      form: 'human' | 'squid';
      speed: number;
      grounded: boolean;
      swimming: boolean;
      hp: number;
      downed: boolean;
    }
  | { t: 'fire'; x: number; y: number; z: number; dx: number; dy: number; dz: number; scale: number }
  | { t: 'paint'; x: number; z: number; r: number; team: TeamIndex }
  | { t: 'hit'; to: string; damage: number }
  | { t: 'ko'; x: number; z: number; killerTeam: TeamIndex };

export type RelayType = RelayMsg['t'];
export const RELAY_TYPES: ReadonlySet<string> = new Set<RelayType>([
  'state',
  'fire',
  'paint',
  'hit',
  'ko',
]);

// ---------- 服务器 → 客户端 ----------

export type ServerErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'IN_MATCH'
  | 'NOT_IN_ROOM'
  | 'BAD_MESSAGE';

export type ServerMsg =
  | { t: 'welcome'; id: string }
  | { t: 'pong'; c: number; s: number }
  | { t: 'room'; room: RoomState }
  | { t: 'error'; code: ServerErrorCode }
  | {
      t: 'start';
      /** 服务器时钟下的开局时刻（含倒计时） */
      startAt: number;
      duration: number;
      teamColors: [string, string];
      players: PlayerInfo[];
    }
  | { t: 'end'; hostId: string; reason: 'time' | 'left' }
  | { t: 'result'; coverage: TeamCoverage }
  | { t: 'left'; id: string }
  | (RelayMsg & { from: string; seq: number });

/** 出生点：两队各在一侧，同队按席位左右错开；返回位置与面向场地中心的朝向 */
export function spawnFor(team: TeamIndex, slot: number): { x: number; z: number; yaw: number } {
  const side = team === 0 ? 1 : -1;
  const lane = Math.floor(slot / 2); // 同队第几人
  const x = (lane % 2 === 0 ? -1 : 1) * Math.ceil(lane / 2) * 6;
  return { x, z: 18 * side, yaw: team === 0 ? 0 : Math.PI };
}
