# 贡献指南

感谢你愿意改进 `GPT-Image-2 Studio`。这个仓库只维护公开的本地工具版，不接收私有平台功能相关改动。

## 本地启动

环境要求：

- Node.js `>= 20.19.0`
- npm `>= 10`
- 构建桌面版时需要 Rust toolchain

安装依赖：

```powershell
npm install
```

启动 Web 版本：

```powershell
npm run dev
```

运行测试：

```powershell
npm run test:run
```

构建前端：

```powershell
npm run build
```

检查桌面 Rust 代码：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## 提交前检查

提交 PR 前请至少运行：

```powershell
npm run release:check
npm run test:run
npm run build
```

如果改动涉及 Tauri、文件保存、系统存储或桌面打包，也请运行：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## 不要提交真实密钥

不要在代码、测试、截图、日志、Issue、PR 描述中提交真实 `API key`。

可以使用这些占位写法：

- `API key is blank`
- `your-api-key`
- `example-key`

如果你已经提交过真实密钥，请立刻在服务商后台轮换密钥，然后再清理提交历史。

## 适合提交的改动

- 本地工具版 UI/UX 优化。
- OpenAI compatible 响应格式兼容性改进。
- 错误提示和本地化文案改进。
- 提示词模板、历史记录、配置体验优化。
- Windows 安装包链路、文档、测试改进。

## 暂不接收的改动

- 用户注册或登录。
- 平台托管 `API key`。
- 积分、支付、充值、后台管理。
- 服务端队列、服务端图片存储。
- 平台级供应商熔断和健康监控。

这些属于私有平台版，不放入本公开仓库。

## 文案规则

- 默认中文文案应自然、明确，避免技术黑话。
- `API key` 和 `Base URL` 保留英文写法。
- 新增用户可见文案时，同步维护中英文内容。

## PR 建议

- 一个 PR 只解决一个问题。
- 附上改动截图或简短说明。
- 如果是 bug fix，请说明复现步骤和验证命令。
- 如果是 UI 改动，请确认窄屏下不会遮挡主要按钮或错误信息。
