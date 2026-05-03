# 本地手动验收指南

本文档用于你在本机逐项验收当前应用。建议先做基础工具版，再做 Web 平台版；发现问题时按最后的反馈模板记录。

## 0. 验收前说明

- 不要把真实 `API key` 写进仓库、截图或反馈文档；反馈时只写 key 数量、供应商、错误信息。
- Windows 下 npm 缓存继续放 D 盘：

```powershell
$env:npm_config_cache = "D:\npm-cache"
```

- 基础工具版可以只启动前端或桌面应用。
- Web 平台版完整闭环必须有 PostgreSQL 和 Redis。原因是 API 和 Worker 是两个独立进程，若不配置 `DATABASE_URL`，它们会各自使用内存仓库，Worker 读不到 API 创建的任务。
- 本地开发不配置 SMTP 时，邮箱验证码会打印在 API 控制台，不会真的发邮件。

## 1. 启动基础工具版

在项目根目录打开 PowerShell：

```powershell
cd D:\DemoProject\chatToImage
$env:npm_config_cache = "D:\npm-cache"
npm run dev
```

浏览器打开：

```text
http://localhost:5173
```

应用默认进入基础工具版。此时不需要启动 API 服务，也不应该看到 `/api/status`、`/api/prompt-templates`、`/api/payment-packages` 的代理报错。只有手动切换到平台版时，才需要按第 3 节启动 API。

可选：如果要验收桌面壳：

```powershell
cd D:\DemoProject\chatToImage
$env:npm_config_cache = "D:\npm-cache"
npm run desktop:dev
```

## 2. 基础工具版验收清单

### 2.1 首次进入与配置

- [ ] 默认界面是中文。
- [ ] 首次欢迎弹窗只出现一次，关闭后刷新页面不再自动出现。
- [ ] 页面右下角有“请作者喝杯可乐”入口。
- [ ] 点击支持入口后能看到固定微信收款码，二维码不是用户可配置项。
- [ ] 可以切换“简体中文 / English”，刷新后语言选择仍保留。
- [ ] 进入设置页，`Base URL` 默认可填写为 `https://ruoli.dev/v1`。
- [ ] `API key` 留空时会提示用户填写，不应写死在仓库里。
- [ ] 文字模型和图片模型可编辑，例如文字模型 `gpt-5.4-mini`，图片模型 `gpt-image-2`。
- [ ] 超时时间可设置，建议本地先用 `240000` 毫秒。
- [ ] 输出目录可设置为本地目录，例如 `D:\DemoProject\chatToImage\outputs`。
- [ ] 保存配置后刷新页面，配置仍保留在当前用户本机。

### 2.2 连接测试

- [ ] 点击文字模型测试，成功时有明确成功提示。
- [ ] 点击图片模型测试，成功时有明确成功提示。
- [ ] 如果测试失败，仍允许保存配置，并展示可理解的错误信息。

### 2.3 文生图

- [ ] 输入一个简单提示词，例如“明亮的产品海报，一只白色陶瓷杯，奶油色背景，自然光”。
- [ ] 不填写图片名称时，生成后文件名按默认规则包含时间和摘要。
- [ ] 填写图片名称时，生成后文件名优先使用填写的名称。
- [ ] 生成过程中按钮禁用或有加载状态，长时间等待时页面不假死。
- [ ] 生成结果在页面中正常展示，不超出容器边界。
- [ ] 报错信息可以换行展示，不会被挤在一行或截断。
- [ ] 图片文件实际保存到输出目录。

### 2.4 图生图与多图参考

- [ ] 通过文件选择上传 1 张图片，可以提交图生图。
- [ ] 通过文件选择上传多张图片，最多允许 8 张。
- [ ] 上传超过 8 张时有明确提示。
- [ ] 推荐不超过 4 张的提示存在或体验上容易理解。
- [ ] 支持拖拽图片到上传区域。
- [ ] 拖拽多张图片后缩略图列表正常显示。
- [ ] 删除某一张参考图后，剩余图片数量和展示正常。
- [ ] 图生图生成结果在页面中正常展示，并保存到输出目录。

## 3. 启动 Web 平台版完整验收

### 3.1 准备 PostgreSQL 和 Redis

你可以使用本机已有的 PostgreSQL / Redis，也可以使用已有 Docker 环境。不要为了这次验收把新依赖装到 C 盘。

需要满足：

- PostgreSQL 可连接，并有一个测试数据库。
- Redis 运行在 `127.0.0.1:6379`，或你能提供 `REDIS_URL`。

执行数据库迁移。假设你已配置好 `$env:DATABASE_URL` 且本机有 `psql`：

