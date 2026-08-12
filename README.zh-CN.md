# Dashboard Magic OS

Dashboard Magic OS 是一个中英双语的 Obsidian 工作空间 OS，用于完成收集、管理、应用、归档与展示的完整流程。

> 当前状态：公开仓库地基。正式运行代码尚未迁入，请勿把当前仓库当成可安装成品。

## 语言

- 简体中文（`zh-CN`）
- 英文（`en`）

项目只维护一套代码，通过两份语言包显示不同语言。记录字段和稳定实体 ID 保持语言无关，不随界面翻译而变化。

新仓库使用语言无关的 `MagicOS/` 存储结构；现有 Dashboard OS 仓库可以通过兼容配置继续使用原来的 `Dashboard/` 目录，初始化不会移动或重命名既有文件。

## 开发

```bash
npm install
npm run check
npm run build
```

`npm run audit:release` 会阻止个人仓库数据、运行设置、本机绝对路径、明显密钥和开发权益模式进入公开构建。

## 仓库边界

本仓库只容纳插件源码、测试、文档和可分发资产。严禁放入个人 Obsidian 仓库、`data.json`、健康记录、人物卡、API凭证、使用账本、快照或备份。

参见[仓库边界](docs/REPOSITORY_BOUNDARY.md)、[国际化迁移](docs/I18N_MIGRATION.md)、[运行代码迁移计划](docs/MIGRATION_PLAN.md)和[发布检查表](docs/RELEASE_CHECKLIST.md)。

## 许可证

目前尚未选择开源许可证。在加入许可证文件以前，默认保留全部权利；第一次公开发布前必须完成许可证决策。
