import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const root = resolve(directory, '../../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')
const readJson = (relativePath) => JSON.parse(read(relativePath))

describe('P2 B-line foundation conformance', () => {
  it('keeps P1 contracts frozen and adds streaming as a separate extension', () => {
    const dataSource = read('packages/h2-contracts/src/data-source.ts')
    const ingestion = read('packages/h2-contracts/src/ingestion.ts')
    assert.doesNotMatch(dataSource, /createCsvUploadSession|uploadCsvChunk|finalizeCsvUpload/)
    assert.match(ingestion, /extends H2SentinelDataSource/)
    assert.match(ingestion, /nextChunkIndex/)
    assert.match(ingestion, /replayed: boolean/)
    assert.match(ingestion, /contentHash: string/)
  })

  it('fails closed at upload and NLU trust boundaries', () => {
    const session = readJson('packages/h2-contracts/schema/csv-upload-session.schema.json')
    const chunk = readJson('packages/h2-contracts/schema/csv-upload-chunk.schema.json')
    const finalize = readJson('packages/h2-contracts/schema/csv-upload-finalize.schema.json')
    const nluRequest = readJson('packages/h2-contracts/schema/bounded-nlu-request.schema.json')
    const nluResult = readJson('packages/h2-contracts/schema/bounded-nlu-result.schema.json')

    assert.equal(session.additionalProperties, false)
    assert.equal(session.properties.filename.pattern, '^[^/\\\\]+$')
    assert.equal(session.properties.declaredBytes.maximum, 268_435_456)
    assert.equal(chunk.additionalProperties, false)
    assert.equal(chunk.properties.byteLength.maximum, 8_388_608)
    assert.equal(finalize.additionalProperties, false)
    assert.equal(nluRequest.properties.text.maxLength, 500)
    assert.equal(nluResult.oneOf.length, 2)
    assert.equal(nluResult.oneOf[0].additionalProperties, false)
    assert.equal(nluResult.oneOf[1].additionalProperties, false)
  })

  it('preseeds disabled feature flags and bounded full-train limits', () => {
    const settings = read('services/h2-analytics/src/h2_analytics/settings.py')
    assert.match(settings, /^H2_ML_ENABLED = False$/m)
    assert.match(settings, /^H2_STREAMING_IMPORT_ENABLED = False$/m)
    assert.match(settings, /^MAX_STREAMING_CSV_BYTES = 256 \* 1024 \* 1024$/m)
    assert.match(settings, /^MAX_STREAMING_CSV_ROWS = 600_000$/m)
    assert.match(settings, /^STREAMING_CSV_CHUNK_BYTES = 8 \* 1024 \* 1024$/m)
  })

  it('records the official train identity only as an external verification input', () => {
    const spec = read('docs/competition/h2-sentinel/P2-B-DELIVERY-SPEC.md')
    const contractSources = [
      'packages/h2-contracts/src/ingestion.ts',
      'packages/h2-contracts/src/nlu.ts',
      'packages/h2-contracts/src/rendering.ts',
      'packages/h2-contracts/src/visualization.ts',
    ].map(read).join('\n')
    assert.match(
      spec,
      /The official training-file SHA-256 `[a-f0-9]{64}` is an external verification input only/,
    )
    assert.doesNotMatch(contractSources, /[a-f0-9]{64}/)
  })
})
