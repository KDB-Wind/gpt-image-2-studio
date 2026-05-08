# v0.1.1 人工验收清单

本文档用于首个公开 Release 前的人工验收。自动检查不能替代安装包实测。

## 发布前本地检查

在 `main` 分支运行：

```powershell
npm run release:check
npm run test:run
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

全部通过后再创建 tag。

## GitHub Actions 检查

1. 推送 `v0.1.1` tag，或手动触发 `Release` workflow。
2. 等待 `Release` workflow 完成。
3. 确认 workflow 上传了 Windows installer artifact。
4. 确认 artifact 中包含 `setup.exe` 和 `SHA256SUMS.txt`。
5. 确认 GitHub Releases 中生成了草稿 Release。
6. 确认草稿 Release 附带 `setup.exe` 和 `SHA256SUMS.txt`。
7. 下载后用 `Get-FileHash` 对比 `SHA256SUMS.txt`。

## 干净 Windows 机器安装验收

1. 从 GitHub 草稿 Release 下载 `setup.exe`。
2. 安装应用。
3. 启动应用。
4. 确认默认语言是中文。
5. 确认首次欢迎弹窗显示。
6. 关闭欢迎弹窗后重启，确认不再自动出现。
7. 切换到 English 后重启，确认语言设置被记住。
8. 打开设置页，填写 `API key`、`Base URL`、文字模型、图片模型和输出目录。
9. 保存配置。
10. 测试文字模型连通性。
11. 测试文生图模型连通性。
12. 上传 1 张参考图，测试图生图。
13. 拖拽 2 到 4 张参考图，测试多图参考。
14. 确认生成中的进度提示不会卡死界面。
15. 确认生成成功后图片显示在预览区。
16. 确认图片保存到按日期分组的本地输出目录。
17. 打开历史页，确认历史记录可搜索、过滤、复用和批量删除。
18. 打开设置页，确认输出目录快捷打开按钮可用。
19. 点击右下角“请作者喝杯可乐”，确认收款码弹层显示正常，并可放大查看。
20. 缩窄窗口，确认图片预览、错误消息和主要按钮没有明显溢出或挤压。

## Release 发布前确认

- README 顶部 badges 显示正常。
- README 链接到中文、英文、FAQ、Release、贡献和安全文档。
- Release 文案使用 `docs/release-notes/v0.1.1.md`。
- Release 页面明确普通用户优先下载 `setup.exe`。
- Release 页面附带 `SHA256SUMS.txt`。
- 如果发现安装失败、启动失败、图片生成关键链路失败或校验和不匹配，不发布正式 Release。
