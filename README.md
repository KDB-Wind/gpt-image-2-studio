# Chat To Image

本地可运行的轻量生图工具，支持：

- Web 模式：浏览器打开即用
- Desktop 模式：Tauri 本地桌面壳
- 本地保存每个用户自己的配置
- 可选提示词优化
- 本地保存生成图片和历史记录

这个项目没有自建后端服务，但它仍然需要联网访问你在设置里填写的 OpenAI 兼容接口。

## 默认配置

- Base URL：`https://ruoli.dev/v1`
- Text model：`gpt-5.4-mini`
- Image model：`gpt-image-2`
- API key：默认留空
- Timeout：`180` 秒
- Output directory：`outputs`

## 环境要求

- Node.js `>= 20.19.0`
- npm `>= 10`
- Desktop 模式还需要 Rust 工具链

安装依赖：

```powershell
npm install
```

## 启动方式

Web 模式：

```powershell
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)

Desktop 模式：

```powershell
npm run desktop:dev
```

桌面打包：

```powershell
npm run desktop:build
```

## 首次使用

打开应用后进入 `Settings`，填写并保存：

- API key
- Base URL
- Text model
- Image model
- Timeout
- Output directory

说明：

- `Test text` 和 `Test image` 都是可选操作
- 测试失败不会阻止保存配置
- Base URL 支持填写带 `/v1` 或不带 `/v1` 的形式，应用会自动规范化
- Prompt 优化是手动触发，不会自动改写你的提示词

## 本地配置保存

### Web 模式

- 配置和历史记录保存在浏览器本地存储中
- API key 不会写进项目源码文件
- 关闭或更换浏览器环境后，配置是否保留取决于该浏览器本地存储

### Desktop 模式

- 配置和历史记录保存在当前用户自己的本地应用目录
- API key 优先尝试保存到系统 keyring
- 如果当前系统 keyring 不可用，会回退到本地配置文件，但仍只保存在当前用户机器上

这也是为什么仓库里不需要预置真实 API key，只保留空值即可，其他用户下载项目后各自本地配置即可。

## 图片保存规则

默认目录结构：

```text
outputs/
  2026-04-30/
    21-15-08_sunset-city.png
```

规则：

- 默认按日期分目录：`输出目录/YYYY-MM-DD/`
- 如果填写了 `Custom image name`，优先使用该名称
- 如果没填写，则使用 `HH-mm-ss_提示词摘要`
- 文件名会自动清洗非法字符
- 如果重名，会自动追加 `-2`、`-3` 等后缀

Desktop 模式会直接写入配置的输出目录。  
Web 模式会优先尝试使用浏览器目录授权；如果当前浏览器不支持，则回退为下载文件。

## 当前功能

- 输入提示词并生成图片
- 手动调用文字模型优化提示词
- 预览最新生成结果
- 保存并按日期查看历史记录
- 复用历史提示词
- 自定义输出目录
- 分别测试文字模型和图片模型连通性

## 验证命令

```powershell
npm run test:run
npm run build
```

Rust 侧验证：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## 安全说明

- 仓库默认不包含真实 API key
- 每个用户都应在自己的本地环境中填写和保存 API key
- 不要把包含真实密钥的配置文件提交到 Git
