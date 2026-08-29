# H2 Sentinel P2 B 线操作手册

## 使用边界

H2 Sentinel / 氢哨是本地优先的监视、诊断、量化和运维建议工具，不是
EMS 或设备控制器。应用不下发设备指令，所有操作建议均须人工确认。
Local 模式只允许 `127.0.0.1` 回环通信；Fixture 是明确标注的合成回退，
不能替代官方数据、主办方评分、隐藏测试、部署或生产证据。

PCC 功率正值表示向电网上网，负值表示从电网下网；储能功率正值表示
放电，负值表示充电。页面和导出不得反转这两组符号约定。

## 首次准备与环境检查

要求 Node.js 22.12 或更高、npm 11 或更高、Python 3.11 或更高，以及
`uv`。安装严格使用锁文件：

```powershell
npm ci
Set-Location services/h2-analytics
uv sync --locked --extra dev
Set-Location ../..
node scripts/h2-sentinel/doctor.mjs --mode local
```

Doctor 只检查版本、锁定依赖、回环端口、磁盘余量和
`STEPFUN_API_KEY` 属性是否存在；它不会读取或打印 secret 值，也不会
终止占用端口的外部进程。需要替代端口时使用：

```powershell
node scripts/h2-sentinel/doctor.mjs --mode local --web-port 5183 --analytics-port 8775
npm run h2:local -- --web-port 5183 --analytics-port 8775
```

## 启动与六页路径

离线 Fixture：

```powershell
npm run h2:fixture
```

Local：

```powershell
npm run h2:local
```

浏览器中依次检查六页：系统总览、异常事件中心、异常诊断详情、数据
分析、运维助手、报告中心。Fixture 不需要 Python 或网络；Local 侧车和
Web 均应保持在 `127.0.0.1`。启动器只清理自己启动的子进程，不接管
外部服务或端口。

## 完整训练文件导入

P2 已实现并接通有序上传会话：浏览器按不超过 8 MiB 的块顺序上传，
服务端校验偏移、长度、块哈希、整文件字节数、块数和 SHA-256 后才
finalize。重试只接受同一请求 ID 的字节完全相同内容；会话有 30 分钟
TTL，并限制为 256 MiB、600,000 行、8 个活动会话和 64 个保留会话。
旧的单请求导入仍保留给不超过 96 MiB、180,000 行的文件。

外部只读训练文件的身份是：

- size: `236991870` bytes
- SHA-256: `67513c9b1d443d25eb1258a6f58252c02cdb438f701a7921e2f8dacc365a6c51`

该文件不随提交包分发，也不是生成证据。Streaming 默认关闭；完整文件
操作必须在当前终端显式 opt-in，且只有精确小写 `true` 会启用：

```powershell
$env:H2_STREAMING_IMPORT_ENABLED = 'true'
npm run h2:local
```

未设置或精确 `false` 保持关闭；其他值会让服务启动失败。完成后关闭
启动器并从终端环境移除该变量。提交 `40b3d391f42a13071f959bd753456afb9e02b2d5`
实现了此运行时入口，但完整训练文件仍须由协调器在最终 clean SHA 上
通过标准 launcher/Web 重跑后才能形成最终运行证据。

## 运维助手与 StepFun

Local 自由文本先经过 500 字符上限的受限 NLU，只能匹配 Q01-Q10，或
明确拒答。歧义、低置信度、越界问题和设备控制请求不会路由到任意问题。
官方 Q01-Q10 按钮、确定性答案、引用、Q09 报告和拒绝控制边界仍是
权威结果。

StepFun 只用于可选语言重述。启用需要同时配置以下环境变量名，secret
值必须由操作系统或受控运行环境提供，不能写入仓库、文档或日志：

- `H2_LLM_ENABLED`，仅精确值 `true` 启用；
- `STEPFUN_API_KEY`；
- `H2_LLM_MODEL`；
- `H2_LLM_BASE_URL` 仅接受实现固定的官方端点，否则失败关闭。

启用后仍使用 `npm run h2:local`。只有有界确定性答案文本和引用 ID 会
发送到 StepFun 云端；原始 CSV、测量序列、review notes、报告和控制
数据不发送。禁用、未配置、超时、重定向、provider 错误或输出校验失败
时自动保留确定性答案；StepFun 不改变事实、引用、证据、安全、review、
报告或 submission。

## C01-C07 图表

事件详情按异常码选择专属配置：C01 指令/储能/PCC 双轴，C02 上报与
实际容量阈值对比，C03 储能指令与实际功率，C04 PCC 实际功率与正向
送出/负向受电边界，C05 日配额/已用电量与 PCC 功率，C06 电解槽功率
堆叠和单位电耗散点，C07 SOC 与可充放电量/备用目标。图表按 `kW`、
`kWh`、`kWh/kg`、`%` 分轴；必需序列不完整时只显示事件 evidence
series，不补造测量值。

## 导出、检查与交付门禁

Submission 必须严格保持以下 16 列和顺序：

```text
pred_event_id,start_time,end_time,anomaly_code,anomaly_subtype,severity,primary_control_object,affected_equipment,confidence,evidence_json,root_cause,recommended_action,primary_impact_metric,estimated_impact_value,first_detection_time,requires_human_confirmation
```

检查一个导出文件：

```powershell
node validation/check-submission.mjs <submission.csv>
```

完整本地确定性门禁默认清除 provider 凭据并设置
`H2_LLM_ENABLED=false`：

```powershell
node scripts/h2-sentinel/check-all.mjs
```

它按顺序运行 doctor、Python lint、TypeScript/Python typecheck、H2
测试、contract QA、launcher 测试、Python/仓库测试、build、回环 smoke
和 `git diff --check`。CI 对 pull request 和 `main` push 使用同一脚本，
但只有具名远端 run 才能证明远端 CI。

官方 test 数据的本地离线 smoke：

```powershell
node validation/offline-deploy-smoke.mjs --official-data <data-directory> --output <new-generated-directory>
```

验证切片两次演示：

```powershell
node validation/run-demo.mjs --manifest <validation-slice-manifest.json> --output <new-generated-artifacts-root> --candidate-commit <40-character-clean-HEAD-sha>
```

这些命令的本地通过不等于 clean-machine、部署、生产、隐藏测试、主办方
评分或验收。

## 故障处理与回退

| 现象 | 处理与回退 |
| --- | --- |
| Doctor 报端口占用 | 停止已知进程，或同时给 doctor/launcher 指定两个不同的空闲端口；不要让工具终止未知进程。 |
| 完整文件提示 streaming disabled | 确认当前终端的 `H2_STREAMING_IMPORT_ENABLED` 精确为 `true`，然后重新启动 Local；若仍失败，回退到不超过旧上限的已授权切片并记录完整导入未验证。 |
| 块顺序、长度或哈希失败 | 取消当前会话并从新 session 重传；不要跳块、改写 request ID 语义或手工修改临时文件。 |
| NLU 拒答 | 使用 Q01-Q10 官方按钮或缩小问题范围；不得把拒答绕到任意问题。 |
| StepFun 不可用 | 关闭可选重述并使用确定性答案；不得让 provider 故障阻断核心流程。 |
| 图表字段不完整 | 保留 evidence-series fallback，并把缺失字段记为数据限制；不得补零或造数。 |
| Checker 失败 | 修复生成端或输入数据后重新导出；不得手工弱化 checker 或改变 16 列契约。 |
| Fixture 通过但 Local 失败 | 记录 Local 失败；Fixture 只能演示交互，不能替代 Live/官方数据证据。 |
