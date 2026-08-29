import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  H2_ASSISTANT_QUESTIONS,
  H2_EVENT_CHART_REQUIREMENTS,
  H2_NLU_MAX_INPUT_CHARS,
  H2_OFFICIAL_FIELDS,
  H2_STREAMING_IMPORT_LIMITS,
  type H2AssistantRenderingResult,
  type H2NluResult,
  type H2SentinelDataSource,
  type H2StreamingCsvDataSource,
} from '../src/index.ts'

interface JsonSchema {
  readonly additionalProperties?: boolean
  readonly maximum?: number
  readonly maxLength?: number
  readonly pattern?: string
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly oneOf?: readonly JsonSchema[]
}

const schema = (name: string): JsonSchema =>
  JSON.parse(
    readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8'),
  ) as JsonSchema

describe('P2 B-line additive foundation', () => {
  it('bounds streaming upload declarations and chunks above the official train size', () => {
    assert.deepEqual(H2_STREAMING_IMPORT_LIMITS, {
      maxBytes: 268_435_456,
      maxRows: 600_000,
      chunkBytes: 8_388_608,
    })
    assert.ok(H2_STREAMING_IMPORT_LIMITS.maxBytes > 236_991_870)
    assert.equal(
      schema('csv-upload-session.schema.json').properties?.declaredBytes
        ?.maximum,
      H2_STREAMING_IMPORT_LIMITS.maxBytes,
    )
    assert.equal(
      schema('csv-upload-chunk.schema.json').properties?.byteLength?.maximum,
      H2_STREAMING_IMPORT_LIMITS.chunkBytes,
    )
    assert.equal(
      schema('csv-upload-session.schema.json').properties?.filename?.pattern,
      '^[^/\\\\]+$',
    )
  })

  it('keeps the legacy data source valid while exposing streaming as an extension', () => {
    const consumeLegacy = (_source: H2SentinelDataSource): void => undefined
    const consumeStreaming = (source: H2StreamingCsvDataSource): void => {
      consumeLegacy(source)
    }
    void consumeStreaming
  })

  it('bounds NLU to an official question or an explicit refusal', () => {
    const requestSchema = schema('bounded-nlu-request.schema.json')
    const resultSchema = schema('bounded-nlu-result.schema.json')
    assert.equal(H2_NLU_MAX_INPUT_CHARS, 500)
    assert.equal(
      requestSchema.properties?.text?.maxLength,
      H2_NLU_MAX_INPUT_CHARS,
    )
    assert.equal(resultSchema.oneOf?.length, 2)

    const matched = {
      schemaVersion: 1,
      status: 'matched',
      questionId: 'Q03',
      confidence: 0.95,
    } as const satisfies H2NluResult
    const refused = {
      schemaVersion: 1,
      status: 'refused',
      reason: 'low_confidence',
      confidence: 0.2,
      allowedQuestionIds: H2_ASSISTANT_QUESTIONS.map(({ questionId }) =>
        questionId,
      ),
    } as const satisfies H2NluResult
    assert.equal(matched.status, 'matched')
    assert.equal(refused.status, 'refused')
  })

  it('makes LLM rendering optional and provenance-bearing', () => {
    const disabled = {
      schemaVersion: 1,
      deterministicAnswerId: 'answer-1',
      status: 'disabled',
      reason: 'not_configured',
      provenance: {
        mode: 'RULE',
        source: 'deterministic-answer',
        generatedAt: '2026-08-29T00:00:00Z',
        limitations: ['LLM rendering is disabled.'],
      },
    } as const satisfies H2AssistantRenderingResult
    assert.equal(disabled.status, 'disabled')
    assert.equal(schema('assistant-rendering.schema.json').oneOf?.length, 3)
  })

  it('publishes exactly one canonical requirement for each C01-C07 chart', () => {
    assert.deepEqual(
      H2_EVENT_CHART_REQUIREMENTS.map(({ code }) => code),
      ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'],
    )
    const officialFields = new Set<string>(
      H2_OFFICIAL_FIELDS.map(({ name }) => name),
    )
    H2_EVENT_CHART_REQUIREMENTS.forEach((requirement) => {
      assert.equal(requirement.fallback, 'event_evidence_series')
      assert.ok(requirement.requiredVariables.length > 0)
      requirement.requiredVariables.forEach((variable) => {
        assert.equal(officialFields.has(variable), true)
      })
    })
  })
})
