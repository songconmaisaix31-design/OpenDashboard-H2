# H2 Sentinel P1 API Contract

- **Status:** Implementation contract
- **Version:** P1 / schema version 1
- **Canonical implementation:** `packages/h2-contracts/**`
- **HTTP namespace:** `/api/v1/h2-sentinel`
- **Product language:** Simplified Chinese

## 1. Contract Strategy

P1 extends the existing H2 contracts only where the judge-facing workflow cannot be represented today. It preserves:

- `H2ApiEnvelope<T>` and the existing redacted-error boundary;
- `H2SentinelDataSource` as the Web composition seam;
- `H2AnomalyEvent` and its current review-state wire values;
- existing analysis, series, report, and submission entry points;
- stable English machine fields and identifiers outside the official question-ID correction.

P1 changes:

1. Replace `H2Q01`-`H2Q10` values with the official `Q01`-`Q10` values and official Chinese prompts.
2. Tighten assistant-answer invariants and add an optional generated report artifact required only by `Q09`.
3. Add an append-only event-review journal and two data-source methods.
4. Add `pcc_daily_compliance` and `review_audit_json` report kinds.

There is no dual-ID compatibility period on the P1 wire. `H2Qxx` inputs are invalid after migration.

## 2. Official Assistant Contract

### 2.1 Canonical questions

```ts
export const H2_ASSISTANT_QUESTIONS = [
  { questionId: 'Q01', prompt: 'PCC正值和负值分别代表什么？' },
  { questionId: 'Q02', prompt: '如何区分PCC功率越限与电量配额异常？' },
  { questionId: 'Q03', prompt: '储能方向异常如何影响PCC功率？' },
  { questionId: 'Q04', prompt: '如何判断SOC调节备用是否不足？' },
  { questionId: 'Q05', prompt: '设备降额但EMS未同步如何定位？' },
  { questionId: 'Q06', prompt: '如何区分云团变化和控制指令振荡？' },
  { questionId: 'Q07', prompt: '如何评价多台电解槽负荷分配？' },
  { questionId: 'Q08', prompt: '哪些建议必须人工确认？' },
  { questionId: 'Q09', prompt: '生成测试集异常诊断报告。' },
  { questionId: 'Q10', prompt: 'PCC合规日报包含哪些内容？' },
] as const

export type H2AssistantQuestionId =
  (typeof H2_ASSISTANT_QUESTIONS)[number]['questionId']
```

The exported constant, TypeScript union, JSON Schema enum, Python constant, Fixture adapter, Live adapter, Web labels, and tests must use the same values and text.

### 2.2 Request

The existing request shape is retained:

```ts
export interface H2AssistantRequest {
  readonly runId: string
  readonly questionId: H2AssistantQuestionId
  readonly eventId?: string
  readonly allowLlmRendering: boolean
}
```

P1 behavior:

- `allowLlmRendering` remains for compatibility but does not enable a network or model call.
- P1 always returns `mode: 'DETERMINISTIC_TEMPLATE'`.
- `runId` and any supplied `eventId` must resolve within the same active data source.
- External paths, URLs, prompts, arbitrary question text, and control commands are not accepted.

### 2.3 Question context matrix

| Question | Event requirement | Allowed event code |
| --- | --- | --- |
| `Q01` | Optional | Any; answer remains sign-convention focused. |
| `Q02` | Optional | C04 or C05 when supplied. |
| `Q03` | Required | C03. |
| `Q04` | Optional | C07 when supplied. |
| `Q05` | Optional | C02 when supplied. |
| `Q06` | Optional | C01 when supplied. |
| `Q07` | Optional | C06 when supplied. |
| `Q08` | Optional | Any. |
| `Q09` | Required | Any event in the selected run. |
| `Q10` | Optional | C04 or C05 when supplied. |

If a restricted supplied event has the wrong code, the request fails with `assistant.event_mismatch`. The service must not silently drop the event and return a generic answer.

### 2.4 Answer

The existing answer types remain, with one addition:

```ts
export interface H2AssistantAnswer {
  readonly schemaVersion: 1
  readonly answerId: string
  readonly runId: string
  readonly questionId: H2AssistantQuestionId
  readonly mode: 'DETERMINISTIC_TEMPLATE'
  readonly generatedAt: string
  readonly eventId?: string
  readonly sections: readonly H2AssistantAnswerSection[]
  readonly citations: readonly H2AssistantCitation[]
  readonly generatedReport?: H2ReportArtifact
  readonly refusedControlClaim: true
  readonly provenance: H2Provenance
}
```

`generatedReport` rules:

