# Dashboard Magic OS

Dashboard Magic OS 是一个中英双语的 Obsidian 工作空间 OS，用于完成收集、管理、应用、归档与展示的完整流程。

> 当前状态：面向 GitHub 与 BRAT 小范围测试的桌面 alpha。整理架、学习脉络、人物健康与个性化设置迁移已经可用；AI 管家入口保留但所有操作仍锁定。

## 语言

- 简体中文（`zh-CN`）
- 英文（`en`）

[English README](README.md)

项目只维护一套代码，通过两份语言包显示不同语言。记录字段和稳定实体 ID 保持语言无关，不随界面翻译而变化。

新仓库使用语言无关的 `MagicOS/` 存储结构；现有 Dashboard OS 仓库可以通过兼容配置继续使用原来的 `Dashboard/` 目录，初始化不会移动或重命名既有文件。

## 开发

```bash
npm install
npm run check
npm run build
```

## 信息披露

- 公开 alpha 不包含遥测、广告、用户账户，也不会从可见界面发起 AI 网络请求。
- AI 管家是计划中的付费功能。入口会保留，但只有单独交付并通过验证的权益与私有运行适配器接入后才会开放。
- 未来使用 AI 时，需要用户自己的受支持 Provider 账户；API 密钥只保存在 Obsidian SecretStorage，不随导出包发布。
- 公开仓库使用 MIT 许可证；私有权益服务、付费适配器和运营基础设施是分离组件，不包含在这里。

参见[隐私说明](PRIVACY.md)、[安全策略](SECURITY.md)与[安装、升级和卸载](docs/INSTALL_UPGRADE_UNINSTALL.md)。

`npm run audit:release` 会阻止个人仓库数据、运行设置、本机绝对路径、明显密钥和开发权益模式进入公开构建。

## 仓库边界

本仓库只容纳插件源码、测试、文档和可分发资产。严禁放入个人 Obsidian 仓库、`data.json`、健康记录、人物卡、API凭证、使用账本、快照或备份。

参见[仓库边界](docs/REPOSITORY_BOUNDARY.md)、[国际化迁移](docs/I18N_MIGRATION.md)、[运行代码迁移计划](docs/MIGRATION_PLAN.md)、[发布检查表](docs/RELEASE_CHECKLIST.md)和[发布流程](docs/RELEASE_PROCESS.md)。

## 许可证

公开仓库源码使用 [MIT 许可证](LICENSE)。付费服务的私有组件不包含在本仓库中。
