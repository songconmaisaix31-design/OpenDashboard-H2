# H2 Sentinel / 氢哨

> **项目状态：FROZEN / RESULT PENDING**
>
> 浦发・IGNITE 未来能源黑客松初赛前 20，复赛已完成；最终结果预计于 **2026-09-10** 公布。在结果公布前，本仓库不改名、不归档、不创建 Release，也不大规模移动比赛目录。

> OpenDashboard 的比赛版本：面向 T03-04 弱电网绿氢 EMS 功率协调异常诊断与运检助手的本地优先 Web 应用。

H2 Sentinel（氢哨）本质是一套**插件组合（plugin composition）**：它在 OpenDashboard 的插件优先架构（共享契约 `@opendashboard/contracts` + 静态可信插件运行时 `@opendashboard/plugin-runtime`）之上，组合了 H2 域契约 `@opendashboard/h2-contracts`、H2 EMS 插件 `@opendashboard/h2-ems`、回环只读分析侧车 `services/h2-analytics` 与 H2 Web feature。

本仓库是 H2 Sentinel 的独立建仓版本，不修改 OpenDashboard 的 `main`。产品定位：诊断与受控恢复建议，建议需人工确认，不控制设备、不替换 EMS。

## 比赛状态与证据边界

- 当前只确认“初赛前 20、复赛已完成、结果待公布”；仓库没有可确认复赛实际提交 SHA 的外部回执，因此不猜测。
- `gate-s6`（`738344fc6cfd90fa80b7306afcf065d076d5d1d9`）是仓库内明确的最终冻结候选；审计时 `origin/main`（`60ecc9c16082a43e9ab0d505470dec000faaf15c`）包含该冻结点及后续本地导入守卫修复，是另一个有界候选。两者都不是官方接收证明。
- 本地公开验证得到的 F1=0.9718309859、完整数据导入结果、Fixture 演示、本地测试和 HTTP 成功仅是各自范围内的本地证据，不是官方成绩、隐藏测试、主办方验收或生产证明。

详细状态、贡献说明和冻结策略见 [STATUS.md](STATUS.md)；分支与残留审计见 [2026-08-31 freeze audit](docs/history/2026-08-31-freeze-audit.md)。

## 贡献说明

- 用户选择了初赛方向并完成了其中大部分实现。
- 朋友在复赛阶段推进算法，并处理现场复赛问题。
- 用户继续完成全量数据导入，并承担部分平台整合。

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
| `local` | 需要 | 仅回环 | 不需要 | 本地文件或公开数据导入与分析；不代表官方成绩 |

入口：`/?mode=fixture` 或 `/?mode=local`（也接受 `/h2-sentinel/?mode=...`）。未知模式失败关闭，显示可见启动错误。

## 声明与来源

- [插件组合声明](docs/H2_AS_PLUGIN_COMPOSITION.md)
- [来源与谱系](docs/PROVENANCE.md)
- [冻结状态](STATUS.md)
- [2026-08-31 分支与残留审计](docs/history/2026-08-31-freeze-audit.md)
- 本仓库代码抽取自 OpenDashboard tag `h2-sentinel-competition-2026-08-20`（`e4357052aa6fffcc065a4f963006e92b2d77c001`），未修改 OpenDashboard 的 `main`。
