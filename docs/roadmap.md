# 后续工作记录

本文档记录 `GPT-Image-2 Studio` 公开工具版的后续优化事项。平台版的注册、积分、支付、队列、供应商熔断等能力不放入本仓库路线图。

## 已完成

- P0 自动发布链路：Windows `setup.exe` Release workflow、离线 WebView2 安装模式、首版 Release 文案、人工验收清单。
- P0 README 门面：badges、界面预览、普通用户安装说明、推荐中转站链接。
- P1 开源项目门面：`CONTRIBUTING.md`、`SECURITY.md`、FAQ、GitHub issue templates。
- P2 工具版体验优化：错误解释、历史搜索过滤、批量删除、输出目录快捷打开、提示词模板、自定义模板。

## P0 剩余人工动作

- 推送 `v0.1.0` tag 后，等待 GitHub Actions 生成草稿 Release。
- 从草稿 Release 下载 `setup.exe`，按 [release-checklist.md](./release-checklist.md) 做一次干净 Windows 环境验收。
- 验收通过后，在 GitHub Releases 页面手动发布正式 Release。

## P3: 发布链路增强

- 为 Release workflow 增加 checksum 文件，例如 `SHA256SUMS.txt`。
- 为 Release workflow 增加安装包 artifact 保留策略说明。
- 调研并补充 `.msi` 产物链路；当前首版只发布已经验收通过的 NSIS `setup.exe`。
- 后续考虑代码签名，降低 Windows SmartScreen 对普通用户的拦截概率。
- 后续考虑自动更新，但需要先明确签名、发布渠道和回滚策略。

## P4: 质量与兼容性

- 增加 Playwright 或等价工具的 UI smoke test，覆盖主界面、设置页、欢迎弹窗和支持弹层。
- 增加窄屏布局验收，避免图片预览、错误信息和按钮挤压。
- 增加 Tauri 安装版的基础手动验收清单。
- 增加更多 OpenAI compatible 响应格式兼容测试，尤其是空图片、不同 base64 字段、不同错误结构。

## 暂不纳入公开工具版

- 用户注册和登录。
- 平台托管 `API key`。
- 积分、充值、支付审核。
- 平台任务队列和管理员后台。
- 平台级供应商熔断与健康探测。
- 服务器端图片存储。

这些能力属于私有平台版，应在 `chatToImage` 主项目中继续维护。
