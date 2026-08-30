# -*- coding: utf-8 -*-
"""B-P0-2 LLM 三态（云端/本地降级/禁用）切换实测驱动脚本。

在 worktree b 根目录运行：  python plan0830/B/evidence/b_p0_2_tristate_demo.py
产出：plan0830/B/evidence/b_p0_2_tristate_<时间戳>.log（计时 + 各态响应留痕）

三态定义（全部既有语义，见 plan0830/B/README.md §1.1）：
  态1 禁用：H2_LLM_ENABLED != "true"（默认） → DETERMINISTIC_TEMPLATE，零 LLM 调用
  态2 云端：H2_LLM_ENABLED=true + 真 key + model → LLM_RENDERED（step_plan 端点）
  态3 降级：云端态但 key 无效 → provider_unavailable → 自动回确定性答案

计时口径（与任务卡一致）：
  切换耗时 = 旧进程停止 → 新进程 /health 探活成功
  端到端耗时 = 切换开始 → assistant:ask 返回（含 import+analyze 重建 run；
  run 为进程内存态，重启后必须重建——此为诚实口径，如实分列）
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

# Windows 控制台默认 cp936，强制 UTF-8 防中文乱码
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PORT = 8965  # 避开默认 8765，防止与其他并行实例冲突
BASE = f"http://127.0.0.1:{PORT}"
NS = "/api/v1/h2-sentinel"
CSV_PATH = Path("packages/h2-contracts/fixtures/tiny-valid-timeseries.csv")
SIDECAR_CWD = Path("services/h2-analytics")
LOG_PATH = Path(__file__).with_name(
    f"b_p0_2_tristate_{time.strftime('%Y%m%d_%H%M%S')}.log"
)

_lines: list[str] = []


def log(message: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    _lines.append(line)


# 本机可能配置系统代理（HTTP_PROXY 等），loopback 请求必须绕过代理
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def post(path: str, body: dict, timeout: float = 60.0) -> dict:
    request = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with _OPENER.open(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def get(path: str, timeout: float = 5.0) -> dict:
    with _OPENER.open(f"{BASE}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def find_pid_on_port(port: int) -> int | None:
    """netstat 查占用端口的监听进程 PID（Windows）。"""
    result = subprocess.run(
        ["netstat", "-ano"], capture_output=True, text=True
    )
    for line in result.stdout.splitlines():
        if f":{port}" in line and "LISTENING" in line:
            return int(line.split()[-1])
    return None


def kill_sidecar() -> None:
    pid = find_pid_on_port(PORT)
    if pid is None:
        return
    subprocess.run(["taskkill", "/T", "/F", "/PID", str(pid)], capture_output=True)
    # 等待端口彻底释放，避免下一次启动绑定失败
    for _ in range(50):
        if find_pid_on_port(PORT) is None:
            return
        time.sleep(0.1)


def start_sidecar(env_overrides: dict[str, str | None]) -> subprocess.Popen:
    """按指定 env 起 analytics sidecar 子进程（env 隔离，不改本进程环境）。"""
    env = os.environ.copy()
    for key, value in env_overrides.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    # 子进程输出落文件（诊断用），不占当前控制台
    sidecar_log = open(LOG_PATH.with_suffix(".sidecar.log"), "w", encoding="utf-8")
    # 直接用项目 venv 解释器启动：绕过 `uv run` 的环境同步校验（开销不稳定，
    # 实测可超 60s），使切换计时只包含进程启动本身，口径稳定可复现
    venv_python = SIDECAR_CWD / ".venv" / "Scripts" / "python.exe"
    return subprocess.Popen(
        [str(venv_python), "-m", "h2_analytics", "--port", str(PORT)],
        cwd=SIDECAR_CWD,
        env=env,
        stdout=sidecar_log,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )


def wait_healthy(deadline_seconds: float = 60.0) -> float:
    """轮询 /health 探活，返回耗时（秒）；超时抛 RuntimeError。"""
    started = time.monotonic()
    while time.monotonic() - started < deadline_seconds:
        try:
            payload = get("/health")
            # 响应为信封结构：顶层 status="success"，healthy 标志在 data.status
            if payload.get("data", {}).get("status") == "healthy":
                return time.monotonic() - started
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f"/health not healthy within {deadline_seconds}s")


def setup_run() -> str:
    """新进程必须重建 run：import tiny fixture → analyze → runId。"""
    text = CSV_PATH.read_text(encoding="utf-8")
    imported = post(
        f"{NS}/datasets:import",
        {"filename": CSV_PATH.name, "text": text},
    )
    # 信封结构：data.dataset.datasetId
    dataset_id = _dig(imported, "data", "dataset", "datasetId")
    if not dataset_id:
        raise RuntimeError(f"import 未返回 datasetId: {imported}")
    analyzed = post(f"{NS}/datasets:analyze", {"datasetId": dataset_id})
    # 信封结构：data.runId
    run_id = _dig(analyzed, "data", "runId")
    if not run_id:
        raise RuntimeError(f"analyze 未返回 runId: {analyzed}")
    return run_id


def _dig(payload: dict, *keys):
    node = payload
    for key in keys:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def ask_q08(run_id: str, allow_llm_rendering: bool) -> dict:
    payload = post(
        f"{NS}/assistant:ask",
        {
            "runId": run_id,
            "questionId": "Q08",
            "allowLlmRendering": allow_llm_rendering,
        },
        timeout=90.0,  # 云端态含 LLM 真调用（10s 超时×2 重试留裕量）
    )
    # 信封结构：data 内为答案对象；无 data 键时原样返回便于诊断
    return _dig(payload, "data") or payload


def summarize(answer: dict) -> str:
    provenance = answer.get("provenance", {})
    return json.dumps(
        {
            "mode": answer.get("mode", provenance.get("mode")),
            "rendererVersion": provenance.get("rendererVersion"),
            "refusedControlClaim": answer.get("refusedControlClaim"),
            "limitations": provenance.get("limitations"),
        },
        ensure_ascii=False,
    )


def run_state(label: str, env_overrides: dict) -> dict:
    """单态全流程：杀旧 → 起新 → 探活 → 重建 run → 问 Q08（双 allowLlm 值）。"""
    log(f"===== {label} =====")
    switch_started = time.monotonic()
    kill_sidecar()
    start_sidecar(env_overrides)
    switch_seconds = wait_healthy()
    log(f"切换耗时（重启+探活）: {switch_seconds:.1f}s")

    run_id = setup_run()
    disabled_answer = ask_q08(run_id, allow_llm_rendering=False)
    llm_answer = ask_q08(run_id, allow_llm_rendering=True)
    end_to_end = time.monotonic() - switch_started
    log(f"端到端耗时（切换+重建run+两问）: {end_to_end:.1f}s")
    log(f"allowLlmRendering=false → {summarize(disabled_answer)}")
    log(f"allowLlmRendering=true  → {summarize(llm_answer)}")
    return {
        "label": label,
        "switchSeconds": round(switch_seconds, 1),
        "endToEndSeconds": round(end_to_end, 1),
        "notRequested": summarize(disabled_answer),
        "requested": summarize(llm_answer),
    }


def main() -> int:
    real_key = os.environ.get("STEPFUN_API_KEY", "")
    model = os.environ.get("H2_LLM_MODEL", "step-3.7-flash")
    if not real_key:
        log("警告：环境无 STEPFUN_API_KEY，态2 将观测 provider_unavailable 降级路径")
    log(f"模型: {model}；key 注入: {'是（长度 %d）' % len(real_key) if real_key else '否'}")

    results = [
        # 态1 禁用（默认）：显式剥离 LLM 三件 env
        run_state("态1 禁用（H2_LLM_ENABLED 剥离）", {
            "H2_LLM_ENABLED": None, "STEPFUN_API_KEY": None, "H2_LLM_MODEL": None,
        }),
        # 态2 云端：真 key 真调用
        run_state("态2 云端（true + 真 key）", {
            "H2_LLM_ENABLED": "true",
            "STEPFUN_API_KEY": real_key or "missing-key-placeholder",
            "H2_LLM_MODEL": model,
        }),
        # 态3 降级：云端态但 key 无效 → provider_unavailable 自动回确定性答案
        run_state("态3 降级（true + 无效 key）", {
            "H2_LLM_ENABLED": "true",
            "STEPFUN_API_KEY": "invalid-key-for-degradation-demo",
            "H2_LLM_MODEL": model,
        }),
    ]
    kill_sidecar()

    log("===== 汇总 =====")
    for item in results:
        log(f"{item['label']}: 切换 {item['switchSeconds']}s / 端到端 {item['endToEndSeconds']}s")
    LOG_PATH.write_text("\n".join(_lines) + "\n", encoding="utf-8")
    print(f"\n留痕已写入: {LOG_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
