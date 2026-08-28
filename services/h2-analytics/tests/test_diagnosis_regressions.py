from __future__ import annotations

from dataclasses import replace

from h2_analytics.diagnosis import DiagnosisBuilder
from h2_analytics.events import EventWindow
from h2_analytics.ingestion import DatasetLoader
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

    c06 = builder.build(
        window=_window(
            "C06",
            "INEFFICIENT_POWER_ALLOCATION",
            baseline,
            implicated_equipment_ids=("ELZ03", "ELZ02"),
        ),
        manifest=imported.manifest,
    )
    assert [item["id"] for item in c06["affectedEquipment"]] == [
        "ELZ03",
        "ELZ02",
    ]
    assert [item["variable"] for item in c06["evidence"][:2]] == [
        "elz3_specific_energy_kwh_per_kg",
        "elz2_power_actual_kw",
    ]
    assert submission_rows([c06])[0]["affected_equipment"] == "ELZ1,ELZ2,ELZ3"
    assert validate_submission_text(serialize_submission([c01, c02, c06]))[
        "rowCount"
    ] == 3


def test_c03_same_direction_measurements_do_not_claim_opposite_feedback(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    row = replace(
        baseline,
        values={
            **baseline.values,
            "bess_power_cmd_kw": -400.0,
            "bess_power_actual_kw": -400.0,
            "pcc_power_actual_kw": -500.0,
        },
    )

    event = DiagnosisBuilder().build(
        window=_window("C03", "BESS_DIRECTION_REVERSED", row),
        manifest=imported.manifest,
    )

    assert "相反" not in event["rootCause"]
    assert [item["variable"] for item in event["evidence"][:2]] == [
        "bess_power_cmd_kw",
        "pcc_power_actual_kw",
    ]
    assert all("相反" not in item["conclusion"] for item in event["evidence"][:2])
