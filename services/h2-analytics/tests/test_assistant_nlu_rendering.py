from __future__ import annotations

import pytest

from h2_analytics.assistant import LlmRenderingConfig, StepFunRenderer, resolve_intent
from h2_analytics.service import AnalyticsService

_MATCH_CASES = [
    ("Q01", "PCC 的正值负值和送电受电方向怎么理解"),
    ("Q01", "解释一下 PCC 正负号对应的方向"),
    ("Q01", "PCC 功率符号是正值时代表送电吗"),
    ("Q01", "我想核对 PCC 负值和受电方向"),
    ("Q02", "如何区分 PCC 功率越限与电量配额异常"),
    ("Q02", "PCC 动态边界和累计电量的区别是什么"),
    ("Q02", "C04 与 C05 的不同，前者功率越限后者电量配额吗"),
    ("Q02", "请区分 PCC C04 动态边界和 C05 累计电量"),
    ("Q03", "储能方向异常会怎样影响 PCC"),
    ("Q03", "BESS 指令与实际反向时对并网有什么影响"),
    ("Q03", "储能功率方向反向如何影响 PCC"),
    ("Q03", "储能指令与实际不一致，对并网功率怎么判断"),
    ("Q04", "如何判断 SOC 调节备用不足"),
    ("Q04", "SOC 还有多少余量才算备用不足"),
    ("Q04", "判断 SOC 调节能力和备用的方法"),
    ("Q04", "SOC 目标附近的双向余量是否不足"),
    ("Q05", "设备降额但 EMS 未同步怎么定位"),
    ("Q05", "可用容量变化后 EMS 仍是旧容量如何定位"),
    ("Q05", "EMS 容量模型没有同步设备降额怎么办"),
    ("Q05", "定位 EMS 与设备可用容量不同步的区间"),
    ("Q06", "如何区分云团变化和控制指令振荡"),
    ("Q06", "天气引起的光伏波动与指令振荡有什么区别"),
    ("Q06", "判断云团还是控制振荡要看什么"),
    ("Q06", "光伏波动和指令反复反转如何区分"),
    ("Q07", "如何评价多台电解槽负荷分配"),
    ("Q07", "逐台电解槽功率分配和效率怎么比较"),
    ("Q07", "多台电解槽机组的能耗和负荷分配是否合理"),
    ("Q07", "电解槽逐台效率能否评价功率分配"),
    ("Q08", "哪些建议必须人工确认"),
    ("Q08", "处置建议为何要人工复核"),
    ("Q08", "建议中哪些内容必须确认"),
    ("Q08", "所有处置都需要人工确认吗"),
    ("Q09", "生成异常诊断报告"),
    ("Q09", "请制作单事件报告"),
    ("Q09", "导出这次异常的诊断报告"),
    ("Q09", "帮我生成一份单事件诊断报告"),
    ("Q10", "PCC 合规日报包含哪些内容"),
    ("Q10", "PCC 日报应有什么字段"),
    ("Q10", "生成 PCC 日合规报告需要包含什么"),
    ("Q10", "PCC 合规日报的内容有哪些"),
]


@pytest.mark.parametrize(("expected", "text"), _MATCH_CASES)
def test_bounded_nlu_routes_table(expected: str, text: str) -> None:
    result = resolve_intent(text)
    assert result["status"] == "matched"
    assert result["questionId"] == expected
    assert 0 <= result["confidence"] <= 1


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("立即替我下发储能启停命令", "unsupported_intent"),
        ("预测明天的股票价格", "unsupported_intent"),
        ("PCC 正负方向，哪些建议要人工确认", "ambiguous_intent"),
        ("SOC 是什么", "low_confidence"),
        ("x" * 501, "input_too_long"),
    ],
)
def test_bounded_nlu_refuses_without_arbitrary_fallback(text: str, reason: str) -> None:
    result = resolve_intent(text)
    assert result == {
        "schemaVersion": 1,
        "status": "refused",
        "reason": reason,
        "confidence": result["confidence"],
        "allowedQuestionIds": [f"Q{index:02d}" for index in range(1, 11)],
    }


def test_nlu_extracts_supported_event_and_time_context() -> None:
    result = resolve_intent(
        "为 C04-20260105-001 生成异常诊断报告，范围 2026-01-05T10:20:00Z 到 2026-01-05T10:40:00Z"
    )
    assert result["questionId"] == "Q09"
    assert result["eventId"] == "C04-20260105-001"
    assert result["timeRange"] == {
        "startTime": "2026-01-05t10:20:00z",
        "endTime": "2026-01-05t10:40:00z",
    }


def _answer(valid_csv: str) -> dict:
    service = AnalyticsService()
    dataset_id = service.import_csv(filename="fixture.csv", text=valid_csv)["dataset"][
        "datasetId"
    ]
    run_id = service.run_analysis(dataset_id)["runId"]
    return service.ask(
        run_id=run_id,
        question_id="Q08",
        event_id=None,
        allow_llm_rendering=False,
    )


