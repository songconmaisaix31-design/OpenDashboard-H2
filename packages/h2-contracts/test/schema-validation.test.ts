import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_ASSISTANT_ANSWER,
  H2_FIXTURE_DATASET,
  H2_FIXTURE_PROVENANCE,
  H2_FIXTURE_QUALITY_REPORT,
  H2_FIXTURE_REPORT_DESCRIPTOR,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  toH2SubmissionRow,
  type H2ApiEnvelope,
} from '../src/index.ts'

type JsonPrimitive = string | number | boolean | null
type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

interface JsonSchema {
  readonly allOf?: readonly JsonSchema[]
  readonly oneOf?: readonly JsonSchema[]
  readonly type?: string | readonly string[]
  readonly const?: JsonValue
  readonly enum?: readonly JsonValue[]
  readonly required?: readonly string[]
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly additionalProperties?: boolean | JsonSchema
  readonly items?: JsonSchema
  readonly minimum?: number
  readonly maximum?: number
  readonly exclusiveMinimum?: number
  readonly minItems?: number
  readonly maxItems?: number
  readonly minLength?: number
  readonly pattern?: string
}

const schema = (name: string): JsonSchema =>
  JSON.parse(
    readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8'),
  ) as JsonSchema

const fixture = (name: string): JsonValue =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  ) as JsonValue

const validate = (
  value: unknown,
  activeSchema: JsonSchema,
  path = '$',
): string[] => {
  const errors: string[] = []
  activeSchema.allOf?.forEach((candidate) => {
    errors.push(...validate(value, candidate, path))
  })

  const oneOf = activeSchema.oneOf
  if (oneOf) {
    const matches = oneOf.filter((candidate) =>
      validate(value, candidate, path).length === 0,
    )
    return matches.length === 1
      ? []
      : [`${path} must match exactly one oneOf branch, got ${matches.length}`]
  }

  const allowedTypes = normalizeTypes(activeSchema.type)
  if (
    allowedTypes.length > 0 &&
    !allowedTypes.some((typeName) => matchesJsonType(value, typeName))
  ) {
    errors.push(`${path} has invalid type`)
  }

  if (
    'const' in activeSchema &&
    !sameJsonValue(value as JsonValue, activeSchema.const)
  ) {
    errors.push(`${path} does not equal const value`)
  }

  if (
    activeSchema.enum &&
    !activeSchema.enum.some((item) => sameJsonValue(value as JsonValue, item))
  ) {
    errors.push(`${path} is not in enum`)
  }

  if (typeof value === 'string') {
    if (
      activeSchema.minLength !== undefined &&
      value.length < activeSchema.minLength
    ) {
      errors.push(`${path} is shorter than minLength`)
    }
    if (
      activeSchema.pattern !== undefined &&
      !new RegExp(activeSchema.pattern).test(value)
    ) {
      errors.push(`${path} does not match pattern`)
    }
  }

  if (typeof value === 'number') {
    if (
      activeSchema.minimum !== undefined &&
      value < activeSchema.minimum
    ) {
      errors.push(`${path} is below minimum`)
    }
    if (
      activeSchema.maximum !== undefined &&
      value > activeSchema.maximum
    ) {
      errors.push(`${path} is above maximum`)
    }
    if (
      activeSchema.exclusiveMinimum !== undefined &&
      value <= activeSchema.exclusiveMinimum
    ) {
      errors.push(`${path} is not above exclusiveMinimum`)
    }
  }

  if (Array.isArray(value)) {
    if (
      activeSchema.minItems !== undefined &&
      value.length < activeSchema.minItems
    ) {
      errors.push(`${path} has too few items`)
    }
    if (
      activeSchema.maxItems !== undefined &&
      value.length > activeSchema.maxItems
    ) {
      errors.push(`${path} has too many items`)
    }
    if (activeSchema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(item, activeSchema.items as JsonSchema, `${path}[${index}]`))
      })
    }
  }

  if (isJsonObject(value)) {
    const required = activeSchema.required ?? []
    required.forEach((key) => {
      if (!(key in value)) {
        errors.push(`${path}.${key} is required`)
      }
    })

    const properties = activeSchema.properties ?? {}
    Object.entries(properties).forEach(([key, propertySchema]) => {
      if (key in value) {
        errors.push(...validate(value[key], propertySchema, `${path}.${key}`))
      }
    })

    if (activeSchema.additionalProperties === false) {
      const known = new Set(Object.keys(properties))
      Object.keys(value).forEach((key) => {
        if (!known.has(key)) {
          errors.push(`${path}.${key} is not allowed`)
        }
      })
    }
  }

  return errors
}

const normalizeTypes = (
  type: JsonSchema['type'],
): readonly string[] => {
  if (type === undefined) {
    return []
  }
  return typeof type === 'string' ? [type] : type
}

