# My Splatoon (Web)

Vite + TypeScript + Three.js 的网页版斯普拉遁风格涂地对战。

## 运行

```bash
npm install
npm run dev        # 单机：http://localhost:5173
npm run server     # 联机中继服务器：ws://localhost:8787
npm run dev:all    # 同时启动前端与中继
```

局域网联机：`npx vite --host` 暴露前端，另一台机器打开 `http://<你的IP>:5173`，
大厅里服务器地址默认取页面主机名，会自动指向 `ws://<你的IP>:8787`。

线上部署：`vite build` 产物为纯静态；中继服务器用 `PORT=... npx tsx server/index.ts`
部署到任意 Node 主机，前端构建时设置 `VITE_WS_URL=wss://你的中继地址`。

## 文档

- `prd.md`：最初的 MVP 需求
- `docs/TECH_NOTES.md`：每个功能的方案、取舍与后续方向（§18 为联机架构）