- Required for `Q09` and forbidden for every other question.
- Must be `kind: 'single_event_diagnosis'`, `format: 'html'`, and `mediaType: 'text/html'`.
- Its `runId` and `eventId` must match the answer.
- Exactly one answer citation has `sourceType: 'report'` and `sourceId` equal to `generatedReport.descriptor.reportId`.
- The report content and descriptor must pass Section 5.

### 2.5 Section and citation invariants

The current section and citation shapes are retained. P1 adds these validation rules:

- `sections` has at least one item.
- Each `sectionId` is unique within the answer.
- Each section has at least one unique `citationId`.
- Each section citation resolves to exactly one returned citation.
- Each returned citation is referenced by at least one section.
- Each `citationId` is unique within the answer.
- A citation's `claimKind` matches every section claim that uses it.
- Event/evidence/report citations belong to the answer's `runId` and selected event where applicable.
- All section text is non-empty Simplified Chinese; canonical IDs and variable names may remain English.
- Missing evidence is represented by a bounded Chinese section with a citation to the available source defining the limit. It is not represented by a fabricated value.
- `refusedControlClaim` is a JSON Schema constant `true`.

### 2.6 Assistant errors

| HTTP | Error code | Condition |
| --- | --- | --- |
| 404 | `assistant.run_not_found` | `runId` does not exist. |
| 404 | `assistant.event_not_found` | Supplied `eventId` does not exist in the run. |
| 400 | `assistant.event_required` | `Q03` or `Q09` lacks `eventId`. |
| 409 | `assistant.event_mismatch` | Supplied event code violates the context matrix. |
| 422 | `assistant.question_unknown` | Value is not an official `Q01`-`Q10` ID, including `H2Qxx`. |
| 409 | `assistant.evidence_unavailable` | `Q09` cannot assemble a valid report from the selected event. |

Stable error codes remain English. Judge-visible `message` values for these errors are Simplified Chinese and must not include paths, stack traces, secrets, or raw imported content.

## 3. Human Review Contract

### 3.1 Existing state values

```ts
export type H2ReviewState =
  | 'open'
  | 'confirmed'
  | 'dismissed'
  | 'resolved'

export type H2ReviewAction =
  | 'confirm'
  | 'reject'
  | 'resolve'
  | 'reopen'
  | 'add_note'
```

`reject` maps to `dismissed`. No `rejected` wire state is added.

### 3.2 Actor, journal entry, and projection

```ts
export interface H2LocalReviewActor {
  readonly kind: 'local_operator'
  readonly displayName: string
}

export interface H2ReviewEntry {
  readonly schemaVersion: 1
  readonly entryId: string
  readonly requestId: string
  readonly revision: number
  readonly action: H2ReviewAction
  readonly previousState: H2ReviewState
  readonly nextState: H2ReviewState
  readonly note?: string
  readonly actor: H2LocalReviewActor
  readonly createdAt: string
}

export interface H2EventReview {
  readonly schemaVersion: 1
  readonly reviewId: string
  readonly runId: string
  readonly eventId: string
  readonly initialState: 'open'
  readonly currentState: H2ReviewState
  readonly revision: number
  readonly entries: readonly H2ReviewEntry[]
  readonly provenance: H2Provenance
}
```

Invariants:

- A new analysis event starts with `reviewState: 'open'` and a review projection at revision zero with no entries.
- `entries` are sorted by ascending revision and contain exactly revisions `1..review.revision`.
- `entry.previousState` equals the prior projection; `entry.nextState` equals the new projection.
- `review.currentState` equals the final entry's `nextState`, or `open` when no entry exists.
- `H2AnomalyEvent.reviewState` is derived from `H2EventReview.currentState` when the event is returned; all other event fields remain analysis-owned.
- `actor.displayName` is local, user-supplied attribution and is not authenticated identity.

### 3.3 Mutation request and receipt

```ts
export interface H2ReviewEventRequest {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly runId: string
  readonly eventId: string
  readonly action: H2ReviewAction
  readonly expectedRevision: number
  readonly actor: H2LocalReviewActor
  readonly note?: string
}

export interface H2ReviewMutationReceipt {
  readonly schemaVersion: 1
  readonly replayed: boolean
  readonly entry: H2ReviewEntry
  readonly review: H2EventReview
}
```

Validation:

- `requestId`: trimmed, 1-128 ASCII characters; scoped to one data-source instance and run.
- `expectedRevision`: integer greater than or equal to zero.
- `actor.displayName`: trimmed, 1-64 Unicode characters; control characters rejected.
- `note`: plain text, trimmed, at most 2,000 Unicode characters; control characters other than newline and tab rejected.
- `reject`, `resolve`, `reopen`, and `add_note` require a non-empty note.
- `confirm` may omit the note.
- The server ignores any client timestamp or requested next state because neither field is accepted.