const matchesJsonType = (value: unknown, typeName: string): boolean => {
  switch (typeName) {
    case 'array':
      return Array.isArray(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'number':
      return typeof value === 'number'
    case 'object':
      return isJsonObject(value)
    case 'string':
      return typeof value === 'string'
    default:
      return false
  }
}

const isJsonObject = (
  value: unknown,
): value is { readonly [key: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sameJsonValue = (left: JsonValue, right: JsonValue | undefined): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const assertValid = (value: unknown, activeSchema: JsonSchema): void => {
  assert.deepEqual(validate(value, activeSchema), [])
}

describe('H2 JSON Schemas', () => {
  it('validate sanitized C03 and C04 event fixtures', () => {
    const eventSchema = schema('anomaly-event.schema.json')

    assertValid(fixture('golden-c03.json'), eventSchema)
    assertValid(fixture('golden-c04.json'), eventSchema)
  })

  it('validate TypeScript fixture samples for every top-level schema', () => {
    assertValid(H2_FIXTURE_DATASET, schema('dataset-manifest.schema.json'))
    assertValid(
      H2_FIXTURE_QUALITY_REPORT,
      schema('data-quality-report.schema.json'),
    )
    assertValid(H2_GOLDEN_C03_EVENT, schema('anomaly-event.schema.json'))
    assertValid(H2_GOLDEN_C04_EVENT, schema('anomaly-event.schema.json'))
    assertValid(H2_FIXTURE_ANALYSIS_RUN, schema('analysis-run.schema.json'))
    assertValid(
      H2_FIXTURE_ASSISTANT_ANSWER,
      schema('assistant-answer.schema.json'),
    )
    assertValid(
      H2_FIXTURE_REPORT_DESCRIPTOR,
      schema('report-descriptor.schema.json'),
    )
    assertValid(
      toH2SubmissionRow(H2_GOLDEN_C03_EVENT),
      schema('submission-row.schema.json'),
    )
  })

  it('rejects cross-code subtype and impact metric combinations', () => {
    const invalidEvent = {
      ...H2_GOLDEN_C03_EVENT,
      subtype: 'EXPORT_POWER_LIMIT_NOT_TRACKED',
    }
    const invalidImpact = {
      ...H2_GOLDEN_C03_EVENT,
      impact: {
        ...H2_GOLDEN_C03_EVENT.impact,
        metric: 'pcc_power_limit_violation_energy_kwh',
      },
    }
    const invalidSubmissionRow = {
      ...toH2SubmissionRow(H2_GOLDEN_C03_EVENT),
      anomaly_subtype: 'EXPORT_POWER_LIMIT_NOT_TRACKED',
      primary_impact_metric: 'pcc_power_limit_violation_energy_kwh',
    }

    assert.notDeepEqual(
      validate(invalidEvent, schema('anomaly-event.schema.json')),
      [],
    )
    assert.notDeepEqual(
      validate(invalidImpact, schema('anomaly-event.schema.json')),
      [],
    )
    assert.notDeepEqual(
      validate(invalidSubmissionRow, schema('submission-row.schema.json')),
      [],
    )
  })

  it('accepts the explicit unknown safety status', () => {
    const eventWithUnknownSafety = {
      ...H2_GOLDEN_C03_EVENT,
      safetyChecks: [
        {
          ...H2_GOLDEN_C03_EVENT.safetyChecks[0],
          status: 'unknown',
        },
      ],
    }

    assertValid(eventWithUnknownSafety, schema('anomaly-event.schema.json'))
  })

  it('validates success, warning, and redacted-error API envelopes', () => {
    const apiEnvelopeSchema = schema('api-envelope.schema.json')
    const successEnvelope = {
      ok: true,
      status: 'success',
      data: H2_FIXTURE_ANALYSIS_RUN,
      warnings: [],
      provenance: H2_FIXTURE_PROVENANCE,
    } as const satisfies H2ApiEnvelope<typeof H2_FIXTURE_ANALYSIS_RUN>
    const warningEnvelope = {
      ok: true,
      status: 'warning',
      data: H2_FIXTURE_ANALYSIS_RUN,
      warnings: [
        {
          code: 'quality.warning',
          message: 'Synthetic warning for contract validation.',
          evidenceIds: [],
        },
      ],
      provenance: H2_FIXTURE_PROVENANCE,
    } as const satisfies H2ApiEnvelope<typeof H2_FIXTURE_ANALYSIS_RUN>
    const errorEnvelope = {
      ok: false,
      status: 'error',
      error: {
        code: 'analysis.failed',
        message: 'Analysis failed; details were redacted.',
        retryable: true,
        incidentId: 'h2-api-error-001',
        details: ['No stack trace, secret, or absolute path is returned.'],
      },
      warnings: [],
      provenance: H2_FIXTURE_PROVENANCE,
    } as const satisfies H2ApiEnvelope<typeof H2_FIXTURE_ANALYSIS_RUN>

    assertValid(successEnvelope, apiEnvelopeSchema)
    assertValid(warningEnvelope, apiEnvelopeSchema)
    assertValid(errorEnvelope, apiEnvelopeSchema)
  })
})
