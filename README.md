# H2 Sentinel / 氢哨

> OpenDashboard 的比赛版本：面向 T03-04 弱电网绿氢 EMS 功率协调异常诊断与运检助手的本地优先 Web 应用。

H2 Sentinel 本质是一套**插件组合（plugin composition）**：它在 OpenDashboard 的插件优先架构（共享契约 `@opendashboard/contracts` + 静态可信插件运行时 `@opendashboard/plugin-runtime`）之上，组合了 H2 域插件 `@opendashboard/h2-ems`、H2 域契约 `@opendashboard/h2-contracts`、回环只读分析侧车 `services/h2-analytics` 与 H2 Web feature。

本仓库为 H2 Sentinel 的独立建仓版本，不修改 OpenDashboard 的 `main`。

> 状态：脚手架占位，正在迁移中。
