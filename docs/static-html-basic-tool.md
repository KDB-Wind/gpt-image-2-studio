# 静态 HTML 基础工具版

这是基础工具版的单文件分发形态。它只包含本地生图工具，不包含平台注册、积分、管理员后台、平台托管 Key、服务端队列和平台图片存储。

普通用户优先阅读：

- [静态 HTML 版使用指南（中文）](user-guide-static-html.zh-CN.md)
- [Static HTML User Guide (English)](user-guide-static-html.en-US.md)

维护者构建方式：

```powershell
npm install
npm run build:static
```

构建产物是 `dist-static/index.html`。发布到 GitHub Release 时，最少只需要提供这个文件，用户下载后双击打开即可使用。

注意：静态 HTML 版从浏览器直接调用模型供应商接口，供应商必须允许浏览器跨域请求。如果遇到 CORS 报错，请改用桌面版，或自行部署代理服务。
