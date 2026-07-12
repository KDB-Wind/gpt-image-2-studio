# 单文件 HTML 基础工具版

单文件 HTML 是基础工具版的最低门槛分发形态。它只包含本地生图工具，不包含注册、积分、管理员后台、平台托管 Key、服务端队列或服务端图片存储。

## 用户如何使用

普通用户应从 GitHub Release 下载：

```text
gpt-image-2-studio-lite.html
```

下载后双击打开即可使用。推荐浏览器是 Microsoft Edge 或 Chrome。

也可以直接使用 GitHub Pages 在线静态页：

```text
https://kdb-wind.github.io/gpt-image-2-studio/
```

不要从仓库源码列表里下载根目录 `index.html`。根目录 `index.html` 是 Vite 源码入口，缺少打包后的脚本和样式，不能作为单文件应用运行。

## 维护者如何构建

```powershell
npm install
npm run build:static
npm run site:check
```

构建后会生成：

```text
dist-static/index.html
dist-static/gpt-image-2-studio-lite.html
```

发布到 GitHub Pages 时使用 `dist-static/index.html`。

发布到 GitHub Release 时上传 `dist-static/gpt-image-2-studio-lite.html`。

## 重要限制

单文件 HTML 从浏览器直接请求模型供应商接口。供应商必须允许浏览器跨域请求。如果遇到 CORS 错误，请改用 Windows 桌面版，或自行部署代理服务。

维护者可以用下面的命令检查 CORS：

```powershell
$env:BASE_URL = "<PROVIDER_BASE_URL>"
$env:SITE_ORIGIN = "https://kdb-wind.github.io"
npm run cors:check
```