Idempotency:

- First accepted `requestId` appends exactly one entry.
- Exact replay returns the original receipt with `replayed: true` even if the current revision has advanced.
- Reuse of a `requestId` with a different semantic request fails with `review.idempotency_conflict`.

### 3.4 Transition function

The service computes the next state; the client never supplies it.

```ts
export function nextH2ReviewState(
  current: H2ReviewState,
  action: H2ReviewAction,
): H2ReviewState {
  if (action === 'add_note') return current
  if (current === 'open' && action === 'confirm') return 'confirmed'
  if (current === 'open' && action === 'reject') return 'dismissed'
  if (current === 'confirmed' && action === 'resolve') return 'resolved'
  if (
    action === 'reopen' &&
    (current === 'confirmed' ||
      current === 'dismissed' ||
      current === 'resolved')
  ) {
    return 'open'
  }
  throw new H2ReviewTransitionError(current, action)
}
```

The illustrative error class is not a requirement to introduce a production class. Implementations may use a function/result pattern consistent with the existing codebase.

### 3.5 Data-source methods

`H2SentinelDataSource` gains exactly two methods:

```ts
export interface H2SentinelDataSource {
  // Existing methods remain unchanged.
  getEventReview(runId: string, eventId: string): Promise<H2EventReview>
  reviewEvent(
    request: H2ReviewEventRequest,
  ): Promise<H2ReviewMutationReceipt>
}
```

`listEvents` and `getEvent` continue to expose the projected `reviewState`. The Web uses `getEventReview` for notes/history and `reviewEvent` for mutations.

### 3.6 HTTP routes

The Live adapter exposes:

```text
GET  /api/v1/h2-sentinel/runs/{runId}/events/{eventId}/review
POST /api/v1/h2-sentinel/runs/{runId}/events/{eventId}:review
```

The POST body is `H2ReviewEventRequest` with `runId` and `eventId` required to match the path. A mismatch fails with `request.invalid`; the service never chooses one value implicitly.

Success uses `H2ApiSuccessEnvelope<H2EventReview>` for GET and `H2ApiSuccessEnvelope<H2ReviewMutationReceipt>` for POST. The routes remain literal-loopback only and are added to the canonical route map and route-parity tests.

### 3.7 Review errors

| HTTP | Error code | Condition |
| --- | --- | --- |
| 404 | `review.run_not_found` | Run does not exist. |
| 404 | `review.event_not_found` | Event does not exist in the run. |
| 409 | `review.conflict` | `expectedRevision` is stale; no entry appended. |
| 409 | `review.invalid_transition` | State/action pair is not in the transition table. |
| 409 | `review.idempotency_conflict` | `requestId` was reused for different content. |
| 422 | `review.note_required` | Required note is absent or blank. |
| 422 | `request.invalid` | Shape, bounds, control characters, or path/body identity is invalid. |

Redacted errors must not echo the rejected note, actor label, absolute path, or internal storage details.

## 4. Review Audit Export

### 4.1 Report kind

```ts
export type H2ReportKind =
  | 'single_event_diagnosis'
  | 'period_summary'
  | 'pcc_daily_compliance'
  | 'analysis_result_json'
  | 'submission_csv'
  | 'validation_metrics'
  | 'quality_report'
  | 'review_audit_json'
```

`review_audit_json` uses `format: 'json'`, media type `application/json`, and an ASCII filename such as `review-audit-<run-id>.json` after safe identifier normalization.

### 4.2 Payload

```ts
export interface H2ReviewAuditEventSnapshot {
  readonly eventId: string
  readonly code: H2AnomalyCode
  readonly subtype: H2AnomalySubtype
  readonly startTime: string
  readonly endTime: string
}

export interface H2ReviewAuditEvent {
  readonly event: H2ReviewAuditEventSnapshot
  readonly review: H2EventReview
}

export interface H2ReviewAuditExport {
  readonly schemaVersion: 1
  readonly exportKind: 'event_review_audit'
  readonly runId: string
  readonly datasetFingerprint: string
  readonly generatedAt: string
  readonly actorIdentityNotice: 'local_operator_labels_are_unverified'
  readonly events: readonly H2ReviewAuditEvent[]
  readonly provenance: H2Provenance
}
```

Export invariants:

