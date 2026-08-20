# H2 Sentinel / 氢哨

> OpenDashboard 的比赛版本：面向 T03-04 弱电网绿氢 EMS 功率协调异常诊断与运检助手的本地优先 Web 应用。

H2 Sentinel（氢哨）本质是一套**插件组合（plugin composition）**：它在 OpenDashboard 的插件优先架构（共享契约 `@opendashboard/contracts` + 静态可信插件运行时 `@opendashboard/plugin-runtime`）之上，组合了 H2 域契约 `@opendashboard/h2-contracts`、H2 EMS 插件 `@opendashboard/h2-ems`、回环只读分析侧车 `services/h2-analytics` 与 H2 Web feature。

本仓库是 H2 Sentinel 的独立建仓版本，不修改 OpenDashboard 的 `main`。产品定位：诊断与受控恢复建议，建议需人工确认，不控制设备、不替换 EMS。

## 插件组合分层

```text
H2 Web feature（apps/web/src/features/h2-sentinel，六个中文页面）
  └─ @opendashboard/h2-ems（H2 EMS 插件：Fixture / 回环适配器）
       ├─ @opendashboard/h2-contracts（H2 域契约 C01-C07、证据、影响、安全、报告、提交 CSV）
       └─ services/h2-analytics（可信、仅回环的 Python/FastAPI 分析侧车）
            └─ @opendashboard/contracts + @opendashboard/plugin-runtime（OpenDashboard 核心插件系统）
```

## 目录结构

```text
packages/contracts/          @opendashboard/contracts（共享契约，TS 源码直发）
packages/plugin-runtime/     @opendashboard/plugin-runtime（静态注册、生命周期、服务容器）
packages/h2-contracts/       @opendashboard/h2-contracts（H2 域契约）
plugins/h2-ems/              @opendashboard/h2-ems（H2 EMS 插件）
apps/web/                    H2 宿主（main.tsx 组合 h2-ems 插件 + H2 feature）
services/h2-analytics/       Python/FastAPI 分析侧车（仅回环 127.0.0.1）
scripts/h2-sentinel/         启动器与冒烟脚本
tests/h2-sentinel/           独立 QA 与契约测试
submission/h2-sentinel/      比赛提交材料
docs/                        声明与来源文档
```

## 快速开始

要求 Node.js 22.12+ 和 npm 11。

```bash
npm ci
npm run h2:fixture   # Fixture 模式，无需 Python，无网络
npm run h2:local     # Local 模式，启动回环分析侧车
```

验证：

```bash
npm run check             # typecheck + test + build
npm run h2:check          # typecheck + 聚焦 H2 测试 + QA + launcher 测试 + build
```

## 运行时模式

| 模式 | 侧车 | 网络 | LLM | 用途 |
|---|---:|---:|---:|---|
| `fixture` | 不需要 | 不需要 | 不需要 | 确定性评估演示 |
| `local` | 需要 | 仅回环 | 不需要 | 官方数据导入与分析 |

入口：`/?mode=fixture` 或 `/?mode=local`（也接受 `/h2-sentinel/?mode=...`）。未知模式失败关闭，显示可见启动错误。

## 声明与来源

- [插件组合声明](docs/H2_AS_PLUGIN_COMPOSITION.md)
- [来源与谱系](docs/PROVENANCE.md)
- 本仓库代码抽取自 OpenDashboard tag `h2-sentinel-competition-2026-08-20`（`e4357052aa6fffcc065a4f963006e92b2d77c001`），未修改 OpenDashboard 的 `main`。
