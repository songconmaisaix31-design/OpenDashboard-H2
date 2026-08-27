from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CsvImportRequest(StrictRequest):
    filename: str = Field(min_length=1, max_length=128)
    text: str


class DatasetIdRequest(StrictRequest):
    dataset_id: str = Field(alias="datasetId", min_length=1)


class RunIdRequest(StrictRequest):
    run_id: str = Field(alias="runId", min_length=1)


class EventRequest(RunIdRequest):
    event_id: str = Field(alias="eventId", min_length=1)


class EventFilter(StrictRequest):
    codes: tuple[str, ...] | None = None
    severities: tuple[str, ...] | None = None
    equipment_ids: tuple[str, ...] | None = Field(default=None, alias="equipmentIds")
    review_states: tuple[str, ...] | None = Field(default=None, alias="reviewStates")
    min_confidence: float | None = Field(default=None, alias="minConfidence", ge=0, le=1)
    starts_at_or_after: str | None = Field(default=None, alias="startsAtOrAfter")
    ends_at_or_before: str | None = Field(default=None, alias="endsAtOrBefore")


class EventListRequest(RunIdRequest):
    filter: EventFilter | None = None


class SeriesRequest(StrictRequest):
    run_id: str = Field(alias="runId", min_length=1)
    variables: tuple[str, ...] = Field(min_length=1, max_length=32)
    start_time: str = Field(alias="startTime", min_length=1)
    end_time: str = Field(alias="endTime", min_length=1)
    event_id: str | None = Field(default=None, alias="eventId")

    @field_validator("variables")
    @classmethod
    def unique_variables(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("series variables must be unique")
        return value


class AssistantRequest(StrictRequest):
    run_id: str = Field(alias="runId", min_length=1)
    question_id: str = Field(alias="questionId")
    event_id: str | None = Field(default=None, alias="eventId")
    allow_llm_rendering: bool = Field(alias="allowLlmRendering")

class TimeRange(StrictRequest):
    start_time: str = Field(alias="startTime", min_length=1)
    end_time: str = Field(alias="endTime", min_length=1)


class ReportRequest(StrictRequest):
    run_id: str = Field(alias="runId", min_length=1)
    kind: str
    event_id: str | None = Field(default=None, alias="eventId")
    time_range: TimeRange | None = Field(default=None, alias="timeRange")


class LocalReviewActor(StrictRequest):
    kind: Literal["local_operator"]
    display_name: str = Field(alias="displayName", min_length=1, max_length=64)


class ReviewEventRequest(StrictRequest):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    run_id: str = Field(alias="runId", min_length=1)
    event_id: str = Field(alias="eventId", min_length=1)
    action: Literal["confirm", "reject", "resolve", "reopen", "add_note"]
    expected_revision: int = Field(alias="expectedRevision", ge=0)
    actor: LocalReviewActor
    note: str | None = Field(default=None, max_length=2000)
