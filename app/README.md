# AI 试妆助手 · H5 MVP（Vite）

可部署的练手工程，与仓库根目录 `prototype/prototype_v1.0.html` 功能对齐；逻辑在 `src/main.js`，样式为 Tailwind CDN + `src/style.css`。

## 命令

在项目根目录为 **`app/`** 时执行：

```bash
npm install
npm run dev
```

浏览器打开终端里提示的地址。开发服务器已启用 **HTTPS**（自签名证书），本地一般为 `https://localhost:5173`。

**手机同 WiFi 调试：** 使用终端里的 **Network** 一行，形如 `https://192.168.x.x:5173`（注意是 **https**）。首次用手机打开时，浏览器会提示证书不受信任，需点「高级 → 继续访问」之类，之后进入试妆页才会出现**摄像头授权**弹窗。

**若仍无摄像头提示：**

1. **必须先走完冷启动**（场合 → 年龄 → 关系 → 进入试妆），摄像头**只在试妆页**请求，在冷启动页不会弹窗。  
2. **iPhone Safari** 对 `http://` + 局域网 IP **通常不开放摄像头**；请始终用 **https://** 的 Network 地址（本工程已配置）。  
3. 系统设置里检查 Safari/Chrome 是否被禁止了相机权限。

### 试妆页 · 规则配妆 + MediaPipe（自测）

1. 在 `app/` 执行 `npm run dev`，用 **https://** 打开本机或局域网地址（见终端 Network 行）。
2. **走完冷启动**（场合 → 年龄 → 关系 → 进入试妆），或 **`?demo=ar#ar`** 直达试妆。
3. **允许摄像头**；角标变为「**{当前预设名} · 跟脸预览**」。
4. 人脸入镜：应看到**唇、眉线、腮红、修容、高光**等跟脸叠层；「**风格与结构建议**」出现脸型 pill 与「跟脸规则配妆」标签，列表为**多条结构建议**（随脸型/场合变化）。
5. **妆容预设**：横向标签选择风格；**选中后**出现「妆容浓度」滑杆（0～100%，按预设分别记忆）；切换预设应看到修容 / 腮红 / 眉 / 高光与唇的差异。
6. **唇妆**：每帧将视频按 `object-cover` 与 landmark 对齐画入画布，再用 Canvas **`color`** 混合叠唇色（保留肤底明暗与纹理，接近常见美颜类「着色」思路）；退出试妆或停止管线时恢复底层 `<video>` 显示。
7. **断网或模型失败**：Toast + 角标「示意叠层（模型未加载）」，回退示意叠层。

```bash
npm run build
```

产物在 **`dist/`**，可上传到任意静态托管（GitHub Pages、Vercel、Cloudflare Pages 等）。`vite.config.js` 已设 `base: './'`，适合子路径部署。

```bash
npm run preview
```

本地预览生产构建。

## 部署（下一步：公开可访问链接）

构建产物为 **`app/dist/`**（`base: './'`），可整包上传。

### Netlify

- 连接 Git 仓库后，**Base directory** 填 **`app`**，构建命令 **`npm run build`**，发布目录 **`dist`**（与根目录 `app/netlify.toml` 一致）。

### Vercel

- **Root Directory** 选 **`app`**，框架选 Vite 或留空，构建 **`npm run build`**，输出 **`dist`**。

### Cloudflare Pages

- 构建命令：`cd app && npm run build`，输出目录：`app/dist`（在面板里填子目录）。

### GitHub Pages（本仓库已含 Actions）

1. 把项目推到 GitHub 仓库。
2. **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 推送 `main` 或 `master` 分支，工作流 **`.github/workflows/deploy-github-pages.yml`** 会自动构建 `app/` 并发布。
4. 首次需在 **Settings → Pages** 里同意使用 `github-pages` 环境。

### 手动

在 `app/` 执行 `npm run build`，将 **`dist/`** 内全部文件上传到任意静态空间。

---

## 上线后自检

- [ ] 手机 **HTTPS** 打开链接，授权摄像头，走通冷启动 → 试妆 → 保存提示。
- [ ] 隐私条「知道了」、右上角隐私弹层可关闭。

## 与 `prototype/` 的关系

- **PRD 里嵌的 iframe** 仍指向 `../prototype/prototype_v1.0.html` 时，改的是旧单文件原型。
- **日常开发与上线** 以本目录 **`app/`** 为准；大改交互后可在适当时机把 `index.html` + `src/` 同步回 `prototype/`（或只维护一端）。

## 技术说明

- 需 **HTTPS** 或 **localhost** 才能稳定调起前置摄像头。
- 试妆页使用 **MediaPipe Face Landmarker**（`@mediapipe/tasks-vision`）：在 canvas 上跟脸绘制**唇、眉、腮红、下颌修容、鼻梁/眉骨高光**（演示级虚化）。
- **规则智能配妆**：`faceShape.js`（脸型）+ `skinTone.js`（额头/双颊取样、灰世界、Lab 深浅与冷暖启发式）+ `eyeShape.js`（眼裂比与倾斜）+ `makeupPacks.js`（多维度妆容包）。非云端大模型；WASM/模型自 CDN；失败回退示意叠层。
- 坐标映射与 `object-cover` 一致，见 `src/lips/lipLandmarker.js`。
- MVP 范围见 `prd/prd_v1.0_final.html` 中「MVP v1.0 范围」。