- Include every event in the run, including revision-zero reviews.
- Sort events by `startTime`, then `eventId`; sort entries by revision.
- Preserve Chinese notes as UTF-8 JSON strings.
- Include no report content, official labels, secrets, cookies, tokens, credentials, absolute paths, or hidden test data.
- Serialize with stable key and array ordering.
- `descriptor.contentHash` is SHA-256 of the exact UTF-8 JSON content.

## 5. Report Contract

### 5.1 Request compatibility

The current request shape remains:

```ts
export interface H2ReportRequest {
  readonly runId: string
  readonly kind: H2ReportKind
  readonly eventId?: string
  readonly timeRange?: H2TimeRange
}
```

Input matrix:

| Kind | `eventId` | `timeRange` |
| --- | --- | --- |
| `single_event_diagnosis` | Required | Ignored/rejected if supplied. |
| `period_summary` | Forbidden | Optional; defaults to the full run. |
| `pcc_daily_compliance` | Forbidden | Required; one declared dataset-calendar day, start inclusive and end exclusive. |
| `analysis_result_json` | Forbidden | Forbidden. |
| `submission_csv` | Forbidden | Forbidden. |
| `validation_metrics` | Forbidden | Forbidden. |
| `quality_report` | Forbidden | Forbidden. |
| `review_audit_json` | Forbidden | Forbidden. |

Unexpected combinations fail with `report.invalid_scope`; they are not silently ignored.

### 5.2 Descriptor and artifact

The existing descriptor and artifact types remain. P1 requires:

- `status: 'ready'` only when non-empty content and a matching content hash exist.
- A failed generation returns a redacted API error, not a `ready` artifact with error prose.
- `filename` contains no path separators or untrusted raw filename fragments.
- `contentHash` matches `sha256:<64 lowercase hex>` over exact UTF-8 content.
- `eventId` is required only for `single_event_diagnosis`.
- `warnings` are Simplified Chinese for judge-visible flows and contain no secret or path.
- `safetyDisclaimer` is Simplified Chinese and explicitly denies control authority.

### 5.3 Kind, format, and media-type parity

| Kind | Format | Media type |
| --- | --- | --- |
| `single_event_diagnosis` | `html` | `text/html` |
| `period_summary` | `html` | `text/html` |
| `pcc_daily_compliance` | `html` | `text/html` |
| `analysis_result_json` | `json` | `application/json` |
| `submission_csv` | `csv` | `text/csv` |
| `validation_metrics` | `json` | `application/json` |
| `quality_report` | `html` | `text/html` |
| `review_audit_json` | `json` | `application/json` |

### 5.4 Chinese HTML requirements

Each HTML artifact must contain:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <!-- escaped Chinese title and bounded local styles -->
  </head>
  <body>
    <!-- Chinese content; no scripts or remote assets -->
  </body>
