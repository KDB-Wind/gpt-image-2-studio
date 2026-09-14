# 维护三件套草稿 — 2026-09-14(发布与 push 留给用户,本文件仅为草稿)

## 1. CHANGELOG 本轮条目草稿(建议并入 v0.1.8)

```markdown
### Fixed
- 设置页连接字段(Base URL / API key / 文本模型 / 生图模型 / 响应模式 / 记住密钥)现即时同步到当前
  供应商 profile:修复"编辑后当次会话不生效、保存重载后回退为旧值"的缺陷;桌面端首次输入的密钥
  从此可正常落盘(此前重启即丢)。
- 发布前可靠性:损坏的本地历史不再导致应用启动失败(空历史降级 + 逐条过滤坏记录);已保存图片不再
  因历史刷新失败被误标"生成失败";批量重试失败不再使任务卡在"进行中",完成批次不再被通知/历史回调
  失败改判"已暂停";选择输出目录不再顺带保存未点击"保存"的草稿配置(含 API key)。
### Added
- mock e2e 覆盖矩阵扩容:单图图生图、单图浏览器下载回退(含错误脱敏断言)、批量取消剩余任务、
  file:// 双击打开页生图、设置编辑请求可达性+重载保持回归;实连新增错误密钥/错误模型两条零成本
  契约用例;e2e 种子配置改为同步写入 provider profile。
- i18n validation 键集双语一致性守卫单测。
### Docs
- src/ 全量静态审计(每文件一行,分级 P0-P3)、mock e2e 覆盖矩阵、StepFun 实连契约矩阵与成本台账
  (生图 5/30、文本 3/60)、全量门禁记录。
### Known Issues(未修,详见 docs/audit-20260914.md)
- P2 剩余:B-2 历史预览竞态、B-3 批次预览吞错、B-5 配额满不裁剪、B-6 目录取消被当失败、B-12 非 JSON
  200 分类失真;桌面端清除 API key 仍会被 keyring 复活(需 Rust 侧配合,批次 4 待启动)。
- (测试基础设施,非产品风险,不入发布阻断)实连 e2e 供应商 StepFun 图像接口 2026-10-10 停服,届时
  替换测试供应商或停用 e2e:static:real 即可。
```

## 2. 版本号建议

- **建议下一版:v0.1.8**(当前 package.json 0.1.7、latestStable 0.1.7、release-notes 至 v0.1.7)。
- 理由:本轮为行为修复(P1)+ 测试/文档扩容,无破坏性接口变更,沿 0.1.x 补丁线递增;发布时需同步
  package.json、static-versions/manifest.json(latestStable/versions/digest)、docs/release-notes/v0.1.8.md,
  并按 docs/release.md 推进外部 STATIC_ARCHIVE_TRUSTED_BASE。

## 3. Release Notes 草稿(docs/release-notes/v0.1.8.md)

```markdown
# GPT-Image-2 Studio v0.1.8

This release fixes a provider-profile synchronization defect and carries the 2026-09-14 audit,
coverage, and live-contract work. The immutable v0.1.7 archive baseline is preserved.

- Settings edits for the active provider (Base URL, API key, text/image model, response mode,
  remember-key) now apply to same-session requests and persist across reload. Previously these
  edits were silently ignored until a page reload and reverted to the previous profile values
  after reload; on desktop the first-entered API key was never persisted.
- Expands mock e2e coverage (single image-to-image, single browser-download fallback with
  redaction asserts, batch cancel, file:// generation, settings-edit request targeting and
  reload persistence) and adds zh/en validation key parity guard.
- Adds zero-cost real-provider error-path tests (wrong key, wrong model) and seeds the e2e
  config with a synchronized provider profile.
- Documents the 2026-09-14 audit (P2 backlog recorded, not fixed), StepFun live contract matrix
  (5 images / 3 text calls against the authorized key), and full gate records.
- Known issue: clearing the API key on desktop is resurrected from the Rust keyring until a
  Rust-side clear channel lands; StepFun's step-image-edit-2 and /images/edits are announced to
  stop serving 2026-10-10 and need a migration decision.
- Requires maintainers to advance the external STATIC_ARCHIVE_TRUSTED_BASE after the stable
  v0.1.8 archive exists. This note records the requirement only and does not claim the GitHub
  Repository Variable has already been changed.

Immutable archive SHA-256 values:

- `v0.1.4`: `2921ACDD0350D487E0659B0A143C7AC3597DA36AF80DA7FD0A4980190CF19A64`
- `v0.1.5`: `50D653FECF24AFD86F7FB7C9F082555A987BB1610ACABC5AAB93E48F74326056`
- `v0.1.6`: `0E67C34BAF4C4289D4864F6CC8E842DF84C23B14CE94E34C8C2354ECA059AEB3`
- `v0.1.7`: `EBDBE76F4E9F731FCA70BDECDC303DA635258F3B8CEC2B96AAEF6C53EB11A9C4`
- `v0.1.8`: `<发布归档时由 archive:static 生成后填入>`
```
