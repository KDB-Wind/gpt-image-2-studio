# 后续工作记录

本文档记录 `GPT-Image-2 Studio` 公开轻量工具版的后续优化事项。平台注册、积分、支付、队列、托管 Key、供应商熔断和服务器图片存储不放入本仓库路线图。

## 已完成

- P0 自动发布链路：Windows `setup.exe` Release workflow、离线 WebView2 安装模式、首版 Release 文案、人工验收清单。
- P0 README 门面：badges、界面预览、普通用户安装说明、推荐中转站链接。
- P1 开源项目门面：`CONTRIBUTING.md`、`SECURITY.md`、FAQ、GitHub issue templates。
- P2 工具版体验优化：错误解释、历史搜索过滤、批量删除、输出目录快捷打开、提示词模板、自定义模板。
- P3 发布链路增强：安装包 `SHA256SUMS.txt`、Release 附件、workflow artifact 上传、artifact `30` 天保留策略、release readiness 校验。
- P4 质量与兼容性：Vitest/jsdom UI smoke tests、窄屏 CSS smoke tests、更多 OpenAI-compatible 图片响应解析测试。

## P0 剩余人工动作

- 推送 `v0.1.0` tag 后，等待 GitHub Actions 生成草稿 Release。
- 从草稿 Release 下载 `setup.exe` 和 `SHA256SUMS.txt`，按 [release-checklist.md](./release-checklist.md) 做一次干净 Windows 环境验收。
- 验收通过后，在 GitHub Releases 页面手动发布正式 Release。

## 后续可选优化

- 增加 `.msi` 产物链路，但需要单独设计 QA 清单。
- 增加代码签名，降低 Windows SmartScreen 对普通用户的拦截概率。
- 增加自动更新，但需要先明确签名、发布通道和回滚策略。
- 如果 UI smoke test 不足以捕捉真实布局问题，再评估引入 Playwright；当前为了保持仓库轻量，暂不下载浏览器运行时。
- 增加更多供应商兼容测试样本，但不在公开工具版内实现供应商熔断或托管 Key 分发。

## 暂不纳入公开工具版

- 用户注册和登录。
- 平台托管 `API key`。
- 积分、充值、支付审核。
- 平台任务队列和管理员后台。
- 平台级供应商熔断与健康探测。
- 服务器端图片存储。

这些能力属于私有平台版，应在 `chatToImage` 主项目中继续维护。
