import { defineConfig } from 'vite';
import { DEFAULT_PORT } from './src/net/protocol';

/**
 * 开发模式：
 * - host: true 让局域网其他设备也能打开 http://<本机IP>:5173
 * - /ws 与 /info 代理到中继服务器，客户端始终用"同源"地址，开发/局域网/线上一套逻辑
 */
const relay = `http://localhost:${process.env.PORT || DEFAULT_PORT}`;
const proxy = {
  '/ws': { target: relay, ws: true },
  '/info': { target: relay },
};

export default defineConfig({
  server: { host: true, proxy },
  preview: { host: true, proxy },
});