```powershell
cd D:\DemoProject\chatToImage
$env:DATABASE_URL = "postgres://chat_to_image:password@127.0.0.1:5432/chat_to_image"
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f packages/platform-db/drizzle/0001_platform_schema.sql
```

如果你没有 `psql`，也可以用数据库管理工具打开 `packages/platform-db/drizzle/0001_platform_schema.sql` 手动执行。

如果你既没有 `psql`，也不想手动执行 SQL，可以改用 Docker 验收方式，见 `docs/docker-platform-acceptance.md`。Docker Compose 会自动启动 PostgreSQL、Redis 并执行迁移。

### 3.2 启动 API

打开第一个 PowerShell：

```powershell
cd D:\DemoProject\chatToImage
$env:npm_config_cache = "D:\npm-cache"
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgres://chat_to_image:password@127.0.0.1:5432/chat_to_image"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:PLATFORM_BASE_URL = "https://ruoli.dev/v1"
$env:PLATFORM_IMAGE_MODEL = "gpt-image-2"
$env:PLATFORM_API_KEY = "<YOUR_HOSTED_API_KEY>"
$env:PLATFORM_API_KEY_MAX_IN_FLIGHT = "1"
$env:PLATFORM_ADMIN_TOKEN = "local-admin-token"
$env:PLATFORM_OUTPUT_DIR = "D:\DemoProject\chatToImage\platform-outputs"
$env:GENERATION_JOB_TIMEOUT_MS = "240000"
npm run api:dev
```

说明：

- 本地不配置 SMTP 时，验证码会打印在这个 API 控制台。
- `PLATFORM_API_KEY` 可以换成 `PLATFORM_API_KEYS`，多个 key 用英文逗号分隔。
- 本地先用 1 个 key 即可，避免健康探测和调试造成多余成本。

### 3.3 启动 Worker

打开第二个 PowerShell，环境变量要和 API 保持一致：

```powershell
cd D:\DemoProject\chatToImage
$env:npm_config_cache = "D:\npm-cache"
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgres://chat_to_image:password@127.0.0.1:5432/chat_to_image"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:PLATFORM_BASE_URL = "https://ruoli.dev/v1"
$env:PLATFORM_IMAGE_MODEL = "gpt-image-2"
$env:PLATFORM_API_KEY = "<YOUR_HOSTED_API_KEY>"
$env:PLATFORM_API_KEY_MAX_IN_FLIGHT = "1"
$env:PLATFORM_ADMIN_TOKEN = "local-admin-token"
$env:PLATFORM_OUTPUT_DIR = "D:\DemoProject\chatToImage\platform-outputs"
$env:GENERATION_JOB_TIMEOUT_MS = "240000"
$env:GENERATION_WORKER_CONCURRENCY = "1"
npm run worker:dev
```

### 3.4 启动前端

打开第三个 PowerShell：

```powershell
cd D:\DemoProject\chatToImage
$env:npm_config_cache = "D:\npm-cache"
npm run dev
```

浏览器打开：

```text
http://localhost:5173
```

平台版界面的 API 地址留空即可，Vite 会把 `/api` 代理到 `http://localhost:3000`。

## 4. Web 平台版验收清单

### 4.1 注册登录

- [ ] 页面可看到“平台版”和“自有 API key 模式 / 基础工具版”切换入口。
- [ ] 平台状态可以刷新，图片模型显示为 `gpt-image-2` 或你配置的模型名。
- [ ] 输入邮箱，点击发送验证码。
- [ ] API 控制台出现类似 `Verification code for xxx@example.com: 123456`。
- [ ] 输入验证码后登录成功。
- [ ] 登录后显示当前账号、用户 ID、额度、任务数。
- [ ] 刷新页面后仍保持登录。
- [ ] 退出登录后，额度和任务历史清空或提示登录后查看。

### 4.2 提示词模板

- [ ] 模板分类可以切换。
- [ ] 选择模板后，变量输入框正常出现。
- [ ] 填写变量并点击套用模板后，提示词被写入生成输入框。
- [ ] 空模板列表时空状态文案清楚。

### 4.3 托管生图任务

- [ ] 登录后输入提示词，提交托管任务。
- [ ] 任务创建后进入任务历史，状态先显示排队中或生成中。
- [ ] Worker 控制台能看到任务被消费。
- [ ] 生成成功后任务状态变成已完成。
- [ ] 平台输出目录出现图片文件，例如 `D:\DemoProject\chatToImage\platform-outputs\<jobId>\image-1.png`。
- [ ] 任务详情能看到结果路径和图片大小。
- [ ] 成功生成后才扣额度；失败不应扣用户额度。
- [ ] 若供应商返回 `524`、`openai_error`、空图片等成本风险错误，平台应进入供应商熔断或提示服务暂不可用。
- [ ] 熔断期间再次提交托管任务，应被阻止，不应继续调用同一供应商。

