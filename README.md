# My Splatoon (Web)

Vite + TypeScript + Three.js 的网页版斯普拉遁风格涂地对战。

## 运行

```bash
npm install
npm run lan        # 局域网对战：构建前端并启动服务器，终端会打印地址和二维码
npm run dev:all    # 开发：Vite 热更新 (5173) + 中继服务器 (8787)，同样对局域网开放
npm run dev        # 只开前端（单机模式够用）
npm run server     # 只开服务器（会托管已构建的 dist/）
npm run check      # 前端 + 服务器类型检查
```

### 局域网对战

1. 一台机器运行 `npm run lan`，终端会列出 `http://<本机IP>:8787` 和二维码。
2. 同一 Wi-Fi 下的其他设备用浏览器打开该地址（或扫码），点"联机对战"。
   页面与 WebSocket 同一端口，客户端自动连同源 `/ws`，不用填服务器地址；
   大厅里也会显示本机的局域网地址方便转告。
3. 一人"创建房间"，把 4 位房间码给对方"加入"，双方准备即开局。

macOS 首次运行可能弹出"是否允许 node 接受传入连接"，选允许；
Windows 防火墙同理。端口冲突用 `PORT=9000 npm run lan` 换端口。
手机/平板会自动切换成触屏操作：左半屏摇杆移动，右半屏拖动看视角，
右下角按钮开火/跳跃/潜行，右上角菜单按钮相当于桌面端的 ESC。

### 线上部署

`vite build` 产物为纯静态，可与服务器一起部署到任意 Node 主机（`PORT=... npx tsx server/index.ts`
会同时托管 `dist/`）；若前端单独放 CDN，则构建时设置 `VITE_WS_URL=wss://你的中继地址`。

## 文档

- `prd.md`：最初的 MVP 需求
- `docs/TECH_NOTES.md`：每个功能的方案、取舍与后续方向（§18 为联机架构）
