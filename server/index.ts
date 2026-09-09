/**
 * 联机中继服务器：房间管理 + 大厅状态 + 对局时钟 + 消息转发。
 * 不跑游戏逻辑（移动/弹道/命中都在客户端），只负责：
 * - 房间码创建/加入、席位与队伍分配、准备状态
 * - 全员准备后倒计时开局，到时广播结束；房主上报结算结果后广播
 * - 对局内消息附加 from/seq 后转发给房间内其他人
 * - 时钟同步（ping/pong）
 *
 * 同一端口同时托管构建好的前端（dist/），局域网内任意设备打开
 * http://<本机IP>:8787 即可加入；客户端默认连同源 /ws。
 *
 * 运行：npm run lan（构建 + 启动）或 npm run server（仅启动）。
 * 环境变量：PORT 端口（默认 8787），HOST 绑定地址（默认 0.0.0.0），MATCH_MS 一局时长（测试用）。
 */
import { WebSocketServer, WebSocket } from 'ws';
import { createHttpServer, printLanBanner } from './lan';
import {
  ClientMsg,
  ServerMsg,
  PlayerInfo,
  RoomState,
  RoomPhase,
  TeamIndex,
  MAX_PLAYERS,
  MATCH_DURATION_MS,
  COUNTDOWN_MS,
  DEFAULT_PORT,
  INK_PALETTE,
  RELAY_TYPES,
} from '../src/net/protocol';

interface Client {
  id: string;
  ws: WebSocket;
  room: Room | null;
  info: PlayerInfo | null;
}

