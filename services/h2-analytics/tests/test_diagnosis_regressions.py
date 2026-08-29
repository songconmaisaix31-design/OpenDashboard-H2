from __future__ import annotations

import json
from dataclasses import replace
from datetime import timedelta

import pytest
from jsonschema import Draft202012Validator

from h2_analytics import vocabulary
from h2_analytics.detection import RuleRowDetector
from h2_analytics.diagnosis import DiagnosisBuilder
from h2_analytics.events import EventAggregator, EventWindow
from h2_analytics.ingestion import DatasetLoader
from h2_analytics.models import DataRow
from h2_analytics.reports import serialize_submission, submission_rows
from h2_analytics.tools.validate_submission import validate_submission_text


def _window(
    code: str,
    subtype: str,
    row,
    *,
    implicated_equipment_ids: tuple[str, ...] = (),
) -> EventWindow:
    assert row.timestamp is not None
    return EventWindow(
        event_id=f"{code}-20260105-001",
        code=code,
        subtype=subtype,
        rows=(row,),
        start_time=row.timestamp,
        end_time=row.timestamp,
        first_detection_time=row.timestamp,
        confidence=0.9,
        detector_version="test-detector-v1",
        implicated_equipment_ids=implicated_equipment_ids,
    )


def test_mixed_c07_subtype_plans_do_not_mutate_global_templates(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    row = imported.rows[0]
    builder = DiagnosisBuilder()
    charge = _window("C07", "CHARGE_HEADROOM_SHORTFALL", row)
    discharge = _window("C07", "DISCHARGE_RESERVE_SHORTFALL", row)

    assert builder._plan_for(charge)[0]["variable"] == (
        "bess_available_charge_energy_kwh"
    )
    assert builder._plan_for(discharge)[0]["variable"] == (
        "bess_available_discharge_energy_kwh"
    )
    assert builder._plan_for(charge)[0]["variable"] == (
        "bess_available_charge_energy_kwh"
    )


def test_c01_c02_c06_use_implicated_electrolyzers_in_evidence_and_submission(
    valid_csv: str,
    repository_root,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    builder = DiagnosisBuilder()

    c01 = builder.build(
        window=_window(
            "C01",
            "SETPOINT_OSCILLATION",
            baseline,
            implicated_equipment_ids=("ELZ02", "ELZ03"),
        ),
        manifest=imported.manifest,
    )
    assert [item["id"] for item in c01["affectedEquipment"]] == [
        "ELZ02",
        "ELZ03",
        "BESS01",
        "PCC01",
    ]
    assert [item["variable"] for item in c01["evidence"][:3]] == [
        "elz2_power_cmd_kw",
        "elz3_power_cmd_kw",
        "pcc_power_actual_kw",
    ]
    assert submission_rows([c01])[0]["affected_equipment"] == (
        "ELZ2,ELZ3,BESS,PCC"
    )

    c02_row = replace(
        baseline,
        values={
            **baseline.values,
            "elz2_reported_available_capacity_kw": 1000.0,
            "elz2_actual_available_capacity_kw": 500.0,
            "elz2_power_cmd_kw": 700.0,
            "elz2_power_actual_kw": 400.0,
        },
    )
    c02 = builder.build(
        window=_window(
            "C02",
            "CAPACITY_NOT_SYNCHRONIZED",
            c02_row,
            implicated_equipment_ids=("ELZ02",),
        ),
        manifest=imported.manifest,
    )
    assert [item["id"] for item in c02["affectedEquipment"]] == ["ELZ02"]
    assert [item["variable"] for item in c02["evidence"][:2]] == [
        "elz2_reported_available_capacity_kw",
        "elz2_power_cmd_kw",
    ]
    assert submission_rows([c02])[0]["affected_equipment"] == "ELZ2"

    c06_row = replace(
        baseline,
        values={
            **baseline.values,
            "ems_total_elz_target_kw": 2000.0,
            "elz1_available_flag": 1.0,
            "elz1_run_state": 2.0,
            "elz1_actual_available_capacity_kw": 1000.0,
            "elz1_power_cmd_kw": 400.0,
            "elz1_power_actual_kw": 400.0,
            "elz1_specific_energy_kwh_per_kg": 51.0,
            "elz2_available_flag": 1.0,
            "elz2_run_state": 2.0,
            "elz2_actual_available_capacity_kw": 1000.0,
            "elz2_power_cmd_kw": 600.0,
            "elz2_power_actual_kw": 600.0,
            "elz2_specific_energy_kwh_per_kg": 52.0,
            "elz3_available_flag": 1.0,
            "elz3_run_state": 2.0,
            "elz3_actual_available_capacity_kw": 1000.0,
            "elz3_power_cmd_kw": 1000.0,
            "elz3_power_actual_kw": 1000.0,
            "elz3_specific_energy_kwh_per_kg": 54.2,
        },
    )
    c06 = builder.build(
        window=_window(
            "C06",
            "INEFFICIENT_POWER_ALLOCATION",
            c06_row,
            implicated_equipment_ids=("ELZ03", "ELZ02"),
        ),
        manifest=imported.manifest,
    )
    assert [item["id"] for item in c06["affectedEquipment"]] == [
        "ELZ03",
        "ELZ02",
    ]
    assert [item["variable"] for item in c06["evidence"][:5]] == [
        "elz3_specific_energy_kwh_per_kg",
        "elz3_power_actual_kw",
        "elz3_run_state",
        "elz3_available_flag",
        "elz3_actual_available_capacity_kw",
    ]
    variables = {item["variable"] for item in c06["evidence"]}
    assert {
        "elz2_specific_energy_kwh_per_kg",
        "elz2_power_actual_kw",
        "elz2_run_state",
        "elz2_available_flag",
        "elz2_actual_available_capacity_kw",
        "ems_total_elz_target_kw",
        "equivalent_reallocation_kw",
        "ELZ03_to_ELZ02_curve_specific_energy",
    }.issubset(variables)
    capacity_evidence = {
        item["variable"]: item
        for item in c06["evidence"]
        if item["variable"].endswith("actual_available_capacity_kw")
    }
    assert capacity_evidence["elz3_actual_available_capacity_kw"][
        "actualValue"
    ] == 1000.0
    assert capacity_evidence["elz3_actual_available_capacity_kw"][
        "referenceValue"
    ] == 950.0
    assert capacity_evidence["elz3_actual_available_capacity_kw"][
        "comparator"
    ] == ">="
    assert capacity_evidence["elz2_actual_available_capacity_kw"][
        "actualValue"
    ] == 1000.0
    assert capacity_evidence["elz2_actual_available_capacity_kw"][
        "referenceValue"
    ] == 650.0
    assert capacity_evidence["elz2_actual_available_capacity_kw"][
        "comparator"
    ] == ">="
    impact_evidence = next(
        item
        for item in c06["evidence"]
        if item["variable"] == "extra_energy_consumption_kwh"
    )
    assert impact_evidence["source"] == "impact-c06-v3"
    event_schema = json.loads(
        (
            repository_root
            / "packages/h2-contracts/schema/anomaly-event.schema.json"
        ).read_text(encoding="utf-8")
    )
    Draft202012Validator(event_schema).validate(c06)
    assert submission_rows([c06])[0]["affected_equipment"] == "ELZ1,ELZ2,ELZ3"
    assert validate_submission_text(serialize_submission([c01, c02, c06]))[
        "rowCount"
    ] == 3


def test_c03_official_sign_detector_to_event_requires_causal_conflict(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    baseline_timestamp = baseline.timestamp

    def marker_row(index: int, *, causal_conflict: bool) -> DataRow:
        timestamp = baseline_timestamp + timedelta(minutes=index)
        return replace(
            baseline,
            index=index,
            timestamp=timestamp,
            timestamp_text=timestamp.isoformat(),
            values={
                **baseline.values,
                "bess_power_cmd_kw": 400.0,
                "bess_power_actual_kw": 400.0,
                "pcc_power_actual_kw": 500.0,
                "elz1_power_actual_kw": 100.0,
                "elz2_power_actual_kw": 100.0,
                "elz3_power_actual_kw": 100.0,
                "aux_load_kw": 100.0,
                "pv_actual_kw": 1000.0 if causal_conflict else 0.0,
                "bess_soc_pct": 80.0,
                "soc_target_pct": 60.0,
            },
        )

    def quiet_row(index: int) -> DataRow:
        row = marker_row(index, causal_conflict=False)
        return replace(
            row,
            values={
                **row.values,
                "bess_power_cmd_kw": 0.0,
                "bess_power_actual_kw": 0.0,
                "pcc_power_actual_kw": 0.0,
            },
        )

    ordinary_same_direction = tuple(
        marker_row(index, causal_conflict=False) for index in range(5)
    )
    causal_event_rows = tuple(
        marker_row(index, causal_conflict=True) for index in range(6, 12)
    )
    rows = (*ordinary_same_direction, quiet_row(5), *causal_event_rows, quiet_row(12))
    candidates = tuple(
        item for item in RuleRowDetector().detect(rows) if item.code == "C03"
    )
    windows = EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )

    event = DiagnosisBuilder().build(
        window=windows[0],
        manifest=imported.manifest,
    )

    assert [item.timestamp for item in candidates] == [
        item.timestamp for item in causal_event_rows
    ]
    assert len(windows) == 1
    assert windows[0].start_time == causal_event_rows[0].timestamp
    assert windows[0].first_detection_time == causal_event_rows[4].timestamp
    assert windows[0].end_time == causal_event_rows[-1].timestamp
    assert "相反" not in event["rootCause"]
    assert [item["variable"] for item in event["evidence"][:3]] == [
        "bess_power_cmd_kw",
        "bess_power_actual_kw",
        "pcc_power_actual_kw",
    ]
    assert all("相反" not in item["conclusion"] for item in event["evidence"][:3])
    impact_evidence = next(
        item
        for item in event["evidence"]
        if item["variable"] == "abnormal_grid_exchange_energy_kwh"
    )
    assert impact_evidence["source"] == "impact-c03-v2"


@pytest.mark.parametrize(
    "missing_field",
    [
        "ems_total_elz_target_kw",
        "elz2_run_state",
        "elz2_available_flag",
        "elz2_actual_available_capacity_kw",
        "elz2_specific_energy_kwh_per_kg",
        "elz3_run_state",
        "elz3_actual_available_capacity_kw",
    ],
)
def test_c06_diagnosis_fails_closed_without_claim_inputs(
    valid_csv: str,
    missing_field: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    values = {
        **baseline.values,
        "ems_total_elz_target_kw": 2000.0,
        "elz1_available_flag": 1.0,
        "elz1_run_state": 2.0,
        "elz1_actual_available_capacity_kw": 1000.0,
        "elz1_power_cmd_kw": 400.0,
        "elz1_power_actual_kw": 400.0,
        "elz1_specific_energy_kwh_per_kg": 51.0,
        "elz2_available_flag": 1.0,
        "elz2_run_state": 2.0,
        "elz2_actual_available_capacity_kw": 1000.0,
        "elz2_power_cmd_kw": 600.0,
        "elz2_power_actual_kw": 600.0,
        "elz2_specific_energy_kwh_per_kg": 52.0,
        "elz3_available_flag": 1.0,
        "elz3_run_state": 2.0,
        "elz3_actual_available_capacity_kw": 1000.0,
        "elz3_power_cmd_kw": 1000.0,
        "elz3_power_actual_kw": 1000.0,
        "elz3_specific_energy_kwh_per_kg": 54.2,
    }
    values[missing_field] = None
    row = replace(baseline, values=values)

    with pytest.raises(
        vocabulary.VocabularyError,
        match="complete feasible-reallocation evidence",
    ):
        DiagnosisBuilder().build(
            window=_window(
                "C06",
                "INEFFICIENT_POWER_ALLOCATION",
                row,
                implicated_equipment_ids=("ELZ03", "ELZ02"),
            ),
            manifest=imported.manifest,
        )


@pytest.mark.parametrize(
    ("code", "subtype", "equipment_ids"),
    [
        ("C01", "SETPOINT_OSCILLATION", ()),
        ("C01", "SETPOINT_OSCILLATION", ("ELZ01",)),
        ("C02", "CAPACITY_NOT_SYNCHRONIZED", ("ELZ99",)),
        ("C06", "INEFFICIENT_POWER_ALLOCATION", ("ELZ01",)),
    ],
)
def test_dynamic_diagnosis_equipment_attribution_fails_closed(
    valid_csv: str,
    code: str,
    subtype: str,
    equipment_ids: tuple[str, ...],
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)

    with pytest.raises(vocabulary.VocabularyError, match="requires valid"):
        DiagnosisBuilder().build(
            window=_window(
                code,
                subtype,
                imported.rows[0],
                implicated_equipment_ids=equipment_ids,
            ),
            manifest=imported.manifest,
        )
