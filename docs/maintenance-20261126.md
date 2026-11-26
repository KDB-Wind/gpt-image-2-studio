# 2026-11-26 Gemini UI 改版前维护

## 范围

- 核对 PR #11 与本地、远端分支。用仓库 CI 的 Node 22 验证现有修复。
- 修复完整 npm 审计报告中的开发依赖问题。只更新受影响的 Vitest、undici 及其随附的锁文件项。
- 保存 `f9782cc` 的 `v0.1.11` 静态版 UI 截图，作为 Gemini 改版前基线。

验收包括完整 npm 审计、单元测试、静态归档字节一致检查，以及 GitHub 对更新后提交的 CI 结果。此次授权覆盖修复分支与现有 PR 的维护。合并至 `main` 会触发 GitHub Pages 部署，需另行授权。真实供应商和发行安装包验收各有独立边界。

## 基线

- 开始时，本地分支、远端分支及 PR #11 指向 `f9782cc`，`main` 指向 `916f43d`。PR 的四项 CI 都成功，GitHub 标记为草稿，且没有 review thread。
- 生产依赖审计为零。完整审计报告命中 `vitest`、`@vitest/mocker` 和 `undici`。锁文件更新至 Vitest 4.1.12 和 undici 7.30.2。
- 在本地 Chromium 以 1600 像素宽度打开 `f9782cc` 的归档 HTML，保存七张中文全页截图。两张结果图使用模拟供应商返回的项目图标，没有真实凭据和真实模型请求。
- 本机 Node 26 的 Vitest/jsdom 环境出现 `localStorage` 不可用的问题。此轮验证使用 CI 的 Node 22。
