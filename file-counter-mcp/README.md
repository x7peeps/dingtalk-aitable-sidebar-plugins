# 📂 DingTalk AI Table - File Counter Plugin

钉钉 AI 表格（多维表）边栏插件：自动统计附件列“办公文档”总数，支持解压 ZIP 并统计内部文档。

## 📦 项目结构

```text
file-counter-mcp/
├── public/
│   ├── index.html       # 插件 UI 界面 (Sidebar Iframe)
│   └── service.js       # 插件脚本服务 (Web Worker)
└── README.md            # 说明文档
```

## 🚀 部署指南

本插件采用标准 HTML/JS 静态文件形式，部署在支持 HTTPS 的静态服务器即可。

### 方式一：使用 Replit (推荐测试用)
1. 在 [Replit](https://replit.com/) 创建一个新的 HTML/CSS/JS 项目。
2. 将 `index.html` 内容覆盖到 `index.html`。
3. 新建文件 `service.js`，将代码复制进去。
4. 点击 **Run**，获取 Web 预览地址 (URL)。
5. 前往钉钉 AI 表格 -> 插件 -> 添加自定义插件：
   - **UI 地址**: Replit 的 URL
   - **脚本服务地址**: Replit 的 URL (若 Replit 不支持 Worker 模式，尝试方式二)

### 方式二：使用 Vercel / GitHub Pages / 阿里云 OSS (推荐生产用)
1. 将项目推送到 GitHub。
2. 在 Vercel 或 Pages 中配置静态站点发布。
3. 获取 `https://...` 域名。
4. 在钉钉 AI 表格插件配置中填入对应 URL。
   - `index.html` -> `https://your-domain.com/index.html`
   - `service.js` -> `https://your-domain.com/service.js`

## ⚙️ 插件配置步骤

1. 打开目标 **钉钉 AI 表格**。
2. 点击右上角 **插件图标**。
3. 选择 **添加自定义插件**。
4. 填写配置：
   - 名称：`附件文件统计`
   - 描述：`统计选中区域的附件总数`
   - 插件主页/URL：指向你的 `index.html`
5. 打开插件，按照提示在表格中**框选附件列**，点击按钮即可统计。

## 💡 注意事项

- **CSP 限制**: `service.js` 中使用了 `importScripts` 加载 `jszip` CDN。如果钉钉环境启用了严格 CSP（内容安全策略）导致加载失败，请将 `jszip.min.js` 下载并放置在同级目录，并将 `importScripts` 参数改为 `./jszip.min.js`。
- **权限**: 插件运行在同域下，下载附件会自动携带用户 Cookie，无需额外配置 Token。请确保当前用户对附件有下载权限。
