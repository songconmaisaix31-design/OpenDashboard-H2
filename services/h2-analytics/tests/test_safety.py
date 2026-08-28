from __future__ import annotations

from dataclasses import replace

from h2_analytics import vocabulary
from h2_analytics.detection import RuleRowDetector
from h2_analytics.diagnosis import DiagnosisBuilder
from h2_analytics.evidence import EvidenceContext
from h2_analytics.events import EventAggregator, EventWindow
from h2_analytics.ingestion import DatasetLoader
from h2_analytics.safety import SafetyEvaluator


def test_safety_reports_passed_failed_and_warning(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    candidates = RuleRowDetector().detect(imported.rows)
    window = EventAggregator().aggregate(
        rows=imported.rows,
        candidates=candidates,
        sampling_interval_minutes=1,
    )[0]
    evaluator = SafetyEvaluator()
    provenance = imported.manifest["provenance"]

    passed = evaluator.evaluate(
        window=window,
        evidence_ids=("C03-EV-001", "C03-EV-002"),
        provenance=provenance,
    )
    assert passed[1]["status"] == "passed"

    failed_rows = tuple(
        replace(row, values={**row.values, "bess_soc_pct": 95.0})
        for row in window.rows
    )
    failed = evaluator.evaluate(
        window=replace(window, rows=failed_rows),
        evidence_ids=("C03-EV-001", "C03-EV-002"),
        provenance=provenance,
    )
    assert failed[1]["status"] == "failed"

    missing_rows = tuple(
        replace(row, values={**row.values, "bess_soc_pct": None})
        for row in window.rows
    )
    missing = evaluator.evaluate(
        window=replace(window, rows=missing_rows),
        evidence_ids=("C03-EV-001", "C03-EV-002"),
        provenance=provenance,
    )
    assert missing[1]["status"] == "warning"
    assert all(check["status"] != "unknown" for check in missing)


def test_c04_safety_applies_dynamic_pcc_limits_from_each_row(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    rows = (
        replace(
            baseline,
            values={
                **baseline.values,
                "pcc_power_actual_kw": 900.0,
                "grid_export_power_limit_kw": 1000.0,
                "grid_import_power_limit_kw": 1000.0,
            },
        ),
        replace(
            baseline,
            index=baseline.index + 1,
            values={
                **baseline.values,
                "pcc_power_actual_kw": 900.0,
                "grid_export_power_limit_kw": 800.0,
                "grid_import_power_limit_kw": 1000.0,
            },
        ),
        replace(
            baseline,
            index=baseline.index + 2,
            values={
                **baseline.values,
                "pcc_power_actual_kw": -900.0,
                "grid_export_power_limit_kw": 1000.0,
                "grid_import_power_limit_kw": 800.0,
            },
        ),
    )
    window = EventWindow(
        event_id="C04-20260105-001",
        code="C04",
        subtype="EXPORT_POWER_LIMIT_NOT_TRACKED",
        rows=rows,
        start_time=baseline.timestamp,
        end_time=baseline.timestamp,
        first_detection_time=baseline.timestamp,
        confidence=0.9,
        detector_version="test-detector-v1",
    )

    checks = SafetyEvaluator().evaluate(
        window=window,
        evidence_ids=("C04-EV-001", "C04-EV-002"),
        provenance=imported.manifest["provenance"],
    )

    boundary = next(
        check for check in checks if check["constraintId"] == "pcc-boundary-v1"
    )
    assert boundary["status"] == "failed"


def test_alarms_are_evidence_only_and_never_detection_criteria(
    valid_csv: str, tmp_path
) -> None:
    """Task B2: 11_alarm_log records enter the evidence chain as facts.

    They are never a detection criterion: the detection module has no access
    to the evidence tables, so `is_anomaly` decisions cannot be influenced by
    alarms. The alarm appears only inside the diagnosis evidence chain.
    """
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    rows = imported.rows

    alarm_file = tmp_path / "11_alarm_log.csv"
    alarm_file.write_text(
        "split,alarm_id,timestamp,source,alarm_code,alarm_message,severity,status\n"
        "validation,A-V-0000001,2026-01-05 10:25:00,EMS01,"
        "BESS_DIRECTION_CONFLICT,储能调度方向冲突,高,ACTIVE\n",
        encoding="utf-8",
    )

    detector = RuleRowDetector()
    before_alarm_file = detector.detect(rows)
    with_alarm_present = detector.detect(rows)
    assert with_alarm_present == before_alarm_file
    assert {candidate.code for candidate in with_alarm_present} == {"C03", "C04"}

    window = EventAggregator().aggregate(
        rows=rows,
        candidates=with_alarm_present,
        sampling_interval_minutes=1,
    )[0]
    event = DiagnosisBuilder(
        evidence_context=EvidenceContext(data_dir=str(tmp_path))
    ).build(window=window, manifest=imported.manifest)

    alarm_evidence = [item for item in event["evidence"] if item["kind"] == "alarm_log"]
    assert alarm_evidence, "the alarm log must appear in the evidence chain"
    assert alarm_evidence[0]["source"] == "alarm-log"
    assert alarm_evidence[0]["variable"] == "BESS_DIRECTION_CONFLICT"
    assert alarm_evidence[0]["actualValue"] == "高"


def _scenario_windows(
    imported,
) -> dict[str, tuple[EventWindow, tuple]]:
    baseline = imported.rows[0]

    def single(**changes: object) -> tuple:
        return (replace(baseline, values={**baseline.values, **changes}),)

    scenarios: dict[str, tuple] = {
        "C01": tuple(
            replace(
                baseline,
                values={**baseline.values, "elz1_power_cmd_kw": value},
            )
            for value in (600, 300, 600, 300, 600, 300, 600, 600, 600, 600, 600, 600, 600, 600, 600)
        ),
        "C02": single(
            elz1_reported_available_capacity_kw=1000.0,
            elz1_actual_available_capacity_kw=500.0,
            elz1_power_cmd_kw=600.0,
            elz1_power_actual_kw=300.0,
        ),
        "C03": single(bess_power_cmd_kw=-240.0, bess_power_actual_kw=230.0),
        "C04": single(pcc_export_power_violation_kw=120.0),
        "C05": single(grid_export_energy_quota_excess_kwh=15.0),
        "C06": single(
            elz1_power_actual_kw=500.0,
            elz1_specific_energy_kwh_per_kg=55.0,
            elz2_power_actual_kw=0.0,
            elz2_specific_energy_kwh_per_kg=52.0,
            elz2_available_flag=1,
            elz2_actual_available_capacity_kw=1000.0,
        ),
        "C07": single(
            bess_soc_pct=40.0,
            soc_target_pct=88.0,
        ),
    }
    windows: dict[str, tuple[EventWindow, tuple]] = {}
    for code, rows in scenarios.items():
        subtype = vocabulary.subtypes_by_code()[code][0]
        window = EventWindow(
            event_id=f"{code}-20260105-001",
            code=code,
            subtype=subtype,
            rows=rows,
            start_time=baseline.timestamp,
            end_time=baseline.timestamp,
            first_detection_time=baseline.timestamp,
            confidence=0.9,
            detector_version="test-detector-v1",
        )
        windows[code] = (window, rows)
    return windows


def test_safety_evaluator_covers_all_seven_classes_without_unknown(
    valid_csv: str,
) -> None:
    """Task B3: every anomaly class yields checks; never "unknown"."""
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    provenance = imported.manifest["provenance"]
    evaluator = SafetyEvaluator()
    for code, (window, _rows) in _scenario_windows(imported).items():
        checks = evaluator.evaluate(
            window=window,
            evidence_ids=(f"{code}-EV-001", f"{code}-EV-002"),
            provenance=provenance,
        )
        assert checks, code
        assert all(
            check["status"] in {"passed", "warning", "failed"} for check in checks
        ), code
        assert all(check["message"] for check in checks), code
        assert any(
            check["constraintId"] == "human-confirmation-v1" for check in checks
        ), code


def test_recommendations_state_confirmation_object_priority_preconditions(
    valid_csv: str,
) -> None:
    """Task B3: each recommendation names manual confirmation, the adjustment
    object, the priority and the preconditions it depends on."""
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    builder = DiagnosisBuilder()
    for code, (window, _rows) in _scenario_windows(imported).items():
        event = builder.build(window=window, manifest=imported.manifest)
        assert event["requiresHumanConfirmation"] is True, code
        recommendation = event["recommendations"][0]
        assert recommendation["requiresHumanConfirmation"] is True, code
        assert "人工确认" in recommendation["summary"] or "人工确认" in recommendation["rationale"]
        assert "调整对象" in recommendation["summary"], code
        assert "前置条件" in recommendation["summary"], code
        assert "优先级" in recommendation["rationale"], code