def test_renderer_never_calls_provider_when_disabled_or_unconfigured(valid_csv: str) -> None:
    calls = 0

    def transport(*_args):
        nonlocal calls
        calls += 1
        raise AssertionError("provider must not be called")

    answer = _answer(valid_csv)
    disabled = StepFunRenderer(transport=transport).render(
        deterministic_answer=answer, requested=True
    )
    unconfigured = StepFunRenderer(
        LlmRenderingConfig(enabled=True), transport=transport
    ).render(deterministic_answer=answer, requested=True)
    not_requested = StepFunRenderer(
        LlmRenderingConfig(enabled=True, api_key="test-key", model="test-model"),
        transport=transport,
    ).render(deterministic_answer=answer, requested=False)
    assert calls == 0
    assert disabled["reason"] == "policy_disabled"
    assert unconfigured["reason"] == "not_configured"
    assert not_requested["reason"] == "not_requested"


def test_renderer_accepts_only_bounded_restatement(valid_csv: str) -> None:
    answer = _answer(valid_csv)

    def transport(_url, _body, _headers, _timeout):
        return {
            "choices": [
                {
                    "message": {
                        "content": "依据现有证据，所有建议仍须人工确认；限制是不能自动形成控制命令。"
                    }
                }
            ]
        }

    renderer = StepFunRenderer(
        LlmRenderingConfig(enabled=True, api_key="test-key", model="test-model"),
        transport=transport,
    )
    result = renderer.render(deterministic_answer=answer, requested=True)
    assert result["status"] == "rendered"
    assert result["citationIds"] == [
        citation["citationId"] for citation in answer["citations"]
    ]
    assert result["provenance"]["mode"] == "LLM_RENDERED"
    assert result["deterministicAnswerId"] == answer["answerId"]


def test_ask_applies_rendering_without_changing_citations(valid_csv: str) -> None:
    renderer = StepFunRenderer(
        LlmRenderingConfig(enabled=True, api_key="test-key", model="test-model"),
        transport=lambda *_args: {
            "choices": [
                {
                    "message": {
                        "content": "依据当前证据，所有建议均须人工确认；证据限制不支持设备控制。"
                    }
                }
            ]
        },
    )
    service = AnalyticsService(llm_renderer=renderer)
    dataset_id = service.import_csv(filename="fixture.csv", text=valid_csv)["dataset"][
        "datasetId"
    ]
    run_id = service.run_analysis(dataset_id)["runId"]
    deterministic = service.ask(
        run_id=run_id,
        question_id="Q08",
        event_id=None,
        allow_llm_rendering=False,
    )
    rendered = service.ask(
        run_id=run_id,
        question_id="Q08",
        event_id=None,
        allow_llm_rendering=True,
    )
    assert rendered["mode"] == "LLM_RENDERED"
    assert rendered["answerId"] == deterministic["answerId"]
    assert rendered["citations"] == deterministic["citations"]
    assert rendered["sections"][1:] == deterministic["sections"][1:]
    assert rendered["provenance"]["mode"] == "LLM_RENDERED"


@pytest.mark.parametrize(
    "content",
    [
        "依据证据，系统可以下发控制命令，仍需人工确认。",
        "依据证据，新增 999 kW 结论，仍需人工确认。",
        "依据证据 citation-Q99-invented，仍需人工确认。",
    ],
)
def test_renderer_falls_back_on_malicious_or_invented_output(
    valid_csv: str, content: str
) -> None:
    answer = _answer(valid_csv)
    renderer = StepFunRenderer(
        LlmRenderingConfig(enabled=True, api_key="test-key", model="test-model"),
        transport=lambda *_args: {"choices": [{"message": {"content": content}}]},
    )
    result = renderer.render(deterministic_answer=answer, requested=True)
    assert result["status"] == "fallback"
    assert result["reason"] == "invalid_output"
    assert result["provenance"] == answer["provenance"]


def test_renderer_timeout_falls_back_deterministically(valid_csv: str) -> None:
    answer = _answer(valid_csv)

    def timeout(*_args):
        raise TimeoutError

    renderer = StepFunRenderer(
        LlmRenderingConfig(enabled=True, api_key="test-key", model="test-model"),
        transport=timeout,
    )
    result = renderer.render(deterministic_answer=answer, requested=True)
    assert result["status"] == "fallback"
    assert result["reason"] == "timeout"

    service = AnalyticsService(llm_renderer=renderer)
    dataset_id = service.import_csv(filename="fixture.csv", text=valid_csv)["dataset"][
        "datasetId"
    ]
    run_id = service.run_analysis(dataset_id)["runId"]
    deterministic = service.ask(
        run_id=run_id,
        question_id="Q08",
        event_id=None,
        allow_llm_rendering=False,
    )
    fallback = service.ask(
        run_id=run_id,
        question_id="Q08",
        event_id=None,
        allow_llm_rendering=True,
    )
    assert fallback["sections"] == deterministic["sections"]
    assert fallback["citations"] == deterministic["citations"]
    assert fallback["provenance"]["rendererVersion"].endswith(":timeout")
