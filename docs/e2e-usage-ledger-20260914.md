# StepFun 实连成本台账 — 2026-09-14

- 密钥:`.env.e2e.local` E2E_API_KEY(掩码 `1tsO****Tse4`),仅本机使用,不入库。
- 硬上限:生图(step-image-edit-2)全轮累计 ≤30 张;文本(step-3.7-flash)≤60 次。
- 记账列:# | 时间 | 用途 | 模型/端点 | 尺寸 | 结果 | 图累计 | 文累计

| # | 时间 | 用途 | 模型/端点 | 尺寸 | 结果 | 图累计 | 文累计 |
|---|---|---|---|---|---|---|---|
| 1 | 00:57 | 错误密钥路径(故意 401,零成本) | step-image-edit-2 /images/generations | 1024x1024 | e2e ok:auth 分类+脱敏文案 | 0 | 0 |
| 2 | 00:57 | 错误模型名路径(零成本) | step-e2e-nonexistent-model /images/generations | 1024x1024 | e2e ok:provider 分类文案 | 0 | 0 |
| 3 | 00:57 | 单图文生图 e2e | step-image-edit-2 /images/generations | 1024x1024 | e2e ok:预览+历史 | 1 | 0 |
| 4 | 00:57 | 单图图生图 e2e | step-image-edit-2 /images/edits | 随输入(64x64) | e2e ok:预览 | 2 | 0 |
| 5 | 00:57 | 批量 2 提示词 e2e | step-image-edit-2 /images/generations ×2 | 1024x1024 | e2e ok:2 成功+历史 | 4 | 0 |
| 6 | 00:57 | AI 任务规划 e2e(3→4) | step-3.7-flash /responses | — | e2e ok:计数调整正确 | 4 | 1 |
| 7 | 01:05 | 探测:/responses 形态 | step-3.7-flash /responses | — | 200,Responses 形态,reasoning 被过滤 | 4 | 2 |
| 8 | 01:05 | 探测:/chat/completions 形态 | step-3.7-flash /chat/completions | — | 200,标准 choices | 4 | 3 |
| 9 | 01:05 | 探测:/models(零成本) | GET /models | — | 200,模型列表 | 4 | 3 |
| 10 | 01:08 | 探测:多参考图 1px(零成本,被尺寸校验拦) | /images/edits | — | 400 image_resolution_exceeded(最小 64px) | 4 | 3 |
| 11 | 01:08 | 探测:超范围尺寸(零成本) | /images/generations size=2048x2048 | — | 400 size_invalid(白名单 5 档) | 4 | 3 |
| 12 | 01:10 | 探测:多参考图(2×64px) | step-image-edit-2 /images/edits | 随输入 | 200,b64_json 返回 | **5** | 3 |

**汇总:生图 5/30 张;文本 3/60 次。未触发上限,无超支。**