interface Room {
  code: string;
  phase: RoomPhase;
  clients: Client[];
  seq: number;
  endTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();
let nextClientId = 1;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符

function makeCode(): string {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function send(c: Client, msg: ServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMsg, except?: Client) {
  for (const c of room.clients) if (c !== except) send(c, msg);
}

function hostOf(room: Room): Client | null {
  let host: Client | null = null;
  for (const c of room.clients) {
    if (!host || c.info!.slot < host.info!.slot) host = c;
  }
  return host;
}

function roomState(room: Room): RoomState {
  return {
    code: room.code,
    phase: room.phase,
    hostId: hostOf(room)?.id ?? '',
    players: room.clients.map((c) => c.info!).sort((a, b) => a.slot - b.slot),
  };
}

function pushRoom(room: Room) {
  broadcast(room, { t: 'room', room: roomState(room) });
}

/** 分配最小空闲席位；队伍按席位奇偶交替，保证两队人数均衡 */
function allocSlot(room: Room): number {
  const used = new Set(room.clients.map((c) => c.info!.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}

function teamOfSlot(slot: number): TeamIndex {
  return (slot % 2) as TeamIndex;
}

/** 队伍色 = 该队最小席位玩家的选色；撞色时给 1 队换成调色板里第一个不冲突的颜色 */
function resolveTeamColors(room: Room): [string, string] {
  const state = roomState(room);
  const pick = (team: TeamIndex) =>
    state.players.find((p) => p.team === team)?.color ?? INK_PALETTE[team];
  let c0 = pick(0);
  let c1 = pick(1);
  if (c0.toLowerCase() === c1.toLowerCase()) {
    c1 = INK_PALETTE.find((h) => h.toLowerCase() !== c0.toLowerCase()) ?? c1;
  }
  return [c0, c1];
}

function joinRoom(client: Client, room: Room, char: string, color: string) {
  const slot = allocSlot(room);
  client.room = room;
  client.info = { id: client.id, slot, team: teamOfSlot(slot), char, color, ready: false };
  room.clients.push(client);
  pushRoom(room);
  log(`${client.id} joined ${room.code} as slot ${slot} team ${client.info.team}`);
}

function leaveRoom(client: Client) {
  const room = client.room;
  if (!room) return;
  room.clients = room.clients.filter((c) => c !== client);
  client.room = null;
  client.info = null;
  log(`${client.id} left ${room.code}`);

  if (room.clients.length === 0) {
    if (room.endTimer) clearTimeout(room.endTimer);
    rooms.delete(room.code);
    log(`room ${room.code} closed`);
    return;
  }
  broadcast(room, { t: 'left', id: client.id });
  // 对局中有人离开：立即结束，剩余玩家中的房主负责上报结果
  if (room.phase === 'playing' || room.phase === 'countdown') {
    endMatch(room, 'left');
  } else {
    pushRoom(room);
  }
}

function tryStart(room: Room) {
  if (room.phase !== 'lobby') return;
  if (room.clients.length < 2) return;
  if (!room.clients.every((c) => c.info!.ready)) return;

  room.phase = 'countdown';
  room.seq = 0;
  const startAt = Date.now() + COUNTDOWN_MS;
  const state = roomState(room);
  broadcast(room, {
    t: 'start',
    startAt,
    duration: matchDuration,
    teamColors: resolveTeamColors(room),
    players: state.players,
  });
  pushRoom(room);
  log(`room ${room.code} starting`);

  setTimeout(() => {
    if (room.phase === 'countdown') {
      room.phase = 'playing';
      pushRoom(room);
    }
  }, COUNTDOWN_MS);

  room.endTimer = setTimeout(() => endMatch(room, 'time'), COUNTDOWN_MS + matchDuration);
}

function endMatch(room: Room, reason: 'time' | 'left') {
  if (room.endTimer) {
    clearTimeout(room.endTimer);
    room.endTimer = null;
  }
  room.phase = 'ended';
  for (const c of room.clients) c.info!.ready = false;
  broadcast(room, { t: 'end', hostId: hostOf(room)?.id ?? '', reason });
  pushRoom(room);
  log(`room ${room.code} ended (${reason})`);
  // 结果由房主上报后广播；无论如何 5 秒后回到大厅
  setTimeout(() => {
    if (room.phase === 'ended') {
      room.phase = 'lobby';
      pushRoom(room);
    }
  }, 5000);
}

function handle(client: Client, msg: ClientMsg) {
  switch (msg.t) {
    case 'ping':
      send(client, { t: 'pong', c: msg.c, s: Date.now() });
      return;

    case 'create': {
      leaveRoom(client);
      const room: Room = {
        code: makeCode(),
        phase: 'lobby',
        clients: [],
        seq: 0,
        endTimer: null,
      };
      rooms.set(room.code, room);
      joinRoom(client, room, msg.char, msg.color);
      return;
    }

    case 'join': {
      const room = rooms.get(String(msg.code).toUpperCase());
      if (!room) return send(client, { t: 'error', code: 'ROOM_NOT_FOUND' });
      if (room.clients.length >= MAX_PLAYERS) return send(client, { t: 'error', code: 'ROOM_FULL' });
      if (room.phase !== 'lobby') return send(client, { t: 'error', code: 'IN_MATCH' });
      leaveRoom(client);
      joinRoom(client, room, msg.char, msg.color);
      return;
    }

    case 'lobby': {
      const room = client.room;
      if (!room || !client.info) return send(client, { t: 'error', code: 'NOT_IN_ROOM' });
      if (room.phase !== 'lobby') return;
      if (typeof msg.char === 'string') client.info.char = msg.char;
      if (typeof msg.color === 'string') client.info.color = msg.color;
      if (typeof msg.ready === 'boolean') client.info.ready = msg.ready;
      pushRoom(room);
      tryStart(room);
      return;
    }

    case 'leave':
      leaveRoom(client);
      return;

    case 'result': {
      const room = client.room;
      if (!room || room.phase !== 'ended') return;
      if (hostOf(room) !== client) return; // 只认房主的结果
      broadcast(room, { t: 'result', coverage: msg.coverage });
      return;
    }

    default: {
      // 对局内转发消息
      const room = client.room;
      if (!room) return;
      if (!RELAY_TYPES.has(msg.t)) return send(client, { t: 'error', code: 'BAD_MESSAGE' });
      if (room.phase !== 'playing' && room.phase !== 'countdown') return;
      room.seq++;
      broadcast(room, { ...msg, from: client.id, seq: room.seq } as ServerMsg, client);
    }
  }
}

function log(s: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
}

const port = Number(process.env.PORT) || DEFAULT_PORT;
/** 测试用：MATCH_MS 环境变量可缩短一局时长 */
const matchDuration = Number(process.env.MATCH_MS) || MATCH_DURATION_MS;
const host = process.env.HOST || '0.0.0.0';
const httpServer = createHttpServer();
// 挂在 http 服务器上，不限制路径：/ws（同源默认）与 /（旧客户端）都接受
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const client: Client = { id: `p${nextClientId++}`, ws, room: null, info: null };
  send(client, { t: 'welcome', id: client.id });
  log(`${client.id} connected`);

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return send(client, { t: 'error', code: 'BAD_MESSAGE' });
    }
    if (!msg || typeof msg.t !== 'string') return;
    handle(client, msg);
  });

  ws.on('close', () => {
    leaveRoom(client);
    log(`${client.id} disconnected`);
  });
  ws.on('error', () => {});
});

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') log(`port ${port} is in use — set PORT=xxxx to use another port`);
  else log(`server error: ${err.message}`);
  process.exit(1);
});
httpServer.listen(port, host, () => {
  log(`relay + static server listening on ${host}:${port}`);
  printLanBanner(port, log);
});