</html>
```

Shared required fields:

- Chinese report title and section headings;
- generation time, run ID, dataset fingerprint, source interval, and provenance mode;
- model, rule, configuration, formula, and renderer versions when available;
- exact values and units for every numeric claim;
- Chinese safety disclaimer: the application provides supervision, diagnosis, quantification, and recommendations only, does not issue equipment commands, and requires human confirmation;
- explicit `FIXTURE`, validation-slice, full-validation, test, or other Live source label;
- Chinese unavailable-state text instead of fabricated values.

Untrusted imported filenames, evidence conclusions, root-cause text, actor labels, review notes, and warning text must be escaped before interpolation. Reports contain no JavaScript, remote font, remote image, tracking pixel, or outbound link required for rendering.

### 5.5 Single-event diagnosis

Required Chinese sections, in order:

1. `报告范围与数据来源`
2. `异常概览`
3. `证据链`
4. `原因判断：事实与推断`
5. `影响量化`
6. `安全检查`
7. `建议与人工确认`
8. `人工复核记录`
9. `版本与溯源`
10. `安全声明与限制`

The report must include the selected event's exact timing, code/subtype/severity, first detection, affected equipment, evidence IDs, impact formula/version/window/unit/assumptions, current review state, ordered journal entries, and unverified-actor notice.

### 5.6 Period summary

Required Chinese sections:

- report range and provenance;
- data-quality status and limitations;
- event counts by anomaly code and severity;
- counts by `open`, `confirmed`, `dismissed`, and `resolved` with Chinese labels;
- important open/high-severity events;
- bounded impact summary that does not add unlike units;
- validation-metric availability statement;
- safety disclaimer.

### 5.7 PCC daily compliance

Required Chinese sections:

- day/range and dataset time basis;
- PCC actual power and dynamic import/export limits;
- import and export violation intervals, duration, and violation energy;
- cumulative daily import/export energy and official quota values when available;
- related C04/C05 events and their human-review states;
- quality gaps or unavailable quota evidence;
- formula versions, assumptions, provenance, and safety disclaimer.

If a quota variable or official constraint is unavailable, the report states `证据不足，未计算该项合规结论` and omits the conclusion. It must not substitute zero.

### 5.8 Machine reports

- `submission_csv` retains exactly the frozen 16 columns and does not add review columns.
- Human review never changes the detector's event ID, timing, code, evidence, or submission cells.
- `validation_metrics` contains results only when labels, split identity, matching definition, and versioned configuration are available. Otherwise generation fails with `report.metrics_unavailable` or returns the existing explicitly unavailable representation; it never returns fabricated zero metrics.
- `review_audit_json` follows Section 4.

### 5.9 Report errors

| HTTP | Error code | Condition |
| --- | --- | --- |
| 404 | `report.run_not_found` | Run does not exist. |
| 404 | `report.event_not_found` | Required event does not exist in the run. |
| 422 | `report.invalid_scope` | Kind/input matrix is violated. |
| 409 | `report.evidence_unavailable` | Required report evidence is absent. |
| 409 | `report.metrics_unavailable` | Validation metrics lack labels or matching definition. |
| 500 | `report.render_failed` | Internal renderer failed; details are redacted. |

## 6. HTTP and Envelope Rules

Existing assistant and report routes remain:

```text
POST /api/v1/h2-sentinel/assistant:ask
POST /api/v1/h2-sentinel/reports:export
POST /api/v1/h2-sentinel/submissions:export
```

Review routes are added as defined in Section 3.6. All routes:

- bind to and accept literal loopback only;
- validate unknown fields as errors;
- use request-size bounds appropriate to the accepted JSON body;
- return `H2ApiSuccessEnvelope<T>`, `H2ApiWarningEnvelope<T>`, or `H2ApiRedactedErrorEnvelope`;
- preserve stable English error codes and Chinese judge-visible messages;
- never echo raw notes, imported content, absolute paths, stack traces, secrets, tokens, or credentials in errors;
- never accept a host, URL, path, command, executable, prompt, or control action from these contracts.

## 7. Determinism, Security, and Provenance

### 7.1 Determinism

- Identical run/event/question input yields identical answer sections, citations, report structure, event sorting, and numeric representation except documented generation timestamps.
- Review request replay is exactly-once by `requestId`.
- Review exports use stable key and event/entry ordering.
- Hashes are computed over exact UTF-8 content using platform capabilities already present; no new dependency is introduced.

### 7.2 Trust boundaries

- Dataset text, imported filenames, event prose, actor labels, and review notes are untrusted input.
- Store notes as plain text and escape them at every HTML boundary.
- Do not execute report content or recommendation text.
- Do not read `.env`, credential files, cookies, tokens, browser storage, or private keys.
- Do not send competition data, evidence, notes, or reports to an external model or service.
- `local_operator` is attribution only; it is not authentication or authorization.

### 7.3 Provenance

Assistant answers, reviews, and report descriptors carry the current run provenance. A review journal never rewrites analysis provenance. Validation-slice artifacts additionally expose their source fingerprint and slice-manifest fingerprint in the dataset/run provenance already used by the application.

## 8. Contract Acceptance Tests

The canonical contract gate must add focused tests covering at least:

1. Exact official `Q01`-`Q10` order and exact Chinese prompts.
2. Rejection of `H2Qxx` aliases in TypeScript schema, Python validation, Fixture adapter, and Live API.
3. All ten deterministic answers with `allowLlmRendering` true and false.
4. Every section/citation referential invariant.
5. Question context matrix, including required event and mismatched code errors.
6. `Q09` generated-report presence, kind/media parity, event/run match, report citation, Chinese HTML, and content hash.
7. Every allowed review transition and representative forbidden transitions.
8. Required-note rules, untrusted note/actor escaping, revision conflict, idempotent replay, and request-ID conflict.
9. Event and submission snapshots unchanged after review mutations.
10. GET/POST review route parity, loopback boundary, unknown-field rejection, and redacted errors.
11. Review-audit inclusion of revision-zero events, stable sorting, UTF-8 notes, actor notice, and matching hash.
12. Chinese single-event, period, PCC daily, and quality HTML structure.
13. PCC daily unavailable-evidence behavior without fake zero values.
14. Exact report kind/format/media-type matrix and invalid-scope errors.
15. Absence of absolute paths, scripts, remote assets, secrets, stack traces, and unescaped HTML in artifacts.

The final integrated verification commands and runtime demo gates are defined in `P1_EXECUTION_SPEC.md`; passing type or schema tests alone does not establish complete judge-facing behavior.
