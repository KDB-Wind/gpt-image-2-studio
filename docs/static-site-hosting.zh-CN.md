# 静态站发布指南

本文说明如何把 GPT-Image-2 Studio 的基础工具版发布成静态网站。静态站只发布前端页面，不提供注册、支付、托管 key、后端代理或服务端图片存储。

## 推荐方案

优先使用 GitHub Pages：

- 与开源仓库天然绑定。
- 不需要额外服务器。
- 可以直接通过 GitHub Actions 构建和发布。
- 用户能看到源码，更容易信任没有内置作者的 `API key`。

如果后续要绑定自有域名或做更好的全球访问速度，可以再考虑 Cloudflare Pages。

## 用户使用模型

当前静态站采用 BYOK 模式，即 Bring Your Own Key：

- 用户自己填写自己的 `API key`。
- 用户自己填写自己的 `Base URL`。
- 配置只保存在用户自己的浏览器本地存储中。
- 浏览器直接请求用户填写的模型供应商。
- 本项目不托管、不转发、不记录用户的 key。

这意味着：同一个网站被不同用户访问时，每个用户只能使用自己浏览器里填写的 key，不能使用其他人的 key。

## GitHub Pages 发布流程

1. 确认公开仓库只包含基础工具版，不包含平台后端或私有部署文件。
2. 合并代码到 `main`。
3. 打开 GitHub 仓库 Settings。
4. 进入 Pages。
5. Source 选择 `GitHub Actions`。
6. 推送 `main`，触发 `.github/workflows/pages.yml`。
7. 等待 `Pages` workflow 完成。
8. 打开输出地址：

```text
https://kdb-wind.github.io/gpt-image-2-studio/
```

## 本地验证

发布前建议运行：

```powershell
npm run release:check
npm run test:run
npm run site:verify
```

其中：

- `release:check` 检查公开发布所需文件、workflow 和密钥风险。
- `test:run` 跑前端测试。
- `site:verify` 构建 `dist-static` 并检查 `index.html`、离线 HTML 和密钥扫描。

## CORS 验证

静态站能否直接调用图片模型，关键取决于供应商是否允许浏览器跨域请求。

用当前推荐中转站测试：

```powershell
$env:BASE_URL = "https://ruoli.dev/v1"
$env:SITE_ORIGIN = "https://kdb-wind.github.io"
npm run cors:check
```

通过时应看到类似：

```text
Status: 204
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: *
CORS preflight check passed.
```

如果 CORS 不通过，浏览器会直接拦截请求。解决方式只有三类：

- 更换支持浏览器 CORS 的供应商。
- 使用 Windows 桌面版。
- 自行部署后端代理。注意代理会引入服务器成本和 key 安全责任。

## API key 安全边界

静态站可以安全公开的前提是：

- HTML 源码中不写入任何真实 `API key`。
- 只让用户自己在浏览器里填写自己的 key。
- 不引入第三方统计脚本、广告脚本或远程 JS。
- 每次发布前跑密钥扫描。

需要提醒用户：

- 不要在公共电脑保存 key。
- 不要把包含 key 的截图发到 Issue。
- 如果担心在线站更新后的代码读取同一域名本地存储，可以使用离线 HTML。

## 发布后验收

1. 打开 GitHub Pages 地址。
2. 查看页面是否正常加载。
3. 搜索页面源码，确认没有 `sk-`。
4. 填入测试用 `API key` 和 `Base URL`。
5. 测试文字模型。
6. 测试图片模型。
7. 生成一张小图。
8. 刷新页面，确认配置仍在本地浏览器中。
9. 换一个无痕窗口，确认不会自动带出普通窗口里的 key。
10. 在浏览器 Network 中确认请求直接发往用户填写的 `Base URL`。

## 和离线 HTML 的关系

GitHub Pages 发布的是：

```text
dist-static/index.html
```

GitHub Release 附件发布的是：

```text
dist-static/gpt-image-2-studio-lite.html
```

这两个文件内容相同，只是名字不同：

- `index.html` 用于静态站根路径访问。
- `gpt-image-2-studio-lite.html` 用于用户下载后双击打开。
