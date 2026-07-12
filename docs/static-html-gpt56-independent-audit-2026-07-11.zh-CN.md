# 静态 HTML 版独立技术审计报告

审计更新：2026-07-12

审计对象：静态 HTML 发布链路与目录保存体验。

## 1. 结论摘要

此前审计提出的发布级问题已完成修复并经复核。当前自动化状态为：**Fixed and unit-tested**、**Mock E2E verified**、**Real-provider verified**。

唯一未完成的手工发布验收门槛是 Native File System Access：在一个受支持浏览器中完成原生目录授权、真实写读和刷新后历史恢复。它不是自动化代码缺陷；在该手工证据取得前，不得称“完整 E2E 已闭环”或“原生验证完成”。

## 2. 已修复并复核的事项

- 真实目录保存已实现同一浏览器应用实例内的文件与历史原子事务，并拒绝真实目录碰撞覆盖。
- 每个单图或批量任务恰好请求一张图片；旧数量值已规范化。
- 前端与桌面端的配置持久化完整覆盖图片响应模式与批量设置。
- `v0.1.6` 已绑定发布与归档；Git blob、链接和路径均受守卫；Release 使用严格校验、Pages 使用非严格校验；校验和生成前执行最终一致性检查；已验证 clean HEAD 可复现性和非空工作流测试。
- 先前 clean 构建不一致的根因是 Windows 下内联 SVG 的 CRLF 行尾；统一为 LF 后已解决。

## 3. 2026-07-12 控制器复核

| 证据层级 | 状态 | 证据 |
| --- | --- | --- |
| Fixed and unit-tested | 已验证 | `npm run test:run`：32 个文件、451 个测试通过；`npx tsc --noEmit` 通过；`cargo test`：25 通过；`cargo check` 通过。 |
| 构建与发布检查 | 已验证 | `npm run build`、`npm run build:static` 均通过，均为 47 个模块；`npm run site:check` 通过；`npm run release:check` 的 21 个 readiness 测试及 readiness、clean HEAD 可复现性、严格归档一致性均通过。 |
| Mock E2E verified | 已验证 | `npm run e2e:static:mock`：10 通过、1 个预期跳过；`npm run e2e:static:file`：2 通过。 |
| Real-provider verified | 已验证 | `npm run e2e:static:real`：4 通过，无重试。未记录或暴露任何服务配置、服务身份或响应内容。 |
| 安全与变更卫生 | 已验证 | 两层密钥扫描均通过；`git diff --check` 通过。 |
| Native manual pending | 待人工验收 | 尚无原生目录选择器、真实写读或历史恢复的可采信证据。 |

### 3.1 归档校验和

- `v0.1.4`：`2921ACDD0350D487E0659B0A143C7AC3597DA36AF80DA7FD0A4980190CF19A64`
- `v0.1.5`：`50D653FECF24AFD86F7FB7C9F082555A987BB1610ACABC5AAB93E48F74326056`
- `v0.1.6` 源归档、分发 index 与 lite HTML：`A81D9D9C0E6E76C95BB66D16ED74F7283B0B3D90397060EF37B44AD2E5FEF129`

## 4. 原生手工验收

仅需在 **Chrome 或 Edge 之一** 的受支持版本完成一次，并记录浏览器名称与准确版本。使用脱敏的授权子目录（例如 `<AUTHORIZED_SUBFOLDER>`），不得记录真实用户名或完整私人路径。

验收必须覆盖：

1. 授权子目录及测试文件写入、读回。
2. 单图输出落入授权目录。
3. 批量输出及 manifest 落入授权目录。
4. 刷新后历史预览恢复。

一次 Computer Use 尝试不能作为证据：当时仅打开了 Edge，自动化未能稳定建立 URL/上下文，随后用户按 Esc；没有取得原生选择器、写入、读回或历史恢复证据。

## 5. 已批准的残余限制

- 保存队列只在同一浏览器应用实例内协调；其他标签页、进程或外部写入者理论上仍可竞争。
- 若浏览器文件写入 Promise 永不 settle，该实例的保存队列可能停滞。
- 时间点一致性检查不能阻止具有更高权限的外部进程在检查后修改文件。

## 6. 发布表述

可表述为“自动化验证完成，真实服务 smoke 已验证”。不得表述为“完整 E2E 已闭环”或“Native File System Access 已验证”，直到第 4 节的手工验收完成并有可复核证据。
