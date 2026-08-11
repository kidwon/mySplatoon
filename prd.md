你是一个精通 WebGL 和 Three.js 的资深游戏前端开发专家。
我正在开发一款网页版的《斯普拉顿3》（Splatoon 3）网页游戏。请帮我初始化并构建该项目的 MVP 阶段代码。

### 1. 技术栈与环境要求
- 前端框架/构建工具：Vite + TypeScript
- 渲染引擎：Three.js (`three` 及 `@types/three`)
- 样式/UI：原生 CSS / HTML 覆盖层

### 2. 请执行以下步骤搭建项目脚手架并安装依赖：
1. 在当前目录下创建 Vite TS 项目（如果当前已经是空目录，请直接初始化；如果不是，请在合适的位置创建结构）。
2. 安装 `three` 和 `@types/three` 依赖。

### 3. MVP 核心功能实现清单（请在 src 中组织好清晰的代码模块）：
请创建一个流畅的 3D 测试场景，并实现以下核心逻辑：

1. **场景与相机**：
   - 建立一个 3D 竞技场地面（如 50x50 的平面，带有默认网格或暗色贴图）。
   - 采用第三人称追随视角（Third-Person Camera），相机跟随玩家角色移动，并支持鼠标控制视角旋转。

2. **玩家控制 (Player Movement)**：
   - 使用胶囊体（Capsule）或简易 Mesh 表示玩家。
   - `WASD` 键控制移动，`Space` 键跳跃。
   - 实现**形态切换机制**：
     - 按住 `Shift` 键进入**乌贼形态（Squid Form）**（玩家 Mesh 变矮/扁平或隐藏，缩小碰撞体积）。
     - 松开 `Shift` 键恢复**人形（Human Form）**。

3. **墨汁射击与实时涂地 (Ink Shooting & Turf System)**：
   - **人形下按鼠标左键**：向前发射墨汁子弹（可以使用简易 Sphere/Particle）。
   - **动态涂地**：子弹击中地面时，在地面对应的位置留下己方颜色（如亮紫色 `#9B51E0`）的墨汁痕迹。
     *注：MVP 阶段可以使用动态 Canvas 2D 离屏纹理作为地面的 Map/CanvasTexture，或者使用贴花/离屏渲染 Target（Render Target）来实现涂色效果。*

4. **墨汁相互作用逻辑 (Ink Interaction)**：
   - 记录地面已涂色区域。
   - **潜行机制**：当玩家在**己方墨汁区域内**按住 `Shift`（乌贼形态）时，移动速度提升 1.5 倍；若不在己方墨汁上，按住 `Shift` 移动速度减半。
   - **墨汁槽（Ink Tank）**：开火消耗墨水（设上限 100）；在己方墨汁中潜行时快速回复墨水。

5. **HUD UI 层**：
   - 使用 HTML/CSS 在页面顶层覆盖简易 UI：
     - 准星（Crosshair）。
     - 墨水剩余量条（Ink Tank Bar）。
     - 当前形态状态显示（Human / Squid）。
     - 操作说明指引（WASD 移动 / 鼠标瞄准 / 左键射击 / Shift 潜墨）。

### 4. 代码结构建议：
请保持代码清晰、模块化，建议分为：
- `src/main.ts` (入口)
- `src/game/SceneManager.ts` (Three.js 场景/渲染循环)
- `src/game/PlayerController.ts` (玩家移动与形态管理)
- `src/game/InkSystem.ts` (墨汁发射、地面涂色纹理更新与碰撞检测)
- `src/ui/HUD.ts` (界面更新)

现在请开始帮我初始化项目并编写核心代码！