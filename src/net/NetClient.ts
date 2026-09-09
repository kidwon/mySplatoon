import type { ClientMsg, ServerMsg } from './protocol';
import { DEFAULT_PORT } from './protocol';

export type NetStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

type Handler<T extends ServerMsg['t']> = (msg: Extract<ServerMsg, { t: T }>) => void;

/**
 * 服务器地址：VITE_WS_URL 覆盖；否则与页面同源的 /ws——
 * 生产由中继服务器同端口托管页面，开发由 Vite 代理 /ws 到中继，
 * 这样局域网内任何设备打开页面都自动连到正确的服务器。
 * 非 http 场景（file://）退回 localhost 默认端口。
 */
export function defaultServerUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (env?.VITE_WS_URL) return env.VITE_WS_URL;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }
  return `ws://localhost:${DEFAULT_PORT}`;
}

/**
 * WebSocket 客户端封装：连接状态、按消息类型分发、时钟同步（ping/pong）。
 * 连接断开不自动重连（v1），由上层提示用户。
 */
export class NetClient {
  status: NetStatus = 'idle';
  /** 服务器分配的自身 id */
  id = '';
  /** 往返延迟（毫秒，指数平滑） */
  rtt = 0;
  /** 服务器时钟 - 本地时钟 的估计（毫秒） */
  private clockOffset = 0;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(msg: ServerMsg) => void>>();
  private pingTimer: number | undefined;

  onStatus?: (status: NetStatus) => void;

  connect(url: string): Promise<void> {
    this.disconnect();
    this.setStatus('connecting');
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.setStatus('connected');
        this.pingTimer = window.setInterval(() => this.ping(), 2000);
        this.ping();
        resolve();
      };
      ws.onerror = () => {
        this.setStatus('error');
        reject(new Error('ws error'));
      };
      ws.onclose = () => {
        if (this.status !== 'error') this.setStatus('closed');
        window.clearInterval(this.pingTimer);
        this.ws = null;
      };
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'welcome') this.id = msg.id;
        if (msg.t === 'pong') this.onPong(msg.c, msg.s);
        this.handlers.get(msg.t)?.forEach((h) => h(msg));
      };
    });
  }

  disconnect() {
    window.clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.status !== 'idle') this.setStatus('idle');
  }

  get connected() {
    return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMsg) {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  on<T extends ServerMsg['t']>(type: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const h = handler as (msg: ServerMsg) => void;
    set.add(h);
    return () => set!.delete(h);
  }

  /** 服务器时钟下的"现在" */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  private ping() {
    this.send({ t: 'ping', c: Date.now() });
  }

  private onPong(c: number, s: number) {
    const now = Date.now();
    const rtt = now - c;
    this.rtt = this.rtt === 0 ? rtt : this.rtt * 0.7 + rtt * 0.3;
    // 假定单程延迟对称：服务器时刻 s 对应本地 (c + now) / 2
    const offset = s - (c + now) / 2;
    this.clockOffset = this.clockOffset === 0 ? offset : this.clockOffset * 0.8 + offset * 0.2;
  }

  private setStatus(s: NetStatus) {
    this.status = s;
    this.onStatus?.(s);
  }
}