### 4.4 充值申请与人工审核

- [ ] 普通用户选择 5 元或 10 元套餐。
- [ ] 填写付款备注，例如“本地验收测试”。
- [ ] 提交充值申请后，用户侧支付历史出现待审核记录。
- [ ] 管理员审核通过后，用户额度增加。
- [ ] 管理员拒绝后，支付记录显示已拒绝，额度不增加。

## 5. 管理员功能验收清单

在平台页面管理员区域输入：

```text
local-admin-token
```

然后点击刷新管理员数据。

### 5.1 支付审核

- [ ] 可以看到用户提交的待审核充值申请。
- [ ] 点击通过后，记录变为已通过，并发放额度。
- [ ] 点击拒绝后，记录变为已拒绝，不发放额度。

### 5.2 用户与额度

- [ ] 管理员用户列表能看到用户邮箱、用户 ID、额度、状态。
- [ ] 点击“填入用户 ID”后，人工加额度表单自动填入该用户 ID。
- [ ] 输入额度和原因，点击人工发放额度后，用户额度增加。
- [ ] 点击禁用用户后，该用户状态变为已禁用。
- [ ] 被禁用用户继续刷新额度、提交任务或支付申请时，应收到 401 或明确错误提示。
- [ ] 再次启用用户后，用户可以恢复使用。

### 5.3 供应商与托管 Key

- [ ] 管理员供应商列表能看到 provider、base URL、模型、状态。
- [ ] 托管 key 只显示标签、状态、并发，不显示明文 `API key`。
- [ ] 停用某个 key 后，该 key 状态变为已停用。
- [ ] 只有一个 key 且被停用时，普通用户提交托管任务应失败并提示无可用托管 key 或服务不可用。
- [ ] 启用 key 后，托管任务可以恢复提交。

### 5.4 健康探测配置

- [ ] 白天/夜间探测间隔可以修改并保存。
- [ ] 刷新管理员数据后，保存后的配置仍存在。
- [ ] 可选：手动运行健康探测，但这会产生一次图片模型调用成本。

手动健康探测命令示例：

```powershell
cd D:\DemoProject\chatToImage
$env:npm_config_cache = "D:\npm-cache"
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgres://chat_to_image:password@127.0.0.1:5432/chat_to_image"
$env:PLATFORM_BASE_URL = "https://ruoli.dev/v1"
$env:PLATFORM_IMAGE_MODEL = "gpt-image-2"
$env:PLATFORM_API_KEY = "<YOUR_HOSTED_API_KEY>"
$env:PLATFORM_ADMIN_TOKEN = "local-admin-token"
npm run health:probe
```

## 6. 常见问题定位

### 任务一直排队

优先检查：

- Worker 是否启动。
- API 和 Worker 是否使用同一个 `DATABASE_URL`。
- API 和 Worker 是否使用同一个 `REDIS_URL`。
- Redis 是否运行。

### 登录后用户接口 401 或 403

优先检查：

- 是否刚刚在管理员面板禁用了用户。
- 是否刷新过页面导致旧 session 与数据库状态不一致。
- 浏览器 DevTools 里是否有 `Authorization: Bearer <sessionToken>` 请求头。
- 可尝试退出登录后重新获取验证码登录。

### 收不到验证码

本地开发不配置 SMTP 时不会发邮件。验证码在 API 控制台，格式类似：

```text
Verification code for your@email.com: 123456
```

### 提交任务后 Worker 报找不到 job

这通常说明 API 和 Worker 没有共享同一个 PostgreSQL。不要用纯内存模式验收平台托管完整链路。

### 生图失败但后台显示 API key 被调用

记录：

- API 控制台错误。
- Worker 控制台错误。
- 任务状态和错误分类。
- 供应商后台调用时间。

如果错误是 `524`、`openai_error`、`bad_response_status_code`、空图片响应，大概率是供应商或上游模型异常；程序应进入熔断或阻止继续调用。

## 7. 反馈模板

验收后请按这个格式反馈：

```text
验收时间：
当前提交：运行 git log --oneline -1 的结果
浏览器：
是否使用 PostgreSQL：
是否使用 Redis：
是否使用真实托管 API key：

基础工具版：
- 通过项：
- 失败项：

Web 平台版：
- 通过项：
- 失败项：

管理员功能：
- 通过项：
- 失败项：

具体问题：
1. 操作步骤：
2. 预期结果：
3. 实际结果：
4. 页面截图：
5. API 控制台日志：
6. Worker 控制台日志：
7. 是否产生供应商调用成本：
```
