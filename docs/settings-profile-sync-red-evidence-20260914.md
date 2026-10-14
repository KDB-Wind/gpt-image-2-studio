# 设置与 active profile 同步修复：红测试复验证据

## 证据性质

T4 最初的未提交红测试 runner 输出没有保存。本文件记录的是 T6 审核整改时进行的**隔离重建复验**，不是对缺失历史日志的补造。

复验基线为修复前提交 `51bdb95`（即 `5be3658^`）。隔离 worktree 只应用 `5be3658` 中 `src/App.test.tsx` 的测试差异，不应用 `src/App.tsx` 修复，然后运行：

```powershell
npx vitest run src/App.test.tsx
```

## 原始关键输出

```text
❯ src/App.test.tsx (38 tests | 2 failed)
    × applies settings edits to the active provider profile for same-session generation
    × persists settings edits into the active provider profile on save

AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times

- Expected
+ Received

  {
-   "apiKey": "edited-persist-key",
-   "baseUrl": "https://persist.example/v1",
-   "imageModel": "persist-image-model",
-   "textModel": "persist-text-model",
+   "apiKey": "test-key",
+   "baseUrl": "https://ruoli.dev/v1",
+   "imageModel": "gpt-image-2",
+   "textModel": "gpt-5.4-mini",
  }

Test Files  1 failed (1)
     Tests  2 failed | 36 passed (38)
```

退出码为 `1`。该结果直接复现了同会话请求未使用编辑值，以及保存仍读取旧 active profile 的两个失败条件。

## 绿色对应

当前实现上运行项目规定的 focused 门禁：

```powershell
npx vitest run src/core/providerProfiles.test.ts src/App.test.tsx
```

结果为 2 个测试文件通过、46/46 测试通过。T6 还补充断言了 `imageResponseMode`、`rememberApiKey`，并同时校验六字段的 active profile 与顶层兼容镜像。
