/**
 * 局域网托管：静态文件服务（dist/）、/info 地址查询、局域网 IPv4 枚举、终端二维码。
 * 与中继逻辑分离，index.ts 只负责把 WebSocket 挂到这里创建的 http 服务器上。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/** 本机所有非回环 IPv4 地址（有线/无线网卡），按接口名排序 */
export function lanAddresses(): string[] {
  const out: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces).sort()) {
    for (const a of ifaces[name] ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

export function hasDist(): boolean {
  return fs.existsSync(path.join(DIST, 'index.html'));
}

/**
 * 创建 http 服务器：
 * - GET /info → { addresses: string[] }（客户端据此显示"其他设备打开"的地址）
 * - GET /health → ok
 * - 其余按 dist/ 静态文件返回，找不到则回退 index.html（单页应用）
 */
export function createHttpServer(): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === '/info') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ addresses: lanAddresses() }));
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (!hasDist()) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dist/ not built. Run: npm run build (or npm run lan)\n');
      return;
    }
    // 防目录穿越：先规范化再限定在 DIST 内
    const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = path.join(DIST, rel);
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    const ext = path.extname(file).toLowerCase();
    const immutable = /\/assets\//.test(file); // vite 产物带 hash，可长期缓存
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/** 启动后打印局域网访问方式（地址列表 + 首个地址的二维码） */
export function printLanBanner(port: number, log: (s: string) => void) {
  const addrs = lanAddresses();
  const host = os.hostname();
  log(`local:   http://localhost:${port}`);
  for (const a of addrs) log(`LAN:     http://${a}:${port}`);
  if (host) log(`mDNS:    http://${host.endsWith('.local') ? host : host + '.local'}:${port}  (macOS/iOS/Win10+)`);
  if (!hasDist()) {
    log('WARNING: dist/ not found — only the WebSocket relay is available. Run `npm run build` to serve the game too.');
  }
  if (addrs.length === 0) {
    log('WARNING: no LAN IPv4 address found — is Wi-Fi / Ethernet connected?');
    return;
  }
  qrcode.generate(`http://${addrs[0]}:${port}`, { small: true }, (qr) => {
    console.log('\n' + qr);
  });
}
