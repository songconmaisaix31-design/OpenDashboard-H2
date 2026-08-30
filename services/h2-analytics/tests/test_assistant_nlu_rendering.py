from __future__ import annotations

from collections import Counter

import pytest

from h2_analytics.assistant import LlmRenderingConfig, StepFunRenderer, resolve_intent
from h2_analytics.assistant.llm_client import llm_rendering_config_from_environment
from h2_analytics.assistant.service import _ALLOWED_EVENT_CODES
from h2_analytics.api import create_app
from h2_analytics.service import AnalyticsService

# 样例集（B-P0-3 验收）：每题覆盖三类变体——paraphrase=口语化改写、
# with_event_id=带事件 ID（事件码须与 service 层 _ALLOWED_EVENT_CODES 一致）、
# followup=追问式语气。带事件 ID 样例的事件码如与该题门控不符，
# NLU 命中后也会被服务层拒答，故由专门断言看住。
_MATCH_CASES = [
    # Q01（事件码门控：任意）
    ("Q01", "paraphrase", "PCC 的正值负值和送电受电方向怎么理解"),
    ("Q01", "paraphrase", "解释一下 PCC 正负号对应的方向"),
    ("Q01", "paraphrase", "PCC 功率符号是正值时代表送电吗"),
    ("Q01", "paraphrase", "我想核对 PCC 负值和受电方向"),
    # 注：此处不用 C04/C05 码——事件码子串会命中 Q02 词组（c04/c05）导致同分歧义；
    # 属 NLU 子串计分已知边界（拒答语义安全），词表级改进归 B-P1-2。
    ("Q01", "with_event_id", "C01-20260105-001 事件里 PCC 是正值还是负值"),
    ("Q01", "followup", "PCC 负值代表受电吗？再说具体点"),
    # Q02（事件码门控：C04/C05）
    ("Q02", "paraphrase", "如何区分 PCC 功率越限与电量配额异常"),
    ("Q02", "paraphrase", "PCC 动态边界和累计电量的区别是什么"),
    ("Q02", "paraphrase", "C04 与 C05 的不同，前者功率越限后者电量配额吗"),
    ("Q02", "paraphrase", "请区分 PCC C04 动态边界和 C05 累计电量"),
    ("Q02", "with_event_id", "看下 C04-20260105-001 这个越限和电量配额怎么区分"),
    ("Q02", "followup", "PCC 功率越限和电量配额到底有什么不同"),
    # Q03（事件码门控：C03）
    ("Q03", "paraphrase", "储能方向异常会怎样影响 PCC"),
    ("Q03", "paraphrase", "BESS 指令与实际反向时对并网有什么影响"),
    ("Q03", "paraphrase", "储能功率方向反向如何影响 PCC"),
    ("Q03", "paraphrase", "储能指令与实际不一致，对并网功率怎么判断"),
    ("Q03", "with_event_id", "C03-20260105-001 储能方向异常对并网功率的影响"),
    ("Q03", "followup", "储能方向异常对 PCC 影响多大"),
    # Q04（事件码门控：C07）
    ("Q04", "paraphrase", "如何判断 SOC 调节备用不足"),
    ("Q04", "paraphrase", "SOC 还有多少余量才算备用不足"),
    ("Q04", "paraphrase", "判断 SOC 调节能力和备用的方法"),
    ("Q04", "paraphrase", "SOC 目标附近的双向余量是否不足"),
    ("Q04", "with_event_id", "C07-20260105-001 里 SOC 备用还够不够"),
    ("Q04", "followup", "那 SOC 备用不足时数值怎么看"),
    # Q05（事件码门控：C02）
    ("Q05", "paraphrase", "设备降额但 EMS 未同步怎么定位"),
    ("Q05", "paraphrase", "可用容量变化后 EMS 仍是旧容量如何定位"),
    ("Q05", "paraphrase", "EMS 容量模型没有同步设备降额怎么办"),
    ("Q05", "paraphrase", "定位 EMS 与设备可用容量不同步的区间"),
    ("Q05", "with_event_id", "C02-20260105-001 的降额和 EMS 不同步怎么定位"),
    ("Q05", "followup", "EMS 没同步降额的话怎么定位问题"),
    # Q06（事件码门控：C01）
    ("Q06", "paraphrase", "如何区分云团变化和控制指令振荡"),
    ("Q06", "paraphrase", "天气引起的光伏波动与指令振荡有什么区别"),
    ("Q06", "paraphrase", "判断云团还是控制振荡要看什么"),
    ("Q06", "paraphrase", "光伏波动和指令反复反转如何区分"),
    ("Q06", "with_event_id", "C01-20260105-001 是云团变化还是指令振荡"),
    ("Q06", "followup", "怎么判断是云团还是指令振荡"),
    # Q07（事件码门控：C06）
    ("Q07", "paraphrase", "如何评价多台电解槽负荷分配"),
    ("Q07", "paraphrase", "逐台电解槽功率分配和效率怎么比较"),
    ("Q07", "paraphrase", "多台电解槽机组的能耗和负荷分配是否合理"),
    ("Q07", "paraphrase", "电解槽逐台效率能否评价功率分配"),
    ("Q07", "with_event_id", "C06-20260105-001 涉及的电解槽逐台负荷分配怎么评价"),
    ("Q07", "followup", "电解槽效率差多少怎么看分配"),
    # Q08（事件码门控：任意；安全基准题）
    ("Q08", "paraphrase", "哪些建议必须人工确认"),
    ("Q08", "paraphrase", "处置建议为何要人工复核"),
    ("Q08", "paraphrase", "建议中哪些内容必须确认"),
    ("Q08", "paraphrase", "所有处置都需要人工确认吗"),
    ("Q08", "with_event_id", "C04-20260105-001 事件的处置建议哪些必须人工确认"),
    ("Q08", "followup", "这些建议哪些要人工确认"),
    # Q09（事件码门控：任意，但必须带事件）
    ("Q09", "paraphrase", "生成异常诊断报告"),
    ("Q09", "paraphrase", "请制作单事件报告"),
    ("Q09", "paraphrase", "导出这次异常的诊断报告"),
    ("Q09", "paraphrase", "帮我生成一份单事件诊断报告"),
    ("Q09", "with_event_id", "为 C03-20260105-001 生成诊断报告"),
    ("Q09", "followup", "再帮我导出一份异常诊断报告"),
    # Q10（事件码门控：C04/C05）
    ("Q10", "paraphrase", "PCC 合规日报包含哪些内容"),
    ("Q10", "paraphrase", "PCC 日报应有什么字段"),
    ("Q10", "paraphrase", "生成 PCC 日合规报告需要包含什么"),
    ("Q10", "paraphrase", "PCC 合规日报的内容有哪些"),
    ("Q10", "with_event_id", "结合 C04-20260105-001 讲讲 PCC 合规日报内容"),
    ("Q10", "followup", "PCC 日报具体都有什么内容"),
]

