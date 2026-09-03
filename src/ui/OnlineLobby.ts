import type { RoomState } from '../net/protocol';
import { MAX_PLAYERS } from '../net/protocol';
import type { NetStatus } from '../net/NetClient';
import { defaultServerUrl } from '../net/NetClient';
import { t, fmt } from './i18n';

const SERVER_KEY = 'mysplatoon-server-url';

/**
 * 联机大厅 UI：连接 / 建房 / 加入 / 玩家列表 / 选色 / 准备。
 * 只管 DOM，动作通过回调交给 Game。
 */
export class OnlineLobby {
  onBack?: () => void;
  onConnect?: (url: string) => void;
  onCreate?: () => void;
  onJoin?: (code: string) => void;
  onReady?: (ready: boolean) => void;
  onLeave?: () => void;
  onOpenChar?: () => void;
  onColor?: (hex: string) => void;

  private overlay = document.getElementById('online-overlay')!;
  private statusEl = document.getElementById('online-status')!;
  private entryEl = document.getElementById('online-entry')!;
  private roomEl = document.getElementById('online-room')!;
  private serverInput = document.getElementById('online-server') as HTMLInputElement;
  private codeInput = document.getElementById('online-code') as HTMLInputElement;
  private codeEl = document.getElementById('online-room-code')!;
  private playersEl = document.getElementById('online-players')!;
  private charBtn = document.getElementById('online-char') as HTMLButtonElement;
  private readyBtn = document.getElementById('online-ready') as HTMLButtonElement;
  private waitEl = document.getElementById('online-wait')!;
  private errorEl = document.getElementById('online-error')!;
  private swatchesEl = document.getElementById('online-swatches')!;

  private status: NetStatus = 'idle';
  private room: RoomState | null = null;
  private myId = '';
  private myChar = '';
  private myColor = '';

  constructor(palette: string[]) {
    this.serverInput.value = localStorage.getItem(SERVER_KEY) || defaultServerUrl();
    this.codeInput.placeholder = t('codePlaceholder');

    document.getElementById('online-back')!.addEventListener('click', () => this.onBack?.());
    document.getElementById('online-connect')!.addEventListener('click', () => {
      localStorage.setItem(SERVER_KEY, this.serverUrl());
      this.onConnect?.(this.serverUrl());
    });
    document.getElementById('online-create')!.addEventListener('click', () => this.onCreate?.());
    document.getElementById('online-join')!.addEventListener('click', () => this.join());
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.join();
      e.stopPropagation(); // 不让 WASD/Space 等落到游戏输入
    });
    this.serverInput.addEventListener('keydown', (e) => e.stopPropagation());
    document.getElementById('online-leave')!.addEventListener('click', () => this.onLeave?.());
    this.charBtn.addEventListener('click', () => this.onOpenChar?.());
    this.readyBtn.addEventListener('click', () => {
      const me = this.room?.players.find((p) => p.id === this.myId);
      this.onReady?.(!me?.ready);
    });

    for (const hex of palette) {
      const btn = document.createElement('button');
      btn.className = 'swatch';
      btn.style.background = hex;
      btn.dataset.hex = hex;
      btn.addEventListener('click', () => this.onColor?.(hex));
      this.swatchesEl.appendChild(btn);
    }
  }

  private join() {
    const code = this.codeInput.value.trim().toUpperCase();
    if (code.length < 4) return;
    this.onJoin?.(code);
  }

  serverUrl(): string {
    return this.serverInput.value.trim() || defaultServerUrl();
  }

  get visible() {
    return !this.overlay.classList.contains('hidden');
  }
  show() {
    this.overlay.classList.remove('hidden');
  }
  hide() {
    this.overlay.classList.add('hidden');
  }

  setStatus(status: NetStatus) {
    this.status = status;
    const text: Record<NetStatus, string> = {
      idle: '',
      connecting: t('connecting'),
      connected: t('connected'),
      closed: t('disconnected'),
      error: t('connectFailed'),
    };
    this.statusEl.textContent = text[status];
    this.statusEl.classList.toggle('ok', status === 'connected');
    this.statusEl.classList.toggle('bad', status === 'error' || status === 'closed');
    this.renderEntry();
  }

  setError(text: string) {
    this.errorEl.textContent = text;
  }

  /** 按房间状态重绘（room 为 null = 未入房） */
  render(room: RoomState | null, myId: string, myChar: string, myColor: string) {
    this.room = room;
    this.myId = myId;
    this.myChar = myChar;
    this.myColor = myColor;
    this.renderEntry();
    if (!room) return;

    this.codeEl.textContent = room.code;
    this.charBtn.textContent = `${t('yourChar')}: ${t(`char_${myChar}`)}`;

    // 玩家列表：按席位，空位显示等待中
    this.playersEl.innerHTML = '';
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const p = room.players.find((q) => q.slot === slot);
      const li = document.createElement('li');
      if (!p) {
        li.className = 'empty';
        li.textContent = t('waitingPlayers');
        this.playersEl.appendChild(li);
        continue;
      }
      if (p.id === myId) li.classList.add('me');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${t(`char_${p.char}`)}${p.id === myId ? ' ' + t('you') : ''}`;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p.id === room.hostId ? t('host') : '';
      const ready = document.createElement('span');
      ready.className = 'ready' + (p.ready ? '' : ' no');
      ready.textContent = p.ready ? t('readyMark') : t('notReadyMark');
      li.append(dot, name, tag, ready);
      this.playersEl.appendChild(li);
    }

    // 准备按钮
    const me = room.players.find((p) => p.id === myId);
    const inLobby = room.phase === 'lobby';
    this.readyBtn.textContent = me?.ready ? t('cancelReady') : t('ready');
    this.readyBtn.classList.toggle('selected', !!me?.ready);
    this.readyBtn.disabled = !inLobby;
    this.charBtn.disabled = !inLobby || !!me?.ready;

    // 色板：对方队伍已用的颜色不可选
    const takenByOthers = new Set(
      room.players.filter((p) => p.team !== me?.team).map((p) => p.color.toLowerCase())
    );
    this.swatchesEl.querySelectorAll<HTMLElement>('.swatch').forEach((s) => {
      const hex = s.dataset.hex!.toLowerCase();
      s.classList.toggle('selected', hex === myColor.toLowerCase());
      s.classList.toggle('taken', takenByOthers.has(hex));
    });

    if (room.players.length < 2) this.waitEl.textContent = t('waitingPlayers');
    else if (!room.players.every((p) => p.ready)) this.waitEl.textContent = t('waitingReady');
    else this.waitEl.textContent = '';
  }

  /** 语言切换后重刷 */
  refreshLocale() {
    this.codeInput.placeholder = t('codePlaceholder');
    this.setStatus(this.status);
    this.render(this.room, this.myId, this.myChar, this.myColor);
  }

  /** 服务器错误码 → 文案 */
  errorText(code: string): string {
    switch (code) {
      case 'ROOM_NOT_FOUND':
        return t('errRoomNotFound');
      case 'ROOM_FULL':
        return t('errRoomFull');
      case 'IN_MATCH':
        return t('errInMatch');
      default:
        return fmt('errGeneric', { code });
    }
  }

  private renderEntry() {
    const connected = this.status === 'connected';
    const inRoom = this.room !== null;
    this.entryEl.classList.toggle('hidden', inRoom);
    this.roomEl.classList.toggle('hidden', !inRoom);
    (document.getElementById('online-create') as HTMLButtonElement).disabled = !connected;
    (document.getElementById('online-join') as HTMLButtonElement).disabled = !connected;
  }
}
