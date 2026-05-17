# 静态 HTML 基础工具版

静态 HTML 基础工具版只包含本地基础工具，不包含平台注册、积分、后台管理、平台托管 Key、服务器队列和平台图片存储。它的目标是让 GitHub 用户下载 Release 后，直接打开 `index.html` 使用，不需要运行 `npm run dev`。

## 使用方式

面向普通用户的推荐方式：

1. 从 GitHub Release 下载静态版压缩包。
2. 解压到本地目录。
3. 双击打开 `index.html`。
4. 进入设置页填写 `API key`、`Base URL`、文字模型、图片模型和超时时间。
5. 保存配置后开始文生图、图生图或批量生图。

配置会保存在当前浏览器的本地存储中，不会上传到项目作者的服务器。

## 维护者打包方式

```powershell
npm install
npm run build:static
Compress-Archive -Path dist-static\index.html -DestinationPath gpt-image-2-studio-static.zip -Force
```

`npm run build:static` 会生成 `dist-static/index.html`，并把 JS、CSS 和内置收款码资源内联到这个 HTML 文件中，方便作为单文件 Release 资产分发。

## 能力边界

- 保留：文生图、图生图、多图参考、拖拽上传、批量任务、AI 拆分提示词、历史记录、设置保存、作者支持弹层。
- 不包含：平台版登录注册、兑换码积分、管理员后台、平台托管 Key、后端队列、服务端图片存储。
- 保存图片：网页模式优先使用浏览器下载；支持 File System Access API 的浏览器可以选择目录。
- CORS 限制：静态 HTML 直接从浏览器调用模型供应商接口，供应商必须允许浏览器跨域请求。若供应商不开放 CORS，需要改用桌面版或由自己部署反向代理。
- 安全边界：`API key` 只保存在用户本机浏览器中，但浏览器直连模式无法做到后端级密钥保护。

## 适合场景

- GitHub 开源用户想快速试用基础工具。
- 用户愿意使用自己的 `API key`。
- 不希望作者服务器承担推理、队列或存储成本。

如果目标用户完全不懂配置 `API key`，仍然建议使用 Web 平台托管 Key 模式，而不是静态 HTML 基础工具版。