_VARIANT_TYPES = {"paraphrase", "with_event_id", "followup"}

# 越界样例（B-P0-3 验收：≥5 例，100% 拒答；四类拒答原因各至少 1 例）
_REJECT_CASES = [
    ("立即替我下发储能启停命令", "unsupported_intent"),
    ("预测明天的股票价格", "unsupported_intent"),
    ("PCC 正负方向，哪些建议要人工确认", "ambiguous_intent"),
    ("SOC 是什么", "low_confidence"),
    ("x" * 501, "input_too_long"),
    ("帮我写一首关于春天的诗", "unsupported_intent"),
]


@pytest.mark.parametrize(("expected", "_variant", "text"), _MATCH_CASES)
def test_bounded_nlu_routes_table(expected: str, _variant: str, text: str) -> None:
    result = resolve_intent(text)
    assert result["status"] == "matched"
    assert result["questionId"] == expected
    assert 0 <= result["confidence"] <= 1


@pytest.mark.parametrize(("text", "reason"), _REJECT_CASES)
def test_bounded_nlu_refuses_without_arbitrary_fallback(text: str, reason: str) -> None:
    result = resolve_intent(text)
    assert result == {
        "schemaVersion": 1,
        "status": "refused",
        "reason": reason,
        "confidence": result["confidence"],
        "allowedQuestionIds": [f"Q{index:02d}" for index in range(1, 11)],
    }


