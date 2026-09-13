# StepFun 实连成本台账 — 2026-09-14

- 密钥:`.env.e2e.local` E2E_API_KEY(掩码 `1tsO****Tse4`),仅本机使用,不入库。
- 硬上限:生图(step-image-edit-2)全轮累计 ≤30 张;文本(step-3.7-flash)≤60 次。
- 记账列:时间 | 用途 | 模型/端点 | 尺寸 | 结果 | 计数(图/文)

| # | 时间 | 用途 | 模型/端点 | 尺寸 | 结果 | 图累计 | 文累计 |
|---|---|---|---|---|---|---|---|
| 1 | 00:5x | 错误密钥路径(故意 401,零成本) | step-image-edit-2 /images/generations | 1024x1024 | 待填 | 0 | 0 |
| 2 | 00:5x | 错误模型名路径(故意 4xx,零成本) | step-e2e-nonexistent-model /images/generations | 1024x1024 | 待填 | 0 | 0 |
| 3 | 00:5x | 单图文生图 | step-image-edit-2 /images/generations | 1024x1024 | 待填 | 待填 | 0 |
| 4 | 00:5x | 单图图生图 | step-image-edit-2 /images/edits | 跟随输入图 | 待填 | 待填 | 0 |
| 5 | 00:5x | 批量 2 提示词 | step-image-edit-2 /images/generations ×2 | 1024x1024 | 待填 | 待填 | 0 |
| 6 | 00:5x | AI 任务规划(3→4) | step-3.7-flash /responses(可能回退 /chat/completions) | — | 待填 | — | 待填 |

(后续补充验证逐条追加;上限触发即停。)