def test_sample_set_meets_acceptance_gate() -> None:
    """B-P0-3 会话3 验收门禁固化：每题 ≥3 变体且三类齐、总命中 ≥90%、越界 100% 拒答。"""
    counts = Counter(expected for expected, _variant, _text in _MATCH_CASES)
    variants_by_question: dict[str, set[str]] = {}
    for expected, variant, _text in _MATCH_CASES:
        assert variant in _VARIANT_TYPES
        variants_by_question.setdefault(expected, set()).add(variant)
    for index in range(1, 11):
        question_id = f"Q{index:02d}"
        assert counts[question_id] >= 3, f"{question_id} 变体不足 3 例"
        assert _VARIANT_TYPES <= variants_by_question[question_id], (
            f"{question_id} 三类变体不全"
        )
    hits = sum(
        resolve_intent(text)["questionId"] == expected
        for expected, _variant, text in _MATCH_CASES
    )
    assert hits / len(_MATCH_CASES) >= 0.90
    refusals = sum(
        resolve_intent(_text)["status"] == "refused" for _text, _reason in _REJECT_CASES
    )
    assert refusals == len(_REJECT_CASES)
    assert len(_REJECT_CASES) >= 5


def test_with_event_samples_match_event_gate() -> None:
    """带事件 ID 样例的事件码必须与 service 层门控一致，避免“NLU 命中但服务层必拒”的样例。"""
    for expected, variant, text in _MATCH_CASES:
        if variant != "with_event_id":
            continue
        result = resolve_intent(text)
        event_id = result.get("eventId")
        assert event_id is not None, f"带事件 ID 样例未提取到事件：{text}"
        allowed_codes = _ALLOWED_EVENT_CODES[expected]
        if allowed_codes is not None:
            assert event_id[:3] in allowed_codes, f"{text} 事件码不在 {expected} 门控内"


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
                        "content": "依据现有证据，所有建议仍须人工确认；限制是只能用于诊断参考。"
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
                        "content": "依据当前证据，所有建议均须人工确认；证据限制仅支持诊断参考。"
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


def test_llm_environment_requires_exact_opt_in_and_redacts_secret() -> None:
    class DisabledEnvironment(dict[str, str]):
        def get(self, key: str, default: str | None = None) -> str | None:
            if key != "H2_LLM_ENABLED":
                raise AssertionError("disabled configuration must not read provider values")
            return super().get(key, default)

    disabled = llm_rendering_config_from_environment(
        DisabledEnvironment({"H2_LLM_ENABLED": "TRUE"})
    )
    assert disabled == LlmRenderingConfig()

    secret = "test-secret-that-must-not-appear"
    enabled = llm_rendering_config_from_environment(
        {
            "H2_LLM_ENABLED": "true",
            "STEPFUN_API_KEY": secret,
            "H2_LLM_MODEL": "step-test",
        }
    )
    assert enabled.enabled is True
    assert enabled.model == "step-test"
    assert secret not in repr(enabled)

    with pytest.raises(RuntimeError) as captured:
        llm_rendering_config_from_environment(
            {
                "H2_LLM_ENABLED": "true",
                "STEPFUN_API_KEY": secret,
            }
        )
    assert "STEPFUN_API_KEY" in str(captured.value)
    assert "H2_LLM_MODEL" in str(captured.value)
    assert secret not in str(captured.value)


def test_create_app_wires_environment_only_for_default_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def configured() -> LlmRenderingConfig:
        nonlocal calls
        calls += 1
        return LlmRenderingConfig()

    monkeypatch.setattr(
        "h2_analytics.service.llm_rendering_config_from_environment", configured
    )
    create_app()
    assert calls == 1
    create_app(AnalyticsService())
    assert calls == 1


def test_renderer_restricts_provider_to_official_endpoint(valid_csv: str) -> None:
    answer = _answer(valid_csv)
    calls: list[str] = []

    def transport(url, *_args):
        calls.append(url)
        return {
            "choices": [
                {
                    "message": {
                        "content": "依据现有证据，所有建议仍须人工确认；限制是仅供诊断参考。"
                    }
                }
            ]
        }

    invalid_endpoints = (
        "http://api.stepfun.com/v1/chat/completions",
        "https://api.stepfun.com.evil.test/v1/chat/completions",
        "https://api.stepfun.com/v1/chat/completions/../other",
        "https://api.stepfun.com/v1/chat/completions?target=other",
    )
    for endpoint in invalid_endpoints:
        result = StepFunRenderer(
            LlmRenderingConfig(
                enabled=True,
                api_key="test-key",
                model="test-model",
                base_url=endpoint,
            ),
            transport=transport,
        ).render(deterministic_answer=answer, requested=True)
        assert result["status"] == "disabled"
        assert result["reason"] == "policy_disabled"
    assert calls == []

    result = StepFunRenderer(
        LlmRenderingConfig(
            enabled=True, api_key="test-key", model="test-model"
        ),
        transport=transport,
    ).render(deterministic_answer=answer, requested=True)
    assert result["status"] == "rendered"
    assert calls == ["https://api.stepfun.com/step_plan/v1/chat/completions"]


@pytest.mark.parametrize(
    "unsafe_text",
    [
        "依据证据，系统下发设备指令，仍须人工确认。",
        "依据证据，设备指令由系统下发，仍须人工确认。",
        "依据证据，本服务不下发指令，但系统可远程控制开机，仍须人工确认。",
        "依据证据，平台将启停设备，仍须人工确认。",
        "依据证据，设备将被关机，仍须人工确认。",
        "依据证据，助手可修改设定，仍须人工确认。",
        "依据证据，平台会切换运行模式，仍须人工确认。",
        # "控制"一词在 Q08 源答案的免责句中已存在，单独复用不构成新增；
        # 因此这两个用例必须同时携带源中不存在的控制动词（下发/启停）才应被拦。
        "依据证据，系统可以直接下发控制指令，仍须人工确认。",
        "依据证据，系统能够自动控制并启停设备，仍须人工确认。",
        "依据证据，平台将调功率，仍须人工确认。",
    ],
)
def test_renderer_fails_closed_on_equipment_control_language(
    valid_csv: str, unsafe_text: str
) -> None:
    answer = _answer(valid_csv)
    renderer = StepFunRenderer(
        LlmRenderingConfig(enabled=True, api_key="test-key", model="test-model"),
        transport=lambda *_args: {
            "choices": [{"message": {"content": unsafe_text}}]
        },
    )
    result = renderer.render(deterministic_answer=answer, requested=True)
    assert result["status"] == "fallback"
    assert result["reason"] == "invalid_output"


def test_renderer_allows_source_disclaimer_control_wording(valid_csv: str) -> None:
    """源答案自带的否定/免责"控制"措辞被忠实保留时必须放行（子集校验语义）。"""
    answer = _answer(valid_csv)
    renderer = StepFunRenderer(
        LlmRenderingConfig(enabled=True, api_key="test-key", model="test-model"),
        transport=lambda *_args: {
            "choices": [
                {
                    "message": {
                        "content": (
                            "依据现有证据，所有建议均须人工确认；"
                            "本应用不具备设备控制、设定值修改或模式切换权限，"
                            "相关限制仅供诊断参考。"
                        )
                    }
                }
            ]
        },
    )
    result = renderer.render(deterministic_answer=answer, requested=True)
    assert result["status"] == "rendered"
    assert result["provenance"]["mode"] == "LLM_RENDERED"
